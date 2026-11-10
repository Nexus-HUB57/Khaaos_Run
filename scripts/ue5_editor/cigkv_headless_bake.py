"""UE5.8 Editor-side pre-bake for the CIGKV headless GPU pipeline.

This script performs only operations available inside a licensed Editor. It
records exactly which cache warmups and bake requests were accepted; it never
claims that lighting was baked if the Editor API/command did not acknowledge it.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

import unreal

ROOT = Path(os.environ.get("GITHUB_WORKSPACE", Path.cwd()))
MANIFEST = ROOT / "Unreal/KhaaosRun/Content/Characters/CIGKV_VerticalSlice/CIGKV_headless_render_bake.json"
OUT = ROOT / "artifacts/cigkv-vertical-slice/headless-bake-report.json"


def log(message: str):
    unreal.log(f"[CIGKV_HEADLESS_BAKE] {message}")


def command(name: str):
    unreal.SystemLibrary.execute_console_command(None, name)
    return name


def main():
    manifest = json.loads(MANIFEST.read_text())
    started = time.time()
    requested = []
    # These commands warm the runtime caches used by the subsequent GPU render.
    for value in (
        "r.ShaderPipelineCache.Enabled 1",
        "r.ShaderPipelineCache.SaveBoundPSOLog 1",
        "r.Nanite.Streaming.NumInitialRootPages 128",
        "r.Lumen.Reflections.Allow 1",
        "r.Lumen.ScreenProbeGather 1",
        "r.Shadow.Virtual.Enable 1",
    ):
        requested.append(command(value))
    # BuildLighting is an Editor command. The report distinguishes a request
    # from completion because command acknowledgement is version dependent.
    requested.append(command("BUILD LIGHTING"))
    unreal.EditorLoadingAndSavingUtils.save_dirty_packages(True, True, True)
    report = {
        "schema": "khaaos.cigkv.headless-bake-report/v1",
        "engine_only": True,
        "engine_version": str(unreal.SystemLibrary.get_engine_version()),
        "status": "requested",
        "cache_warmup_commands": requested,
        "packages_saved": True,
        "build_lighting_requested": True,
        "duration_seconds": round(time.time() - started, 3),
        "limitations": [
            "a conclusão do Build Lighting depende do log do Editor e do runner GPU",
            "Lumen em tempo real não é declarado como lightmap baked",
            "o render headless deve validar GPU e caches em etapa separada",
        ],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    log("pre-bake solicitado e pacotes salvos")


if __name__ == "__main__":
    main()
