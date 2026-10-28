#!/usr/bin/env python3
"""Generate deterministic, engine-less visual intake packages for all five worlds.

The package is intentionally source-level: OBJ/glTF/CSV/SVG plus a .umap.json
contract. UE5.8 Editor remains required to import/cook these into .uasset/.umap.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "Unreal" / "KhaaosRun" / "Content"
CONFIGS = ROOT / "components_dev" / "worlds"
WORLDS = ["CIGKV", "Barburhen", "Priadus", "Ckesalth", "Arukheea"]


def read_config(world: str) -> dict:
    if world == "CIGKV":
        source = CONTENT / "Maps" / "CIGKV" / "CIGKV_level_data.json"
        data = json.loads(source.read_text(encoding="utf-8"))
        return {
            "world_id": world,
            "display_name": data.get("level_name", "CIGKV — Khaaos Ville"),
            "map_bounds": 5000,
            "sector_count": len(data.get("sectors", [])) or 3,
            "biome": {"type": "urban_training", "colors": {"primary": "#53606B", "secondary": "#8A979A", "accent": "#C8FF3D", "fog": "#26313A"}},
            "poi_markers": data.get("environment_markers", [])[:8],
            "spawn_points": data.get("spawn_points", [])[:16],
            "loot_points": data.get("loot_spawn_points", [])[:24],
        }
    source = CONFIGS / f"WCFG_{world}.json"
    return json.loads(source.read_text(encoding="utf-8"))


def norm_point(item: dict, index: int, scale: float) -> tuple[float, float, float]:
    loc = item.get("location") or item.get("position") or [0, 0, 0]
    if isinstance(loc, dict):
        loc = [loc.get("x", 0), loc.get("y", 0), loc.get("z", 0)]
    return tuple(float(v) * scale for v in (loc + [0, 0, 0])[:3])


def write_obj(path: Path, cfg: dict) -> None:
    bound = float(cfg.get("map_bounds", 5000))
    # A lightweight terrain/collision intake mesh: four corners plus a raised POI marker.
    verts = [(-bound, -bound, 0), (bound, -bound, 0), (bound, bound, 0), (-bound, bound, 0)]
    for i, poi in enumerate(cfg.get("poi_markers", [])[:8]):
        x, y, z = norm_point(poi, i, 1.0)
        verts.extend([(x - 80, y - 80, z), (x + 80, y - 80, z), (x + 80, y + 80, z), (x - 80, y + 80, z)])
    lines = [f"# Khaaos Run source intake mesh — {cfg['world_id']}", "o SM_{}_WorldBlockout".format(cfg["world_id"])]
    lines += [f"v {x:.3f} {y:.3f} {z:.3f}" for x, y, z in verts]
    lines += ["f 1 2 3", "f 1 3 4"]
    for base in range(5, len(verts) + 1, 4):
        lines += [f"f {base} {base+1} {base+2}", f"f {base} {base+2} {base+3}"]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_gltf(path: Path, cfg: dict) -> None:
    gltf = {
        "asset": {"version": "2.0", "generator": "khaaos-generate-world-asset-packages"},
        "scene": 0,
        "scenes": [{"name": f"{cfg['world_id']}_WorldBlockout", "nodes": [0]}],
        "nodes": [{"name": f"SM_{cfg['world_id']}_WorldBlockout", "mesh": 0}],
        "meshes": [{"name": f"SM_{cfg['world_id']}_WorldBlockout", "primitives": []}],
        "extras": {"world_id": cfg["world_id"], "source_contract": "WCFG/canonical world data", "requires_ue_import": True},
    }
    path.write_text(json.dumps(gltf, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def write_csvs(folder: Path, cfg: dict) -> None:
    points = ["PointId,X,Y,Z,Sector,Kind"]
    for i, item in enumerate(cfg.get("spawn_points", [])):
        x, y, z = norm_point(item, i, 1.0)
        points.append(f"SP_{i+1:03d},{x:.3f},{y:.3f},{z:.3f},{item.get('sector','default')},spawn")
    for i, item in enumerate(cfg.get("loot_points", [])):
        x, y, z = norm_point(item, i, 1.0)
        points.append(f"LP_{i+1:03d},{x:.3f},{y:.3f},{z:.3f},{item.get('sector','default')},loot")
    (folder / f"DT_{cfg['world_id']}_MapPoints.csv").write_text("\n".join(points) + "\n", encoding="utf-8")
    biome = cfg.get("biome", {})
    colors = biome.get("colors", {})
    rows = ["Key,Value", f"world_id,{cfg['world_id']}", f"display_name,{cfg.get('display_name', cfg['world_id'])}", f"biome,{biome.get('type', 'unspecified')}", f"sector_count,{cfg.get('sector_count', 0)}"]
    for key in ("primary", "secondary", "accent", "fog"):
        if colors.get(key): rows.append(f"color_{key},{colors[key]}")
    (folder / f"DT_{cfg['world_id']}_WorldConfig.csv").write_text("\n".join(rows) + "\n", encoding="utf-8")


def write_svg(path: Path, cfg: dict) -> None:
    bound = float(cfg.get("map_bounds", 5000))
    size = 800
    def xy(p): return (400 + float(p[0]) / bound * 360, 400 - float(p[1]) / bound * 360)
    circles = []
    for i, poi in enumerate(cfg.get("poi_markers", [])[:16]):
        x, y, _ = norm_point(poi, i, 1.0)
        sx, sy = xy((x, y))
        circles.append(f'<circle cx="{sx:.1f}" cy="{sy:.1f}" r="8" data-poi="{i+1}"/>')
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" role="img" aria-label="{cfg["world_id"]} top-down intake map">
<rect width="800" height="800" fill="#18212a"/><rect x="40" y="40" width="720" height="720" fill="#35424a" stroke="#c8ff3d" stroke-width="3"/>
<g fill="#c8ff3d" stroke="#0b1115" stroke-width="2">{' '.join(circles)}</g>
<text x="56" y="90" fill="#ffffff" font-family="sans-serif" font-size="28">{cfg['world_id']} — visual intake</text>
<text x="56" y="730" fill="#b7c2c9" font-family="sans-serif" font-size="16">Source package; import/cook required in UE5.8 Editor</text></svg>'''
    path.write_text(svg + "\n", encoding="utf-8")


def main() -> None:
    report = {"schema": "khaaos.world-visual-intake/v1", "engine_target": "UE5.8", "worlds": []}
    for world in WORLDS:
        cfg = read_config(world)
        folder = CONTENT / "Maps" / world
        folder.mkdir(parents=True, exist_ok=True)
        write_obj(folder / f"{world}_WorldBlockout.obj", cfg)
        write_gltf(folder / f"{world}_WorldBlockout.gltf", cfg)
        (folder / f"{world}_WorldBlockout.umap.json").write_text(json.dumps({
            "schema": "khaaos.ue5.umap-intake/v1", "world_id": world,
            "display_name": cfg.get("display_name", world), "engine_target": "UE5.8",
            "source_config": f"components_dev/worlds/WCFG_{world}.json" if world != "CIGKV" else "Unreal/KhaaosRun/Content/Maps/CIGKV/CIGKV_level_data.json",
            "status": "source_intake_requires_editor_import", "poi_count": len(cfg.get("poi_markers", [])),
        }, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        write_csvs(folder, cfg)
        write_svg(folder / f"{world}_WorldBlockout_TopDown.svg", cfg)
        report["worlds"].append({"world_id": world, "path": str(folder.relative_to(ROOT)), "status": "generated_source_intake"})
    out = CONTENT / "Maps" / "WORLD_VISUAL_INTAKE_MANIFEST.json"
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
