#!/usr/bin/env python3
"""Build lightweight, traceable web portraits from local Lote 4 source PNGs."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / ".generated" / "lote4"
CATALOG_PATH = ROOT / "Content" / "Avatars" / "avatar_catalog.json"
OUTPUT_DIR = ROOT / "client" / "public" / "avatars" / "realistic"
MANIFEST_PATH = OUTPUT_DIR / "avatar_catalog.json"
MAX_SIDE = 768
WEBP_QUALITY = 86


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    roster = [item for item in catalog if item.get("faction") in {"MILICIA_URBANA", "GANGUE_URBANA"}]
    if len(roster) != 16:
        raise SystemExit(f"Expected exactly 16 Lote 4 entries in {CATALOG_PATH}; found {len(roster)}")

    missing: list[str] = []
    for operative in roster:
        source = SOURCE_DIR / f"{operative['id'].lower()}.png"
        if not source.is_file():
            missing.append(str(source.relative_to(ROOT)))
    if missing:
        raise SystemExit("Missing source portraits (kept outside Git by design):\n  " + "\n  ".join(missing))

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    records = []
    for operative in roster:
        source = SOURCE_DIR / f"{operative['id'].lower()}.png"
        output_name = f"{operative['id'].lower()}.webp"
        output = OUTPUT_DIR / output_name
        with Image.open(source) as opened:
            image = ImageOps.exif_transpose(opened).convert("RGB")
            image.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
            image.save(output, "WEBP", quality=WEBP_QUALITY, method=6)
            width, height = image.size
        records.append({
            "operative_id": operative["id"],
            "codename": operative["codename"],
            "faction": operative["faction"],
            "gender": operative["gender"],
            "format": "webp",
            "width": width,
            "height": height,
            "client_path": f"/avatars/realistic/{output_name}",
            "source_path": f".generated/lote4/{source.name}",
            "source_sha256": sha256(source),
            "client_sha256": sha256(output),
            "generation_source": "AI-generated portrait derived from the canonical character brief",
            "commercial_use": "requires separate rights/license approval",
            "runtime_status": "2D portrait only; not a rigged or UE5-ready character mesh",
        })

    manifest = {
        "manifest_version": 1,
        "set": "lote4-realistic-operatives",
        "source_of_truth": "Content/Avatars/avatar_catalog.json",
        "conversion": {"max_side_px": MAX_SIDE, "format": "WebP", "quality": WEBP_QUALITY},
        "assets": records,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    total_source = sum((SOURCE_DIR / f"{op['id'].lower()}.png").stat().st_size for op in roster)
    total_output = sum((OUTPUT_DIR / f"{op['id'].lower()}.webp").stat().st_size for op in roster)
    print(f"Built {len(records)} realistic 2D portraits: {total_source:,} source bytes -> {total_output:,} WebP bytes")
    print(f"Manifest: {MANIFEST_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
