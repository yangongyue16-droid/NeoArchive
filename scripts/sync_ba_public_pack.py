#!/usr/bin/env python3
"""Sync the newest public Blue Archive story pack for local NeoArchive development.

Sources (community mirrors, not official game CDNs):
  - ba-archive `ba-all-data` on yuuka.cdn.diyigemt.com (indexes: 2026-06-23)
  - SchaleDB JP student metadata and portraits (live)

Usage:
  python3 scripts/sync_ba_public_pack.py
  python3 scripts/sync_ba_public_pack.py --groups indexes,backgrounds,portraits
  python3 scripts/sync_ba_public_pack.py --force
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

from ba_zh_labels import background_label, bgm_label, character_label, load_tokens, sfx_label

ROOT = Path(__file__).resolve().parents[1]
PACK_ROOT = ROOT / "research-assets" / "ba-public-pack"
INDEX_DIR = PACK_ROOT / "indexes"
CDN_ROOT = PACK_ROOT / "ba-all-data"
SPINE42_ROOT = PACK_ROOT / "ba-all-data-spine42"
SCHALE_ROOT = PACK_ROOT / "schaledb"

CDN_BASE = "https://yuuka.cdn.diyigemt.com/image/ba-all-data"
SPINE42_BASE = "https://yuuka.cdn.diyigemt.com/image/ba-all-data-spine42"
SCHALE_BASE = "https://schaledb.com"

USER_AGENT = "NeoArchive-research/1.0 (local story-editor development)"
CH_OR_NP = re.compile(r"^(?:ch|np)\d+", re.IGNORECASE)
BGM_VARIANT_SUFFIX = re.compile(
    r"_(Short|VeryShort|Intro|Verse|Chorus|Blank|Inst2|Inst|Title|8bit|Light|Song)$"
)
BGM_TITLES_PATH = ROOT / "scripts" / "ba_bgm_titles.json"
STORY_SE_PATH = ROOT / "scripts" / "ba_story_se.json"

INDEX_FILES = (
    "ScenarioBGNameExcelTable.json",
    "ScenarioCharacterNameExcelTable.json",
    "BGMExcelTable.json",
    "CharacterExcelTable.json",
    "CostumeExcelTable.json",
    "ScenarioTransitionExcelTable.json",
    "ScenarioCharacterEmotionExcelTable.json",
    "ScenarioBGEffectExcelTable.json",
)

PORTRAIT_URL_ALIASES = {
    f"{CDN_BASE}/UIs/01_Common/01_Character/Student_Portrait_CH0077.png": (
        f"{CDN_BASE}/UIs/01_Common/01_Character/Student_Portrait_Ibuki.png",
    ),
    f"{CDN_BASE}/UIs/01_Common/01_Character/Student_Portrait_CH0081.png": (
        f"{CDN_BASE}/UIs/01_Common/01_Character/Student_Portrait_Sena.png",
    ),
    f"{CDN_BASE}/UIs/01_Common/01_Character/NPC_Portrait_Binah.png": (
        f"{SCHALE_BASE}/images/raid/Boss_Portrait_Binah_Lobby.png",
        f"https://raw.githubusercontent.com/SchaleDB/SchaleDB/main/images/raid/Boss_Portrait_Binah_Lobby.png",
    ),
}

LOCAL_PORTRAIT_ALIASES = {
    "UIs/01_Common/01_Character/Student_Portrait_CH0077.png": "UIs/01_Common/01_Character/Student_Portrait_Ibuki.png",
    "UIs/01_Common/01_Character/Student_Portrait_CH0081.png": "UIs/01_Common/01_Character/Student_Portrait_Sena.png",
}


def filename_case_variants(filename: str) -> list[str]:
    if "." not in filename:
        return [filename]
    stem, ext = filename.rsplit(".", 1)
    parts = stem.split("_")
    variants = {filename}
    if parts:
        variants.add("_".join(part.capitalize() for part in parts) + f".{ext}")
        titled = [part[:1].upper() + part[1:] if part else part for part in parts]
        variants.add("_".join(titled) + f".{ext}")
        variants.add("_".join([*titled[:-1], parts[-1]]) + f".{ext}")
        variants.add("_".join([*titled[:-1], parts[-1].lower()]) + f".{ext}")
    return [item for item in variants if item]


def candidate_urls(url: str) -> list[str]:
    urls = [url]
    if url.startswith(f"{CDN_BASE}/"):
        relative = url[len(CDN_BASE) + 1 :]
        directory, _, filename = relative.rpartition("/")
        for variant in filename_case_variants(filename):
            if directory:
                urls.append(f"{CDN_BASE}/{directory}/{variant}")
            else:
                urls.append(f"{CDN_BASE}/{variant}")
    urls.extend(PORTRAIT_URL_ALIASES.get(url, ()))
    seen: set[str] = set()
    unique: list[str] = []
    for item in urls:
        if item not in seen:
            seen.add(item)
            unique.append(item)
    return unique


COMMON_SOUNDS = (
    "Audio/Sound/UI_Button_Touch.wav",
    "Audio/Sound/UI_Button_Back.wav",
    "Audio/Sound/UI_FX_BG_UnderFire.wav",
    "Audio/Sound/SE_Run_05.wav",
    "Audio/Sound/UI_Button_Select.wav",
    "Audio/Sound/UI_Button_Cancel.wav",
)

EMOTION_FILES = (
    "emotions/Emoji_Bulb_1.png",
    "emotions/Emoji_Bulb_2.png",
    "emotions/Emoji_Evidence.png",
    "emotions/Emoji_Keyword.png",
    "emotions/Emoji_Momotalk.png",
    "emotions/Emoji_Phone.png",
    "emotions/Emoji_Sad.png",
    "emotions/Emoji_Sigh.png",
    "emotions/Emoji_Steam.png",
    "emotions/Emoji_Tear_1.png",
    "emotions/Emoji_Tear_2.png",
    "emotions/Emoji_Zzz.png",
    "emotions/Emoticon_Action.png",
    "emotions/Emoticon_Aggro.png",
    "emotions/Emoticon_Anxiety.png",
    "emotions/Emoticon_Balloon_N.png",
    "emotions/Emoticon_Balloon_T.png",
    "emotions/Emoticon_Chat.png",
    "emotions/Emoticon_Exclamation.png",
    "emotions/Emoticon_ExclamationMark.png",
    "emotions/Emoticon_Heart.png",
    "emotions/Emoticon_Ice_M.png",
    "emotions/Emoticon_Ice_S.png",
    "emotions/Emoticon_Ice_V.png",
    "emotions/Emoticon_Idea.png",
    "emotions/Emoticon_Note.png",
    "emotions/Emoticon_Question.png",
    "emotions/Emoticon_QuestionMark.png",
    "emotions/Emoticon_Shy.png",
    "emotions/Emoticon_Sweat_1.png",
    "emotions/Emoticon_Sweat_2.png",
    "emotions/Emoticon_Twinkle.png",
)

print_lock = threading.Lock()


def log(message: str) -> None:
    with print_lock:
        print(message, flush=True)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def data_list(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, dict) and isinstance(payload.get("DataList"), list):
        return [row for row in payload["DataList"] if isinstance(row, dict)]
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    return []


def first_path(value: Any) -> str:
    if isinstance(value, list):
        return first_path(value[0]) if value else ""
    if isinstance(value, str):
        return value.strip()
    return ""


def basename(value: str) -> str:
    return value.rstrip("/").split("/")[-1]


def encode_url(url: str) -> str:
    head, sep, tail = url.partition("://")
    if not sep:
        return quote(url, safe=":/?&=%#")
    return f"{head}://{quote(tail, safe='/:@?&=+%#')}"


def request(url: str, method: str = "GET") -> urllib.request.Request:
    return urllib.request.Request(
        encode_url(url),
        method=method,
        headers={"User-Agent": USER_AGENT},
    )


def download_file(url: str, dest: Path, *, force: bool, timeout: int) -> str:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0 and not force:
        return "skip"

    last_error = "unknown"
    for candidate in candidate_urls(url):
        for attempt in range(1, 4):
            try:
                with urllib.request.urlopen(request(candidate), timeout=timeout) as response:
                    payload = response.read()
                    if not payload:
                        last_error = "empty"
                        break
                    tmp = dest.with_suffix(dest.suffix + ".part")
                    tmp.write_bytes(payload)
                    tmp.replace(dest)
                    return "ok"
            except urllib.error.HTTPError as error:
                if error.code == 404:
                    last_error = "missing"
                    break
                last_error = f"HTTP {error.code}"
            except Exception as error:  # noqa: BLE001 - network boundary
                last_error = str(error)
            time.sleep(min(2 * attempt, 6))
    return "missing" if last_error == "missing" else f"error:{last_error}"


def download_many(
    jobs: list[tuple[str, Path]],
    *,
    force: bool,
    timeout: int,
    workers: int,
    label: str,
) -> Counter[str]:
    unique: dict[str, Path] = {}
    for url, dest in jobs:
        unique.setdefault(url, dest)
    items = list(unique.items())
    stats: Counter[str] = Counter()
    if not items:
        log(f"[{label}] nothing to download")
        return stats

    log(f"[{label}] {len(items)} files, {workers} workers")
    done = 0
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(download_file, url, dest, force=force, timeout=timeout): (url, dest)
            for url, dest in items
        }
        for future in as_completed(futures):
            url, dest = futures[future]
            try:
                status = future.result()
            except Exception as error:  # noqa: BLE001
                status = f"error:{error}"
            stats[status.split(":", 1)[0]] += 1
            done += 1
            if status.startswith("error") or done % 50 == 0 or done == len(items):
                log(f"[{label}] {done}/{len(items)} ok={stats['ok']} skip={stats['skip']} missing={stats['missing']} error={stats['error']}")
            if status.startswith("error"):
                log(f"  ! {status} {url} -> {dest}")
    return stats


def sync_indexes(force: bool, timeout: int, workers: int) -> dict[str, str]:
    jobs = [
        (f"{CDN_BASE}/data/{name}", INDEX_DIR / "ba-all-data" / name) for name in INDEX_FILES
    ]
    jobs.append((f"{SCHALE_BASE}/data/jp/students.json", INDEX_DIR / "schaledb-jp-students.json"))
    jobs.append((f"{SCHALE_BASE}/data/config.json", INDEX_DIR / "schaledb-config.json"))
    download_many(jobs, force=force, timeout=timeout, workers=workers, label="indexes")

    last_modified = {}
    for name in INDEX_FILES:
        url = f"{CDN_BASE}/data/{name}"
        try:
            with urllib.request.urlopen(request(url, "HEAD"), timeout=timeout) as response:
                last_modified[name] = response.headers.get("Last-Modified", "")
        except Exception:  # noqa: BLE001
            last_modified[name] = ""
    return last_modified


def spine_id_from_prefab(prefab: str) -> str:
    name = basename(prefab)
    name = re.sub(r"^CharacterSpine_", "", name, flags=re.IGNORECASE)
    if name.endswith("ND"):
        name = name[:-2]
    return name


def spine_job(spine_id: str) -> tuple[str, Path] | None:
    cleaned = spine_id.strip()
    if not cleaned:
        return None
    cleaned = re.sub(r"_spr$", "", cleaned, flags=re.IGNORECASE)
    folder = f"{cleaned}_spr".lower()
    relative = f"spine/{folder}/{folder}.skel"
    if CH_OR_NP.match(cleaned):
        return f"{SPINE42_BASE}/{relative}", SPINE42_ROOT / relative
    return f"{CDN_BASE}/{relative}", CDN_ROOT / relative


def collect_background_jobs(rows: list[dict[str, Any]]) -> list[tuple[str, Path]]:
    jobs: list[tuple[str, Path]] = []
    seen: set[str] = set()
    for row in rows:
        if str(row.get("BGType") or "") == "Spine":
            continue
        file_name = first_path(row.get("BGFileName"))
        if not file_name or file_name in seen:
            continue
        seen.add(file_name)
        relative = f"{file_name}.jpg"
        jobs.append((f"{CDN_BASE}/{relative}", CDN_ROOT / relative))
    return jobs


def collect_portrait_jobs(
    scenario_rows: list[dict[str, Any]],
    character_rows: list[dict[str, Any]],
) -> list[tuple[str, Path]]:
    jobs: list[tuple[str, Path]] = []
    seen: set[str] = set()

    def add(relative: str) -> None:
        relative = relative.lstrip("/")
        if not relative or relative in seen:
            return
        seen.add(relative)
        jobs.append((f"{CDN_BASE}/{relative}", CDN_ROOT / relative))

    for row in scenario_rows:
        portrait = first_path(row.get("SmallPortrait"))
        if portrait:
            add(f"{portrait}.png")

    for row in character_rows:
        dev_name = first_path(row.get("DevName"))
        if re.fullmatch(r"CH\d+", dev_name, re.IGNORECASE):
            add(f"UIs/01_Common/01_Character/Student_Portrait_{dev_name}.png")
    return jobs


def collect_bgm_jobs(rows: list[dict[str, Any]]) -> list[tuple[str, Path]]:
    jobs: list[tuple[str, Path]] = []
    seen: set[str] = set()
    for row in rows:
        path = first_path(row.get("Path"))
        if not path or path.endswith("/Mute") or path in seen:
            continue
        seen.add(path)
        relative = f"{path}.ogg"
        jobs.append((f"{CDN_BASE}/{relative}", CDN_ROOT / relative))
    return jobs


def is_story_spine_id(value: str) -> bool:
    cleaned = re.sub(r"_spr$", "", value, flags=re.IGNORECASE)
    return bool(CH_OR_NP.match(cleaned) or re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*", cleaned))


def collect_spine_jobs(
    scenario_rows: list[dict[str, Any]],
    character_rows: list[dict[str, Any]],
    costume_rows: list[dict[str, Any]],
    student_dev_names: list[str],
) -> list[tuple[str, Path]]:
    ids: set[str] = set()
    for row in scenario_rows:
        prefab = first_path(row.get("SpinePrefabName"))
        if prefab:
            ids.add(spine_id_from_prefab(prefab))
    for row in character_rows:
        if not (row.get("IsPlayableCharacter") or row.get("CollectionVisible")):
            continue
        for key in ("DevName", "ScenarioCharacter"):
            value = first_path(row.get(key))
            if value:
                ids.add(value)
    for row in costume_rows:
        if not (row.get("CollectionVisible") or row.get("IsDefault")):
            continue
        value = first_path(row.get("SpineResourceName"))
        if value:
            ids.add(basename(value))
    ids.update(student_dev_names)
    ids = {item for item in ids if is_story_spine_id(item)}

    jobs: list[tuple[str, Path]] = []
    for spine_id in sorted(ids):
        job = spine_job(spine_id)
        if job:
            jobs.append(job)
    return jobs


def atlas_texture_names(atlas_text: str) -> list[str]:
    names: list[str] = []
    for raw_line in atlas_text.splitlines():
        line = raw_line.strip()
        if not line or ":" in line:
            continue
        if line.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
            names.append(line)
    return names


def collect_spine_support_jobs() -> list[tuple[str, Path]]:
    jobs: list[tuple[str, Path]] = []
    for root, base in ((CDN_ROOT, CDN_BASE), (SPINE42_ROOT, SPINE42_BASE)):
        for skel in root.glob("spine/*/*.skel"):
            atlas = skel.with_suffix(".atlas")
            relative_atlas = atlas.relative_to(root).as_posix()
            jobs.append((f"{base}/{relative_atlas}", atlas))
    return jobs


def collect_spine_texture_jobs() -> list[tuple[str, Path]]:
    jobs: list[tuple[str, Path]] = []
    for root, base in ((CDN_ROOT, CDN_BASE), (SPINE42_ROOT, SPINE42_BASE)):
        for atlas in root.glob("spine/*/*.atlas"):
            try:
                names = atlas_texture_names(atlas.read_text(encoding="utf-8", errors="ignore"))
            except OSError:
                continue
            for name in names:
                texture = (atlas.parent / name).resolve()
                try:
                    relative = texture.relative_to(root.resolve()).as_posix()
                except ValueError:
                    continue
                jobs.append((f"{base}/{relative}", root / relative))
    return jobs


def collect_schale_jobs(students: dict[str, Any] | list[Any]) -> list[tuple[str, Path]]:
    items = list(students.values()) if isinstance(students, dict) else students
    jobs: list[tuple[str, Path]] = []
    for student in items:
        if not isinstance(student, dict):
            continue
        student_id = student.get("Id")
        if student_id is None:
            continue
        for kind in ("collection", "icon", "portrait", "lobby"):
            relative = f"images/student/{kind}/{student_id}.webp"
            jobs.append((f"{SCHALE_BASE}/{relative}", SCHALE_ROOT / relative))
    return jobs


def collect_sound_jobs(emotion_rows: list[dict[str, Any]]) -> list[tuple[str, Path]]:
    jobs = [(f"{CDN_BASE}/{path}", CDN_ROOT / path) for path in COMMON_SOUNDS]
    jobs.extend((f"{CDN_BASE}/{path}", CDN_ROOT / path) for path in EMOTION_FILES)
    for row in emotion_rows:
        for key, value in row.items():
            if "Sound" in key:
                name = first_path(value)
                if name:
                    relative = f"Audio/Sound/{name}.wav"
                    jobs.append((f"{CDN_BASE}/{relative}", CDN_ROOT / relative))
    return jobs


def collect_story_sfx_jobs() -> list[tuple[str, Path]]:
    if not STORY_SE_PATH.is_file():
        return []
    names = json.loads(STORY_SE_PATH.read_text(encoding="utf-8"))
    jobs: list[tuple[str, Path]] = []
    for name in names:
        if not isinstance(name, str) or not name.strip():
            continue
        relative = f"Audio/Sound/{name.strip()}.wav"
        jobs.append((f"{CDN_BASE}/{relative}", CDN_ROOT / relative))
    return jobs


def load_bgm_titles() -> dict[str, Any]:
    if not BGM_TITLES_PATH.is_file():
        return {}
    payload = json.loads(BGM_TITLES_PATH.read_text(encoding="utf-8"))
    return payload if isinstance(payload, dict) else {}


def bgm_display_name(stem: str, titles: dict[str, Any]) -> str:
    direct = titles.get(stem)
    if isinstance(direct, dict) and direct.get("title"):
        return str(direct["title"])
    extras: list[str] = []
    base = stem
    for _ in range(3):
        match = BGM_VARIANT_SUFFIX.search(base)
        if not match:
            break
        extras.append(match.group(1))
        base = base[: match.start()]
    theme = re.match(r"(Theme_\d+)", stem)
    key = base if base in titles else (theme.group(1) if theme and theme.group(1) in titles else "")
    entry = titles.get(key) if key else None
    if isinstance(entry, dict) and entry.get("title"):
        title = str(entry["title"])
        return f"{title} ({' '.join(reversed(extras))})" if extras else title
    return stem


def build_catalog(index_dates: dict[str, str]) -> dict[str, Any]:
    zh_tokens = load_tokens()
    bg_rows = data_list(load_json(INDEX_DIR / "ba-all-data" / "ScenarioBGNameExcelTable.json"))
    char_rows = data_list(load_json(INDEX_DIR / "ba-all-data" / "ScenarioCharacterNameExcelTable.json"))
    bgm_rows = data_list(load_json(INDEX_DIR / "ba-all-data" / "BGMExcelTable.json"))
    students_cn_path = INDEX_DIR / "schaledb-cn-students.json"
    students_jp_path = INDEX_DIR / "schaledb-jp-students.json"
    students = load_json(students_cn_path if students_cn_path.is_file() else students_jp_path)
    student_items = list(students.values()) if isinstance(students, dict) else students
    students_by_dev = {
        str(item.get("DevName") or "").upper(): item
        for item in student_items
        if isinstance(item, dict)
    }
    students_by_path = {
        str(item.get("PathName") or "").lower(): item
        for item in student_items
        if isinstance(item, dict)
    }

    backgrounds: list[dict[str, Any]] = []
    seen_bg: set[str] = set()
    for row in bg_rows:
        file_name = first_path(row.get("BGFileName"))
        if not file_name or file_name in seen_bg:
            continue
        seen_bg.add(file_name)
        relative = f"ba-all-data/{file_name}.jpg"
        if not (PACK_ROOT / relative).is_file():
            continue
        short = basename(file_name)
        backgrounds.append(
            {
                "id": f"background/{short}",
                "label": background_label(short, zh_tokens),
                "path": relative,
                "bgType": row.get("BGType"),
            }
        )
    backgrounds.sort(key=lambda item: item["label"].lower())

    characters: list[dict[str, Any]] = []
    seen_chars: set[str] = set()
    for row in char_rows:
        prefab = first_path(row.get("SpinePrefabName"))
        if not prefab:
            continue
        spine_id = spine_id_from_prefab(prefab)
        job = spine_job(spine_id)
        if not job:
            continue
        _url, dest = job
        if dest.name in seen_chars or not dest.is_file():
            continue
        seen_chars.add(dest.name)
        if dest.is_relative_to(SPINE42_ROOT):
            relative = f"ba-all-data-spine42/{dest.relative_to(SPINE42_ROOT).as_posix()}"
        else:
            relative = f"ba-all-data/{dest.relative_to(CDN_ROOT).as_posix()}"
        schale = students_by_dev.get(spine_id.upper())
        label = character_label(row, spine_id, zh_tokens)
        characters.append(
            {
                "id": f"character/{spine_id.lower()}",
                "label": label,
                "path": relative,
                "nameJp": first_path(row.get("NameJP")),
                "nameCn": first_path(row.get("NameCN")),
                "preview": (
                    f"schaledb/images/student/portrait/{schale.get('Id')}.webp"
                    if schale and (SCHALE_ROOT / "images" / "student" / "portrait" / f"{schale.get('Id')}.webp").is_file()
                    else ""
                ),
            }
        )

    for root, prefix in ((CDN_ROOT, "ba-all-data"), (SPINE42_ROOT, "ba-all-data-spine42")):
        if not root.exists():
            continue
        for dest in root.glob("spine/*_spr/*.skel"):
            if dest.name in seen_chars:
                continue
            seen_chars.add(dest.name)
            spine_id = dest.stem.removesuffix("_spr")
            schale = students_by_dev.get(spine_id.upper()) or students_by_path.get(spine_id.lower())
            row = {
                "NameCN": str(schale.get("Name")) if schale else "",
                "NameJP": "",
            }
            label = character_label(row, spine_id, zh_tokens)
            characters.append(
                {
                    "id": f"character/{spine_id.lower()}",
                    "label": label,
                    "path": f"{prefix}/{dest.relative_to(root).as_posix()}",
                    "nameJp": str(schale.get("Name")) if schale else "",
                "nameCn": "",
                "preview": (
                    f"schaledb/images/student/portrait/{schale.get('Id')}.webp"
                    if schale and (SCHALE_ROOT / "images" / "student" / "portrait" / f"{schale.get('Id')}.webp").is_file()
                    else ""
                ),
                }
            )
    characters.sort(key=lambda item: item["label"])

    titles = load_bgm_titles()
    audio: list[dict[str, Any]] = []
    seen_audio: set[str] = set()
    for row in bgm_rows:
        path = first_path(row.get("Path"))
        if not path or path in seen_audio:
            continue
        seen_audio.add(path)
        relative = f"ba-all-data/{path}.ogg"
        if not (PACK_ROOT / relative).is_file():
            continue
        short = basename(path)
        audio.append(
            {
                "id": f"audio/bgm/{short}",
                "label": bgm_label(short, titles, zh_tokens, bgm_display_name(short, titles)),
                "path": relative,
                "channel": "bgm",
            }
        )

    sound_dir = CDN_ROOT / "Audio" / "Sound"
    if sound_dir.is_dir():
        for wav in sorted(sound_dir.glob("*.wav")):
            audio.append(
                {
                    "id": f"audio/sfx/{wav.stem}",
                    "label": sfx_label(wav.stem, zh_tokens),
                    "path": f"ba-all-data/Audio/Sound/{wav.name}",
                    "channel": "sfx",
                }
            )

    catalog = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sources": {
            "baAllData": {
                "base": CDN_BASE,
                "indexLastModified": index_dates.get("ScenarioBGNameExcelTable.json", ""),
            },
            "baAllDataSpine42": {"base": SPINE42_BASE},
            "schaleDb": {
                "base": SCHALE_BASE,
                "studentCount": len(student_items),
            },
        },
        "stats": {
            "backgrounds": len(backgrounds),
            "characters": len(characters),
            "audio": len(audio),
        },
        "backgrounds": backgrounds,
        "characters": characters,
        "audio": audio,
    }
    catalog_path = PACK_ROOT / "catalog.json"
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
    log(
        f"[catalog] backgrounds={len(backgrounds)} characters={len(characters)} audio={len(audio)} -> {catalog_path}"
    )
    return catalog


def write_source_note(index_dates: dict[str, str]) -> None:
    lines = [
        "# ba-public-pack",
        "",
        "Local research copy of public community Blue Archive story assets.",
        "Do not redistribute. Copyright remains with the original rights holders.",
        "",
        f"- ba-all-data indexes last-modified: {index_dates.get('ScenarioBGNameExcelTable.json', 'unknown')}",
        f"- CDN: {CDN_BASE}",
        f"- Spine 4.2 CDN: {SPINE42_BASE}",
        f"- SchaleDB: {SCHALE_BASE}",
        "",
        "Refresh with: python3 scripts/sync_ba_public_pack.py",
        "",
    ]
    (PACK_ROOT / "SOURCE.md").write_text("\n".join(lines), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--groups",
        default="indexes,backgrounds,portraits,bgm,se,sfx,emotions,spines,schaledb",
        help="Comma-separated groups to sync",
    )
    parser.add_argument("--workers", type=int, default=12)
    parser.add_argument("--timeout", type=int, default=60)
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    groups = {item.strip() for item in args.groups.split(",") if item.strip()}
    PACK_ROOT.mkdir(parents=True, exist_ok=True)
    INDEX_DIR.mkdir(parents=True, exist_ok=True)

    index_dates: dict[str, str] = {}
    if "indexes" in groups:
        index_dates = sync_indexes(args.force, args.timeout, min(args.workers, 6))
    else:
        for name in INDEX_FILES:
            index_dates[name] = ""

    required = INDEX_DIR / "ba-all-data" / "ScenarioBGNameExcelTable.json"
    if not required.is_file():
        log("Missing indexes. Run with --groups indexes first.")
        return 1

    bg_rows = data_list(load_json(required))
    scenario_rows = data_list(load_json(INDEX_DIR / "ba-all-data" / "ScenarioCharacterNameExcelTable.json"))
    bgm_rows = data_list(load_json(INDEX_DIR / "ba-all-data" / "BGMExcelTable.json"))
    character_path = INDEX_DIR / "ba-all-data" / "CharacterExcelTable.json"
    costume_path = INDEX_DIR / "ba-all-data" / "CostumeExcelTable.json"
    emotion_path = INDEX_DIR / "ba-all-data" / "ScenarioCharacterEmotionExcelTable.json"
    character_rows = data_list(load_json(character_path)) if character_path.is_file() else []
    costume_rows = data_list(load_json(costume_path)) if costume_path.is_file() else []
    emotion_rows = data_list(load_json(emotion_path)) if emotion_path.is_file() else []

    log(
        f"[indexes] backgrounds={len(bg_rows)} scenarioChars={len(scenario_rows)} "
        f"bgm={len(bgm_rows)} characters={len(character_rows)} costumes={len(costume_rows)}"
    )

    if "backgrounds" in groups:
        download_many(
            collect_background_jobs(bg_rows),
            force=args.force,
            timeout=args.timeout,
            workers=args.workers,
            label="backgrounds",
        )
    if "portraits" in groups:
        download_many(
            collect_portrait_jobs(scenario_rows, character_rows),
            force=args.force,
            timeout=args.timeout,
            workers=args.workers,
            label="portraits",
        )
        for dest_rel, src_rel in LOCAL_PORTRAIT_ALIASES.items():
            dest = CDN_ROOT / dest_rel
            src = CDN_ROOT / src_rel
            if dest.exists() and dest.stat().st_size > 0:
                continue
            if src.is_file():
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(src.read_bytes())
                log(f"[portraits] aliased {src_rel} -> {dest_rel}")
    if "bgm" in groups:
        download_many(
            collect_bgm_jobs(bgm_rows),
            force=args.force,
            timeout=args.timeout,
            workers=args.workers,
            label="bgm",
        )
    if {"se", "emotions"} & groups:
        download_many(
            collect_sound_jobs(emotion_rows),
            force=args.force,
            timeout=args.timeout,
            workers=args.workers,
            label="se+emotions",
        )
    if "sfx" in groups:
        download_many(
            collect_story_sfx_jobs(),
            force=args.force,
            timeout=args.timeout,
            workers=args.workers,
            label="story-sfx",
        )
        sound_dir = CDN_ROOT / "Audio" / "Sound"
        if sound_dir.is_dir() and STORY_SE_PATH.is_file():
            existing = {path.name.lower(): path for path in sound_dir.glob("*.wav")}
            for name in json.loads(STORY_SE_PATH.read_text(encoding="utf-8")):
                dest = sound_dir / f"{name}.wav"
                if dest.exists() and dest.stat().st_size > 0:
                    continue
                source = existing.get(f"{name}.wav".lower())
                if source and source.is_file():
                    dest.write_bytes(source.read_bytes())
                    log(f"[story-sfx] case-alias {source.name} -> {dest.name}")
    students_path = INDEX_DIR / "schaledb-jp-students.json"
    student_payload = load_json(students_path) if students_path.is_file() else {}
    student_items = list(student_payload.values()) if isinstance(student_payload, dict) else student_payload
    student_dev_names = [
        str(item.get("DevName"))
        for item in student_items
        if isinstance(item, dict) and item.get("DevName")
    ]

    if "spines" in groups:
        download_many(
            collect_spine_jobs(scenario_rows, character_rows, costume_rows, student_dev_names),
            force=args.force,
            timeout=args.timeout,
            workers=args.workers,
            label="spines-skel",
        )
        download_many(
            collect_spine_support_jobs(),
            force=args.force,
            timeout=args.timeout,
            workers=args.workers,
            label="spines-atlas",
        )
        download_many(
            collect_spine_texture_jobs(),
            force=args.force,
            timeout=args.timeout,
            workers=args.workers,
            label="spines-png",
        )
    if "schaledb" in groups and students_path.is_file():
        download_many(
            collect_schale_jobs(student_payload),
            force=args.force,
            timeout=args.timeout,
            workers=args.workers,
            label="schaledb-images",
        )

    write_source_note(index_dates)
    build_catalog(index_dates)
    return 0


if __name__ == "__main__":
    sys.exit(main())
