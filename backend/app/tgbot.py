"""Telegram-бот: большие видео из Telegram (фильмы на 1–2 ГБ).

Telegram не отдаёт большие файлы сайтам, поэтому их достаёт бот через MTProto
(у ботов там нет лимита 20 МБ, как в обычном Bot API):
  • пользователь пересылает видео боту → бот создаёт комнату и присылает ссылку;
  • или вставляет на сайте ссылку t.me/канал/123 из публичного канала.
Браузер получает видео по /api/tg/stream/<token> с поддержкой Range (перемотка).
Файл качается кусками по 512 КБ с упреждением и кэшируется на диске —
если смотрят несколько человек, из Telegram он скачивается один раз.

Нужны переменные окружения: TG_BOT_TOKEN, TG_API_ID, TG_API_HASH.
"""

from __future__ import annotations

import asyncio
import os
import re
import secrets
from pathlib import Path

from . import db

CHUNK = 512 * 1024          # максимальный кусок, который Telegram отдаёт за один запрос
PREFETCH = 6                # сколько кусков качать наперёд (~3 МБ)
MEDIA_TTL_S = 30 * 60       # file_reference у Telegram живёт ограниченно — обновляем

TG_POST = re.compile(r"(?:https?://)?(?:t\.me|telegram\.me|telegram\.dog)/(?:s/)?([A-Za-z][A-Za-z0-9_]{3,})/(\d+)")

HELP = (
    "Привет! Я помогаю смотреть видео из Telegram вместе в Kinora.\n\n"
    "Перешли мне видео из любого канала или чата (или отправь файл) — "
    "я создам комнату и пришлю ссылку, которую можно отправить друзьям.\n\n"
    "Ещё можно прислать ссылку на пост из публичного канала: t.me/канал/123"
)


def public_base() -> str:
    url = os.environ.get("PUBLIC_URL")
    if url:
        return url.rstrip("/")
    domain = os.environ.get("RAILWAY_PUBLIC_DOMAIN")
    return f"https://{domain}" if domain else "http://localhost:8000"


class TgBot:
    def __init__(self) -> None:
        self.api_id = int(os.environ.get("TG_API_ID") or 0)
        self.api_hash = os.environ.get("TG_API_HASH", "")
        self.token = os.environ.get("TG_BOT_TOKEN", "")
        self.client = None
        self.username: str | None = None
        self.cache_dir = Path(os.environ.get("TG_CACHE_DIR") or (db.DB_PATH.parent / "tgcache"))
        self.cache_cap = int(float(os.environ.get("TG_CACHE_GB", "3")) * 1024**3)
        self._cache_size: int | None = None
        self._media: dict[str, tuple[object, float]] = {}
        self._inflight: dict[tuple[str, int], asyncio.Task] = {}
        self._thumbs: dict[str, bytes] = {}

    @property
    def configured(self) -> bool:
        return bool(self.api_id and self.api_hash and self.token)

    @property
    def ready(self) -> bool:
        return self.client is not None and self.username is not None

    # ---------- запуск ----------

    async def start(self) -> None:
        if not self.configured:
            print("telegram bot: TG_BOT_TOKEN / TG_API_ID / TG_API_HASH не заданы — бот выключен", flush=True)
            return
        from telethon import TelegramClient, events

        session = os.environ.get("TG_SESSION") or str(db.DB_PATH.parent / "tgbot")
        self.client = TelegramClient(session, self.api_id, self.api_hash)
        try:
            await self.client.start(bot_token=self.token)
            me = await self.client.get_me()
            self.username = me.username
        except Exception as exc:
            print(f"telegram bot: не удалось запуститься: {exc!r}", flush=True)
            self.client = None
            return
        self.client.add_event_handler(self._on_message, events.NewMessage(incoming=True, func=lambda e: e.is_private))
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        print(f"telegram bot: запущен как @{self.username}", flush=True)

    async def stop(self) -> None:
        if self.client:
            await self.client.disconnect()

    # ---------- разбор сообщений ----------

    @staticmethod
    def video_info(msg) -> dict | None:
        from telethon.tl.types import DocumentAttributeFilename, DocumentAttributeVideo

        doc = getattr(msg, "document", None)
        if not doc:
            return None
        mime = doc.mime_type or ""
        video_attr = next((a for a in doc.attributes if isinstance(a, DocumentAttributeVideo)), None)
        if not (mime.startswith("video/") or video_attr):
            return None
        name = next((a.file_name for a in doc.attributes if isinstance(a, DocumentAttributeFilename)), None)
        return {
            "size": doc.size,
            "mime": mime or "video/mp4",
            "duration": int(video_attr.duration) if video_attr else None,
            "file_name": name,
        }

    @staticmethod
    def title_for(msg, info: dict, fallback: str) -> str:
        caption = re.sub(r"\s+", " ", (msg.message or "")).strip()
        if caption:
            return caption[:90].rsplit(" ", 1)[0] + "…" if len(caption) > 90 else caption
        if info.get("file_name"):
            return re.sub(r"\.[A-Za-z0-9]{2,4}$", "", info["file_name"]).replace("_", " ").replace(".", " ")
        return fallback

    def register(self, peer: str, msg_id: int, info: dict, title: str) -> str:
        existing = db.find_tg_file(peer, msg_id)
        if existing:
            return existing["token"]
        token = secrets.token_urlsafe(12).replace("-", "x").replace("_", "z")
        db.add_tg_file(token, peer, msg_id, info["size"], info["mime"], info["duration"], title, info["file_name"])
        return token

    @staticmethod
    def media_for(token: str) -> dict | None:
        f = db.get_tg_file(token)
        if not f:
            return None
        return {
            "source": "tgbot",
            "external_id": token,
            "url": f"/api/tg/stream/{token}",
            "page_url": f"{public_base()}/tgf/{token}",
            "title": f["title"],
            "subtitle": "Telegram",
            "poster_url": f"/api/tg/thumb/{token}",
            "duration_s": f["duration"],
        }

    async def from_public_post(self, channel: str, post: int) -> dict:
        """Ссылка t.me/канал/123 → видео через бота. Бросает ValueError с текстом для пользователя."""
        if not self.ready:
            raise ValueError("Бот Telegram не настроен.")
        try:
            msg = await self.client.get_messages(channel, ids=post)
        except Exception as exc:
            print(f"telegram bot: get_messages {channel}/{post} failed: {exc!r}", flush=True)
            raise ValueError(
                f"Не получилось открыть пост через бота. Перешли видео боту @{self.username} — он пришлёт ссылку."
            ) from exc
        if not msg:
            raise ValueError("Пост не найден.")
        info = self.video_info(msg)
        if not info:
            raise ValueError("В этом посте нет видео.")
        token = self.register(f"@{channel}", post, info, self.title_for(msg, info, f"Видео из @{channel}"))
        self._media[token] = (msg.document, asyncio.get_running_loop().time())
        return self.media_for(token)

    async def _on_message(self, event) -> None:
        from . import rooms

        msg = event.message
        text = (msg.raw_text or "").strip()
        try:
            info = self.video_info(msg)
            if not info:
                link = TG_POST.search(text)
                if link:
                    media = await self.from_public_post(link.group(1), int(link.group(2)))
                    token = media["external_id"]
                elif text.startswith("/"):
                    await event.reply(HELP, link_preview=False)
                    return
                else:
                    await event.reply("Пришли или перешли мне видео — или ссылку на пост с видео из публичного канала.")
                    return
            else:
                token = self.register("private", msg.id, info, self.title_for(msg, info, "Видео из Telegram"))
                self._media[token] = (msg.document, asyncio.get_running_loop().time())
                media = self.media_for(token)

            slug = rooms.create_room_with_media(media, name=media["title"][:60])
            base = public_base()
            await event.reply(
                f"🎬 Комната готова:\n{base}/r/{slug}\n\n"
                f"Отправь ссылку друзьям — видео пойдёт у всех синхронно.\n\n"
                f"Чтобы включить это видео в другой комнате, вставь там ссылку:\n{base}/tgf/{token}",
                link_preview=False,
            )
        except ValueError as exc:
            await event.reply(str(exc))
        except Exception as exc:
            print(f"telegram bot: ошибка обработки сообщения: {exc!r}", flush=True)
            await event.reply("Что-то пошло не так. Попробуй ещё раз чуть позже.")

    # ---------- скачивание кусками ----------

    async def _document(self, token: str, force: bool = False):
        cached = self._media.get(token)
        now = asyncio.get_running_loop().time()
        if cached and not force and now - cached[1] < MEDIA_TTL_S:
            return cached[0]
        f = db.get_tg_file(token)
        if not f:
            raise FileNotFoundError(token)
        peer = None if f["peer"] == "private" else f["peer"].lstrip("@")
        msg = await self.client.get_messages(peer, ids=f["msg_id"])
        if not msg or not getattr(msg, "document", None):
            raise FileNotFoundError("Видео удалено из Telegram.")
        self._media[token] = (msg.document, now)
        return msg.document

    async def _download(self, token: str, idx: int, size: int) -> bytes:
        from telethon import errors

        for attempt in range(2):
            doc = await self._document(token, force=attempt > 0)
            try:
                async for data in self.client.iter_download(
                    doc, offset=idx * CHUNK, request_size=CHUNK, chunk_size=CHUNK, limit=1, file_size=size
                ):
                    return bytes(data)
                return b""
            except (errors.FileReferenceExpiredError, errors.FileReferenceInvalidError):
                continue
        raise RuntimeError("Не удалось обновить ссылку на файл в Telegram.")

    def _chunk_path(self, token: str, idx: int) -> Path:
        return self.cache_dir / token / f"{idx:06d}"

    async def _fetch_and_store(self, token: str, idx: int, size: int) -> bytes:
        data = await self._download(token, idx, size)
        path = self._chunk_path(token, idx)
        await asyncio.to_thread(self._write_chunk, path, data)
        return data

    def _write_chunk(self, path: Path, data: bytes) -> None:
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(".tmp")
            tmp.write_bytes(data)
            tmp.replace(path)
            if self._cache_size is None:
                self._cache_size = sum(p.stat().st_size for p in self.cache_dir.rglob("*") if p.is_file())
            else:
                self._cache_size += len(data)
            if self._cache_size > self.cache_cap:
                self._evict()
        except OSError as exc:
            print(f"telegram cache write failed: {exc!r}", flush=True)

    def _evict(self) -> None:
        files = sorted((p for p in self.cache_dir.rglob("*") if p.is_file()), key=lambda p: p.stat().st_mtime)
        target = int(self.cache_cap * 0.8)
        total = sum(p.stat().st_size for p in files)
        for p in files:
            if total <= target:
                break
            total -= p.stat().st_size
            p.unlink(missing_ok=True)
        self._cache_size = total

    async def chunk(self, token: str, idx: int, size: int) -> bytes:
        path = self._chunk_path(token, idx)
        if path.exists():
            try:
                return await asyncio.to_thread(path.read_bytes)
            except OSError:
                pass
        key = (token, idx)
        task = self._inflight.get(key)
        if task is None:
            task = asyncio.create_task(self._fetch_and_store(token, idx, size))
            self._inflight[key] = task
            task.add_done_callback(lambda _t: self._inflight.pop(key, None))
        # shield: если зритель закрыл вкладку, скачивание куска для остальных не прерывается
        return await asyncio.shield(task)

    def prefetch(self, token: str, idx: int, size: int) -> None:
        last = (size - 1) // CHUNK
        if 0 <= idx <= last and (token, idx) not in self._inflight and not self._chunk_path(token, idx).exists():
            task = asyncio.create_task(self._fetch_and_store(token, idx, size))
            self._inflight[(token, idx)] = task
            task.add_done_callback(lambda t, k=(token, idx): (self._inflight.pop(k, None), t.exception() if not t.cancelled() else None))

    async def thumbnail(self, token: str) -> bytes | None:
        if token in self._thumbs:
            return self._thumbs[token]
        try:
            doc = await self._document(token)
            if not getattr(doc, "thumbs", None):
                return None
            data = await self.client.download_media(doc, file=bytes, thumb=-1)
        except Exception as exc:
            print(f"telegram thumb failed: {exc!r}", flush=True)
            return None
        if data:
            self._thumbs[token] = data
        return data


bot = TgBot()
