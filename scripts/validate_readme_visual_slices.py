#!/usr/bin/env python3
"""Validate readme-canonical visual-slice contracts for CIGKV and W2–W4.

The README is parsed as the source of truth for sector names and fractions.
The manifests are visual contracts only; this validator does not bless or
consume gameplay values from WCFG, INI, C++ or other technical sources.
"""
from __future__ import annotations

import json
import re
import struct
import sys
import unicodedata
from fractions import Fraction
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
README = ROOT / "README.md"
CONTENT_MAPS = ROOT / "Unreal" / "KhaaosRun" / "Content" / "Maps"
SCHEMA = "khaaos.readme-visual-slice/v1"

WORLDS = {
    "CIGKV": {
        "folder": "CIGKV",
        "world_id": "CIGKV",
        "heading": "## Protocolo CIGKV — Campo de Treinamento",
        "art": "T_CIGKV_World_Concept.png",
        "required_terms": [
            "Pátio de Armamento (Armory Hub)", "Setor de Testes (Proving Grounds)",
            "Parque Abandonado", "racks", "túneis", "vegetação", "riachos",
            "emboscadas", "15", "ZEX",
        ],
    },
    "Priadus": {
        "folder": "Priadus",
        "world_id": "W2/C2",
        "heading": "### W2/C2 — Priadus (Floresta da Escuridão)",
        "art": "T_Priadus_World_Concept.png",
        "required_terms": [
            "Área Pantanosa", "Bosque (desembarque)", "Área de Caça + Templo Antigo",
            "matadouro", "neblina alucinógena", "esporos tóxicos", "flora carnívora", "jacarés",
        ],
    },
    "Ckesalth": {
        "folder": "Ckesalth",
        "world_id": "W3/C3",
        "heading": "### W3/C3 — Ckesalth (Deserto das Almas Esquecidas)",
        "art": "T_Ckesalth_World_Concept.png",
        "required_terms": [
            "Resort Abandonado", "Vilarejo dos Beduínos", "Refinaria de Petróleo (centro)",
            "Zona de Extração (expedição)", "deserto árido", "lagoas de petróleo em chamas",
            "fumaça tóxica", "areia movediça", "Vila Sombria", "cinco minutos",
        ],
    },
    "Arukheea": {
        "folder": "Arukheea",
        "world_id": "W4/C4",
        "heading": "### W4/C4 — Arukheea (Ilha dos Gritos Calados)",
        "art": "T_Arukheea_World_Concept.png",
        "required_terms": [
            "Bosque dos Perdidos", "Prisão do Sol da Noite", "Fábrica / Cemitério das Baleias",
            "heliporto da torre", "luz perpétua", "tsunami iminente", "tubarões",
            "pressão hidráulica", "claustrofobia em céu aberto",
        ],
    },
}

VULGAR_FRACTIONS = {
    "⅛": Fraction(1, 8), "¼": Fraction(1, 4), "⅜": Fraction(3, 8),
    "½": Fraction(1, 2), "⅝": Fraction(5, 8), "¾": Fraction(3, 4),
    "⅞": Fraction(7, 8), "⅓": Fraction(1, 3), "⅔": Fraction(2, 3),
}
SUPERSCRIPT_DIGITS = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹", "0123456789")
SUBSCRIPT_DIGITS = str.maketrans("₀₁₂₃₄₅₆₇₈₉", "0123456789")


def fraction_from_readme(label: str) -> Fraction | None:
    text = label.strip().replace("\u00a0", " ")
    if text in {"—", "–", "-", ""}:
        return None
    if text in VULGAR_FRACTIONS:
        return VULGAR_FRACTIONS[text]
    text = text.translate(SUPERSCRIPT_DIGITS).translate(SUBSCRIPT_DIGITS).replace("⁄", "/").replace(" ", "")
    if re.fullmatch(r"\d+/\d+", text):
        numerator, denominator = (int(part) for part in text.split("/", 1))
        return Fraction(numerator, denominator)
    raise ValueError(f"fração do README não reconhecida: {label!r}")


def fraction_from_manifest(value: Any, world: str, sector_name: str) -> Fraction | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{world}: fração inválida em {sector_name!r}: {value!r}")
    return Fraction(str(value)).limit_denominator(1024)


def extract_sector_table(lines: list[str], heading: str) -> list[tuple[str, Fraction | None]]:
    try:
        start = next(i for i, line in enumerate(lines) if line.strip() == heading)
    except StopIteration as exc:
        raise ValueError(f"seção canônica não encontrada: {heading}") from exc

    header = None
    heading_level = len(heading) - len(heading.lstrip("#"))
    for i in range(start + 1, min(len(lines), start + 50)):
        if "| Setor | Fração |" in lines[i]:
            header = i
            break
        candidate_heading = re.match(r"^(#+)\s+", lines[i].strip())
        if candidate_heading and len(candidate_heading.group(1)) <= heading_level:
            break
    if header is None:
        raise ValueError(f"tabela Setor/Fração não encontrada após: {heading}")

    sectors: list[tuple[str, Fraction | None]] = []
    for line in lines[header + 1:]:
        stripped = line.strip()
        if not stripped.startswith("|"):
            break
        cells = [cell.strip() for cell in stripped.strip("|").split("|")]
        if len(cells) < 2 or set(cells[0] + cells[1]) <= {"-", ":", " "}:
            continue
        if cells[0].lower() == "setor":
            continue
        if cells[1].casefold() == "dispersas":
            # CIGKV's 15 distributed ZEX are landmarks, not an area fraction.
            continue
        sectors.append((cells[0], fraction_from_readme(cells[1])))
    if not sectors:
        raise ValueError(f"tabela canônica sem setores após: {heading}")
    return sectors


def normalize_text(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text.casefold())
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def load_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as stream:
        value = json.load(stream)
    if not isinstance(value, dict):
        raise ValueError(f"JSON raiz deve ser um objeto: {path}")
    return value


def png_dimensions(path: Path) -> tuple[int, int]:
    with path.open("rb") as stream:
        header = stream.read(24)
    if len(header) < 24 or header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR":
        raise ValueError(f"concept art não é PNG válido: {path}")
    return struct.unpack(">II", header[16:24])


def validate_world(readme_lines: list[str], name: str, config: dict[str, str | list[str]]) -> list[str]:
    errors: list[str] = []
    base = CONTENT_MAPS / str(config["folder"])
    manifest_path = base / "ReadmeVisualSlice" / "scene_manifest.json"
    manifest = load_json(manifest_path)

    if manifest.get("$schema") != SCHEMA:
        errors.append(f"$schema deve ser {SCHEMA!r}")
    if "schema" in manifest:
        errors.append("use apenas a chave padronizada '$schema', não 'schema'")
    if manifest.get("world_id") != config["world_id"]:
        errors.append(f"world_id esperado {config['world_id']!r}; obtido {manifest.get('world_id')!r}")
    if manifest.get("status") != "visual_reference_only_not_gameplay":
        errors.append("status deve declarar referência visual sem gameplay")

    preview = manifest.get("preview_units")
    if not isinstance(preview, dict):
        errors.append("preview_units deve ser objeto")
    else:
        if preview.get("width") != 1000 or preview.get("height") != 1000:
            errors.append("preview_units deve permanecer normalizado em 1000 x 1000")
        if preview.get("playable") is not False:
            errors.append("preview_units.playable deve ser false")
        if preview.get("unit") != "normalized_preview_units":
            errors.append("preview_units.unit deve ser 'normalized_preview_units'")

    expected = extract_sector_table(readme_lines, str(config["heading"]))
    sectors = manifest.get("sectors")
    if not isinstance(sectors, list):
        errors.append("sectors deve ser lista")
        sectors = []
    else:
        actual_names = [sector.get("name") for sector in sectors if isinstance(sector, dict)]
        expected_names = [sector_name for sector_name, _ in expected]
        if actual_names != expected_names:
            errors.append(f"setores divergentes do README; esperado {expected_names!r}, recebido {actual_names!r}")

        ids: list[str] = []
        for sector in sectors:
            if not isinstance(sector, dict):
                errors.append("cada setor deve ser objeto")
                continue
            sid = sector.get("id")
            if not isinstance(sid, str) or not sid:
                errors.append(f"setor sem id estável: {sector.get('name')!r}")
            else:
                ids.append(sid)
        if len(ids) != len(set(ids)):
            errors.append("ids de setores devem ser únicos")

        if len(sectors) == len(expected):
            for sector, (expected_name, expected_fraction) in zip(sectors, expected):
                try:
                    actual_fraction = fraction_from_manifest(sector.get("fraction"), name, expected_name)
                except ValueError as exc:
                    errors.append(str(exc))
                    continue
                if actual_fraction != expected_fraction:
                    errors.append(f"fração de {expected_name!r} diverge do README: esperado {expected_fraction}, recebido {actual_fraction}")
                label = sector.get("fraction_label")
                if expected_fraction is None:
                    if label is not None:
                        errors.append(f"{expected_name!r}: fraction_label deve ser null quando README usa '—'")
                else:
                    try:
                        label_fraction = fraction_from_readme(str(label))
                    except ValueError:
                        label_fraction = None
                    if label_fraction != expected_fraction:
                        errors.append(f"{expected_name!r}: fraction_label deve representar {expected_fraction}")

        explicit = [fraction_from_manifest(s.get("fraction"), name, str(s.get("name"))) for s in sectors if isinstance(s, dict) and s.get("fraction") is not None]
        if explicit and sum(explicit, Fraction(0)) != Fraction(1):
            errors.append(f"frações setoriais precisam somar 1; obtido {sum(explicit, Fraction(0))}")

    for field in ("canonical_sources", "landmarks", "hazards", "fidelity_exclusions", "unresolved_technical_data"):
        if not isinstance(manifest.get(field), list) or not manifest[field]:
            errors.append(f"{field} deve ser uma lista não vazia")

    serialized = normalize_text(json.dumps(manifest, ensure_ascii=False))
    for term in config["required_terms"]:
        if normalize_text(str(term)) not in serialized:
            errors.append(f"conteúdo visual canônico ausente: {term!r}")

    concept_path = ROOT / "Unreal" / "KhaaosRun" / "Docs" / "Worlds" / "ConceptArt" / str(config["art"])
    if not concept_path.is_file():
        errors.append(f"concept art ausente: {concept_path.relative_to(ROOT)}")
    else:
        width, height = png_dimensions(concept_path)
        if width < 2048 or height < 1024:
            errors.append(f"concept art abaixo da resolução de referência: {width}x{height}")

    return errors


def main() -> int:
    try:
        readme_lines = README.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        print(f"FAIL — README canônico indisponível: {exc}", file=sys.stderr)
        return 1

    total_errors = 0
    for name, config in WORLDS.items():
        try:
            errors = validate_world(readme_lines, name, config)
        except (OSError, json.JSONDecodeError, ValueError, TypeError) as exc:
            errors = [str(exc)]
        if errors:
            total_errors += len(errors)
            print(f"FAIL — {name}")
            for error in errors:
                print(f"  - {error}")
        else:
            print(f"PASS — {name}: JSON, esquema, identidade README, setores/frações, exclusões e concept art")

    if total_errors:
        print(f"\nFalhou: {total_errors} problema(s) nos contratos visuais.")
        return 1
    print("\nTodos os contratos visuais passaram; nenhum valor de gameplay foi inferido.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
