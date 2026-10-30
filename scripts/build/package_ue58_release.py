#!/usr/bin/env python3
"""Empacota uma entrega final reproduzível do Khaaos Run.

O pacote inclui o projeto UE5.8, source/config/content versionados, runtime,
relatório de performance e, quando fornecido, o staging compilado pelo runner
UE. Nunca afirma que um cook ocorreu se somente o fallback engine-less rodou.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tarfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROJECT = ROOT / "Unreal" / "KhaaosRun"
DEFAULT_OUTPUT = ROOT / "artifacts" / "release" / "khaaos-run-ue58.tar.gz"

def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def repo_files(include_staging: Path | None) -> list[Path]:
    roots = [
        PROJECT / "KhaaosRun.uproject",
        PROJECT / "Config",
        PROJECT / "Source",
        PROJECT / "Content",
        ROOT / "game-runtime" / "src",
        ROOT / "game-runtime" / "server",
        ROOT / "game-runtime" / "package.json",
        ROOT / "docs" / "performance",
        ROOT / "artifacts" / "performance",
    ]
    files: set[Path] = set()
    for root in roots:
        if root.is_file(): files.add(root)
        elif root.is_dir(): files.update(p for p in root.rglob("*") if p.is_file())
    if include_staging and include_staging.exists():
        files.update(p for p in include_staging.rglob("*") if p.is_file())
    return sorted(files)

def validate() -> dict:
    errors: list[str] = []
    if not PROJECT.joinpath("KhaaosRun.uproject").exists(): errors.append("uproject ausente")
    else:
        try:
            project = json.loads(PROJECT.joinpath("KhaaosRun.uproject").read_text(encoding="utf-8"))
            if project.get("EngineAssociation") != "5.8": errors.append("EngineAssociation diferente de 5.8")
        except Exception as exc: errors.append(f"uproject inválido: {exc}")
    required = [PROJECT / "Config" / "DefaultEngine.ini", PROJECT / "Source", PROJECT / "Content"]
    errors.extend(f"ausente: {p.relative_to(ROOT)}" for p in required if not p.exists())
    return {"status": "passed" if not errors else "failed", "errors": errors}

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--staging", type=Path, help="diretório de staging UE cookado/compilado")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    output = (ROOT / args.output).resolve() if not args.output.is_absolute() else args.output
    staging = ((ROOT / args.staging).resolve() if args.staging and not args.staging.is_absolute() else args.staging)
    validation = validate()
    result = {"schema": "khaaos.ue58.release-package/v1", "generatedAt": datetime.now(timezone.utc).isoformat(), "engineTarget": "UE5.8", "validation": validation, "buildMode": "compiled_staging" if staging and staging.exists() else "source_config_engine_required"}
    if validation["status"] != "passed":
        result["package"] = {"status": "not_created"}
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 1
    files = repo_files(staging)
    output.parent.mkdir(parents=True, exist_ok=True)
    entries = []
    with tarfile.open(output, "w:gz") as archive:
        for file in files:
            rel = file.relative_to(ROOT).as_posix()
            archive.add(file, arcname=f"khaaos-run/{rel}", recursive=False)
            entries.append({"path": rel, "bytes": file.stat().st_size, "sha256": sha256(file)})
        manifest = {**result, "files": entries, "fileCount": len(entries)}
        manifest_path = ROOT / "artifacts" / "release" / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        archive.add(manifest_path, arcname="khaaos-run/manifest.json", recursive=False)
    result["package"] = {"status": "created", "path": str(output), "bytes": output.stat().st_size, "sha256": sha256(output), "fileCount": len(files)}
    report_path = (ROOT / args.report).resolve() if args.report and not args.report.is_absolute() else args.report
    if report_path:
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
