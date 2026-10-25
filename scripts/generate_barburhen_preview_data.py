#!/usr/bin/env python3
"""Validate Barburhen CSV data and embed it into the standalone 3D preview."""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "Unreal/KhaaosRun/Content/Barburhen"
POINTS_CSV = CONTENT / "DT_Barburhen_MapPoints.csv"
WORLD_CSV = CONTENT / "DT_Barburhen_WorldConfig.csv"
PREVIEW_HTML = CONTENT / "Barburhen_Map_3D.html"
START_MARKER = "<!-- BARBURHEN MAP DATA START -->"
END_MARKER = "<!-- BARBURHEN MAP DATA END -->"
EXPECTED_TYPES = {
    "PlayerSpawn": 8,
    "RingCenter": 1,
    "Bunker": 2,
    "TankSpawn": 5,
    "SniperPoint": 10,
    "Hospital": 2,
    "PoliceStation": 3,
    "ZEXTerminal": 15,
    "LootCache": 3,
}


def read_data() -> dict:
    points: list[dict] = []
    with POINTS_CSV.open(newline="", encoding="utf-8-sig") as stream:
        for row in csv.DictReader(stream):
            point_id = (row.get("PointId") or "").strip()
            if not point_id:
                # Section headings are stored as comment rows in the CSV.
                continue
            point = {
                "id": point_id,
                "type": (row.get("Type") or "").strip(),
                "sector": (row.get("Sector") or "").strip(),
                "xCm": float(row["Location_X"]),
                "yCm": float(row["Location_Y"]),
                "zCm": float(row["Location_Z"]),
                "yaw": float(row["Rotation_Yaw"]),
                "radiusCm": float(row["Radius"]),
                "name": (row.get("DisplayName") or point_id).strip(),
            }
            if not point["type"] or not point["sector"]:
                raise ValueError(f"Point {point_id} is missing type or sector")
            for key in ("xCm", "yCm", "zCm", "yaw", "radiusCm"):
                if not math.isfinite(point[key]):
                    raise ValueError(f"Point {point_id} has non-finite {key}")
            points.append(point)

    if not points:
        raise ValueError(f"No map points found in {POINTS_CSV}")
    ids = [point["id"] for point in points]
    if len(ids) != len(set(ids)):
        raise ValueError("Map PointId values must be unique")
    actual_types = Counter(point["type"] for point in points)
    if dict(actual_types) != EXPECTED_TYPES:
        raise ValueError(f"Unexpected Barburhen point counts: {dict(actual_types)}")

    with WORLD_CSV.open(newline="", encoding="utf-8-sig") as stream:
        world_rows = list(csv.DictReader(stream))
    world_rows = [row for row in world_rows if (row.get("---") or "").strip()]
    if len(world_rows) != 1:
        raise ValueError(f"Expected exactly one world config row; found {len(world_rows)}")
    row = world_rows[0]
    world = {
        "ringStartRadiusCm": float(row["RingStartRadius"]),
        "ringEndRadiusCm": float(row["RingEndRadius"]),
        "ringCloseDurationSeconds": float(row["RingCloseDurationSeconds"]),
        "maxPlayers": int(row["MaxPlayers"]),
        "parkCenterXcm": float(row["ParkCenter_X"]),
        "parkCenterYcm": float(row["ParkCenter_Y"]),
        "parkCenterZcm": float(row["ParkCenter_Z"]),
    }
    if not (world["ringStartRadiusCm"] > world["ringEndRadiusCm"] > 0):
        raise ValueError("Ring radii must satisfy start > end > 0")
    if world["ringCloseDurationSeconds"] <= 0 or world["maxPlayers"] <= 0:
        raise ValueError("Ring duration and max players must be positive")

    return {
        "source": "DT_Barburhen_MapPoints.csv + DT_Barburhen_WorldConfig.csv",
        "units": "centimeters",
        "world": world,
        "points": points,
    }


def block(payload: dict) -> str:
    encoded = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True)
    # Prevent a CSV value from terminating the embedded script element.
    encoded = encoded.replace("</", "<\\/")
    return f'{START_MARKER}\n<script id="barburhen-map-data" type="application/json">\n{encoded}\n</script>\n{END_MARKER}'


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if the HTML's embedded data is stale")
    args = parser.parse_args()

    payload = read_data()
    html = PREVIEW_HTML.read_text(encoding="utf-8")
    pattern = re.compile(re.escape(START_MARKER) + r".*?" + re.escape(END_MARKER), re.DOTALL)
    match = pattern.search(html)
    if args.check:
        if not match:
            raise SystemExit("Preview is missing generated Barburhen data markers; run this script without --check")
        if match.group(0) != block(payload):
            raise SystemExit("Preview data is stale; run python3 scripts/generate_barburhen_preview_data.py")
        print(f"Preview data is current: {len(payload['points'])} points, {payload['world']['maxPlayers']} max players")
        return 0

    generated = block(payload)
    if match:
        html = html[: match.start()] + generated + html[match.end() :]
    else:
        marker = "</head>"
        if marker not in html:
            raise SystemExit(f"Cannot find {marker} in {PREVIEW_HTML}")
        html = html.replace(marker, generated + "\n" + marker, 1)
    PREVIEW_HTML.write_text(html, encoding="utf-8")
    print(f"Embedded canonical Barburhen data: {len(payload['points'])} points; types={dict(Counter(p['type'] for p in payload['points']))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
