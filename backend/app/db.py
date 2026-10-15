"""Хранилище на SQLite (stdlib).

Схема повторяет план (users/rooms/members/media/chat). Для продакшена её можно
перенести на Postgres без изменения остального кода — все запросы в этом файле.
"""

from __future__ import annotations

import hashlib
import json
import os
import secrets
import sqlite3
import time
from pathlib import Path

DB_PATH = Path(os.environ.get("KINOZAL_DB", Path(__file__).resolve().parent.parent / "kinozal.db"))
SEED_PATH = Path(__file__).resolve().parent / "catalog_seed.json"

ROOM_TTL_S = 7 * 24 * 3600
CHAT_TTL_S = 30 * 24 * 3600
AVATAR_COLORS = ["#F5B544", "#FF7A6B", "#7AD3A8", "#7FB2FF", "#C59BFF", "#FF9BD2", "#5ED0E0", "#E8D36A"]

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    token_hash TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at REAL NOT NULL,
    last_seen_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS media_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    external_id TEXT NOT NULL,
    title TEXT NOT NULL,
    year INTEGER,
    description TEXT,
    duration_s INTEGER,
    poster_url TEXT,
    media_url TEXT NOT NULL,
    page_url TEXT,
    license TEXT,
    license_url TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    UNIQUE(source, external_id)
);
CREATE TABLE IF NOT EXISTS rooms (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    control_mode TEXT NOT NULL DEFAULT 'everyone',
    host_session_id TEXT NOT NULL,
    snapshot TEXT NOT NULL DEFAULT '{}',
    created_at REAL NOT NULL,
    last_active_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_slug TEXT NOT NULL,
    session_id TEXT,
    author_name TEXT,
    author_color TEXT,
    kind TEXT NOT NULL DEFAULT 'text',
    body TEXT NOT NULL,
    created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_room ON chat_messages(room_slug, id);
CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_slug TEXT,
    kind TEXT NOT NULL,
    target TEXT,
    reason TEXT NOT NULL,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS tg_files (
    token TEXT PRIMARY KEY,
    peer TEXT NOT NULL,
    msg_id INTEGER NOT NULL,
    size INTEGER NOT NULL,
    mime TEXT NOT NULL,
    duration INTEGER,
    title TEXT NOT NULL,
    file_name TEXT,
    created_at REAL NOT NULL,
    UNIQUE(peer, msg_id)
);
"""

_conn: sqlite3.Connection | None = None


def conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(DB_PATH, check_same_thread=False, isolation_level=None)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA journal_mode=WAL")
    return _conn


def init() -> None:
    c = conn()
    c.executescript(SCHEMA)
    now = time.time()
    c.execute("DELETE FROM rooms WHERE last_active_at < ?", (now - ROOM_TTL_S,))
    c.execute("DELETE FROM chat_messages WHERE created_at < ?", (now - CHAT_TTL_S,))
    seed_catalog()


def seed_catalog() -> None:
    if not SEED_PATH.exists():
        return
    items = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    c = conn()
    for it in items:
        c.execute(
            """INSERT INTO media_items (source, external_id, title, year, description, duration_s,
                   poster_url, media_url, page_url, license, license_url, tags)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(source, external_id) DO UPDATE SET
                   title=excluded.title, year=excluded.year, description=excluded.description,
                   duration_s=excluded.duration_s, poster_url=excluded.poster_url,
                   media_url=excluded.media_url, page_url=excluded.page_url,
                   license=excluded.license, license_url=excluded.license_url, tags=excluded.tags""",
            (
                it["source"], it["external_id"], it["title"], it.get("year"), it.get("description"),
                it.get("duration_s"), it.get("poster_url"), it["media_url"], it.get("page_url"),
                it.get("license"), it.get("license_url"), json.dumps(it.get("tags") or [], ensure_ascii=False),
            ),
        )


# ---------- Гостевые сессии ----------

def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _session_row(row: sqlite3.Row) -> dict:
    return {"id": row["id"], "name": row["display_name"], "color": row["color"]}


def create_session(display_name: str, color: str | None = None) -> tuple[str, dict]:
    token = secrets.token_urlsafe(32)
    sid = secrets.token_hex(8)
    color = color if color in AVATAR_COLORS else secrets.choice(AVATAR_COLORS)
    now = time.time()
    conn().execute(
        "INSERT INTO sessions (id, token_hash, display_name, color, created_at, last_seen_at) VALUES (?,?,?,?,?,?)",
        (sid, _hash(token), display_name, color, now, now),
    )
    return token, {"id": sid, "name": display_name, "color": color}


def session_by_token(token: str | None) -> dict | None:
    if not token:
        return None
    row = conn().execute("SELECT * FROM sessions WHERE token_hash = ?", (_hash(token),)).fetchone()
    if not row:
        return None
    conn().execute("UPDATE sessions SET last_seen_at = ? WHERE id = ?", (time.time(), row["id"]))
    return _session_row(row)


def update_session(sid: str, display_name: str | None, color: str | None) -> None:
    if display_name:
        conn().execute("UPDATE sessions SET display_name = ? WHERE id = ?", (display_name, sid))
    if color in AVATAR_COLORS:
        conn().execute("UPDATE sessions SET color = ? WHERE id = ?", (color, sid))


# ---------- Каталог ----------

def _media_row(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["tags"] = json.loads(d["tags"] or "[]")
    return d


def search_catalog(q: str = "", tag: str = "", limit: int = 60, offset: int = 0) -> list[dict]:
    sql = "SELECT * FROM media_items WHERE 1=1"
    args: list = []
    if q:
        sql += " AND (title LIKE ? OR description LIKE ? OR tags LIKE ? OR CAST(year AS TEXT) = ?)"
        like = f"%{q}%"
        args += [like, like, like, q]
    if tag:
        sql += " AND tags LIKE ?"
        args.append(f'%"{tag}"%')
    sql += " ORDER BY title COLLATE NOCASE LIMIT ? OFFSET ?"
    args += [limit, offset]
    return [_media_row(r) for r in conn().execute(sql, args).fetchall()]


def get_media(media_id: int) -> dict | None:
    row = conn().execute("SELECT * FROM media_items WHERE id = ?", (media_id,)).fetchone()
    return _media_row(row) if row else None


TAG_BLACKLIST = {"pdmovies", "feature film", "feature_films", "movie", "movies", "film", "public domain"}


def all_tags(min_count: int = 2) -> list[str]:
    counts: dict[str, int] = {}
    for (tags,) in conn().execute("SELECT tags FROM media_items").fetchall():
        for t in json.loads(tags or "[]"):
            if t not in TAG_BLACKLIST:
                counts[t] = counts.get(t, 0) + 1
    return sorted([t for t, n in counts.items() if n >= min_count], key=lambda t: (-counts[t], t))[:16]


def media_descriptor(item: dict) -> dict:
    """Каталожная запись → описание медиа для комнаты."""
    return {
        "source": item["source"],
        "external_id": item["external_id"],
        "url": item["media_url"],
        "title": item["title"],
        "subtitle": " · ".join(str(x) for x in [item.get("year"), item.get("license")] if x),
        "poster_url": item.get("poster_url"),
        "duration_s": item.get("duration_s"),
        "catalog_id": item["id"],
    }


# ---------- Комнаты ----------

def create_room(slug: str, name: str, control_mode: str, host_session_id: str, snapshot: dict) -> None:
    now = time.time()
    conn().execute(
        "INSERT INTO rooms (slug, name, control_mode, host_session_id, snapshot, created_at, last_active_at) VALUES (?,?,?,?,?,?,?)",
        (slug, name, control_mode, host_session_id, json.dumps(snapshot, ensure_ascii=False), now, now),
    )


def get_room(slug: str) -> dict | None:
    row = conn().execute("SELECT * FROM rooms WHERE slug = ?", (slug,)).fetchone()
    if not row:
        return None
    d = dict(row)
    d["snapshot"] = json.loads(d["snapshot"] or "{}")
    return d


def save_room(slug: str, name: str, control_mode: str, host_session_id: str, snapshot: dict) -> None:
    conn().execute(
        "UPDATE rooms SET name=?, control_mode=?, host_session_id=?, snapshot=?, last_active_at=? WHERE slug=?",
        (name, control_mode, host_session_id, json.dumps(snapshot, ensure_ascii=False), time.time(), slug),
    )


# ---------- Чат и жалобы ----------

def add_message(room_slug: str, session: dict | None, body: str, kind: str = "text") -> dict:
    now = time.time()
    cur = conn().execute(
        "INSERT INTO chat_messages (room_slug, session_id, author_name, author_color, kind, body, created_at) VALUES (?,?,?,?,?,?,?)",
        (room_slug, session and session["id"], session and session["name"], session and session["color"], kind, body, now),
    )
    return {
        "id": cur.lastrowid,
        "author_id": session and session["id"],
        "author_name": session and session["name"],
        "author_color": session and session["color"],
        "kind": kind,
        "body": body,
        "created_at": int(now * 1000),
    }


def recent_messages(room_slug: str, after_id: int = 0, limit: int = 80) -> list[dict]:
    rows = conn().execute(
        "SELECT * FROM chat_messages WHERE room_slug = ? AND id > ? ORDER BY id DESC LIMIT ?",
        (room_slug, after_id, limit),
    ).fetchall()
    return [
        {
            "id": r["id"],
            "author_id": r["session_id"],
            "author_name": r["author_name"],
            "author_color": r["author_color"],
            "kind": r["kind"],
            "body": r["body"],
            "created_at": int(r["created_at"] * 1000),
        }
        for r in reversed(rows)
    ]


# ---------- Видео из Telegram (через бота) ----------

def add_tg_file(token: str, peer: str, msg_id: int, size: int, mime: str, duration: int | None, title: str, file_name: str | None) -> None:
    conn().execute(
        "INSERT OR IGNORE INTO tg_files (token, peer, msg_id, size, mime, duration, title, file_name, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
        (token, peer, msg_id, size, mime, duration, title, file_name, time.time()),
    )


def get_tg_file(token: str) -> dict | None:
    row = conn().execute("SELECT * FROM tg_files WHERE token = ?", (token,)).fetchone()
    return dict(row) if row else None


def find_tg_file(peer: str, msg_id: int) -> dict | None:
    row = conn().execute("SELECT * FROM tg_files WHERE peer = ? AND msg_id = ?", (peer, msg_id)).fetchone()
    return dict(row) if row else None


def add_report(room_slug: str | None, kind: str, target: str | None, reason: str) -> None:
    conn().execute(
        "INSERT INTO reports (room_slug, kind, target, reason, created_at) VALUES (?,?,?,?,?)",
        (room_slug, kind, target, reason, time.time()),
    )
