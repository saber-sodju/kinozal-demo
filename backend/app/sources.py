"""Адаптеры источников видео.

Каждый адаптер умеет:
  match(url)            — узнать «свою» ссылку;
  resolve(url)          — превратить ссылку в описание медиа + проверить, можно ли его встроить.

Новый источник = новый класс + строка в ADAPTERS. Остальной код не меняется.
Видео никогда не идёт через наш сервер: клиент играет его напрямую с источника.
"""

from __future__ import annotations

import asyncio
import ipaddress
import json
import re
import socket
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field

USER_AGENT = "kinozal/1.0 (+watch-party)"


class ResolveError(Exception):
    """Ссылку не удалось превратить в проигрываемое видео. Текст — для пользователя."""


@dataclass
class Capabilities:
    can_seek: bool = True
    can_set_rate: bool = True       # плавная подстройка скорости для догона
    may_have_ads: bool = False      # реклама у каждого своя → возможен рассинхрон
    needs_auth: bool = False


@dataclass
class SourceInfo:
    id: str
    name: str
    examples: list[str]
    capabilities: Capabilities
    notes: list[str] = field(default_factory=list)


# ---------- HTTP-помощники (stdlib, в отдельном потоке) ----------

def _fetch(url: str, method: str = "GET", timeout: float = 10) -> tuple[int, dict, bytes]:
    req = urllib.request.Request(url, method=method, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read(2_000_000) if method == "GET" else b""
            return resp.status, dict(resp.headers), body
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers or {}), b""


async def fetch(url: str, method: str = "GET") -> tuple[int, dict, bytes]:
    try:
        return await asyncio.to_thread(_fetch, url, method)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise ResolveError("Источник не отвечает. Попробуй позже.") from exc


async def fetch_json(url: str) -> tuple[int, dict]:
    status, _, body = await fetch(url)
    if status != 200:
        return status, {}
    try:
        return status, json.loads(body)
    except ValueError:
        return status, {}


def _assert_public_host(url: str) -> None:
    """Защита от SSRF: не даём серверу ходить во внутреннюю сеть по ссылке пользователя."""
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ResolveError("Нужна ссылка вида https://…")
    try:
        infos = socket.getaddrinfo(parsed.hostname, None)
    except socket.gaierror as exc:
        raise ResolveError("Такой сайт не найден.") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise ResolveError("Эта ссылка ведёт во внутреннюю сеть — такие не поддерживаются.")


# ---------- YouTube ----------

YT_ID = re.compile(
    r"(?:youtube\.com/(?:watch\?(?:.*&)?v=|embed/|shorts/|live/)|youtu\.be/)([A-Za-z0-9_-]{11})"
)


class YouTubeAdapter:
    info = SourceInfo(
        id="youtube",
        name="YouTube",
        examples=["https://www.youtube.com/watch?v=…", "https://youtu.be/…"],
        capabilities=Capabilities(can_set_rate=False, may_have_ads=True),
        notes=[
            "Работает только если владелец разрешил встраивание.",
            "Реклама показывается каждому отдельно — во время неё возможен рассинхрон, после неё плеер догонит.",
            "Видео с возрастным ограничением не встраиваются.",
        ],
    )

    def match(self, url: str) -> bool:
        return bool(YT_ID.search(url))

    async def resolve(self, url: str) -> dict:
        video_id = YT_ID.search(url).group(1)
        canonical = f"https://www.youtube.com/watch?v={video_id}"
        status, data = await fetch_json(
            "https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote(canonical, safe="")
        )
        # oEmbed: 401/403 — встраивание запрещено, 404/400 — видео нет или оно приватное.
        if status in (401, 403):
            raise ResolveError("Владелец запретил встраивание этого видео на других сайтах.")
        if status != 200:
            raise ResolveError("Видео не найдено, удалено или приватное.")
        return {
            "source": "youtube",
            "external_id": video_id,
            "url": canonical,
            "title": data.get("title") or "YouTube-видео",
            "subtitle": data.get("author_name"),
            "poster_url": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
            "duration_s": None,  # плеер сообщит сам
        }


# ---------- Vimeo ----------

VIMEO_ID = re.compile(r"vimeo\.com/(?:video/|channels/[\w-]+/|groups/[\w-]+/videos/)?(\d{5,})")


class VimeoAdapter:
    info = SourceInfo(
        id="vimeo",
        name="Vimeo",
        examples=["https://vimeo.com/1084537"],
        capabilities=Capabilities(can_set_rate=False),
        notes=[
            "Владелец может ограничить встраивание определёнными сайтами.",
            "Скрыть родные кнопки плеера Vimeo можно только у видео платных аккаунтов.",
        ],
    )

    def match(self, url: str) -> bool:
        return bool(VIMEO_ID.search(url))

    async def resolve(self, url: str) -> dict:
        video_id = VIMEO_ID.search(url).group(1)
        status, data = await fetch_json(
            "https://vimeo.com/api/oembed.json?url="
            + urllib.parse.quote(f"https://vimeo.com/{video_id}", safe="")
        )
        if status in (401, 403):
            raise ResolveError("Владелец запретил встраивание этого видео.")
        if status != 200:
            raise ResolveError("Видео не найдено или приватное.")
        return {
            "source": "vimeo",
            "external_id": video_id,
            "url": f"https://vimeo.com/{video_id}",
            "title": data.get("title") or "Vimeo-видео",
            "subtitle": data.get("author_name"),
            "poster_url": data.get("thumbnail_url"),
            "duration_s": data.get("duration"),
        }


# ---------- Internet Archive ----------

ARCHIVE_ID = re.compile(r"archive\.org/(?:details|embed|download)/([^/?#]+)")
ARCHIVE_FORMATS = ["h.264", "h.264 IA", "MPEG4"]


def parse_length(raw) -> int | None:
    if raw is None:
        return None
    raw = str(raw)
    try:
        if ":" in raw:
            seconds = 0.0
            for part in raw.split(":"):
                seconds = seconds * 60 + float(part)
            return int(seconds)
        return int(float(raw))
    except ValueError:
        return None


def pick_archive_video(files: list[dict]) -> dict | None:
    for fmt in ARCHIVE_FORMATS:
        candidates = [
            f for f in files
            if f.get("format") == fmt and f.get("name", "").lower().endswith(".mp4")
        ]
        if candidates:
            return max(candidates, key=lambda f: int(f.get("size", 0) or 0))
    return None


def archive_license(licenseurl: str | None) -> str:
    if licenseurl and "publicdomain" in licenseurl:
        return "Public domain"
    if licenseurl and "creativecommons" in licenseurl:
        kind = licenseurl.rstrip("/").split("/licenses/")[-1].split("/")[0].upper()
        return f"Creative Commons {kind}".strip()
    return "Public domain (по данным Internet Archive)"


def clean_text(html: str | None, limit: int = 600) -> str:
    if not html:
        return ""
    text = re.sub(r"<br\s*/?>", "\n", html, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > limit:
        text = text[:limit].rsplit(" ", 1)[0] + "…"
    return text


class ArchiveAdapter:
    info = SourceInfo(
        id="archive",
        name="Internet Archive",
        examples=["https://archive.org/details/his_girl_friday"],
        capabilities=Capabilities(),
        notes=[
            "Играем прямой MP4-файл — полная синхронизация.",
            "Серверы архива иногда медленные: первая загрузка может занять несколько секунд.",
            "Права на фильм указывает загрузивший — проверяй лицензию на странице фильма.",
        ],
    )

    def match(self, url: str) -> bool:
        return bool(ARCHIVE_ID.search(url))

    async def resolve(self, url: str) -> dict:
        identifier = urllib.parse.unquote(ARCHIVE_ID.search(url).group(1))
        status, data = await fetch_json(f"https://archive.org/metadata/{urllib.parse.quote(identifier)}")
        if status != 200 or not data.get("metadata"):
            raise ResolveError("Такой страницы в Internet Archive нет.")
        video = pick_archive_video(data.get("files") or [])
        if not video:
            raise ResolveError("В этой записи нет видео в формате, который понимает браузер (MP4/H.264).")
        meta = data["metadata"]
        title = meta.get("title")
        if isinstance(title, list):
            title = title[0]
        return {
            "source": "archive",
            "external_id": identifier,
            "url": f"https://archive.org/download/{urllib.parse.quote(identifier)}/{urllib.parse.quote(video['name'])}",
            "title": clean_text(title, 160) or identifier,
            "subtitle": archive_license(meta.get("licenseurl")),
            "poster_url": f"https://archive.org/services/img/{urllib.parse.quote(identifier)}",
            "duration_s": parse_length(video.get("length")),
        }


# ---------- Прямая ссылка на файл ----------

DIRECT_EXT = re.compile(r"\.(mp4|webm|ogv|ogg|m4v|m3u8)(?:$|[?#])", re.I)


class DirectAdapter:
    info = SourceInfo(
        id="direct",
        name="Прямая ссылка на файл",
        examples=["https://example.com/film.mp4", "https://example.com/stream.m3u8"],
        capabilities=Capabilities(),
        notes=[
            "Поддерживаются MP4, WebM, OGG и HLS (.m3u8).",
            "Сайт-источник должен разрешать воспроизведение с других сайтов (hotlink, CORS для HLS).",
            "Используй только видео, на которое у тебя есть права.",
        ],
    )

    def match(self, url: str) -> bool:
        return bool(DIRECT_EXT.search(urllib.parse.urlparse(url).path + " ")) or bool(DIRECT_EXT.search(url))

    async def resolve(self, url: str) -> dict:
        await asyncio.to_thread(_assert_public_host, url)
        status, headers, _ = await fetch(url, method="HEAD")
        if status == 405:  # некоторые сервера не любят HEAD
            status, headers, _ = 200, {}, b""
        if status >= 400:
            raise ResolveError(f"Файл недоступен (ответ сервера {status}).")
        ctype = {k.lower(): v for k, v in headers.items()}.get("content-type", "")
        if ctype and not (ctype.startswith("video/") or "mpegurl" in ctype or "octet-stream" in ctype or "ogg" in ctype):
            raise ResolveError("По ссылке не видеофайл.")
        name = urllib.parse.unquote(urllib.parse.urlparse(url).path.rsplit("/", 1)[-1]) or "Видео"
        return {
            "source": "direct",
            "external_id": url,
            "url": url,
            "title": name,
            "subtitle": urllib.parse.urlparse(url).hostname,
            "poster_url": None,
            "duration_s": None,
        }


ADAPTERS = [YouTubeAdapter(), VimeoAdapter(), ArchiveAdapter(), DirectAdapter()]


def source_infos() -> list[dict]:
    from dataclasses import asdict

    return [asdict(a.info) for a in ADAPTERS]


def capabilities_for(source: str) -> dict:
    from dataclasses import asdict

    for adapter in ADAPTERS:
        if adapter.info.id == source:
            return asdict(adapter.info.capabilities)
    return asdict(Capabilities())


async def resolve_url(url: str) -> dict:
    url = url.strip()
    if not url:
        raise ResolveError("Вставь ссылку на видео.")
    if not re.match(r"^https?://", url, re.I):
        url = "https://" + url
    for adapter in ADAPTERS:
        if adapter.match(url):
            return await adapter.resolve(url)
    raise ResolveError(
        "Этот сайт не поддерживается. Подходят YouTube, Vimeo, Internet Archive и прямые ссылки на .mp4/.webm/.m3u8."
    )
