"""HTTP API + WebSocket сервер «Кинозала».

Разработка:  .venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
Продакшен:   собрать фронтенд (npm run build) — сервер сам отдаст frontend/dist.
"""

from __future__ import annotations

import asyncio
import json
import os
import secrets
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import db
from .rooms import manager
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
    yield
    task.cancel()
    for room in manager.rooms.values():
        room.save()


app = FastAPI(title="Кинозал", lifespan=lifespan)


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
        return {"ok": False, "reason": str(exc)}
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

    slug = secrets.token_urlsafe(8).replace("_", "x").replace("-", "z")
    name = body.name.strip() or f"Кинозал {session['name']}"
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
