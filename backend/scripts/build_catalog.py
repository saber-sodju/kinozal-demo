"""Собирает курированный каталог фильмов из Internet Archive.

Запуск (из папки backend):  .venv/Scripts/python scripts/build_catalog.py
Результат: app/catalog_seed.json — сервер загружает его в БД при старте.

Видео не скачиваются: сохраняются только метаданные и прямая ссылка на MP4.
"""

import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.sources import archive_license, clean_text, parse_length, pick_archive_video  # noqa: E402

# Вручную отобранный список. Чтобы добавить фильм — допиши identifier с archive.org.
IDENTIFIERS = [
    "his_girl_friday",
    "Sita_Sings_the_Blues",
    "house_on_haunted_hill_ipod",
    "lost_world",
    "CarnivalofSouls",
    "ScarletStreet",
    "TheStranger_0",
    "meet_john_doe",
    "royal_wedding",
    "gullivers_travels1939",
    "little_princess",
    "charlie_chaplin_film_fest",
    "TheFlyingDeuces",
    "Cyrano_DeBergerac",
    "suddenly",
    "dressed_to_kill",
    "Nosferatu_DVD_quality",
    "night_of_the_living_dead_dvd",
    "TheGeneral_201312",
    "BattleshipPotemkin_644",
    "ATripToTheMoonGeorgeMelies",
    "BigBuckBunny_124",
    "Sintel",
    "Tears-of-Steel",
    "plan-9-from-outer-space",
    "ElHombreConLaCamara",
    "JungleBook",
    "my_favorite_brunette",
    "Killers_from_space",
    "Horror_Express",
    "impact",
    "Quicksand_clear",
    "ThePhantomoftheOpera",
    "DasKabinettdesDoktorCaligariTheCabinetofDrCaligari",
    "20000LeaguesUndertheSea",
]

OUT = Path(__file__).resolve().parent.parent / "app" / "catalog_seed.json"


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "kinozal-catalog-builder/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def first(value):
    if isinstance(value, list):
        return value[0] if value else None
    return value


def build_item(identifier: str) -> dict | None:
    data = fetch_json(f"https://archive.org/metadata/{identifier}")
    meta = data.get("metadata") or {}
    video = pick_archive_video(data.get("files") or [])
    if not video:
        return None

    year = first(meta.get("year")) or (str(first(meta.get("date")) or "")[:4] or None)
    subjects = meta.get("subject") or []
    if isinstance(subjects, str):
        subjects = re.split(r"[;,]", subjects)
    licenseurl = first(meta.get("licenseurl"))
    quoted_id = urllib.parse.quote(identifier)

    return {
        "source": "archive",
        "external_id": identifier,
        "title": clean_text(first(meta.get("title")), 160) or identifier,
        "year": int(year) if year and str(year).isdigit() else None,
        "description": clean_text(first(meta.get("description"))),
        "duration_s": parse_length(video.get("length")),
        "poster_url": f"https://archive.org/services/img/{quoted_id}",
        "media_url": f"https://archive.org/download/{quoted_id}/{urllib.parse.quote(video['name'])}",
        "page_url": f"https://archive.org/details/{quoted_id}",
        "license": archive_license(licenseurl),
        "license_url": licenseurl,
        "tags": [s.strip().lower() for s in subjects if s.strip()][:6],
    }


def main() -> None:
    items, skipped = [], []
    for identifier in IDENTIFIERS:
        try:
            item = build_item(identifier)
        except Exception as exc:  # сеть, 404 и т.п.
            skipped.append(f"{identifier} ({exc})")
            continue
        if item:
            items.append(item)
            print(f"ok   {identifier}")
        else:
            skipped.append(f"{identifier} (нет MP4)")
            print(f"skip {identifier}")

    OUT.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nСохранено {len(items)} фильмов в {OUT}")
    if skipped:
        print("Пропущено:", *skipped, sep="\n  ")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
