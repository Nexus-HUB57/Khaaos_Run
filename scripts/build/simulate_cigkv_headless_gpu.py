#!/usr/bin/env python3
"""Run the CIGKV headless pipeline contract locally without UE5 or a GPU.

This verifies orchestration, matrix cardinality and artifact schemas only. It
never creates screenshots that could be mistaken for real UE5 captures.
"""
from __future__ import annotations

import argparse
import json
import platform
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "Unreal/KhaaosRun/Content/Characters/CIGKV_VerticalSlice/CIGKV_headless_render_bake.json"
MATRIX = ROOT / "Unreal/KhaaosRun/Content/Characters/CIGKV_VerticalSlice/CIGKV_visual_lighting_test_matrix.json"
DEFAULT_OUT = ROOT / "artifacts/cigkv-vertical-slice/mock-headless"


def write(path: Path, payload: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=str(DEFAULT_OUT))
    args = parser.parse_args()
    out = Path(args.output)
    manifest = json.loads(MANIFEST.read_text())
    matrix = json.loads(MATRIX.read_text())
    cases = [
        {"profile": profile, "lighting": lighting["id"], "view": view["id"], "simulated": True}
        for profile in matrix["profiles"]
        for lighting in matrix["lighting_scenarios"]
        for view in matrix["views"]
    ]
    assert len(cases) == manifest["render"]["expected_frames"] == 24
    write(out / "mock-gpu-diagnostic.json", {
        "schema": "khaaos.cigkv.mock-gpu-diagnostic/v1",
        "simulated": True,
        "ready": True,
        "gpu": {"name": "MOCK-NVIDIA-GPU", "memory_total_mb": 16384, "driver": "mock"},
        "ue5": {"version": "5.8.0-mock", "null_rhi": False},
        "host": platform.platform(),
    })
    write(out / "material-configuration-report.json", {
        "schema": "khaaos.cigkv.material-configuration-report/v1",
        "simulated": True,
        "status": "pass",
        "engine_version": "5.8.0-mock",
        "subsurface_profiles": [{"name": "human_skin", "status": "pass"}, {"name": "zheers_skin", "status": "pass"}],
        "instances": [{"name": "mock_material_instance", "status": "pass"}],
        "visual_acceptance": "not_measured",
    })
    write(out / "headless-bake-report.json", {
        "schema": "khaaos.cigkv.headless-bake-report/v1",
        "simulated": True,
        "status": "pass_simulated",
        "build_lighting_requested": True,
        "packages_saved": True,
        "gpu_cache_warmup": True,
        "visual_acceptance": "not_measured",
    })
    write(out / "engine-report.json", {
        "schema": "khaaos.cigkv.vertical-slice.engine-report/v2",
        "simulated": True,
        "status": "captured_simulated",
        "expected_captures": 24,
        "captures": cases,
        "screenshots": [],
        "visual_acceptance": "not_measured",
    })
    write(out / "mock-headless-pipeline-report.json", {
        "schema": "khaaos.cigkv.headless-pipeline-report/v1",
        "simulated": True,
        "status": "pass_simulated",
        "steps": ["gpu_preflight", "material_configuration", "pre_bake", "render_matrix", "artifact_validation"],
        "cases": len(cases),
        "real_pngs": 0,
        "visual_acceptance": "not_measured",
        "limitations": ["não executa UnrealEditor-Cmd", "não usa GPU", "não produz screenshots reais"],
    })
    print(f"MOCK_HEADLESS_PASS cases={len(cases)} real_pngs=0 output={out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
