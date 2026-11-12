#!/usr/bin/env python3
"""Generate deterministic 2K PBR texture sets for the CIGKV material master.

The maps are technical starting assets, not a claim of final scanned-surface
quality. Each set contains BaseColor, Normal, ORM (AO/Roughness/Metallic) and a
Detail map. A seed and recipe are written to metadata for reproducibility.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SIZE = 2048
SEED = 20261106

MATERIALS = {
    "human_skin": {"base": (0.48, 0.20, 0.14), "roughness": 0.55, "ao": 0.86, "metallic": 0.0, "detail": "pores"},
    "zheers_skin": {"base": (0.18, 0.25, 0.28), "roughness": 0.48, "ao": 0.82, "metallic": 0.0, "detail": "species_scales"},
    "cloth": {"base": (0.07, 0.09, 0.10), "roughness": 0.82, "ao": 0.78, "metallic": 0.0, "detail": "woven"},
    "hair": {"base": (0.025, 0.018, 0.012), "roughness": 0.42, "ao": 0.76, "metallic": 0.0, "detail": "flow"},
}


def noise(size: int, seed: int, scale: int = 64) -> np.ndarray:
    rng = np.random.default_rng(seed)
    small = rng.random((scale + 1, scale + 1), dtype=np.float32)
    small[-1, :] = small[0, :]
    small[:, -1] = small[:, 0]
    image = Image.fromarray(np.uint8(small * 255), "L").resize((size, size), Image.Resampling.BICUBIC)
    return np.asarray(image, dtype=np.float32) / 255.0


def save_rgb(path: Path, array: np.ndarray):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.uint8(np.clip(array, 0, 1) * 255), "RGB").save(path, optimize=True)


def normal_from_height(height: np.ndarray, strength: float = 2.2) -> np.ndarray:
    dx = np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)
    dy = np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)
    normal = np.stack((-dx * strength, -dy * strength, np.ones_like(height)), axis=-1)
    normal /= np.maximum(np.linalg.norm(normal, axis=-1, keepdims=True), 1e-6)
    return normal * 0.5 + 0.5


def make_set(name: str, spec: dict, out: Path) -> dict:
    name_seed = int.from_bytes(hashlib.sha256(name.encode("utf-8")).digest()[:4], "little") % 1000
    n1 = noise(SIZE, SEED + name_seed, 96)
    n2 = noise(SIZE, SEED + 1000 + name_seed, 256)
    yy, xx = np.mgrid[0:SIZE, 0:SIZE]
    if spec["detail"] == "pores":
        height = 0.58 * n1 + 0.42 * n2
        base = np.array(spec["base"], dtype=np.float32)[None, None, :] * (0.88 + 0.22 * n1[..., None])
        base[..., 0] += 0.025 * n2
    elif spec["detail"] == "species_scales":
        pattern = 0.5 + 0.5 * np.sin(xx / 9.0 + 3.0 * n1)
        height = 0.55 * n1 + 0.45 * pattern
        base = np.array(spec["base"], dtype=np.float32)[None, None, :] * (0.82 + 0.30 * pattern[..., None])
        base[..., 1] += 0.025 * n2
    elif spec["detail"] == "woven":
        weave = 0.5 + 0.5 * np.sin(xx / 5.0) * np.sin(yy / 5.0)
        height = 0.35 * n1 + 0.65 * weave
        base = np.array(spec["base"], dtype=np.float32)[None, None, :] * (0.78 + 0.32 * weave[..., None])
    else:
        flow = 0.5 + 0.5 * np.sin(xx / 13.0 + 2.0 * n1)
        height = 0.25 * n2 + 0.75 * flow
        base = np.array(spec["base"], dtype=np.float32)[None, None, :] * (0.70 + 0.42 * flow[..., None])
        base[..., 0] += 0.012 * flow
    normal = normal_from_height(height, 3.0 if spec["detail"] in {"woven", "species_scales"} else 1.7)
    ao = np.clip(spec["ao"] - 0.15 * (1.0 - n1), 0, 1)
    roughness = np.clip(spec["roughness"] + 0.13 * (n2 - 0.5), 0, 1)
    metallic = np.full((SIZE, SIZE), spec["metallic"], dtype=np.float32)
    orm = np.stack((ao, roughness, metallic), axis=-1)
    detail = np.stack((height, height, height), axis=-1)
    files = {
        "basecolor": out / name / f"T_CIGKV_{name}_BaseColor_2K.png",
        "normal": out / name / f"T_CIGKV_{name}_Normal_2K.png",
        "orm": out / name / f"T_CIGKV_{name}_ORM_2K.png",
        "detail": out / name / f"T_CIGKV_{name}_Detail_2K.png",
    }
    save_rgb(files["basecolor"], base)
    save_rgb(files["normal"], normal)
    save_rgb(files["orm"], orm)
    save_rgb(files["detail"], detail)
    return {"material_set": name, "resolution": [SIZE, SIZE], "channels": {"basecolor": "RGB", "normal": "RGB tangent-space", "orm": "R=AO,G=Roughness,B=Metallic", "detail": "grayscale in RGB"}, "seed": SEED, "files": {k: str(v.relative_to(ROOT)) for k, v in files.items()}, "sha256": {k: hashlib.sha256(v.read_bytes()).hexdigest() for k, v in files.items()}}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="Unreal/KhaaosRun/Content/Materials/CIGKV/Textures")
    parser.add_argument("--metadata", default="Unreal/KhaaosRun/Content/Materials/CIGKV/cigkv_pbr_texture_sets.json")
    args = parser.parse_args()
    output = ROOT / args.output
    sets = [make_set(name, spec, output) for name, spec in MATERIALS.items()]
    metadata = {"schema": "khaaos.cigkv.pbr-texture-sets/v1", "generator": "scripts/ue5/generate_cigkv_pbr_textures.py", "seed": SEED, "resolution": [SIZE, SIZE], "sets": sets, "limitations": ["procedural technical starting maps; not scanned skin or final art direction", "must be reviewed in UE5.8 under day/night/interior lighting", "must be re-authored or replaced if commercial provenance is not approved"]}
    metadata_path = ROOT / args.metadata
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps(metadata, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
