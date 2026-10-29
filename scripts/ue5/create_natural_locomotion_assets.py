#!/usr/bin/env python3
"""
Khaaos Run — Natural Locomotion asset wiring (UE5.8 Editor Python).
Copyright Nexus-HUB57 · Devs Ph.D

Executa DENTRO do UE5.8 Editor (host licenciado):
  1. Via UI:    File → Execute Python Script → este arquivo
  2. Via cmdline: UnrealEditor-Cmd.exe <proj.uproject> -run=pythonscript -script=<caminho>/create_natural_locomotion_assets.py

O que faz (contrato da seção 4 de docs/NATURAL_LOCOMOTION.md):
  - Cria Blend Spaces 2D com eixos EXATAMENTE `SmoothedSpeed` x `SmoothedDirection`
    (os AnimBPs consomem o kernel por esses nomes — nunca Speed/Direction crus).
  - Cria Aim Offset `AO_NaturalLean` com eixos `LeanRoll` x `LeanPitch`
    (faixa por espécie conforme a tabela de perfis da doc §3).
  - Idempotente: assets existentes são pulados (reexecução segura).
  - Nunca inventa skeleton: só cria assets para skeletons encontrados
    em /Game/Characters (ou o passado via --skeleton). Sem skeleton,
    Sai com instruções claras — nada é fabricado.
  - Escreve relatório JSON em <projeto>/Saved/NaturalLocomotionWiring_report.json
    com a checklist dos nós do AnimGraph que continuam manuais (UI/MCP),
    pois o Python do Editor não expõe criação de nós do AnimGraph.

Uso:
  import create_natural_locomotion_assets as nla; nla.main()
  # ou, para dry-run:
  nla.main(dry_run=True)
"""

import json
import os
import sys

import unreal

CONTENT_CHARACTERS = "/Game/Characters"
REPORT_NAME = "NaturalLocomotionWiring_report.json"

# Contrato de parâmetros (docs/NATURAL_LOCOMOTION.md §4) — NÃO renomear:
AX_SPEED = "SmoothedSpeed"
AX_DIRECTION = "SmoothedDirection"
AX_ROLL = "LeanRoll"
AX_PITCH = "LeanPitch"

# Velocidades de referência do CMC (KhaaosCharacter.cpp):
#   Walk = 600 * BaseSpeed · Sprint = 900 * BaseSpeed  →  teto com folga:
SPEED_MIN = 0.0
SPEED_MAX = 1000.0
SPEED_GRID = 10          # snaps de 10 cm/s — blends suaves sem custo
DIRECTION_MIN = -180.0
DIRECTION_MAX = 180.0
DIRECTION_GRID = 15

# Lean máximo por espécie (doc §3, perfis ApplySpeciesProfile) —
# aim offset ganha ~+2° de headroom para o overshoot de spring (ζ=0.85).
SPECIES_LEAN_ROLL_MAX = {
    "Zheers": 7.0,
    "Onith": 13.0,
    "Skeetw": 5.0,
    "Huran": 10.0,
    "Venex": 14.0,
    "Khael": 6.0,
}
PITCH_MAX_DEFAULT = 7.0  # LeanPitchMaxDeg do kernel (KhaaosLocomotionCore.h)

BLEND_SPACE_DIR = "Animations"
BS_NAME = "BS_NaturalLocomotion"        # por espécie
AO_NAME = "AO_NaturalLean"              # por espécie


# ─── util ─────────────────────────────────────────────────────────────────────

def _log(msg, warning=False):
    (unreal.log_warning if warning else unreal.log_display)(
        "[NaturalLocomotionWiring] {}".format(msg))


def safe_set(obj, prop, value, ctx):
    """set_editor_property tolerante a drift de API entre versões."""
    try:
        obj.set_editor_property(prop, value)
        return True
    except Exception as exc:  # noqa: BLE001 — relatório honesto por propriedade
        _log("{}: falha ao set '{}': {}".format(ctx, prop, exc), warning=True)
        return False


def _blend_param(display_name, vmin, vmax, grid, wrap=False):
    bp = unreal.BlendParameter()
    safe_set(bp, "display_name", display_name, "BlendParameter")
    safe_set(bp, "min", float(vmin), "BlendParameter")
    safe_set(bp, "max", float(vmax), "BlendParameter")
    safe_set(bp, "grid_num", int(grid), "BlendParameter")
    safe_set(bp, "snap_to_grid", True, "BlendParameter")
    if wrap:
        safe_set(bp, "wrap_input", True, "BlendParameter")
    return bp


def _asset_tools():
    return unreal.AssetToolsHelpers.get_asset_tools()


def _find_skeletons(explicit=None):
    """Skeletons reais em /Game/Characters (ou o passado explicitamente)."""
    if explicit:
        if unreal.EditorAssetLibrary.does_asset_exist(explicit):
            return [("Custom", unreal.EditorAssetLibrary.load_asset(explicit))]
        _log("Skeleton explícito não encontrado: {}".format(explicit), warning=True)
        return []

    found = []
    eal = unreal.EditorAssetLibrary
    asset_ar = unreal.AssetRegistryHelpers.get_asset_registry()
    # varredura por classe via Asset Registry (barata e sem load desnecessário)
    assets = asset_ar.get_assets_by_class(
        unreal.TopLevelAssetPath("/Script/Engine", "Skeleton"), True)
    for ad in assets:
        pkg = str(ad.package_name)
        if pkg.startswith(CONTENT_CHARACTERS):
            skel = eal.load_asset(pkg)
            if skel is not None:
                # espécie = primeiro nível sob /Game/Characters
                parts = pkg[len(CONTENT_CHARACTERS):].strip("/").split("/")
                species = parts[0] if parts else "Unknown"
                found.append((species, skel))
    return found


# ─── criação de assets ────────────────────────────────────────────────────────

def create_blend_space(species, skeleton, pkg_dir, dry_run, report):
    """BS_NaturalLocomotion — eixos SmoothedSpeed x SmoothedDirection."""
    path = "{}/{}".format(pkg_dir, BS_NAME)
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        _log("já existe, pulando: {}".format(path))
        report["skipped"].append(path)
        return True
    if dry_run:
        report["would_create"].append(path)
        return True

    factory = unreal.BlendSpaceFactoryNew()
    if not safe_set(factory, "target_skeleton", skeleton, "BlendSpaceFactory"):
        report["errors"].append("{}: skeleton não aplicado à factory".format(path))
        return False
    bs = _asset_tools().create_asset(
        BS_NAME, pkg_dir, unreal.BlendSpace, factory)
    if bs is None:
        report["errors"].append("{}: create_asset falhou".format(path))
        return False

    ok_x = safe_set(bs, "blend_param_0",
                    _blend_param(AX_SPEED, SPEED_MIN, SPEED_MAX, SPEED_GRID),
                    path)
    ok_y = safe_set(bs, "blend_param_1",
                    _blend_param(AX_DIRECTION, DIRECTION_MIN, DIRECTION_MAX,
                                 DIRECTION_GRID, wrap=True),
                    path)
    if not (ok_x and ok_y):
        report["errors"].append("{}: eixos do contrato não aplicados".format(path))
        return False

    unreal.EditorAssetLibrary.save_asset(path)
    _log("criado: {} (eixos {}×{})".format(path, AX_SPEED, AX_DIRECTION))
    report["created"].append(path)
    return True


def create_aim_offset(species, skeleton, pkg_dir, dry_run, report):
    """AO_NaturalLean — eixos LeanRoll x LeanPitch com headroom de spring."""
    roll_max = SPECIES_LEAN_ROLL_MAX.get(species, 10.0) + 2.0
    path = "{}/{}".format(pkg_dir, AO_NAME)
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        _log("já existe, pulando: {}".format(path))
        report["skipped"].append(path)
        return True
    if dry_run:
        report["would_create"].append(path)
        return True

    # AimOffset 2D; fallback 1D se a factory 2D não existir nesta build
    factory = None
    asset_cls = None
    if hasattr(unreal, "AimOffsetBlendSpaceFactoryNew"):
        factory = unreal.AimOffsetBlendSpaceFactoryNew()
        asset_cls = unreal.AimOffsetBlendSpace
    elif hasattr(unreal, "AimOffsetBlendSpace1DFactoryNew"):
        factory = unreal.AimOffsetBlendSpace1DFactoryNew()
        asset_cls = unreal.AimOffsetBlendSpace1D
    if factory is None:
        report["errors"].append("{}: nenhuma factory de AimOffset disponível".format(path))
        return False
    if not safe_set(factory, "target_skeleton", skeleton, "AimOffsetFactory"):
        report["errors"].append("{}: skeleton não aplicado à factory".format(path))
        return False

    ao = _asset_tools().create_asset(AO_NAME, pkg_dir, asset_cls, factory)
    if ao is None:
        report["errors"].append("{}: create_asset falhou".format(path))
        return False

    ok_r = safe_set(ao, "blend_param_0",
                    _blend_param(AX_ROLL, -roll_max, roll_max, 9), path)
    ok_p = safe_set(ao, "blend_param_1",
                    _blend_param(AX_PITCH, -(PITCH_MAX_DEFAULT + 2.0),
                                 PITCH_MAX_DEFAULT + 2.0, 7), path)
    if not (ok_r and ok_p):
        report["errors"].append("{}: eixos de lean não aplicados".format(path))
        return False

    unreal.EditorAssetLibrary.save_asset(path)
    _log("criado: {} (LeanRoll ±{}° × LeanPitch ±{}°)".format(
        path, roll_max, PITCH_MAX_DEFAULT + 2.0))
    report["created"].append(path)
    return True


# ─── main ─────────────────────────────────────────────────────────────────────

MANUAL_NODES_CHECKLIST = [
    "AnimGraph: substituir amostragem por Speed/Direction crus → "
    "Blend Space BS_NaturalLocomotion alimentado por SmoothedSpeed/SmoothedDirection",
    "AnimGraph: Layered Blend Per Bone (spine_01) aditivo com AO_NaturalLean "
    "amostrado por LeanRoll/LeanPitch",
    "AnimGraph: transições start/stop gated por StopEase (distance matching)",
    "AnimGraph: LandRecovery → blend de aterrissagem (aprox -1..1)",
    "AnimGraph: bNaturalTurningInPlace + TurnYawOffset → node de turn-in-place",
    "AnimGraph: HeadLookYaw/HeadLookPitch → look-at da cabeça (clamp 75°/40° já no kernel)",
    "AnimGraph: IdleBreath → layer aditiva de respiração (chest/spine)",
    "AnimGraph: FootIKOffsetL/R + FootIKTiltL/R → TwoBoneIK por pé (foot_l/foot_r)",
    "Notifies: sincronizar eventos de passo via StridePhase (OnFootstepPhase já emite áudio/VFX)",
]


def main(dry_run=False, explicit_skeleton=None):
    report = {"created": [], "skipped": [], "would_create": [], "errors": [],
              "dry_run": bool(dry_run), "manual_nodes_checklist": MANUAL_NODES_CHECKLIST}

    _log("iniciando wiring de Natural Locomotion (dry_run={})".format(dry_run))
    skeletons = _find_skeletons(explicit_skeleton)
    if not skeletons:
        _log("Nenhum skeleton em /Game/Characters{}. Importe as malhas/skeletons "
             "das espécies primeiro (ou passe --skeleton). Nada foi criado."
             .format(" (explicito: {})".format(explicit_skeleton) if explicit_skeleton else ""),
             warning=True)
        report["errors"].append("nenhum skeleton disponível — nada criado")

    for species, skel in skeletons:
        _log("espécie '{}' → skeleton {}".format(species, skel.get_name()))
        pkg_dir = "{}/{}/{}".format(CONTENT_CHARACTERS, species, BLEND_SPACE_DIR)
        if not dry_run and not unreal.EditorAssetLibrary.does_directory_exist(pkg_dir):
            unreal.EditorAssetLibrary.make_directory(pkg_dir)
        create_blend_space(species, skel, pkg_dir, dry_run, report)
        create_aim_offset(species, skel, pkg_dir, dry_run, report)

    report_path = os.path.join(unreal.Paths.project_saved_dir(), REPORT_NAME)
    with open(report_path, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, ensure_ascii=False)
    _log("relatório: {}".format(report_path))
    _log("criados={} pulados={} erros={}".format(
        len(report["created"]), len(report["skipped"]), len(report["errors"])))
    if report["errors"]:
        for err in report["errors"]:
            _log("ERRO: {}".format(err), warning=True)
        unreal.log_error("[NaturalLocomotionWiring] concluído COM erros — veja o relatório")
        return 1
    _log("wiring de assets OK. Checklist de nós do AnimGraph no relatório JSON "
         "(criação de nós do AnimGraph não é exposta ao Python do Editor — "
         "execute na UI ou via unreal-mcp no host licenciado).")
    return 0


def run_from_cli(argv=None):
    argv = argv if argv is not None else sys.argv[1:]
    dry = "--dry-run" in argv
    skel = None
    if "--skeleton" in argv:
        skel = argv[argv.index("--skeleton") + 1]
    sys.exit(main(dry_run=dry, explicit_skeleton=skel))


if __name__ == "__main__":
    run_from_cli()
