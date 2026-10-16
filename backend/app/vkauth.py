"""Подключение VK для поиска видео (VK ID, OAuth 2.1 + PKCE).

Поиск видео VK (video.search) работает только с ключом пользователя.
Владелец сайта один раз открывает секретную ссылку /api/vk/connect?s=<VK_CONNECT_SECRET>,
входит в VK и нажимает «Разрешить». Ключи сохраняются в БД, а сервер сам продлевает их
по refresh_token, когда истекает срок (около часа).

Переменные: VK_APP_ID (ID приложения VK ID), VK_CONNECT_SECRET (любая длинная строка).
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os
import secrets
import time
import urllib.parse
import urllib.request

from . import db
from .tgbot import public_base

AUTHORIZE_URL = "https://id.vk.com/authorize"
TOKEN_URL = "https://id.vk.com/oauth2/auth"
SCOPE = "vkid.personal_info video"
KV_KEY = "vk_tokens"

_pending: dict[str, tuple[str, float]] = {}  # state → (code_verifier, время)
_lock = asyncio.Lock()


def app_id() -> str:
    return os.environ.get("VK_APP_ID", "")


def redirect_uri() -> str:
    return f"{public_base()}/api/vk/callback"


def connect_allowed(secret: str) -> bool:
    expected = os.environ.get("VK_CONNECT_SECRET", "")
    return bool(expected) and secrets.compare_digest(secret, expected)


def authorize_url() -> str:
    verifier = secrets.token_urlsafe(48)[:64]
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state = secrets.token_urlsafe(24)
    now = time.time()
    for k, (_, t) in list(_pending.items()):
        if now - t > 900:
            _pending.pop(k, None)
    _pending[state] = (verifier, now)
    params = {
        "response_type": "code",
        "client_id": app_id(),
        "redirect_uri": redirect_uri(),
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "scope": SCOPE,
    }
    return f"{AUTHORIZE_URL}?{urllib.parse.urlencode(params)}"


def _post(url: str, form: dict) -> dict:
    req = urllib.request.Request(
        url,
        data=urllib.parse.urlencode(form).encode(),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        try:
            return json.loads(exc.read().decode())
        except Exception:
            return {"error": f"http {exc.code}"}


def _save(data: dict, device_id: str) -> None:
    db.set_kv(KV_KEY, {
        "access_token": data["access_token"],
        "refresh_token": data.get("refresh_token"),
        "device_id": device_id,
        "expires_at": time.time() + int(data.get("expires_in") or 3600),
        "user_id": data.get("user_id"),
        "scope": data.get("scope"),
    })


async def finish(code: str, state: str, device_id: str) -> tuple[bool, str]:
    pending = _pending.pop(state, None)
    if not pending:
        return False, "Ссылка устарела. Открой ссылку подключения ещё раз."
    verifier, _ = pending
    data = await asyncio.to_thread(_post, TOKEN_URL, {
        "grant_type": "authorization_code",
        "code_verifier": verifier,
        "redirect_uri": redirect_uri(),
        "code": code,
        "client_id": app_id(),
        "device_id": device_id,
        "state": state,
    })
    if "access_token" not in data:
        print(f"vk auth failed: {data}", flush=True)
        return False, f"VK не выдал ключ: {data.get('error_description') or data.get('error') or data}"
    _save(data, device_id)
    print(f"vk auth: подключён аккаунт {data.get('user_id')}, scope={data.get('scope')}", flush=True)
    return True, "VK подключён"


async def access_token() -> str | None:
    """Действующий ключ VK: из переменной VK_TOKEN или сохранённый (с автопродлением)."""
    if os.environ.get("VK_TOKEN"):
        return os.environ["VK_TOKEN"]
    saved = db.get_kv(KV_KEY)
    if not saved:
        return None
    if time.time() < saved.get("expires_at", 0) - 60:
        return saved["access_token"]
    async with _lock:
        saved = db.get_kv(KV_KEY) or saved
        if time.time() < saved.get("expires_at", 0) - 60:
            return saved["access_token"]
        if not saved.get("refresh_token"):
            return None
        data = await asyncio.to_thread(_post, TOKEN_URL, {
            "grant_type": "refresh_token",
            "refresh_token": saved["refresh_token"],
            "client_id": app_id(),
            "device_id": saved.get("device_id", ""),
            "state": secrets.token_urlsafe(16),
        })
        if "access_token" not in data:
            print(f"vk refresh failed: {data}", flush=True)
            return None
        _save(data, saved.get("device_id", ""))
        return data["access_token"]
