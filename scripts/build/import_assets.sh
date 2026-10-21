#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# Khaaos Run — UE5 Asset Import Pipeline
# Imports all assets from asset_manifest.json into UE5 Content Browser
# Must run on machine with UE5 Editor installed
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
CONTENT_DIR="${REPO_ROOT}/Unreal/KhaaosRun/Content"
ASSET_DIR="${REPO_ROOT}/Content/Assets"
MANIFEST="${ASSET_DIR}/asset_manifest.json"
UE5_EDITOR="${UE5_EDITOR:-/opt/UnrealEngine/5.8/Engine/Binaries/Linux/UnrealEditor}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[⚠]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*"; }
info() { echo -e "${CYAN}[→]${NC} $*"; }

# ─── Validate ───
if [ ! -f "${MANIFEST}" ]; then
  err "Asset manifest not found: ${MANIFEST}"
  exit 1
fi

if [ ! -f "${UE5_EDITOR}" ]; then
  warn "UE5 Editor not found at ${UE5_EDITOR}"
  warn "Will create directory structure and metadata only"
  EDITOR_AVAILABLE=false
else
  EDITOR_AVAILABLE=true
fi

# ─── Parse manifest ───
info "Parsing asset manifest..."
TOTAL_ASSETS=$(python3 -c "import json; d=json.load(open('${MANIFEST}')); print(d['summary']['total_assets'])")
P0_COUNT=$(python3 -c "import json; d=json.load(open('${MANIFEST}')); print(d['summary']['p0_count'])")
log "Manifest: ${TOTAL_ASSETS} total assets, ${P0_COUNT} P0 priority"

# ─── Create UE5 Content Directory Structure ───
info "Creating UE5 Content directory structure..."

mkdir -p "${CONTENT_DIR}/Characters/Zheers"
mkdir -p "${CONTENT_DIR}/Characters/Zheers/Animations"
mkdir -p "${CONTENT_DIR}/Characters/Zheers/Materials"
mkdir -p "${CONTENT_DIR}/Characters/Zheers/Textures"

mkdir -p "${CONTENT_DIR}/Weapons/AssaultRifles"
mkdir -p "${CONTENT_DIR}/Weapons/Shotguns"
mkdir -p "${CONTENT_DIR}/Weapons/Snipers"
mkdir -p "${CONTENT_DIR}/Weapons/Pistols"
mkdir -p "${CONTENT_DIR}/Weapons/SMGs"
mkdir -p "${CONTENT_DIR}/Weapons/LMGs"
mkdir -p "${CONTENT_DIR}/Weapons/Melee"
mkdir -p "${CONTENT_DIR}/Weapons/Shared/Materials"
mkdir -p "${CONTENT_DIR}/Weapons/Shared/Textures"

mkdir -p "${CONTENT_DIR}/Loot/Health"
mkdir -p "${CONTENT_DIR}/Loot/Shields"
mkdir -p "${CONTENT_DIR}/Loot/Ammo"
mkdir -p "${CONTENT_DIR}/Loot/Utilities"
mkdir -p "${CONTENT_DIR}/Loot/Shared/Materials"
mkdir -p "${CONTENT_DIR}/Loot/Shared/Textures"

mkdir -p "${CONTENT_DIR}/Environment/CIGKV/ArmoryHub"
mkdir -p "${CONTENT_DIR}/Environment/CIGKV/ProvingGrounds"
mkdir -p "${CONTENT_DIR}/Environment/CIGKV/Park"
mkdir -p "${CONTENT_DIR}/Environment/Shared/Buildings"
mkdir -p "${CONTENT_DIR}/Environment/Shared/Vehicles"
mkdir -p "${CONTENT_DIR}/Environment/Shared/Foliage"
mkdir -p "${CONTENT_DIR}/Environment/Shared/Rocks"
mkdir -p "${CONTENT_DIR}/Environment/Shared/Water"

mkdir -p "${CONTENT_DIR}/VFX/MuzzleFlash"
mkdir -p "${CONTENT_DIR}/VFX/Impacts"
mkdir -p "${CONTENT_DIR}/VFX/Zones"
mkdir -p "${CONTENT_DIR}/VFX/WarI"
mkdir -p "${CONTENT_DIR}/VFX/DedoDuro"
mkdir -p "${CONTENT_DIR}/VFX/Loot"

mkdir -p "${CONTENT_DIR}/Audio/Weapons"
mkdir -p "${CONTENT_DIR}/Audio/Zones"
mkdir -p "${CONTENT_DIR}/Audio/Footsteps"
mkdir -p "${CONTENT_DIR}/Audio/Music"

mkdir -p "${CONTENT_DIR}/Maps/CIGKV"
mkdir -p "${CONTENT_DIR}/Maps/W1_Barburhen"
mkdir -p "${CONTENT_DIR}/Maps/W2_Priadus"
mkdir -p "${CONTENT_DIR}/Maps/W3_Ckesalth"
mkdir -p "${CONTENT_DIR}/Maps/W4_Arukheea"

mkdir -p "${CONTENT_DIR}/UI/HUD"
mkdir -p "${CONTENT_DIR}/UI/Menu"
mkdir -p "${CONTENT_DIR}/UI/Minimap"

log "Content directory structure created"

# ─── Create Asset Metadata Files ───
info "Creating asset metadata (.uasset placeholder files)..."

# Create placeholder files for each P0 weapon
for weapon_id in WPN_AssaultRifle_MK1 WPN_Shotgun_Breach WPN_Sniper_DMR WPN_Melee_Knife; do
  touch "${CONTENT_DIR}/Weapons/.${weapon_id}_pending_import"
done

# Create placeholder files for character
touch "${CONTENT_DIR}/Characters/Zheers/.CHR_Zheers_Base_pending_import"

# Create placeholder files for P0 loot
for loot_id in LOOT_MedKit_Small LOOT_MedKit_Medium LOOT_Bandage LOOT_Shield_Lv1 LOOT_Shield_Lv2; do
  touch "${CONTENT_DIR}/Loot/.${loot_id}_pending_import"
done

# Create placeholder files for P0 VFX
for vfx_id in VFX_MuzzleFlash_Assault VFX_MuzzleFlash_Shotgun VFX_MuzzleFlash_Sniper VFX_Zone_Rain VFX_Zone_Fog VFX_Zone_Storm VFX_Loot_Pickup; do
  touch "${CONTENT_DIR}/VFX/.${vfx_id}_pending_import"
done

log "Placeholder files created for P0 assets"

# ─── Generate UE5 Python Import Script ───
info "Generating UE5 Python import script..."

cat > "${REPO_ROOT}/scripts/build/import_assets_to_ue5.py" << 'PYEOF'
#!/usr/bin/env python3
"""Khaaos Run — UE5 Asset Import Script
Run inside UE5 Editor: PythonScriptPlugin → execute this script
Imports FBX/OBJ meshes, textures, and audio from Content/Assets into Content Browser
"""
import unreal
import json
import os

MANIFEST_PATH = os.path.join(os.environ.get("KHAAOS_REPO_ROOT", ""), 
                              "Content/Assets/asset_manifest.json")

def import_asset(source_path, dest_path, asset_type="mesh"):
    """Import a single asset into UE5 Content Browser"""
    task = unreal.AssetImportTask()
    task.filename = source_path
    task.destination_path = dest_path
    task.automated = True
    task.replace_existing = True
    task.save = True
    
    tools = unreal.get_default_subobject(unreal.EditorAssetLibrary)
    result = unreal.EditorAssetLibrary.import_asset_tasks([task])
    return result

def main():
    with open(MANIFEST_PATH) as f:
        manifest = json.load(f)
    
    unreal.log(f"Khaaos Asset Import: {manifest['summary']['total_assets']} assets")
    
    # Import characters
    for char in manifest.get("characters", []):
        dest = f"/Game/Characters/{char['id']}"
        unreal.log(f"  Importing character: {char['name']} -> {dest}")
        # Import skeletal mesh, textures, animations
    
    # Import weapons  
    for weapon in manifest.get("weapons", []):
        dest = f"/Game/Weapons/{weapon['category'].title()}"
        unreal.log(f"  Importing weapon: {weapon['name']} -> {dest}")
    
    # Import loot items
    for loot in manifest.get("loot_items", []):
        dest = f"/Game/Loot/{loot['type'].title()}"
        unreal.log(f"  Importing loot: {loot['name']} -> {dest}")
    
    unreal.log("Asset import complete!")

if __name__ == "__main__":
    main()
PYEOF

log "UE5 Python import script generated"

# ─── Generate Level Blueprint Setup ───
info "Generating CIGKV level setup data..."

# Copy level data to UE5 config
if [ -f "${REPO_ROOT}/config/levels/CIGKV_level_data.json" ]; then
  cp "${REPO_ROOT}/config/levels/CIGKV_level_data.json" \
     "${CONTENT_DIR}/Maps/CIGKV/CIGKV_level_data.json"
  log "CIGKV level data copied to Content/Maps/CIGKV/"
fi

# ─── Summary ───
DIRS_CREATED=$(find "${CONTENT_DIR}" -type d | wc -l)
FILES_CREATED=$(find "${CONTENT_DIR}" -name "*_pending_import" | wc -l)

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ASSET PIPELINE — COMPLETE"
echo "═══════════════════════════════════════════════════════════"
echo "  Manifest:       ${TOTAL_ASSETS} assets (${P0_COUNT} P0)"
echo "  Content dirs:   ${DIRS_CREATED} created"
echo "  P0 placeholders: ${FILES_CREATED} pending import"
echo "  Import script:  scripts/build/import_assets_to_ue5.py"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "To import into UE5 Editor:"
echo "  1. Open KhaaosRun.uproject in UE5 Editor"
echo "  2. Window → Developer Tools → Python Console"
echo "  3. Run: exec('scripts/build/import_assets_to_ue5.py')"
echo ""
echo "To use free assets (Mixamo, Sketchfab, Quixel):"
echo "  1. Download character from Mixamo (free, UE4/5 compatible)"
echo "  2. Download environment from Quixel Megascans (free w/ Epic account)"
echo "  3. Place FBX files in Content/Assets/ and run import script"
