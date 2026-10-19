#!/usr/bin/env python3
"""Khaaos Run — Level Generator for UE5 Editor.
Reads level_data.json, creates spawn/loot points, generates DataTable CSVs.
"""
import json
import csv
import os
from pathlib import Path

def load_level_data(json_path):
    with open(json_path, "r") as f:
        return json.load(f)

def generate_spawn_points(level_data, output_dir):
    spawns = level_data.get("spawn_points", [])
    csv_path = os.path.join(output_dir, "DT_SpawnPoints.csv")
    with open(csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["ID","X","Y","Z","Pitch","Yaw","Roll","Team"])
        for i, sp in enumerate(spawns):
            loc = sp.get("location", [0,0,0])
            rot = sp.get("rotation", [0,0,0])
            writer.writerow([f"SP_{i:04d}", loc[0], loc[1], loc[2], rot[0], rot[1], rot[2], sp.get("team","")])
    print(f"  → {len(spawns)} spawn points → {csv_path}")

def generate_loot_points(level_data, output_dir):
    loot = level_data.get("loot_points", [])
    csv_path = os.path.join(output_dir, "DT_LootPoints.csv")
    with open(csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["ID","X","Y","Z","LootPool","SpawnWeight"])
        for i, lp in enumerate(loot):
            loc = lp.get("location", [0,0,0])
            writer.writerow([f"LP_{i:04d}", loc[0], loc[1], loc[2], lp.get("loot_pool",""), lp.get("weight",1.0)])
    print(f"  → {len(loot)} loot points → {csv_path}")

def generate_datatable_csvs(level_data, output_dir):
    os.makedirs(output_dir, exist_ok=True)
    generate_spawn_points(level_data, output_dir)
    generate_loot_points(level_data, output_dir)

if __name__ == "__main__":
    import sys
    json_path = sys.argv[1] if len(sys.argv) > 1 else "CIGKV_level_data.json"
    output_dir = sys.argv[2] if len(sys.argv) > 2 else "."
    data = load_level_data(json_path)
    generate_datatable_csvs(data, output_dir)
    print("Level generation complete!")
