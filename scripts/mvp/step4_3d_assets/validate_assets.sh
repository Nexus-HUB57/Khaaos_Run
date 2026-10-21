#!/usr/bin/env bash
#
# Khaaos Run — Step 4: Asset Validation Script
# ==================================================
# Validates all P0 placeholder 3D assets for the MVP.
# Checks: existence, file size, naming conventions, LOD chains,
#          material assignments, and minimum asset count (10+).
#
# Usage: ./validate_assets.sh [--strict] [--manifest PATH]
#   --strict       Fail on warnings (default: warnings only)
#   --manifest     Path to asset manifest JSON (default: auto-detect)
#
# Exit codes:
#   0 = All validations pass
#   1 = One or more validations failed
#

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
ASSETS_DIR="${REPO_ROOT}/mvp_output/assets"
MANIFEST_PATH="${SCRIPT_DIR}/asset_manifest_mvp.json"
REPORT_FILE="${ASSETS_DIR}/validation_report.txt"
MINIMUM_ASSETS=10

STRICT_MODE=0
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0
TOTAL_CHECKS=0

# ─── Argument Parsing ────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
    case "$1" in
        --strict)   STRICT_MODE=1; shift ;;
        --manifest) MANIFEST_PATH="$2"; shift 2 ;;
        -h|--help)
            echo "Usage: $0 [--strict] [--manifest PATH]"
            echo "  --strict       Fail on warnings"
            echo "  --manifest     Path to asset manifest JSON"
            exit 0
            ;;
        *) echo "Unknown argument: $1"; exit 1 ;;
    esac
done

# ─── Utility Functions ───────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'  # No Color

log_pass() {
    echo -e "  ${GREEN}[PASS]${NC} $1"
    PASS_COUNT=$((PASS_COUNT + 1))
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
}

log_fail() {
    echo -e "  ${RED}[FAIL]${NC} $1"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
}

log_warn() {
    echo -e "  ${YELLOW}[WARN]${NC} $1"
    WARN_COUNT=$((WARN_COUNT + 1))
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    if [[ $STRICT_MODE -eq 1 ]]; then
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
}

log_info() {
    echo -e "  ${BLUE}[INFO]${NC} $1"
}

log_section() {
    echo ""
    echo -e "${BLUE}── $1 ──────────────────────────────────────${NC}"
}

# ─── UE5 Naming Convention Check ─────────────────────────────────────────────

# Valid UE5 prefixes per category
validate_naming_convention() {
    local asset_id="$1"
    local category="$2"
    local valid=0

    case "$category" in
        character)
            # Character assets: CHR_ or SK_ or SKM_ prefix
            if [[ "$asset_id" =~ ^CHR_ ]] || [[ "$asset_id" =~ ^SK_ ]]; then
                valid=1
            fi
            ;;
        weapon)
            # Weapon assets: WPN_ or SM_ prefix
            if [[ "$asset_id" =~ ^WPN_ ]] || [[ "$asset_id" =~ ^SM_ ]]; then
                valid=1
            fi
            ;;
        loot)
            # Loot assets: LOOT_ or SM_ prefix
            if [[ "$asset_id" =~ ^LOOT_ ]] || [[ "$asset_id" =~ ^SM_ ]]; then
                valid=1
            fi
            ;;
        vfx)
            # VFX assets: VFX_ or NS_ or NI_ prefix
            if [[ "$asset_id" =~ ^VFX_ ]] || [[ "$asset_id" =~ ^NS_ ]] || [[ "$asset_id" =~ ^NI_ ]]; then
                valid=1
            fi
            ;;
        audio)
            # Audio assets: SFX_ or MUS_ or SW_ or SCue_ prefix
            if [[ "$asset_id" =~ ^SFX_ ]] || [[ "$asset_id" =~ ^MUS_ ]] || [[ "$asset_id" =~ ^SW_ ]] || [[ "$asset_id" =~ ^SCue_ ]]; then
                valid=1
            fi
            ;;
        *)
            # Unknown category - warn but don't fail
            log_warn "Unknown category '$category' for asset '$asset_id'"
            valid=1
            ;;
    esac

    # Check for spaces (not allowed in UE5)
    if [[ "$asset_id" =~ [[:space:]] ]]; then
        log_fail "Asset ID '$asset_id' contains spaces (UE5 convention violation)"
        valid=0
    fi

    # Check for special characters (only underscore and alphanumeric allowed)
    if [[ ! "$asset_id" =~ ^[A-Za-z0-9_]+$ ]]; then
        log_fail "Asset ID '$asset_id' contains invalid characters"
        valid=0
    fi

    if [[ $valid -eq 1 ]]; then
        log_pass "Naming convention valid: $asset_id ($category)"
    else
        log_fail "Naming convention invalid: $asset_id ($category)"
    fi
}

# ─── File Validation ─────────────────────────────────────────────────────────

validate_asset_file() {
    local asset_id="$1"
    local category="$2"
    local source_path="$3"

    # Construct full path
    local full_path="${REPO_ROOT}/${source_path}"

    # Check existence
    if [[ ! -f "$full_path" ]]; then
        # Try alternate: look in assets directory
        local alt_path=""
        case "$category" in
            character) alt_path="${ASSETS_DIR}/characters/${asset_id}/${asset_id}.dae" ;;
            weapon)    alt_path="${ASSETS_DIR}/weapons/${asset_id}/${asset_id}.fbx" ;;
            loot)      alt_path="${ASSETS_DIR}/loot/${asset_id}/${asset_id}.fbx" ;;
        esac

        if [[ -n "$alt_path" && -f "$alt_path" ]]; then
            full_path="$alt_path"
        else
            # Try OBJ as fallback
            local obj_path=""
            case "$category" in
                character) obj_path="${ASSETS_DIR}/characters/${asset_id}/${asset_id}.obj" ;;
                weapon)    obj_path="${ASSETS_DIR}/weapons/${asset_id}/${asset_id}.obj" ;;
                loot)      obj_path="${ASSETS_DIR}/loot/${asset_id}/${asset_id}.obj" ;;
            esac

            if [[ -n "$obj_path" && -f "$obj_path" ]]; then
                full_path="$obj_path"
            else
                log_fail "Asset file not found: $asset_id (tried: ${source_path}, ${alt_path:-N/A})"
                return 1
            fi
        fi
    fi

    # Check non-zero size
    local file_size
    file_size=$(stat -f%z "$full_path" 2>/dev/null || stat -c%s "$full_path" 2>/dev/null || echo "0")
    if [[ "$file_size" -eq 0 ]]; then
        log_fail "Asset file has zero size: $asset_id (${full_path})"
        return 1
    else
        log_pass "Asset file exists with non-zero size: $asset_id (${file_size} bytes)"
    fi

    # Check file format (extension)
    local extension="${full_path##*.}"
    case "$extension" in
        fbx|obj|dae|gltf|glb)
            log_pass "Valid 3D format: $asset_id (.${extension})"
            ;;
        *)
            log_warn "Unexpected format: $asset_id (.${extension})"
            ;;
    esac

    # Basic mesh integrity check (for OBJ files we can count vertices/faces)
    if [[ "$extension" == "obj" ]]; then
        local vertex_count
        local face_count
        vertex_count=$(rg -c "^v " "$full_path" 2>/dev/null || echo "0")
        face_count=$(rg -c "^f " "$full_path" 2>/dev/null || echo "0")

        if [[ "$vertex_count" -gt 0 && "$face_count" -gt 0 ]]; then
            log_pass "Mesh integrity OK: $asset_id (verts=${vertex_count}, faces=${face_count})"
        else
            log_fail "Mesh integrity FAILED: $asset_id (verts=${vertex_count}, faces=${face_count})"
        fi
    elif [[ "$extension" == "fbx" ]]; then
        # For FBX, check minimum file size (a valid FBX should be > 100 bytes)
        if [[ "$file_size" -gt 100 ]]; then
            log_pass "FBX appears valid: $asset_id (${file_size} bytes)"
        else
            log_warn "FBX may be invalid (too small): $asset_id (${file_size} bytes)"
        fi
    elif [[ "$extension" == "dae" ]]; then
        # Check for COLLADA root element
        if rg -q "<COLLADA" "$full_path" 2>/dev/null; then
            log_pass "DAE is valid COLLADA: $asset_id"
        else
            log_fail "DAE missing COLLADA root: $asset_id"
        fi
    fi

    return 0
}

# ─── Material Validation ─────────────────────────────────────────────────────

validate_material() {
    local asset_id="$1"
    local mat_dir="${ASSETS_DIR}/materials/${asset_id}"

    if [[ -d "$mat_dir" ]]; then
        # Find material JSON
        local mat_file
        mat_file=$(find "$mat_dir" -name "M_${asset_id}.json" -type f 2>/dev/null | head -1)

        if [[ -n "$mat_file" && -f "$mat_file" ]]; then
            # Validate JSON is parseable
            if python3 -c "import json; json.load(open('${mat_file}'))" 2>/dev/null; then
                log_pass "Material valid: $asset_id"
            else
                log_fail "Material JSON invalid: $asset_id"
            fi
        else
            log_warn "No material JSON found: $asset_id"
        fi
    else
        log_warn "No material directory: $asset_id"
    fi
}

# ─── Metadata Validation ─────────────────────────────────────────────────────

validate_metadata() {
    local asset_id="$1"
    local meta_dir="${ASSETS_DIR}/metadata/${asset_id}"

    if [[ -d "$meta_dir" ]]; then
        local meta_file="${meta_dir}/${asset_id}_metadata.json"
        if [[ -f "$meta_file" ]]; then
            if python3 -c "import json; json.load(open('${meta_file}'))" 2>/dev/null; then
                # Check required fields
                local has_required=1
                for field in "asset_id" "category" "dimensions_cm" "lod_info" "collision"; do
                    if ! python3 -c "import json; d=json.load(open('${meta_file}')); assert '${field}' in d or '${field}' in d" 2>/dev/null; then
                        has_required=0
                    fi
                done

                if [[ $has_required -eq 1 ]]; then
                    log_pass "Metadata valid: $asset_id"
                else
                    log_warn "Metadata missing some fields: $asset_id"
                fi
            else
                log_fail "Metadata JSON invalid: $asset_id"
            fi
        else
            log_warn "No metadata file: $asset_id"
        fi
    else
        log_warn "No metadata directory: $asset_id"
    fi
}

# ─── LOD Chain Validation ────────────────────────────────────────────────────

validate_lod_chain() {
    local asset_id="$1"
    local meta_dir="${ASSETS_DIR}/metadata/${asset_id}"
    local meta_file="${meta_dir}/${asset_id}_metadata.json"

    if [[ -f "$meta_file" ]]; then
        local lod_count
        lod_count=$(python3 -c "
import json
d = json.load(open('${meta_file}'))
lod = d.get('lod_info', {})
print(lod.get('lod_count', 0))
" 2>/dev/null || echo "0")

        if [[ "$lod_count" -ge 1 ]]; then
            # Verify LOD levels are defined
            local lod_levels_valid
            lod_levels_valid=$(python3 -c "
import json
d = json.load(open('${meta_file}'))
levels = d.get('lod_info', {}).get('lod_levels', [])
print('1' if len(levels) == ${lod_count} else '0')
" 2>/dev/null || echo "0")

            if [[ "$lod_levels_valid" == "1" ]]; then
                log_pass "LOD chain complete: $asset_id (${lod_count} levels)"
            else
                log_warn "LOD chain incomplete: $asset_id (declared ${lod_count}, defined mismatch)"
            fi
        else
            log_warn "No LOD info: $asset_id"
        fi
    fi
}

# ─── Manifest Validation ─────────────────────────────────────────────────────

validate_manifest() {
    log_section "Asset Manifest Validation"

    if [[ ! -f "$MANIFEST_PATH" ]]; then
        log_fail "Manifest not found: ${MANIFEST_PATH}"
        return 1
    fi

    # Parse manifest JSON
    if ! python3 -c "import json; json.load(open('${MANIFEST_PATH}'))" 2>/dev/null; then
        log_fail "Manifest JSON is invalid"
        return 1
    fi

    log_pass "Manifest JSON is valid"

    # Check required top-level sections
    for section in "characters" "weapons" "loot_items" "vfx" "audio" "summary" "import_order"; do
        if python3 -c "import json; d=json.load(open('${MANIFEST_PATH}')); assert '${section}' in d" 2>/dev/null; then
            log_pass "Manifest has section: ${section}"
        else
            log_fail "Manifest missing section: ${section}"
        fi
    done

    # Check summary counts
    local total_in_summary
    total_in_summary=$(python3 -c "
import json
d = json.load(open('${MANIFEST_PATH}'))
print(d.get('summary', {}).get('total_assets', 0))
" 2>/dev/null || echo "0")

    if [[ "$total_in_summary" -ge $MINIMUM_ASSETS ]]; then
        log_pass "Total assets in summary: ${total_in_summary} (>= ${MINIMUM_ASSETS})"
    else
        log_fail "Total assets in summary: ${total_in_summary} (< ${MINIMUM_ASSETS} minimum)"
    fi

    # Check P0 count
    local p0_count
    p0_count=$(python3 -c "
import json
d = json.load(open('${MANIFEST_PATH}'))
print(d.get('summary', {}).get('p0_count', 0))
" 2>/dev/null || echo "0")

    log_info "P0 assets in manifest: ${p0_count}"
}

# ─── P0 Asset Existence Check ────────────────────────────────────────────────

validate_p0_assets() {
    log_section "P0 Asset Existence & Integrity"

    # Extract P0 asset IDs from manifest
    local p0_assets_json
    p0_assets_json=$(python3 -c "
import json
d = json.load(open('${MANIFEST_PATH}'))
p0 = []
for section in ['characters', 'weapons', 'loot_items', 'vfx', 'audio']:
    for item in d.get(section, []):
        if item.get('priority') == 'P0':
            p0.append({
                'id': item['id'],
                'category': item.get('category', section.rstrip('s')),
                'source_path': item.get('source_path', '')
            })
print(json.dumps(p0))
" 2>/dev/null || echo "[]")

    local p0_count
    p0_count=$(python3 -c "import json; print(len(json.loads('${p0_assets_json}')))" 2>/dev/null || echo "0")

    log_info "Found ${p0_count} P0 assets in manifest"

    # Validate each P0 asset
    local i=0
    while [[ $i -lt $p0_count ]]; do
        local asset_id category source_path
        asset_id=$(python3 -c "import json; print(json.loads('${p0_assets_json}')[${i}]['id'])" 2>/dev/null || echo "")
        category=$(python3 -c "import json; print(json.loads('${p0_assets_json}')[${i}]['category'])" 2>/dev/null || echo "")
        source_path=$(python3 -c "import json; print(json.loads('${p0_assets_json}')[${i}]['source_path'])" 2>/dev/null || echo "")

        if [[ -n "$asset_id" ]]; then
            validate_naming_convention "$asset_id" "$category"

            # Skip mesh file validation for non-mesh categories (VFX, audio)
            if [[ "$category" != "vfx" && "$category" != "audio" ]]; then
                validate_asset_file "$asset_id" "$category" "$source_path"
                validate_material "$asset_id"
                validate_metadata "$asset_id"
                validate_lod_chain "$asset_id"
            else
                log_info "Skipping mesh validation for non-mesh category: $asset_id ($category)"
            fi
        fi

        i=$((i + 1))
    done
}

# ─── Asset Count Validation ──────────────────────────────────────────────────

validate_asset_count() {
    log_section "Asset Count Validation"

    # Count actual generated asset directories
    local char_count=0
    local weapon_count=0
    local loot_count=0
    local vfx_count=0

    [[ -d "${ASSETS_DIR}/characters" ]] && char_count=$(find "${ASSETS_DIR}/characters" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
    [[ -d "${ASSETS_DIR}/weapons" ]] && weapon_count=$(find "${ASSETS_DIR}/weapons" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
    [[ -d "${ASSETS_DIR}/loot" ]] && loot_count=$(find "${ASSETS_DIR}/loot" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
    [[ -d "${ASSETS_DIR}/vfx" ]] && vfx_count=$(find "${ASSETS_DIR}/vfx" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)

    local total=$((char_count + weapon_count + loot_count + vfx_count))

    log_info "Characters: ${char_count}"
    log_info "Weapons:   ${weapon_count}"
    log_info "Loot:      ${loot_count}"
    log_info "VFX:       ${vfx_count}"
    log_info "Total:     ${total}"

    # Check minimum requirements
    if [[ $char_count -ge 1 ]]; then
        log_pass "Character count OK: ${char_count} (>= 1)"
    else
        log_fail "Character count insufficient: ${char_count} (< 1)"
    fi

    if [[ $weapon_count -ge 3 ]]; then
        log_pass "Weapon count OK: ${weapon_count} (>= 3)"
    else
        log_fail "Weapon count insufficient: ${weapon_count} (< 3)"
    fi

    if [[ $loot_count -ge 7 ]]; then
        log_pass "Loot item count OK: ${loot_count} (>= 7)"
    else
        log_fail "Loot item count insufficient: ${loot_count} (< 7)"
    fi

    if [[ $total -ge $MINIMUM_ASSETS ]]; then
        log_pass "Total asset count meets minimum: ${total} (>= ${MINIMUM_ASSETS})"
    else
        log_fail "Total asset count below minimum: ${total} (< ${MINIMUM_ASSETS})"
    fi
}

# ─── Main ────────────────────────────────────────────────────────────────────

main() {
    echo "========================================================================"
    echo "  Khaaos Run — Step 4: Asset Validation"
    echo "========================================================================"
    echo "  Manifest: ${MANIFEST_PATH}"
    echo "  Assets:   ${ASSETS_DIR}"
    echo "  Strict:   ${STRICT_MODE}"
    echo ""

    # Run all validation steps
    validate_manifest
    validate_p0_assets
    validate_asset_count

    # ── Summary ──
    echo ""
    echo "========================================================================"
    echo "  VALIDATION SUMMARY"
    echo "========================================================================"
    echo "  Total checks:  ${TOTAL_CHECKS}"
    echo -e "  ${GREEN}Passed:  ${PASS_COUNT}${NC}"
    echo -e "  ${RED}Failed:  ${FAIL_COUNT}${NC}"
    echo -e "  ${YELLOW}Warnings: ${WARN_COUNT}${NC}"
    echo ""

    # Write report file
    mkdir -p "$(dirname "$REPORT_FILE")"
    {
        echo "Khaaos Run — Step 4: Asset Validation Report"
        echo "Generated: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
        echo ""
        echo "Total checks: ${TOTAL_CHECKS}"
        echo "Passed:       ${PASS_COUNT}"
        echo "Failed:       ${FAIL_COUNT}"
        echo "Warnings:     ${WARN_COUNT}"
        echo ""
        if [[ $FAIL_COUNT -eq 0 ]]; then
            echo "RESULT: PASS"
        else
            echo "RESULT: FAIL (${FAIL_COUNT} failures)"
        fi
    } > "$REPORT_FILE"

    log_info "Report written to: ${REPORT_FILE}"

    # Exit code
    if [[ $FAIL_COUNT -gt 0 ]]; then
        echo -e "${RED}VALIDATION FAILED${NC} (${FAIL_COUNT} failures)"
        exit 1
    else
        echo -e "${GREEN}VALIDATION PASSED${NC}"
        exit 0
    fi
}

main
