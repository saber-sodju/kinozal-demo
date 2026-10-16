"""HTTP API + WebSocket сервер Kinora.

Разработка:  .venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
Продакшен:   собрать фронтенд (npm run build) — сервер сам отдаст frontend/dist.
"""

from __future__ import annotations

import asyncio
import json
import re
import os
import secrets
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import db
from .rooms import manager, new_slug
from .search import search_everywhere
from .tgbot import CHUNK, PREFETCH
from .tgbot import bot as tgbot
from .sources import ResolveError, capabilities_for, resolve_url, source_infos

DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


def ice_servers() -> list[dict]:
    servers = [{"urls": ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"]}]
    turn = os.environ.get("KINOZAL_TURN_URL")
    if turn:
        servers.append({
            "urls": turn.split(","),
            "username": os.environ.get("KINOZAL_TURN_USER", ""),
            "credential": os.environ.get("KINOZAL_TURN_PASS", ""),
        })
    return servers


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init()
    task = asyncio.create_task(manager.cleanup_loop())
    await tgbot.start()
    yield
    task.cancel()
    await tgbot.stop()
    for room in manager.rooms.values():
        room.save()


app = FastAPI(title="Kinora", lifespan=lifespan)


# ---------- простой лимит запросов по IP ----------

_hits: dict[str, list[float]] = {}


def limit(request: Request, key: str, max_hits: int, window: float) -> None:
    ip = request.client.host if request.client else "?"
    now = time.monotonic()
    bucket = _hits.setdefault(f"{key}:{ip}", [])
    bucket[:] = [t for t in bucket if now - t < window]
    if len(bucket) >= max_hits:
        raise HTTPException(429, "Слишком много запросов. Подожди минуту.")
    bucket.append(now)


def require_session(authorization: str | None) -> dict:
    token = (authorization or "").removeprefix("Bearer ").strip()
    session = db.session_by_token(token)
    if not session:
        raise HTTPException(401, "Сессия не найдена. Обнови страницу.")
    return session


# ---------- сессии ----------

class SessionIn(BaseModel):
    name: str = Field(min_length=1, max_length=32)
    color: str | None = None


@app.post("/api/sessions")
def create_session(body: SessionIn, request: Request):
    limit(request, "session", 20, 60)
    token, session = db.create_session(body.name.strip(), body.color)
    return {"token": token, "session": session}


@app.get("/api/sessions/me")
def me(authorization: str | None = Header(None)):
    return {"session": require_session(authorization)}


@app.patch("/api/sessions/me")
def update_me(body: SessionIn, authorization: str | None = Header(None)):
    session = require_session(authorization)
    db.update_session(session["id"], body.name.strip(), body.color)
    return {"session": db.session_by_token((authorization or "").removeprefix("Bearer ").strip())}


@app.get("/api/colors")
def colors():
    return {"colors": db.AVATAR_COLORS}


# ---------- каталог и источники ----------

@app.get("/api/catalog")
def catalog(q: str = "", tag: str = "", page: int = 0):
    return {"items": db.search_catalog(q.strip()[:100], tag.strip()[:40], 60, max(page, 0) * 60), "tags": db.all_tags()}


@app.get("/api/catalog/{media_id}")
def catalog_item(media_id: int):
    item = db.get_media(media_id)
    if not item:
        raise HTTPException(404, "Фильм не найден")
    return {"item": item, "capabilities": capabilities_for(item["source"])}


@app.get("/api/search")
async def search(request: Request, q: str = "", kind: str = "all"):
    limit(request, "search", 40, 60)
    return await search_everywhere(q[:100], kind if kind in ("all", "long", "short") else "all")


# ---------- подключение VK (для поиска видео) ----------

def _vk_page(title: str, text: str) -> HTMLResponse:
    return HTMLResponse(
        f"""<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#07070f;color:#f3f4fa;font-family:system-ui">
<div style="max-width:420px;padding:32px;border-radius:24px;background:#151729;text-align:center">
<img src="/logo-mark.png" width="64" height="64" alt=""><h1 style="font-size:22px">{title}</h1>
<p style="color:#a3a7c2;line-height:1.5">{text}</p><a href="/search" style="color:#7c9bff">Перейти к поиску →</a></div></body>"""
    )


@app.get("/api/vk/connect")
def vk_connect(s: str = ""):
    from . import vkauth

    if not vkauth.connect_allowed(s) or not vkauth.app_id():
        raise HTTPException(404)
    return RedirectResponse(vkauth.authorize_url())


@app.get("/api/vk/callback")
async def vk_callback(code: str = "", state: str = "", device_id: str = "", error: str = "", error_description: str = ""):
    from . import vkauth

    if error or not code:
        return _vk_page("VK не подключён", error_description or error or "VK не вернул код авторизации.")
    ok, text = await vkauth.finish(code, state, device_id)
    if not ok:
        return _vk_page("VK не подключён", text)
    return _vk_page("VK подключён ✅", "Теперь поиск на сайте и в боте ищет и в VK Видео.")


@app.get("/api/sources")
def sources():
    return {"sources": source_infos()}


class ResolveIn(BaseModel):
    url: str = Field(max_length=2000)


@app.post("/api/media/resolve")
async def resolve(body: ResolveIn, request: Request):
    limit(request, "resolve", 30, 60)
    try:
        media = await resolve_url(body.url)
    except ResolveError as exc:
        # В лог — чтобы по `railway logs` было видно, какие ссылки не прошли и почему.
        print(f"resolve failed: {body.url[:300]!r} -> {exc}", flush=True)
        return {"ok": False, "reason": str(exc)}
    except Exception as exc:
        print(f"resolve crashed: {body.url[:300]!r} -> {exc!r}", flush=True)
        return {"ok": False, "reason": "Не удалось разобрать эту ссылку. Попробуй другую."}
    return {"ok": True, "media": media, "capabilities": capabilities_for(media["source"])}


# ---------- комнаты ----------

class RoomIn(BaseModel):
    name: str = Field(default="", max_length=60)
    control_mode: str = "everyone"
    catalog_id: int | None = None
    url: str | None = Field(default=None, max_length=2000)


@app.post("/api/rooms")
async def create_room(body: RoomIn, request: Request, authorization: str | None = Header(None)):
    limit(request, "room", 10, 60)
    session = require_session(authorization)
    media = None
    if body.catalog_id is not None:
        item = db.get_media(body.catalog_id)
        if not item:
            raise HTTPException(404, "Фильм не найден")
        media = db.media_descriptor(item)
    elif body.url:
        try:
            media = await resolve_url(body.url)
        except ResolveError as exc:
            raise HTTPException(400, str(exc)) from exc
    if media:
        media["capabilities"] = capabilities_for(media["source"])

    slug = new_slug()
    name = body.name.strip() or f"Комната {session['name']}"
    mode = body.control_mode if body.control_mode in ("everyone", "host_only") else "everyone"
    db.create_room(slug, name, mode, session["id"], {"playback": {"media": media, "position": 0}, "queue": []})
    return {"slug": slug}


@app.get("/api/rooms/{slug}")
def room_info(slug: str):
    room = manager.get(slug)
    if not room:
        raise HTTPException(404, "Комната не найдена или истекла")
    media = room.playback.media
    return {
        "room": room.info(),
        "online": manager.live_count(slug),
        "media": {"title": media["title"], "poster_url": media.get("poster_url")} if media else None,
    }


class ReportIn(BaseModel):
    room_slug: str | None = None
    kind: str = Field(max_length=20)
    target: str | None = Field(default=None, max_length=2000)
    reason: str = Field(min_length=3, max_length=1000)


@app.post("/api/reports")
def report(body: ReportIn, request: Request):
    limit(request, "report", 5, 300)
    db.add_report(body.room_slug, body.kind, body.target, body.reason)
    return {"ok": True}


@app.get("/api/config")
def config():
    return {"tg_bot": tgbot.username if tgbot.ready else None}


# ---------- видео из Telegram (через бота) ----------

MAX_RESPONSE = 64 * 1024 * 1024  # один ответ — не больше 64 МБ, браузер сам запросит дальше


@app.get("/api/tg/stream/{token}")
async def tg_stream(token: str, request: Request):
    f = db.get_tg_file(token)
    if not f or not tgbot.ready:
        raise HTTPException(404, "Видео не найдено")
    size = f["size"]
    start, end = 0, size - 1
    status = 200
    rng = request.headers.get("range", "")
    m = re.match(r"bytes=(\d*)-(\d*)", rng)
    if m and (m.group(1) or m.group(2)):
        status = 206
        if m.group(1):
            start = int(m.group(1))
            end = int(m.group(2)) if m.group(2) else size - 1
        else:  # bytes=-N — последние N байт
            start = max(0, size - int(m.group(2)))
        end = min(end, size - 1, start + MAX_RESPONSE - 1)
        if start >= size or start > end:
            return Response(status_code=416, headers={"Content-Range": f"bytes */{size}"})

    async def body():
        first, last = start // CHUNK, end // CHUNK
        for idx in range(first, last + 1):
            for ahead in range(idx + 1, idx + 1 + PREFETCH):
                tgbot.prefetch(token, ahead, size)
            data = await tgbot.chunk(token, idx, size)
            lo = start - idx * CHUNK if idx == first else 0
            hi = end - idx * CHUNK + 1 if idx == last else len(data)
            yield data[lo:hi]

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(end - start + 1),
        "Cache-Control": "private, max-age=3600",
    }
    if status == 206:
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    return StreamingResponse(body(), status_code=status, headers=headers, media_type=f["mime"])


@app.get("/api/tg/thumb/{token}")
async def tg_thumb(token: str):
    if not db.get_tg_file(token) or not tgbot.ready:
        raise HTTPException(404)
    data = await tgbot.thumbnail(token)
    if not data:
        raise HTTPException(404)
    return Response(data, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


@app.get("/api/health")
def health():
    return {"ok": True, "rooms_in_memory": len(manager.rooms)}


# ---------- WebSocket ----------

@app.websocket("/ws/rooms/{slug}")
async def room_socket(ws: WebSocket, slug: str, token: str = "", last_msg_id: int = 0):
    session = db.session_by_token(token)
    room = manager.get(slug)
    await ws.accept()
    if not session:
        await ws.close(code=4001)
        return
    if not room:
        await ws.close(code=4004)
        return
    if session["id"] in room.banned:
        await ws.close(code=4003)
        return

    member = await manager.connect(room, session, ws, last_msg_id, ice_servers())
    try:
        while True:
            raw = await ws.receive_text()
            if len(raw) > 64_000:
                continue
            try:
                msg = json.loads(raw)
            except ValueError:
                continue
            if isinstance(msg, dict):
                await manager.handle(room, member, msg)
    except WebSocketDisconnect:
        pass
    except Exception as exc:  # не роняем сервер из-за одного клиента
        print("ws error:", repr(exc))
    finally:
        await manager.disconnect(room, member, ws)


# ---------- фронтенд (после npm run build) ----------

if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        file = DIST / path
        if path and file.is_file() and DIST in file.resolve().parents:
            return FileResponse(file)
        return FileResponse(DIST / "index.html")
