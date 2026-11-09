#!/usr/bin/env python3
"""Emit a JSON diagnostic for a UE5.8 visual runner.

No credentials are read or printed. Exit 0 means the host satisfies the
minimum checks requested by the command; exit 2 means it is not ready.
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import subprocess
from pathlib import Path


def run(command: list[str]) -> str | None:
    try:
        return subprocess.check_output(command, text=True, stderr=subprocess.STDOUT, timeout=15).strip()
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ue-root", default=os.environ.get("UE5_ROOT", "/opt/UnrealEngine"))
    parser.add_argument("--blender", default=os.environ.get("BLENDER_BIN", "blender"))
    parser.add_argument("--output", default="artifacts/cigkv-vertical-slice/ue58-gpu-diagnostic.json")
    parser.add_argument("--require-gpu", action="store_true")
    args = parser.parse_args()
    ue_root = Path(args.ue_root)
    editor = ue_root / "Engine/Binaries/Linux/UnrealEditor-Cmd"
    build_version = ue_root / "Engine/Build/Build.version"
    gpu_text = run(["nvidia-smi", "--query-gpu=name,memory.total,driver_version", "--format=csv,noheader"])
    blender_text = run([args.blender, "--version"])
    report = {
        "schema": "khaaos.ue58.gpu-runner-diagnostic/v1",
        "platform": {"system": platform.system(), "release": platform.release(), "machine": platform.machine()},
        "ue5": {"root": str(ue_root), "editor_cmd": str(editor), "editor_exists": editor.is_file(), "build_version_exists": build_version.is_file()},
        "gpu": {"nvidia_smi_found": shutil.which("nvidia-smi") is not None, "query": gpu_text, "ready": bool(gpu_text)},
        "blender": {"binary": args.blender, "found": shutil.which(args.blender) is not None, "version": blender_text, "ready": bool(blender_text and "Blender 4." in blender_text)},
        "ready": bool(editor.is_file() and build_version.is_file() and blender_text and "Blender 4." in blender_text and (gpu_text or not args.require_gpu)),
        "secrets_not_inspected": True,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0 if report["ready"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
