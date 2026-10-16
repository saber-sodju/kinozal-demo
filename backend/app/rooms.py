"""Комнаты, участники и протокол синхронизации.

Сервер — единственный источник истины о воспроизведении. Состояние:
    {media, status: playing|paused, position, ref_time, rate, version}
Клиент вычисляет ожидаемую позицию:
    position + (server_now - ref_time) / 1000 * rate   (если playing)
и сам подстраивается (скорость или seek). Команды обрабатываются по очереди,
каждая увеличивает version — так разрешаются конфликты.
"""

from __future__ import annotations

import asyncio
import secrets
import time
from dataclasses import dataclass, field

from fastapi import WebSocket

from . import db
from .sources import ResolveError, capabilities_for, resolve_url

GRACE_S = 60                 # сколько ждём переподключения, прежде чем убрать участника
EMPTY_ROOM_UNLOAD_S = 600    # пустая комната выгружается из памяти (остаётся в БД)
WAIT_ALL_TIMEOUT_S = 8       # «ждать всех» не дольше этого
CONFLICT_WINDOW_S = 0.3      # устаревшая команда в этом окне после другой — отбрасывается
START_DELAY_MS = 1500        # новое видео стартует чуть позже, чтобы все успели загрузить
MAX_VOICE = 6                # голос — P2P mesh, больше людей он не потянет
MAX_QUEUE = 50
REACTIONS = ["😂", "😮", "😍", "👏", "😱", "🔥", "😢", "👍"]


def now_ms() -> int:
    return int(time.time() * 1000)


@dataclass
class Member:
    id: str
    name: str
    color: str
    role: str  # host | mod | viewer
    joined_at: float
    ws: WebSocket | None = None
    connected: bool = False
    disconnected_at: float | None = None
    status: str = "idle"  # idle | ready | buffering | ad | error | ended
    in_voice: bool = False
    muted: bool = False
    chat_times: list[float] = field(default_factory=list)
    reaction_times: list[float] = field(default_factory=list)

    def public(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "color": self.color,
            "role": self.role,
            "connected": self.connected,
            "status": self.status,
            "in_voice": self.in_voice,
            "muted": self.muted,
        }


@dataclass
class Playback:
    media: dict | None = None
    status: str = "paused"
    position: float = 0.0
    ref_time: int = field(default_factory=now_ms)
    rate: float = 1.0
    version: int = 0
    by: str | None = None
    waiting: bool = False         # пауза «ждём, пока все загрузятся»
    updated_mono: float = 0.0

    def current_position(self) -> float:
        if self.status != "playing":
            return self.position
        return max(0.0, self.position + (now_ms() - self.ref_time) / 1000 * self.rate)

    def to_dict(self) -> dict:
        return {
            "media": self.media,
            "status": self.status,
            "position": self.position,
            "ref_time": self.ref_time,
            "rate": self.rate,
            "version": self.version,
            "by": self.by,
            "waiting": self.waiting,
        }


def rate_limited(times: list[float], limit: int, window: float) -> bool:
    now = time.monotonic()
    times[:] = [t for t in times if now - t < window]
    if len(times) >= limit:
        return True
    times.append(now)
    return False


class Room:
    def __init__(self, data: dict):
        snap = data.get("snapshot") or {}
        self.slug: str = data["slug"]
        self.name: str = data["name"]
        self.control_mode: str = data["control_mode"]
        self.host_id: str = data["host_session_id"]
        self.members: dict[str, Member] = {}
        self.banned: set[str] = set(snap.get("banned", []))
        self.queue: list[dict] = snap.get("queue", [])
        self.wait_for_all: bool = snap.get("wait_for_all", False)
        pb = snap.get("playback") or {}
        # После перезапуска сервера комната всегда поднимается на паузе.
        self.playback = Playback(media=pb.get("media"), position=float(pb.get("position", 0)))
        self.ended_version = -1
        self.wait_task: asyncio.Task | None = None
        self.empty_since: float | None = time.monotonic()
        self.screen: dict | None = None  # кто сейчас показывает вкладку: {"by", "name"}
        self.lock = asyncio.Lock()

    # ---------- сериализация ----------

    def info(self) -> dict:
        return {
            "slug": self.slug,
            "name": self.name,
            "control_mode": self.control_mode,
            "wait_for_all": self.wait_for_all,
            "host_id": self.host_id,
            "screen": self.screen,
        }

    def save(self) -> None:
        snapshot = {
            "playback": {"media": self.playback.media, "position": self.playback.current_position()},
            "queue": self.queue,
            "wait_for_all": self.wait_for_all,
            "banned": sorted(self.banned),
        }
        db.save_room(self.slug, self.name, self.control_mode, self.host_id, snapshot)

    def members_public(self) -> list[dict]:
        return [m.public() for m in sorted(self.members.values(), key=lambda m: m.joined_at)]

    # ---------- отправка ----------

    async def send(self, member: Member, msg: dict) -> None:
        if member.ws is None:
            return
        try:
            await member.ws.send_json(msg)
        except Exception:
            pass  # отвалившийся сокет уберёт обработчик отключения

    async def broadcast(self, msg: dict, exclude: str | None = None) -> None:
        await asyncio.gather(
            *(self.send(m, msg) for m in self.members.values() if m.connected and m.id != exclude)
        )

    async def broadcast_presence(self) -> None:
        await self.broadcast({"type": "presence", "members": self.members_public(), "room": self.info()})

    async def broadcast_playback(self) -> None:
        await self.broadcast({"type": "playback.state", "playback": self.playback.to_dict(), "server_time": now_ms()})

    async def broadcast_queue(self) -> None:
        await self.broadcast({"type": "queue", "queue": self.queue})

    async def system_message(self, body: str) -> None:
        msg = db.add_message(self.slug, None, body, kind="system")
        await self.broadcast({"type": "chat.message", "message": msg})

    async def error(self, member: Member, text: str) -> None:
        await self.send(member, {"type": "error", "message": text})

    # ---------- права ----------

    def can_control(self, m: Member) -> bool:
        return self.control_mode == "everyone" or m.role in ("host", "mod")

    def can_moderate(self, m: Member) -> bool:
        return m.role in ("host", "mod")

    # ---------- воспроизведение ----------

    def _bump(self, by: str | None) -> None:
        pb = self.playback
        pb.ref_time = now_ms()
        pb.version += 1
        pb.by = by
        pb.updated_mono = time.monotonic()
        if self.wait_task:
            self.wait_task.cancel()
            self.wait_task = None
        pb.waiting = False

    async def set_media(self, media: dict, by: Member | None, autoplay: bool = True) -> None:
        media = {**media, "capabilities": capabilities_for(media["source"])}
        pb = self.playback
        pb.media = media
        pb.position = 0.0
        pb.status = "playing" if autoplay else "paused"
        self._bump(by.id if by else None)
        if autoplay:
            pb.ref_time = now_ms() + START_DELAY_MS  # старт чуть в будущем
        self.ended_version = -1
        for m in self.members.values():
            m.status = "idle"
        self.save()
        await self.broadcast_playback()
        await self.broadcast_presence()
        who = by.name if by else "Комната"
        await self.system_message(f"{who} включает «{media['title']}»")

    async def playback_command(self, m: Member, msg: dict) -> None:
        pb = self.playback
        if not self.can_control(m):
            return await self.error(m, "В этой комнате управляют просмотром только ведущий и модераторы.")
        if not pb.media:
            return
        action = msg.get("action")
        if action not in ("play", "pause", "seek"):
            return
        base = msg.get("base_version")
        if (
            isinstance(base, int) and base < pb.version and pb.by != m.id
            and time.monotonic() - pb.updated_mono < CONFLICT_WINDOW_S
        ):
            # Кто-то другой только что сделал действие — эта команда устарела.
            await self.send(m, {"type": "playback.state", "playback": pb.to_dict(), "server_time": now_ms()})
            return

        duration = pb.media.get("duration_s") or None
        raw = msg.get("position")
        position = pb.current_position() if not isinstance(raw, (int, float)) else float(raw)
        position = max(0.0, min(position, duration)) if duration else max(0.0, position)

        if action == "play":
            pb.status = "playing"
        elif action == "pause":
            pb.status = "paused"
        pb.position = position
        self._bump(m.id)
        await self.broadcast_playback()

    async def report(self, m: Member, msg: dict) -> None:
        status = msg.get("status")
        if status not in ("ready", "buffering", "ad", "error", "ended"):
            return
        duration = msg.get("duration")
        pb = self.playback
        if (
            isinstance(duration, (int, float)) and duration > 0 and pb.media
            and not pb.media.get("duration_s") and msg.get("version") == pb.version
        ):
            pb.media["duration_s"] = int(duration)  # длительность YouTube узнаём от плеера

        changed = m.status != status
        m.status = status

        if status == "ended" and pb.status == "playing" and self.ended_version != pb.version:
            self.ended_version = pb.version
            await self.advance_queue()
            return

        if self.wait_for_all:
            if status in ("buffering", "ad") and pb.status == "playing":
                pb.position = pb.current_position()
                pb.status = "paused"
                self._bump(None)
                pb.waiting = True
                self.wait_task = asyncio.create_task(self._wait_timeout(pb.version))
                await self.broadcast_playback()
            elif pb.waiting and not self._anyone_loading():
                await self._resume_after_wait()

        if changed:
            await self.broadcast_presence()

    def _anyone_loading(self) -> bool:
        return any(x.connected and x.status in ("buffering", "ad") for x in self.members.values())

    async def _resume_after_wait(self) -> None:
        pb = self.playback
        pb.status = "playing"
        self._bump(None)
        await self.broadcast_playback()

    async def _wait_timeout(self, version: int) -> None:
        await asyncio.sleep(WAIT_ALL_TIMEOUT_S)
        async with self.lock:
            if self.playback.waiting and self.playback.version == version:
                self.wait_task = None
                await self._resume_after_wait()

    async def advance_queue(self, by: Member | None = None) -> None:
        if self.queue:
            nxt = self.queue.pop(0)
            await self.broadcast_queue()
            await self.set_media(nxt, by, autoplay=True)
        else:
            pb = self.playback
            pb.position = pb.current_position()
            if pb.media and pb.media.get("duration_s"):
                pb.position = float(pb.media["duration_s"])
            pb.status = "paused"
            self._bump(None)
            self.save()
            await self.broadcast_playback()

    # ---------- медиа и очередь ----------

    async def _resolve_media(self, m: Member, msg: dict) -> dict | None:
        catalog_id = msg.get("catalog_id")
        if isinstance(catalog_id, int):
            item = db.get_media(catalog_id)
            if not item:
                await self.error(m, "Фильм не найден в каталоге.")
                return None
            return db.media_descriptor(item)
        url = msg.get("url")
        if isinstance(url, str) and len(url) < 2000:
            try:
                return await resolve_url(url)
            except ResolveError as exc:
                await self.error(m, str(exc))
                return None
        await self.error(m, "Не указано, что включить.")
        return None

    async def media_set(self, m: Member, msg: dict) -> None:
        if not self.can_control(m):
            return await self.error(m, "Менять видео могут только ведущий и модераторы.")
        media = await self._resolve_media(m, msg)
        if not media:
            return
        if msg.get("mode") == "queue":
            if len(self.queue) >= MAX_QUEUE:
                return await self.error(m, "Очередь заполнена.")
            self.queue.append({**media, "qid": secrets.token_hex(4), "added_by": m.name})
            self.save()
            await self.broadcast_queue()
            await self.system_message(f"{m.name} добавляет в очередь «{media['title']}»")
        else:
            await self.set_media(media, m, autoplay=True)

    async def media_external(self, m: Member, msg: dict) -> None:
        if not self.can_control(m):
            return await self.error(m, "Менять видео могут только ведущий и модераторы.")
        url = str(msg.get("url", ""))[:2000]
        if not url.startswith(("http://", "https://")):
            return
        from urllib.parse import urlparse

        if self.playback.media and self.playback.media.get("source") == "external" and self.playback.media.get("url") == url:
            return  # уже смотрим эту страницу
        duration = msg.get("duration")
        media = {
            "source": "external",
            "external_id": url,
            "url": url,
            "page_url": url,
            "title": (str(msg.get("title") or "") or urlparse(url).hostname or "Видео на сайте")[:160],
            "subtitle": urlparse(url).hostname,
            "poster_url": None,
            "duration_s": int(duration) if isinstance(duration, (int, float)) and duration > 0 else None,
        }
        await self.set_media(media, m, autoplay=False)

    async def queue_action(self, m: Member, msg: dict) -> None:
        if not self.can_control(m):
            return await self.error(m, "Очередью управляют только ведущий и модераторы.")
        qid = msg.get("qid")
        idx = next((i for i, q in enumerate(self.queue) if q.get("qid") == qid), None)
        if idx is None:
            return
        action = msg.get("action")
        if action == "remove":
            self.queue.pop(idx)
        elif action == "play":
            item = self.queue.pop(idx)
            await self.broadcast_queue()
            self.save()
            return await self.set_media(item, m, autoplay=True)
        elif action in ("up", "down"):
            j = idx - 1 if action == "up" else idx + 1
            if 0 <= j < len(self.queue):
                self.queue[idx], self.queue[j] = self.queue[j], self.queue[idx]
        self.save()
        await self.broadcast_queue()

    # ---------- чат ----------

    async def chat(self, m: Member, msg: dict) -> None:
        body = str(msg.get("body", "")).strip()[:500]
        if not body:
            return
        if rate_limited(m.chat_times, 5, 5):
            return await self.error(m, "Слишком быстро — подожди пару секунд.")
        session = {"id": m.id, "name": m.name, "color": m.color}
        message = db.add_message(self.slug, session, body)
        await self.broadcast({"type": "chat.message", "message": message})

    async def reaction(self, m: Member, msg: dict) -> None:
        emoji = msg.get("emoji")
        if emoji not in REACTIONS or rate_limited(m.reaction_times, 8, 4):
            return
        await self.broadcast({"type": "reaction", "from": m.id, "name": m.name, "emoji": emoji, "id": secrets.token_hex(4)})

    # ---------- модерация и настройки ----------

    async def settings(self, m: Member, msg: dict) -> None:
        if m.role != "host":
            return await self.error(m, "Настройки комнаты меняет только ведущий.")
        if msg.get("control_mode") in ("everyone", "host_only"):
            self.control_mode = msg["control_mode"]
        if isinstance(msg.get("wait_for_all"), bool):
            self.wait_for_all = msg["wait_for_all"]
        name = str(msg.get("name", "")).strip()[:60]
        if name:
            self.name = name
        self.save()
        await self.broadcast_presence()

    async def member_action(self, m: Member, msg: dict) -> None:
        target = self.members.get(msg.get("target", ""))
        action = msg.get("action")
        if not target or target.id == m.id:
            return
        if action in ("promote", "demote", "transfer") and m.role != "host":
            return await self.error(m, "Это может только ведущий.")
        if action == "promote":
            target.role = "mod"
        elif action == "demote":
            target.role = "viewer"
        elif action == "transfer":
            m.role = "viewer"
            target.role = "host"
            self.host_id = target.id
            self.save()
            await self.system_message(f"{target.name} теперь ведущий")
        elif action == "kick":
            if not self.can_moderate(m) or target.role == "host" or (m.role == "mod" and target.role == "mod"):
                return await self.error(m, "Нельзя выгнать этого участника.")
            self.banned.add(target.id)
            self.save()
            await self.send(target, {"type": "kicked"})
            if target.ws:
                try:
                    await target.ws.close(code=4003)
                except Exception:
                    pass
            if target.in_voice:
                await self.broadcast({"type": "voice.left", "id": target.id})
            self.members.pop(target.id, None)
            await self.system_message(f"{target.name} удалён из комнаты")
        else:
            return
        await self.broadcast_presence()

    # ---------- голос (сигналинг WebRTC) ----------

    async def voice(self, m: Member, msg: dict) -> None:
        kind = msg["type"]
        if kind == "voice.join":
            in_voice = [x for x in self.members.values() if x.in_voice and x.connected and x.id != m.id]
            if len(in_voice) >= MAX_VOICE:
                return await self.error(m, f"В голосе уже {MAX_VOICE} человек — больше пока не поддерживается.")
            m.in_voice = True
            m.muted = bool(msg.get("muted", False))
            # Новичок сам звонит всем, кто уже в голосе — так нет «встречных» звонков.
            await self.send(m, {"type": "voice.peers", "ids": [x.id for x in in_voice]})
        elif kind == "voice.leave":
            if not m.in_voice:
                return
            m.in_voice = False
            await self.broadcast({"type": "voice.left", "id": m.id}, exclude=m.id)
        elif kind == "voice.state":
            m.muted = bool(msg.get("muted", False))
        elif kind == "rtc.signal":
            target = self.members.get(msg.get("to", ""))
            if target and target.in_voice and m.in_voice:
                await self.send(target, {"type": "rtc.signal", "from": m.id, "data": msg.get("data")})
            return
        await self.broadcast_presence()

    # ---------- демонстрация вкладки (видео идёт P2P от показывающего) ----------

    async def screen_action(self, m: Member, msg: dict) -> None:
        kind = msg["type"]
        if kind == "screen.start":
            if self.screen and self.screen["by"] != m.id and m.role not in ("host", "mod"):
                return await self.error(m, f"Сейчас показывает {self.screen['name']}. Дождись, пока он закончит.")
            previous = self.screen
            self.screen = {"by": m.id, "name": m.name}
            if previous and previous["by"] != m.id:
                await self.broadcast({"type": "screen.stopped", "by": previous["by"]})
            pb = self.playback
            if pb.media and pb.status == "playing":
                pb.position = pb.current_position()
                pb.status = "paused"
                self._bump(m.id)
                await self.broadcast_playback()
            await self.broadcast_presence()
            await self.system_message(f"{m.name} показывает вкладку")
        elif kind == "screen.stop":
            if not self.screen or (self.screen["by"] != m.id and not self.can_moderate(m)):
                return
            await self.stop_screen()
        elif kind == "screen.signal":
            target = self.members.get(msg.get("to", ""))
            if target and target.connected:
                await self.send(target, {"type": "screen.signal", "from": m.id, "data": msg.get("data")})

    async def stop_screen(self) -> None:
        if not self.screen:
            return
        by = self.screen["by"]
        self.screen = None
        await self.broadcast({"type": "screen.stopped", "by": by})
        await self.broadcast_presence()

    async def profile(self, m: Member, msg: dict) -> None:
        name = str(msg.get("name", "")).strip()[:32]
        color = msg.get("color")
        db.update_session(m.id, name or None, color)
        if name:
            m.name = name
        if color in db.AVATAR_COLORS:
            m.color = color
        await self.broadcast_presence()


class RoomManager:
    def __init__(self) -> None:
        self.rooms: dict[str, Room] = {}

    def get(self, slug: str) -> Room | None:
        room = self.rooms.get(slug)
        if room:
            return room
        data = db.get_room(slug)
        if not data:
            return None
        room = Room(data)
        self.rooms[slug] = room
        return room

    def live_count(self, slug: str) -> int:
        room = self.rooms.get(slug)
        return sum(1 for m in room.members.values() if m.connected) if room else 0

    async def connect(self, room: Room, session: dict, ws: WebSocket, last_msg_id: int, ice_servers: list) -> Member:
        async with room.lock:
            member = room.members.get(session["id"])
            is_new = member is None
            if member and member.ws is not None and member.ws is not ws:
                old = member.ws
                member.ws = None
                try:
                    await old.close(code=4000)  # открыт в другой вкладке
                except Exception:
                    pass
            if is_new:
                host_present = room.host_id in room.members
                if session["id"] != room.host_id and not host_present and not room.members:
                    room.host_id = session["id"]  # хозяина нет — первый вошедший ведёт
                    room.save()
                role = "host" if session["id"] == room.host_id else "viewer"
                member = Member(session["id"], session["name"], session["color"], role, time.time())
                room.members[member.id] = member
            member.name, member.color = session["name"], session["color"]
            member.ws = ws
            member.connected = True
            member.disconnected_at = None
            member.status = "idle"
            room.empty_since = None

            await room.send(member, {
                "type": "welcome",
                "you": member.id,
                "room": room.info(),
                "members": room.members_public(),
                "playback": room.playback.to_dict(),
                "queue": room.queue,
                "messages": db.recent_messages(room.slug, after_id=last_msg_id),
                "reactions": REACTIONS,
                "ice_servers": ice_servers,
                "server_time": now_ms(),
            })
            await room.broadcast_presence()
            if is_new:
                await room.system_message(f"{member.name} заходит в комнату")
            return member

    async def disconnect(self, room: Room, member: Member, ws: WebSocket) -> None:
        async with room.lock:
            if member.ws is not ws:
                return  # уже переподключился с нового сокета
            member.ws = None
            member.connected = False
            member.disconnected_at = time.monotonic()
            if member.in_voice:
                member.in_voice = False
                await room.broadcast({"type": "voice.left", "id": member.id})
            if room.screen and room.screen["by"] == member.id:
                await room.stop_screen()
            if room.playback.waiting and not room._anyone_loading():
                await room._resume_after_wait()
            await room.broadcast_presence()
            if not any(m.connected for m in room.members.values()):
                room.empty_since = time.monotonic()
                room.save()

    async def handle(self, room: Room, member: Member, msg: dict) -> None:
        kind = msg.get("type")
        if kind == "ping":
            # Отвечаем без блокировки — от точности зависит синхронизация часов.
            await room.send(member, {"type": "pong", "t0": msg.get("t0"), "server_time": now_ms()})
            return
        async with room.lock:
            if member.id not in room.members:
                return
            if kind == "playback.cmd":
                await room.playback_command(member, msg)
            elif kind == "playback.report":
                await room.report(member, msg)
            elif kind == "media.set":
                await room.media_set(member, msg)
            elif kind == "media.external":
                await room.media_external(member, msg)
            elif kind == "queue.action":
                await room.queue_action(member, msg)
            elif kind == "playback.next":
                if room.can_control(member):
                    await room.advance_queue(member)
            elif kind == "chat.send":
                await room.chat(member, msg)
            elif kind == "reaction":
                await room.reaction(member, msg)
            elif kind == "room.settings":
                await room.settings(member, msg)
            elif kind == "member.action":
                await room.member_action(member, msg)
            elif kind in ("voice.join", "voice.leave", "voice.state", "rtc.signal"):
                await room.voice(member, msg)
            elif kind == "profile.update":
                await room.profile(member, msg)
            elif kind in ("screen.start", "screen.stop", "screen.signal"):
                await room.screen_action(member, msg)

    async def cleanup_loop(self) -> None:
        while True:
            await asyncio.sleep(10)
            try:
                await self._cleanup()
            except Exception as exc:  # чистка не должна ронять сервер
                print("cleanup error:", exc)

    async def _cleanup(self) -> None:
        now = time.monotonic()
        for slug, room in list(self.rooms.items()):
            async with room.lock:
                gone = [
                    m for m in room.members.values()
                    if not m.connected and m.disconnected_at and now - m.disconnected_at > GRACE_S
                ]
                for m in gone:
                    room.members.pop(m.id, None)
                    await room.system_message(f"{m.name} выходит")
                    if m.role == "host" and room.members:
                        heir = sorted(
                            room.members.values(),
                            key=lambda x: (not x.connected, x.role != "mod", x.joined_at),
                        )[0]
                        heir.role = "host"
                        room.host_id = heir.id
                        room.save()
                        await room.system_message(f"{heir.name} теперь ведущий")
                if gone:
                    await room.broadcast_presence()
                if not room.members and room.empty_since and now - room.empty_since > EMPTY_ROOM_UNLOAD_S:
                    room.save()
                    del self.rooms[slug]


manager = RoomManager()


def new_slug() -> str:
    return secrets.token_urlsafe(8).replace("_", "x").replace("-", "z")


def create_room_with_media(media: dict, name: str, host_session_id: str = "tg-bot") -> str:
    """Комната, созданная не из браузера (например, ботом): ведущим станет первый вошедший."""
    slug = new_slug()
    media = {**media, "capabilities": capabilities_for(media["source"])}
    db.create_room(slug, name or "Kinora", "everyone", host_session_id, {"playback": {"media": media, "position": 0}, "queue": []})
    return slug
