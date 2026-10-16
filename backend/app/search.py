"""Поиск видео сразу по всем площадкам, которые мы умеем проигрывать синхронно.

Площадки опрашиваются параллельно через их официальные/публичные API:
  • Rutube          — открытый поиск, ключ не нужен;
  • YouTube         — YouTube Data API (YT_API_KEY), только встраиваемые видео;
  • VK Видео        — VK API video.search (VK_TOKEN — ключ пользователя);
  • Internet Archive — открытый поиск;
  • наш каталог.
Результаты кэшируются, чтобы не тратить лимиты площадок на одинаковые запросы.
Выбранный результат дальше проходит обычную проверку (sources.resolve_url).
"""

from __future__ import annotations

import asyncio
import os
import re
import time
import urllib.parse

from . import db
from .sources import fetch_json

CACHE_TTL_S = 6 * 3600
CACHE_MAX = 500
PROVIDER_TIMEOUT_S = 8
LONG_S = 20 * 60  # «фильмы и серии» — всё, что длиннее 20 минут

_cache: dict[tuple[str, str], tuple[float, dict]] = {}


def _norm(q: str) -> str:
    return re.sub(r"\s+", " ", q.strip().lower())[:100]


def _iso_duration(value: str) -> int | None:
    m = re.fullmatch(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", value or "")
    if not m:
        return None
    d, h, mi, s = (int(x or 0) for x in m.groups())
    return d * 86400 + h * 3600 + mi * 60 + s


# ---------- площадки ----------

async def search_rutube(q: str) -> list[dict]:
    _, data = await fetch_json("https://rutube.ru/api/search/video/?" + urllib.parse.urlencode({"query": q}))
    out = []
    for r in data.get("results") or []:
        if any(r.get(k) for k in ("is_adult", "is_paid", "is_deleted", "is_hidden", "is_livestream", "is_audio")):
            continue
        out.append({
            "source": "rutube",
            "url": r.get("video_url") or f"https://rutube.ru/video/{r['id']}/",
            "title": r.get("title") or "",
            "thumb": r.get("thumbnail_url"),
            "duration_s": r.get("duration"),
            "author": (r.get("author") or {}).get("name"),
        })
    return out


async def search_youtube(q: str) -> list[dict]:
    key = os.environ.get("YT_API_KEY")
    if not key:
        raise LookupError("disabled")
    params = {
        "part": "snippet", "type": "video", "videoEmbeddable": "true", "safeSearch": "moderate",
        "maxResults": "20", "q": q, "key": key, "relevanceLanguage": "ru",
    }
    status, data = await fetch_json("https://www.googleapis.com/youtube/v3/search?" + urllib.parse.urlencode(params))
    if status != 200:
        raise RuntimeError(f"youtube {status}")
    items = data.get("items") or []
    ids = [i["id"]["videoId"] for i in items if i.get("id", {}).get("videoId")]
    durations: dict[str, int | None] = {}
    if ids:
        _, details = await fetch_json(
            "https://www.googleapis.com/youtube/v3/videos?"
            + urllib.parse.urlencode({"part": "contentDetails", "id": ",".join(ids), "key": key})
        )
        for v in details.get("items") or []:
            durations[v["id"]] = _iso_duration(v.get("contentDetails", {}).get("duration", ""))
    out = []
    for i in items:
        vid = i.get("id", {}).get("videoId")
        if not vid:
            continue
        sn = i.get("snippet") or {}
        if sn.get("liveBroadcastContent") not in (None, "none"):
            continue
        thumbs = sn.get("thumbnails") or {}
        out.append({
            "source": "youtube",
            "url": f"https://www.youtube.com/watch?v={vid}",
            "title": _unescape(sn.get("title") or ""),
            "thumb": (thumbs.get("high") or thumbs.get("medium") or thumbs.get("default") or {}).get("url"),
            "duration_s": durations.get(vid),
            "author": sn.get("channelTitle"),
        })
    return out


async def search_vk(q: str) -> list[dict]:
    token = os.environ.get("VK_TOKEN")
    if not token:
        raise LookupError("disabled")
    params = {"q": q, "count": "30", "adult": "0", "sort": "2", "access_token": token, "v": "5.199"}
    _, data = await fetch_json("https://api.vk.com/method/video.search?" + urllib.parse.urlencode(params))
    if "error" in data:
        raise RuntimeError(f"vk {data['error'].get('error_code')}: {data['error'].get('error_msg')}")
    out = []
    for v in (data.get("response") or {}).get("items") or []:
        if v.get("content_restricted") or v.get("live") or not v.get("player"):
            continue
        images = v.get("image") or []
        thumb = min(images, key=lambda i: abs(i.get("width", 0) - 640)).get("url") if images else None
        out.append({
            "source": "vk",
            "url": f"https://vkvideo.ru/video{v['owner_id']}_{v['id']}",
            "title": v.get("title") or "",
            "thumb": thumb,
            "duration_s": v.get("duration"),
            "author": None,
        })
    return out


async def search_archive(q: str) -> list[dict]:
    params = {
        "q": f"({q}) AND mediatype:movies AND -collection:stream_only",
        "fl[]": ["identifier", "title", "year"],
        "sort[]": "downloads desc",
        "rows": "12",
        "output": "json",
    }
    _, data = await fetch_json("https://archive.org/advancedsearch.php?" + urllib.parse.urlencode(params, doseq=True))
    out = []
    for d in (data.get("response") or {}).get("docs") or []:
        ident = d.get("identifier")
        title = d.get("title")
        if isinstance(title, list):
            title = title[0] if title else ""
        out.append({
            "source": "archive",
            "url": f"https://archive.org/details/{ident}",
            "title": f"{title} ({d['year']})" if d.get("year") else (title or ident),
            "thumb": f"https://archive.org/services/img/{urllib.parse.quote(ident)}",
            "duration_s": None,
            "author": "Internet Archive",
        })
    return out


async def search_catalog(q: str) -> list[dict]:
    return [
        {
            "source": "archive",
            "url": item["page_url"] or item["media_url"],
            "title": f"{item['title']} ({item['year']})" if item.get("year") else item["title"],
            "thumb": item.get("poster_url"),
            "duration_s": item.get("duration_s"),
            "author": "Каталог Kinora",
            "catalog_id": item["id"],
        }
        for item in db.search_catalog(q, limit=8)
    ]


def _unescape(text: str) -> str:
    from html import unescape

    return unescape(text)


PROVIDERS = {
    "catalog": search_catalog,
    "rutube": search_rutube,
    "youtube": search_youtube,
    "vk": search_vk,
    "archive": search_archive,
}


async def _run(name: str, q: str) -> tuple[str, str, list[dict]]:
    try:
        results = await asyncio.wait_for(PROVIDERS[name](q), PROVIDER_TIMEOUT_S)
        return name, "ok", results
    except LookupError:
        return name, "disabled", []
    except Exception as exc:
        print(f"search {name} failed for {q!r}: {exc!r}", flush=True)
        return name, "error", []


async def search_everywhere(query: str, kind: str = "all") -> dict:
    q = _norm(query)
    if len(q) < 2:
        return {"query": q, "results": [], "providers": {}}
    key = (q, kind)
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_TTL_S:
        return hit[1]

    runs = await asyncio.gather(*(_run(name, q) for name in PROVIDERS))
    providers = {name: status for name, status, _ in runs}
    lists = [res for _, _, res in runs]

    # Перемешиваем площадки по очереди, чтобы сверху было разнообразие, и убираем дубли.
    merged, seen = [], set()
    for i in range(max((len(x) for x in lists), default=0)):
        for res in lists:
            if i < len(res) and res[i]["url"] not in seen:
                seen.add(res[i]["url"])
                merged.append(res[i])

    if kind == "long":
        merged = [r for r in merged if (r.get("duration_s") or LONG_S) >= LONG_S]
    elif kind == "short":
        merged = [r for r in merged if r.get("duration_s") and r["duration_s"] < LONG_S]

    result = {"query": q, "results": merged[:60], "providers": providers}
    if any(s == "ok" for s in providers.values()):
        if len(_cache) >= CACHE_MAX:
            _cache.pop(next(iter(_cache)))
        _cache[key] = (time.time(), result)
    return result
