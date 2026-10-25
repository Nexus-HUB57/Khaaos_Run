#!/usr/bin/env python3
"""Validate Barburhen CSV row IDs and references against EBarburhen* enums."""

from __future__ import annotations

import argparse
import csv
import re
import sys
from collections import Counter
from pathlib import Path

ENUM_RE = re.compile(
    r"\benum\s+class\s+(EBarburhen\w+)(?:\s*:\s*[\w:]+)?\s*\{(.*?)\}\s*;",
    re.DOTALL,
)
NUMERIC_ENUM_VALUE_RE = re.compile(
    r"^[+-]?(?:0[xX][0-9a-fA-F]+|0[bB][01]+|0[0-7]*|[1-9][0-9]*)(?:[uUlL]+)?$"
)


class Validation:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.csv_count = 0
        self.row_count = 0
        self.identifier_count = 0
        self.enum_count = 0

    def error(self, message: str) -> None:
        self.errors.append(message)


def parse_enum_members(body: str, path: Path, enum_name: str, result: Validation) -> list[str]:
    """Parse one-enumerator-per-line Unreal C++ enum bodies, including UMETA annotations."""
    members: list[str] = []
    numeric_values: dict[int, str] = {}
    next_value: int | None = 0

    for line_number, raw_line in enumerate(body.splitlines(), start=1):
        line = re.sub(r"//.*$", "", raw_line).strip()
        if not line:
            continue
        line = re.sub(r"\bUMETA\s*\(.*\)", "", line).strip().rstrip(",").strip()
        match = re.fullmatch(r"([A-Za-z_]\w*)\s*(?:=\s*(.+))?", line)
        if not match:
            result.error(f"{path}:{enum_name}: não foi possível interpretar o enumerador: {raw_line.strip()}")
            continue

        member, explicit_value = match.groups()
        members.append(member)
        value: int | None = None
        if explicit_value is None:
            value = next_value
        else:
            literal = explicit_value.strip()
            if not NUMERIC_ENUM_VALUE_RE.fullmatch(literal):
                # Do not claim uniqueness when a C++ expression cannot be evaluated safely.
                result.error(
                    f"{path}:{enum_name}: valor enum não literal não suportado em "
                    f"{member}={literal}; valide manualmente ou atualize o parser"
                )
                value = None
            else:
                literal = re.sub(r"[uUlL]+$", "", literal)
                sign = -1 if literal.startswith("-") else 1
                unsigned_literal = literal.lstrip("+-")
                base = 16 if unsigned_literal.lower().startswith("0x") else 2 if unsigned_literal.lower().startswith("0b") else 8 if len(unsigned_literal) > 1 and unsigned_literal.startswith("0") else 10
                value = sign * int(unsigned_literal, base)

        if value is not None:
            if value in numeric_values:
                result.error(
                    f"{path}:{enum_name}: valor numérico duplicado {value} em "
                    f"{numeric_values[value]} e {member}"
                )
            else:
                numeric_values[value] = member
            next_value = value + 1
        else:
            next_value = None

    duplicates = sorted(name for name, count in Counter(members).items() if count > 1)
    for member in duplicates:
        result.error(f"{path}:{enum_name}: membro duplicado {member}")
    return members


def load_enums(source_root: Path, result: Validation) -> dict[str, set[str]]:
    definitions: dict[str, list[tuple[Path, list[str]]]] = {}
    source_files = sorted(
        path
        for pattern in ("*.h", "*.hpp", "*.inl", "*.cpp")
        for path in source_root.rglob(pattern)
    )
    for path in source_files:
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            result.error(f"{path}: falha ao ler fonte C++ ({exc})")
            continue
        # Remove block comments before matching enum bodies; retain line count for diagnostics.
        clean_text = re.sub(r"/\*.*?\*/", lambda m: "\n" * m.group(0).count("\n"), text, flags=re.DOTALL)
        clean_text = re.sub(r"//[^\n]*", "", clean_text)
        for match in ENUM_RE.finditer(clean_text):
            enum_name, body = match.groups()
            members = parse_enum_members(body, path, enum_name, result)
            definitions.setdefault(enum_name, []).append((path, members))

    enums: dict[str, set[str]] = {}
    for enum_name, entries in definitions.items():
        if len(entries) > 1:
            locations = ", ".join(str(path) for path, _ in entries)
            result.error(f"Enum {enum_name} definido mais de uma vez: {locations}")
        # Keep the first definition so CSV reference checks can still report useful errors.
        enums[enum_name] = set(entries[0][1])
        result.enum_count += 1

    for required in ("EBarburhenSector", "EBarburhenPointType"):
        if required not in enums:
            result.error(f"Enum requerido não encontrado: {required} em {source_root}")
    return enums


def is_identifier_header(header: str, index: int) -> bool:
    # Unreal DataTable CSVs use the first column as the row key; it is commonly named `---`.
    if index == 0:
        return True
    name = header.strip()
    normalized = name.casefold()
    if normalized in {"rowname", "pointid", "id", "uuid", "guid", "key"}:
        return True
    if normalized.endswith(("_id", "_uuid", "_guid", "_key")):
        return True
    return name.endswith(("Id", "ID", "Uuid", "UUID", "Guid", "GUID", "Key"))


def validate_csv(path: Path, enums: dict[str, set[str]], result: Validation) -> None:
    result.csv_count += 1
    try:
        stream = path.open("r", newline="", encoding="utf-8-sig")
    except OSError as exc:
        result.error(f"{path}: falha ao abrir CSV ({exc})")
        return

    with stream:
        reader = csv.reader(stream)
        try:
            headers = next(reader)
        except StopIteration:
            result.error(f"{path}: CSV vazio")
            return
        headers = [header.strip() for header in headers]
        if not headers:
            result.error(f"{path}: cabeçalho ausente")
            return

        header_counts = Counter(header.casefold() for header in headers)
        for header, count in header_counts.items():
            if count > 1:
                result.error(f"{path}: cabeçalho duplicado {header!r}")

        id_columns = [index for index, header in enumerate(headers) if is_identifier_header(header, index)]
        if not id_columns:
            result.error(f"{path}: nenhuma coluna de identificador encontrada")
            return
        seen: dict[int, dict[str, int]] = {index: {} for index in id_columns}
        row_key_index = 0
        row_key_header = headers[row_key_index] or "(primeira coluna/row key)"
        id_index_by_header = {header.casefold(): index for index, header in enumerate(headers)}
        point_id_index = id_index_by_header.get("pointid")

        for row in reader:
            line_number = reader.line_num
            if not row or not any(cell.strip() for cell in row):
                continue
            if row[0].strip().startswith("#"):
                continue
            if len(row) != len(headers):
                result.error(
                    f"{path}:{line_number}: linha tem {len(row)} campos; esperado {len(headers)}"
                )
                continue
            result.row_count += 1
            values = [cell.strip() for cell in row]

            for index in id_columns:
                value = values[index]
                header = headers[index] or ("row key" if index == 0 else f"coluna {index + 1}")
                if not value:
                    result.error(f"{path}:{line_number}: identificador vazio em {header}")
                    continue
                result.identifier_count += 1
                # Unreal DataTable row names are FName values, which compare case-insensitively.
                normalized_value = value.casefold()
                previous = seen[index].get(normalized_value)
                if previous is not None:
                    result.error(
                        f"{path}:{line_number}: ID duplicado {value!r} em {header}; "
                        f"primeira ocorrência na linha {previous}"
                    )
                else:
                    seen[index][normalized_value] = line_number

            # In this DataTable, PointId is intended to be identical to Unreal's CSV row key.
            if point_id_index is not None and values[row_key_index] != values[point_id_index]:
                result.error(
                    f"{path}:{line_number}: row key {values[row_key_index]!r} difere de "
                    f"PointId {values[point_id_index]!r}"
                )

            for column, enum_name in (("Type", "EBarburhenPointType"), ("Sector", "EBarburhenSector")):
                index = id_index_by_header.get(column.casefold())
                if index is None or enum_name not in enums:
                    continue
                value = values[index]
                if value not in enums[enum_name]:
                    result.error(
                        f"{path}:{line_number}: {column}={value!r} não existe em {enum_name}"
                    )

        # Keep row-key validation explicit in the report and catch a malformed empty first header.
        if row_key_index not in id_columns:
            result.error(f"{path}: primeira coluna {row_key_header!r} não foi tratada como row key")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="raiz do repositório (útil para testar fixtures temporárias)",
    )
    args = parser.parse_args()
    repo_root = args.root.resolve()
    content_root = repo_root / "Unreal/KhaaosRun/Content/Barburhen"
    source_root = repo_root / "Unreal/KhaaosRun/Source/KhaaosRun"
    result = Validation()

    if not content_root.is_dir():
        result.error(f"Diretório de CSVs não encontrado: {content_root}")
    if not source_root.is_dir():
        result.error(f"Diretório de fontes C++ não encontrado: {source_root}")

    enums = load_enums(source_root, result) if source_root.is_dir() else {}
    csv_files = sorted(content_root.rglob("*.csv")) if content_root.is_dir() else []
    if not csv_files:
        result.error(f"Nenhum CSV encontrado em {content_root}")
    for path in csv_files:
        validate_csv(path, enums, result)

    if result.errors:
        print("Validação de IDs/Enums Barburhen: FALHOU", file=sys.stderr)
        for error in result.errors:
            print(f"  - {error}", file=sys.stderr)
        print(f"{len(result.errors)} erro(s) em {result.csv_count} CSV(s).", file=sys.stderr)
        return 1

    print(
        "Validação de IDs/Enums Barburhen: OK — "
        f"{result.csv_count} CSV(s), {result.row_count} linha(s), "
        f"{result.identifier_count} valor(es) de ID, {result.enum_count} enum(s)."
    )
    print("Referências Type/Sector dos CSVs compatíveis com EBarburhenPointType/EBarburhenSector.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
