#!/usr/bin/env python3
"""
Khaaos Run — Niagara VFX Asset Manifest Generator
Generates the 18 species-specific Niagara system asset definitions
for use in the UE5 Content Browser and SpeciesVFXRegistry.

Output: 
  - niagara_vfx_manifest.json — Structured manifest of all 18 VFX assets
  - niagara_vfx_manifest.csv  — Flat CSV for import into data tables

Species VFX (6 species × 3 VFX = 18 total):
  HURAN:  RegenGlow, WaterDash, AmphibianEyes
  KHAEL:  CryoShield, FrostBreath, EnergyResonance
  VENEX:  CyberneticGlow, ShieldPulse, SpeedTrail
  ONITH:  ToxicAura, ScaleShimmer, HissVFX
  ZHEERS: RadGlow, MutationPulse, RadResistAura
  SKEETW: Bioluminescence, FogStealthVFX, AvianTrail
"""

import json
import csv
import os
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import List

# ─── VFX Definitions ──────────────────────────────────────────────────────────

@dataclass
class SpeciesVFX:
    """Single VFX asset definition."""
    species: str
    species_enum: str
    vfx_name: str
    asset_path: str          # UE5 asset path: NiagaraSystem'/Khaaos/VFX/Species/.../NS_...NS_...'
    asset_name: str          # Short asset name: NS_HuranRegenGlow
    auto_destroy: bool
    use_pooling: bool
    color_primary: str       # Primary particle color (hex)
    color_accent: str        # Accent particle color (hex)
    emission_rate: int       # Particles/sec
    lifetime_min: float      # Min particle lifetime (s)
    lifetime_max: float      # Max particle lifetime (s)
    description: str         # Design description
    freefire_equivalent: str # FreeFire visual equivalent

# ─── Species Color Palettes ───────────────────────────────────────────────────
PALETTES = {
    "Huran":  {"primary": "#00FF66", "accent": "#004D1A"},   # Green / swamp
    "Khael":  {"primary": "#00CCFF", "accent": "#003D66"},   # Cyan / frost
    "Venex":  {"primary": "#FF6600", "accent": "#4D1F00"},   # Orange / cyber
    "Onith":  {"primary": "#AA00FF", "accent": "#330066"},   # Purple / toxic
    "Zheers": {"primary": "#FFFF00", "accent": "#4D4D00"},   # Yellow / rad
    "Skeetw": {"primary": "#00FFAA", "accent": "#004D33"},   # Teal / biolum
}

VFX_DEFS: List[SpeciesVFX] = [
    # ── HURAN ──────────────────────────────────────────────────────────────────
    SpeciesVFX("Huran", "HURAN", "RegenGlow",
        "NiagaraSystem'/Khaaos/VFX/Species/Huran/NS_HuranRegenGlow.NS_HuranRegenGlow'",
        "NS_HuranRegenGlow", False, True, PALETTES["Huran"]["primary"], PALETTES["Huran"]["accent"],
        120, 0.5, 2.0,
        "Green HP-regeneration particles emanating from skin surface, pulsing with health tick rate.",
        "A124/Kelly regen aura"),
    SpeciesVFX("Huran", "HURAN", "WaterDash",
        "NiagaraSystem'/Khaaos/VFX/Species/Huran/NS_HuranWaterDash.NS_HuranWaterDash'",
        "NS_HuranWaterDash", True, True, PALETTES["Huran"]["primary"], "#0066CC",
        200, 0.2, 0.8,
        "Water splash and ripple effect on water entry/exit with directional spray.",
        "Water movement splash (Alvaro/Chrono water trail)"),
    SpeciesVFX("Huran", "HURAN", "AmphibianEyes",
        "NiagaraSystem'/Khaaos/VFX/Species/Huran/NS_HuranAmphibianEyes.NS_HuranAmphibianEyes'",
        "NS_HuranAmphibianEyes", False, True, "#CCFF00", PALETTES["Huran"]["primary"],
        60, 1.0, 3.0,
        "Glowing nictating membrane VFX on eyes, subtle ambient glow while in water.",
        "Night vision glow effect (Misha eye glow)"),

    # ── KHAEL ──────────────────────────────────────────────────────────────────
    SpeciesVFX("Khael", "KHAEL", "CryoShield",
        "NiagaraSystem'/Khaaos/VFX/Species/Khael/NS_KhaelCryoShield.NS_KhaelCryoShield'",
        "NS_KhaelCryoShield", False, True, PALETTES["Khael"]["primary"], "#FFFFFF",
        80, 0.8, 2.5,
        "Ice crystal aura orbiting the operative, fractal shard particles in slow rotation.",
        "Chrono time-freeze shield / A124 ice barrier"),
    SpeciesVFX("Khael", "KHAEL", "FrostBreath",
        "NiagaraSystem'/Khaaos/VFX/Species/Khael/NS_KhaelFrostBreath.NS_KhaelFrostBreath'",
        "NS_KhaelFrostBreath", True, True, PALETTES["Khael"]["primary"], PALETTES["Khael"]["accent"],
        150, 0.3, 1.0,
        "Cold breath condensation VFX, white mist expelled from mouth/nose area.",
        "Snowfall breath effect (Wukong cloud trail)"),
    SpeciesVFX("Khael", "KHAEL", "EnergyResonance",
        "NiagaraSystem'/Khaaos/VFX/Species/Khael/NS_KhaelEnergyResonance.NS_KhaelEnergyResonance'",
        "NS_KhaelEnergyResonance", False, True, "#9900FF", PALETTES["Khael"]["primary"],
        40, 1.5, 4.0,
        "Purple energy pulse radiating outward from body, low-frequency resonance wave.",
        "Energy pulse wave (Hayato/Yuto electric aura)"),

    # ── VENEX ──────────────────────────────────────────────────────────────────
    SpeciesVFX("Venex", "VENEX", "CyberneticGlow",
        "NiagaraSystem'/Khaaos/VFX/Species/Venex/NS_VenexCyberneticGlow.NS_VenexCyberneticGlow'",
        "NS_VenexCyberneticGlow", False, True, PALETTES["Venex"]["primary"], "#FF0000",
        100, 0.5, 2.0,
        "Circuit-line glow tracing cybernetic implants, pulsing with energy flow.",
        "Cyberpunk circuit glow (Max/Mecha robot lines)"),
    SpeciesVFX("Venex", "VENEX", "ShieldPulse",
        "NiagaraSystem'/Khaaos/VFX/Species/Venex/NS_VenexShieldPulse.NS_VenexShieldPulse'",
        "NS_VenexShieldPulse", False, True, PALETTES["Venex"]["primary"], "#FFAA00",
        60, 0.8, 2.0,
        "Hexagonal energy shield pulse, expanding and fading around operative.",
        "Shield bubble pulse (Dimitri/Clu shield effect)"),
    SpeciesVFX("Venex", "VENEX", "SpeedTrail",
        "NiagaraSystem'/Khaaos/VFX/Species/Venex/NS_VenexSpeedTrail.NS_VenexSpeedTrail'",
        "NS_VenexSpeedTrail", False, True, PALETTES["Venex"]["primary"], PALETTES["Venex"]["accent"],
        180, 0.1, 0.5,
        "Motion blur speed trail particles, fading streaks behind operative at high speed.",
        "Speed trail effect (J.Biebs/Skyler dash trail)"),

    # ── ONITH ──────────────────────────────────────────────────────────────────
    SpeciesVFX("Onith", "ONITH", "ToxicAura",
        "NiagaraSystem'/Khaaos/VFX/Species/Onith/NS_OnithToxicAura.NS_OnithToxicAura'",
        "NS_OnithToxicAura", False, True, PALETTES["Onith"]["primary"], "#00FF00",
        90, 1.0, 3.0,
        "Toxic gas cloud particles around operative, iridescent purple-green shifting colors.",
        "Poison cloud aura (Jota/Capitão toxin cloud)"),
    SpeciesVFX("Onith", "ONITH", "ScaleShimmer",
        "NiagaraSystem'/Khaaos/VFX/Species/Onith/NS_OnithScaleShimmer.NS_OnithScaleShimmer'",
        "NS_OnithScaleShimmer", False, True, PALETTES["Onith"]["primary"], "#FF00FF",
        50, 0.5, 2.0,
        "Iridescent scale shimmer on skin, rainbow refraction at viewing angles.",
        "Iridescent skin effect (Alok/Thiva shimmer)"),
    SpeciesVFX("Onith", "ONITH", "HissVFX",
        "NiagaraSystem'/Khaaos/VFX/Species/Onith/NS_OnithHissVFX.NS_OnithHissVFX'",
        "NS_OnithHissVFX", True, True, PALETTES["Onith"]["accent"], PALETTES["Onith"]["primary"],
        200, 0.2, 0.6,
        "Toxic gas emission from mouth, directional spray with hissing particle motion.",
        "Gas emission spray (Luqueta poison breath)"),

    # ── ZHEERS ─────────────────────────────────────────────────────────────────
    SpeciesVFX("Zheers", "ZHEERS", "RadGlow",
        "NiagaraSystem'/Khaaos/VFX/Species/Zheers/NS_ZheersRadGlow.NS_ZheersRadGlow'",
        "NS_ZheersRadGlow", False, True, PALETTES["Zheers"]["primary"], "#FF8800",
        80, 0.5, 2.5,
        "Radiation glow on skin, sickly yellow-green with occasional flash bursts.",
        "Rad glow effect (Maro/toxic zone aura)"),
    SpeciesVFX("Zheers", "ZHEERS", "MutationPulse",
        "NiagaraSystem'/Khaaos/VFX/Species/Zheers/NS_ZheersMutationPulse.NS_ZheersMutationPulse'",
        "NS_ZheersMutationPulse", False, True, "#FF4400", PALETTES["Zheers"]["primary"],
        40, 1.0, 3.0,
        "Genetic mutation visual, cells splitting and reforming with DNA helix particles.",
        "Mutation pulse (Xayne/Orion transformation VFX)"),
    SpeciesVFX("Zheers", "ZHEERS", "RadResistAura",
        "NiagaraSystem'/Khaaos/VFX/Species/Zheers/NS_ZheersRadResistAura.NS_ZheersRadResistAura'",
        "NS_ZheersRadResistAura", False, True, PALETTES["Zheers"]["primary"], "#008800",
        60, 0.8, 2.0,
        "Protective radiation resistance shell, translucent green barrier with flicker.",
        "Rad shield aura (K/Director force field)"),

    # ── SKEETW ─────────────────────────────────────────────────────────────────
    SpeciesVFX("Skeetw", "SKEETW", "Bioluminescence",
        "NiagaraSystem'/Khaaos/VFX/Species/Skeetw/NS_SkeetwBioluminescence.NS_SkeetwBioluminescence'",
        "NS_SkeetwBioluminescence", False, True, PALETTES["Skeetw"]["primary"], "#004488",
        70, 0.5, 3.0,
        "Bioluminescent feather glow, teal-green light emanating from plumage.",
        "Bioluminescence (Caroline/Sky glow aura)"),
    SpeciesVFX("Skeetw", "SKEETW", "FogStealthVFX",
        "NiagaraSystem'/Khaaos/VFX/Species/Skeetw/NS_SkeetwFogStealthVFX.NS_SkeetwFogStealthVFX'",
        "NS_SkeetwFogStealthVFX", False, True, "#888888", PALETTES["Skeetw"]["accent"],
        120, 0.3, 1.5,
        "Fog dissolve effect, operative fades into mist with particle scatter.",
        "Stealth cloak effect (Wukong vanish / Clu invisible)"),
    SpeciesVFX("Skeetw", "SKEETW", "AvianTrail",
        "NiagaraSystem'/Khaaos/VFX/Species/Skeetw/NS_SkeetwAvianTrail.NS_SkeetwAvianTrail'",
        "NS_SkeetwAvianTrail", False, True, PALETTES["Skeetw"]["primary"], "#FFFFFF",
        90, 0.2, 0.8,
        "Feather particle trail behind operative during movement, soft downy particles.",
        "Feather trail (Nishima/Sakura petal trail equivalent)"),
]

# ─── Main ──────────────────────────────────────────────────────────────────────

def main():
    output_dir = Path("/home/z/my-project/Khaaos_Run/repo/scripts")
    output_dir.mkdir(parents=True, exist_ok=True)

    # ── JSON Manifest ──
    json_path = output_dir / "niagara_vfx_manifest.json"
    manifest = {
        "version": "1.0.0",
        "project": "Khaaos Run",
        "engine": "UE5.8",
        "description": "18 species-specific Niagara VFX asset definitions",
        "species_count": 6,
        "vfx_per_species": 3,
        "total_vfx": 18,
        "content_base_path": "/Khaaos/VFX/Species/",
        "vfx_assets": [asdict(v) for v in VFX_DEFS]
    }
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    print(f"✓ JSON manifest: {json_path} ({len(VFX_DEFS)} entries)")

    # ── CSV for Data Table import ──
    csv_path = output_dir / "niagara_vfx_manifest.csv"
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=[
            'species', 'species_enum', 'vfx_name', 'asset_path', 'asset_name',
            'auto_destroy', 'use_pooling', 'color_primary', 'color_accent',
            'emission_rate', 'lifetime_min', 'lifetime_max',
            'description', 'freefire_equivalent'
        ])
        writer.writeheader()
        for vfx in VFX_DEFS:
            writer.writerow(asdict(vfx))
    print(f"✓ CSV manifest:  {csv_path} ({len(VFX_DEFS)} rows)")

    # ── Print Summary ──
    print(f"\n{'═'*60}")
    print(f"  Niagara VFX Asset Manifest — {len(VFX_DEFS)} Assets")
    print(f"{'═'*60}\n")

    current_species = ""
    for vfx in VFX_DEFS:
        if vfx.species != current_species:
            current_species = vfx.species
            print(f"  ── {vfx.species.upper()} ──")
        pool = "P" if vfx.use_pooling else "-"
        auto = "A" if vfx.auto_destroy else "-"
        print(f"    {vfx.vfx_name:<20} [{pool}{auto}] {vfx.emission_rate:>4} p/s  {vfx.color_primary} → {vfx.freefire_equivalent}")

    print(f"\n  Total: {len(VFX_DEFS)} VFX across 6 species")
    print(f"  Pooling: {sum(1 for v in VFX_DEFS if v.use_pooling)}/{len(VFX_DEFS)} use pooling")
    print(f"  AutoDestroy: {sum(1 for v in VFX_DEFS if v.auto_destroy)}/{len(VFX_DEFS)} auto-destroy")

if __name__ == "__main__":
    main()
