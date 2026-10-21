#!/usr/bin/env python3
"""
visualize_map.py — Step 2: CIGKV Map Visualization

Creates a detailed top-down map visualization of the CIGKV_KhaaosVille level
using matplotlib, showing sectors, spawn points, ZEX zones, loot points,
zone phases, and environmental hazards.

Output: /home/z/my-project/Khaaos_Run/repo/mvp_output/cigkv_map_visualization.png

Usage:
    python visualize_map.py [--input PATH] [--output PATH]
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parents[3]  # repo/
DEFAULT_INPUT = REPO_ROOT / "config" / "levels" / "CIGKV_level_data.json"
DEFAULT_OUTPUT = REPO_ROOT / "mvp_output" / "cigkv_map_visualization.png"

# ---------------------------------------------------------------------------
# Color Definitions
# ---------------------------------------------------------------------------
SECTOR_COLORS = {
    "ArmoryHub":       "#2ecc71",  # Green
    "ProvingGrounds":  "#e67e22",  # Orange
    "Park":            "#3498db",  # Blue
}

SECTOR_ALPHA = 0.18

RARITY_COLORS = {
    "common":    "#95a5a6",  # Gray
    "uncommon":  "#2ecc71",  # Green
    "rare":      "#3498db",  # Blue
    "epic":      "#9b59b6",  # Purple
    "legendary": "#f1c40f",  # Gold
}

RARITY_SIZES = {
    "common":    4,
    "uncommon":  5,
    "rare":      6,
    "epic":      7,
    "legendary": 8,
}

PHASE_COLORS = {
    "Clear":  "#2ecc71",
    "Rain":   "#3498db",
    "Fog":    "#9b59b6",
    "Storm":  "#e74c3c",
}

HAZARD_MARKERS = {
    "acid_rain":           ("X", "#f39c12", 12),
    "hallucinogenic_fog":  ("P", "#8e44ad", 12),
    "carnivorous_flora":   ("*", "#27ae60", 14),
    "collapsing_structure":("D", "#e67e22", 10),
}

TEAM_COLORS = {
    "neutral":  "#95a5a6",
    "alpha":    "#e74c3c",
    "bravo":    "#3498db",
    "charlie":  "#2ecc71",
    "delta":    "#f39c12",
    "echo":     "#9b59b6",
    "foxtrot":  "#1abc9c",
    "golf":     "#e67e22",
    "hotel":    "#fd79a8",
    "india":    "#6c5ce7",
}


# ---------------------------------------------------------------------------
# Data Loading
# ---------------------------------------------------------------------------

def load_level_data(path: Path) -> Dict[str, Any]:
    """Load and return the CIGKV level data JSON."""
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Visualization
# ---------------------------------------------------------------------------

def create_visualization(data: Dict, output_path: Path) -> None:
    """Create the detailed top-down map visualization."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import matplotlib.patches as mpatches
        from matplotlib.font_manager import FontProperties
        from matplotlib.collections import PatchCollection
    except ImportError:
        print("ERROR: matplotlib is required. Install with: pip install matplotlib",
              file=sys.stderr)
        sys.exit(1)

    # Try Noto Sans SC for Portuguese/Chinese characters
    try:
        font_paths = [
            Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
            Path("/usr/share/fonts/truetype/noto/NotoSansSC-Regular.ttf"),
            Path("/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc"),
        ]
        fp = FontProperties()
        for fp_candidate in font_paths:
            if fp_candidate.exists():
                fp = FontProperties(fname=str(fp_candidate))
                break
    except Exception:
        fp = FontProperties()

    # Extract data
    map_x = data["map_size"]["x"]
    map_y = data["map_size"]["y"]
    sectors = data["sectors"]
    spawns = data["spawn_points"]
    zex_zones = data["zex_zones"]
    loot_points = data["loot_spawn_points"]
    zone_phases = data["zone_phases"]
    env_hazards = data["environmental_hazards"]

    # -----------------------------------------------------------------------
    # Figure setup
    # -----------------------------------------------------------------------
    fig, ax = plt.subplots(
        1, 1, figsize=(16, 16), constrained_layout=True,
        facecolor="#1a1a2e"
    )
    ax.set_facecolor("#16213e")
    ax.set_xlim(-50, map_x + 50)
    ax.set_ylim(-50, map_y + 50)
    ax.set_aspect("equal")
    ax.set_xlabel("X (cm)", fontsize=11, color="white")
    ax.set_ylabel("Y (cm)", fontsize=11, color="white")
    ax.set_title(
        "CIGKV KhaaosVille — Top-Down Map Layout\n"
        "Campo de Instrução de Guerra Khaaos Ville — Ring de Treinamento 50 jogadores",
        fontsize=14, fontweight="bold", color="white", fontproperties=fp
    )
    ax.tick_params(colors="white")
    for spine in ax.spines.values():
        spine.set_color("#444444")

    # -----------------------------------------------------------------------
    # Map boundary
    # -----------------------------------------------------------------------
    map_border = mpatches.Rectangle(
        (0, 0), map_x, map_y,
        linewidth=2, edgecolor="#ecf0f1", facecolor="none", linestyle="-"
    )
    ax.add_patch(map_border)

    # -----------------------------------------------------------------------
    # Sector backgrounds
    # -----------------------------------------------------------------------
    for sec in sectors:
        name = sec["name"]
        b = sec["bounds"]
        color = SECTOR_COLORS.get(name, "#cccccc")
        rect = mpatches.FancyBboxPatch(
            (b["min_x"], b["min_y"]),
            b["max_x"] - b["min_x"],
            b["max_y"] - b["min_y"],
            boxstyle="round,pad=0",
            linewidth=2, edgecolor=color, facecolor=color,
            alpha=SECTOR_ALPHA,
        )
        ax.add_patch(rect)

        # Sector label with Portuguese description
        cx = (b["min_x"] + b["max_x"]) / 2
        cy = (b["min_y"] + b["max_y"]) / 2
        label_text = f"{name}\n({sec['fraction']})"
        ax.text(
            cx, cy, label_text,
            ha="center", va="center", fontsize=16, fontweight="bold",
            alpha=0.35, color=color, fontproperties=fp
        )
        # Portuguese description below
        desc = sec.get("function", "")
        if desc:
            ax.text(
                cx, cy - 60, desc,
                ha="center", va="center", fontsize=7, alpha=0.4,
                color=color, fontproperties=fp, style="italic"
            )

    # -----------------------------------------------------------------------
    # Zone phase circles (from outermost to innermost)
    # -----------------------------------------------------------------------
    for zp in reversed(zone_phases[1:]):  # Skip phase 1 (Clear = full map)
        cx, cy = zp["center"]["x"], zp["center"]["y"]
        pct = zp["radius_percent"] / 100.0
        radius = pct * math.sqrt(map_x ** 2 + map_y ** 2) / 2
        color = PHASE_COLORS.get(zp["name"], "white")
        circle = mpatches.Circle(
            (cx, cy), radius,
            linewidth=2, edgecolor=color, facecolor=color,
            alpha=0.08, linestyle="--"
        )
        ax.add_patch(circle)
        # Label at the top of the circle
        ax.text(
            cx, cy + radius - 30,
            f"Phase {zp['phase']}: {zp['name']} ({zp['radius_percent']}%)",
            ha="center", va="center", fontsize=8, color=color, alpha=0.7,
            fontproperties=fp
        )

    # -----------------------------------------------------------------------
    # ZEX zones (red circles with labels)
    # -----------------------------------------------------------------------
    for zone in zex_zones:
        circle = mpatches.Circle(
            (zone["x"], zone["y"]), zone["radius"],
            linewidth=1.5, edgecolor="#e74c3c", facecolor="#e74c3c",
            alpha=0.35
        )
        ax.add_patch(circle)
        ax.text(
            zone["x"], zone["y"], f"Z{zone['id']}",
            fontsize=6, ha="center", va="center",
            color="#ff6b6b", fontweight="bold", fontproperties=fp
        )

    # -----------------------------------------------------------------------
    # Environmental hazard markers
    # -----------------------------------------------------------------------
    for hz in env_hazards:
        marker, color, size = HAZARD_MARKERS.get(hz["type"], ("X", "red", 10))
        if "locations" in hz:
            for loc in hz["locations"]:
                ax.plot(
                    loc[0], loc[1],
                    marker=marker, markersize=size, color=color,
                    markeredgecolor="white", markeredgewidth=1, zorder=6
                )
        else:
            # Place at sector center
            sec = next(s for s in sectors if s["name"] == hz["sector"])
            b = sec["bounds"]
            cx = (b["min_x"] + b["max_x"]) / 2
            cy = (b["min_y"] + b["max_y"]) / 2
            ax.plot(
                cx, cy,
                marker=marker, markersize=size + 2, color=color,
                markeredgecolor="white", markeredgewidth=1, zorder=6
            )

    # -----------------------------------------------------------------------
    # Loot spawn points (diamonds, color-coded by rarity)
    # -----------------------------------------------------------------------
    for lp in loot_points:
        color = RARITY_COLORS.get(lp["rarity"], "gray")
        size = RARITY_SIZES.get(lp["rarity"], 5)
        ax.plot(
            lp["x"], lp["y"],
            marker="D", markersize=size, color=color,
            markeredgecolor="white", markeredgewidth=0.3,
            alpha=0.8, zorder=5
        )

    # -----------------------------------------------------------------------
    # Spawn points (numbered dots, color-coded by team)
    # -----------------------------------------------------------------------
    for sp in spawns:
        # Team-based color for the dot
        dot_color = TEAM_COLORS.get(sp.get("team", ""), "#ecf0f1")
        # Sector color for the edge
        edge_color = SECTOR_COLORS.get(sp["sector"], "white")

        ax.plot(
            sp["x"], sp["y"],
            "o", markersize=8, color=dot_color,
            markeredgecolor=edge_color, markeredgewidth=1.5,
            zorder=7
        )
        # ID label
        ax.text(
            sp["x"] + 35, sp["y"] + 35,
            str(sp["id"]), fontsize=5.5, color="white",
            fontweight="bold", zorder=8, fontproperties=fp
        )

    # -----------------------------------------------------------------------
    # Grid overlay
    # -----------------------------------------------------------------------
    ax.grid(True, alpha=0.1, linewidth=0.5, color="white")
    # Major gridlines every 512cm
    ax.set_xticks(range(0, map_x + 1, 512), minor=False)
    ax.set_yticks(range(0, map_y + 1, 512), minor=False)
    ax.grid(True, which="major", alpha=0.15, linewidth=0.8, color="white")

    # -----------------------------------------------------------------------
    # Scale bar (bottom-right)
    # -----------------------------------------------------------------------
    scale_len = 512  # cm
    sx = map_x - scale_len - 100
    sy = 60
    ax.plot([sx, sx + scale_len], [sy, sy], color="white", linewidth=3, zorder=9)
    ax.plot([sx, sx], [sy - 20, sy + 20], color="white", linewidth=2, zorder=9)
    ax.plot([sx + scale_len, sx + scale_len], [sy - 20, sy + 20],
            color="white", linewidth=2, zorder=9)
    ax.text(
        sx + scale_len / 2, sy + 35, f"{scale_len}cm",
        ha="center", va="center", fontsize=9, color="white",
        fontweight="bold", fontproperties=fp, zorder=9
    )

    # -----------------------------------------------------------------------
    # Legend
    # -----------------------------------------------------------------------
    legend_handles = []

    # Sectors
    for sec_name, color in SECTOR_COLORS.items():
        frac = next(s["fraction"] for s in sectors if s["name"] == sec_name)
        legend_handles.append(
            mpatches.Patch(color=color, alpha=0.5, label=f"Sector: {sec_name} ({frac})")
        )

    # Spawns
    legend_handles.append(
        plt.Line2D([0], [0], marker="o", color="w", markerfacecolor="#ecf0f1",
                    markersize=8, markeredgecolor="white", label="Spawn Points (50)")
    )

    # ZEX Zones
    legend_handles.append(
        plt.Line2D([0], [0], marker="o", color="w", markerfacecolor="#e74c3c",
                    markersize=8, alpha=0.5, label="ZEX Zones (15)")
    )

    # Zone Phases
    for phase_name, color in PHASE_COLORS.items():
        if phase_name == "Clear":
            continue
        legend_handles.append(
            plt.Line2D([0], [0], linestyle="--", color=color,
                        label=f"Phase: {phase_name}")
        )

    # Loot rarities
    legend_handles.append(
        plt.Line2D([0], [0], marker="D", color="w", markerfacecolor="gray",
                    markersize=6, label="Loot Points (60)")
    )
    for rarity, color in RARITY_COLORS.items():
        count = sum(1 for lp in loot_points if lp["rarity"] == rarity)
        legend_handles.append(
            plt.Line2D([0], [0], marker="D", color="w", markerfacecolor=color,
                        markersize=6, label=f"  {rarity} ({count})")
        )

    # Hazards
    for htype, (marker, color, _) in HAZARD_MARKERS.items():
        legend_handles.append(
            plt.Line2D([0], [0], marker=marker, color="w", markerfacecolor=color,
                        markersize=8, label=f"Hazard: {htype}")
        )

    # Teams
    legend_handles.append(
        plt.Line2D([0], [0], color="none", label="")  # spacer
    )
    legend_handles.append(
        plt.Line2D([0], [0], color="none", label="Teams:")
    )
    for team, color in TEAM_COLORS.items():
        legend_handles.append(
            plt.Line2D([0], [0], marker="o", color="w", markerfacecolor=color,
                        markersize=6, label=f"  {team}")
        )

    leg = ax.legend(
        handles=legend_handles, loc="upper left", fontsize=7,
        framealpha=0.85, facecolor="#1a1a2e", edgecolor="#444444",
        labelcolor="white", ncol=2, columnspacing=1.0,
    )
    leg.get_frame().set_linewidth(1)

    # -----------------------------------------------------------------------
    # Stats annotation (top-right)
    # -----------------------------------------------------------------------
    stats_text = (
        f"Map: {map_x}×{map_y}cm\n"
        f"Spawns: {len(spawns)}\n"
        f"ZEX Zones: {len(zex_zones)}\n"
        f"Loot: {len(loot_points)}\n"
        f"Hazards: {len(env_hazards)}\n"
        f"Capacity: {data.get('capacity', 'N/A')}\n"
        f"Ring: {data.get('ring_duration_minutes', 'N/A')}min"
    )
    ax.text(
        map_x - 20, map_y - 20, stats_text,
        ha="right", va="top", fontsize=8, color="white",
        fontproperties=fp, family="monospace",
        bbox=dict(boxstyle="round,pad=0.5", facecolor="#1a1a2e",
                  edgecolor="#444444", alpha=0.85),
        zorder=10
    )

    # -----------------------------------------------------------------------
    # Save
    # -----------------------------------------------------------------------
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(str(output_path), dpi=150, bbox_inches="tight",
                facecolor=fig.get_facecolor())
    plt.close(fig)
    print(f"Visualization saved to {output_path}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Step 2: CIGKV Map Visualization"
    )
    parser.add_argument(
        "--input", type=Path, default=DEFAULT_INPUT,
        help="Path to CIGKV_level_data.json",
    )
    parser.add_argument(
        "--output", type=Path, default=DEFAULT_OUTPUT,
        help="Output PNG path",
    )
    args = parser.parse_args()

    print("=" * 70)
    print("Step 2: CIGKV Map Visualization")
    print("=" * 70)

    print(f"\nLoading level data from {args.input} ...")
    data = load_level_data(args.input)
    print(f"  Level: {data['level_name']}")
    print(f"  Map: {data['map_size']['x']}×{data['map_size']['y']}×{data['map_size']['z']} cm")
    print(f"  Spawn points: {len(data['spawn_points'])}")
    print(f"  ZEX zones: {len(data['zex_zones'])}")
    print(f"  Loot points: {len(data['loot_spawn_points'])}")
    print(f"  Zone phases: {len(data['zone_phases'])}")
    print(f"  Hazards: {len(data['environmental_hazards'])}")

    print(f"\nGenerating visualization → {args.output}")
    create_visualization(data, args.output)

    print("\nDone!")


if __name__ == "__main__":
    main()
