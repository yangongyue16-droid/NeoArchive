"""Build Chinese-first search labels for the local BA story pack."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
TOKENS_PATH = ROOT / "scripts" / "ba_zh_tokens.json"

VARIANT_CN = {
    "swimsuit": "泳装",
    "casual": "便服",
    "newyear": "正月",
    "robber": "蒙面",
    "maid": "女仆",
    "bunny": "兔女郎",
    "dress": "礼服",
    "hot spring": "温泉",
    "hotspring": "温泉",
    "camping": "露营",
    "guide": "导游",
    "uniform": "制服",
    "band": "乐队",
    "gym": "体操服",
    "cheer": "应援",
    "idol": "偶像",
    "terror": "色堕",
    "shibaseki": "柴关",
    "nd": "无光环",
}

SFX_PREFIX = {
    "SE": "音效",
    "SFX": "特效音",
    "UI": "界面",
    "Main": "主线",
}

CAMEL = re.compile(r"CH\d+|NP\d+|[A-Z][a-z]+|[A-Z]+(?![a-z])|[a-z]+|\d+")


def load_tokens() -> dict[str, Any]:
    if not TOKENS_PATH.is_file():
        return {"bg": {}, "sfx": {}, "bgm": {}}
    return json.loads(TOKENS_PATH.read_text(encoding="utf-8"))


def split_ident(value: str) -> list[str]:
    cleaned = re.sub(r"^(BG_|SpineBG_|CS_|SE_|SFX_|UI_FX_|UI_)", "", value)
    parts: list[str] = []
    for chunk in cleaned.replace("-", "_").split("_"):
        if not chunk:
            continue
        parts.extend(CAMEL.findall(chunk) or [chunk])
    return parts


def translate_parts(parts: list[str], table: dict[str, str]) -> list[str]:
    lowered = {key.lower(): value for key, value in table.items()}
    out: list[str] = []
    index = 0
    while index < len(parts):
        matched = None
        for width in (3, 2, 1):
            if index + width > len(parts):
                continue
            piece = "".join(parts[index : index + width]).lower()
            dashed = " ".join(parts[index : index + width]).lower()
            if piece in lowered:
                matched = (width, lowered[piece])
                break
            if dashed in lowered:
                matched = (width, lowered[dashed])
                break
        if matched:
            out.append(matched[1])
            index += matched[0]
        else:
            token = parts[index]
            out.append(lowered.get(token.lower(), token))
            index += 1
    return [item for item in out if item]


def join_zh(parts: list[str]) -> str:
    if not parts:
        return ""
    text = parts[0]
    for part in parts[1:]:
        if part.isdigit() or re.fullmatch(r"[A-Z0-9]{2,}", part):
            text = f"{text} {part}"
        elif part in {"夜", "黄昏", "雨", "阴", "冬", "室内", "室外"}:
            text = f"{text}（{part}）"
        else:
            text = f"{text}{part}"
    return text


def background_label(stem: str, tokens: dict[str, Any]) -> str:
    parts = split_ident(stem)
    translated = translate_parts(parts, tokens.get("bg") or {})
    zh = join_zh(translated) or stem
    if zh == stem:
        return stem
    return f"{zh} · {stem}"


def character_label(row: dict[str, Any], spine_id: str, tokens: dict[str, Any]) -> str:
    name = (
        str(row.get("NameCN") or "").strip()
        or str(row.get("NameTW") or "").strip()
        or str(row.get("NameJP") or "").strip()
        or spine_id
    )
    nick = str(row.get("NicknameCN") or row.get("NicknameTW") or "").strip()
    extras: list[str] = []
    if nick and nick not in name:
        extras.append(nick)
    lower_id = spine_id.lower()
    for key, label in VARIANT_CN.items():
        if key.replace(" ", "") in lower_id.replace("_", ""):
            extras.append(label)
    if extras:
        name = f"{name}（{' · '.join(dict.fromkeys(extras))}）"
    jp = str(row.get("NameJP") or "").strip()
    if jp and jp not in name:
        return f"{name} · {jp}"
    return name


def sfx_label(stem: str, tokens: dict[str, Any]) -> str:
    parts = split_ident(stem)
    prefix = ""
    if parts and parts[0] in SFX_PREFIX and parts[0] != "SE":
        prefix = SFX_PREFIX[parts[0]]
        parts = parts[1:]
    translated = translate_parts(parts, tokens.get("sfx") or {})
    zh = join_zh(translated) or stem
    if prefix:
        zh = f"{prefix} · {zh}"
    if zh == stem:
        return stem
    return f"{zh} · {stem}"


def bgm_label(stem: str, titles: dict[str, Any], tokens: dict[str, Any], fallback: str) -> str:
    zh_table = tokens.get("bgm") or {}
    english = fallback
    entry = titles.get(stem)
    if isinstance(entry, dict) and entry.get("title"):
        english = str(entry["title"])
    zh = zh_table.get(english) or zh_table.get(stem)
    use = ""
    if isinstance(entry, dict):
        use = str(entry.get("use") or "").strip()
    if zh and zh != english:
        label = f"{zh} · {english}"
    else:
        label = english
    if use and use not in label:
        label = f"{label}（{use}）"
    return label
