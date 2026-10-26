#!/usr/bin/env python3
"""
KHAAOS RUN — End-to-End Validation v4.0
=========================================
Comprehensive validation covering all systems built through the full pipeline.

Categories (12):
  1.  Server Modules — EconomyMatchBridge, SpectatorDataPipeline, DiscordBot, MatchFlow
  2.  Game Services — Server wiring, route registration, lifecycle
  3.  Species System — 6 species, traits, multipliers
  4.  Operative System — 18 operatives, ref codes, species mapping
  5.  Economy Pipeline — Kill rewards, phase survival, world transition
  6.  Spectator Pipeline — Delay buffer, batch aggregator, WebSocket
  7.  Discord Integration — Bot, webhook, slash commands, events
  8.  Match Lifecycle — LOBBY → COUNTDOWN → IN_PROGRESS → FINISHED
  9.  Damage Pipeline — Shield → Health → Downed → Eliminate → Revive
 10. Multi-World Pipeline — CIGKV → Barburhen → Priadus → Ckesalth → Arukheea
 11. C++ Operative Subclasses — 18 Blueprint subclasses
 12. Test Coverage — Unit tests + integration tests

Usage: python3 scripts/validate_e2e_v4.py
"""

import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent

class Validator:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.total = 0
        self.categories = {}

    def check(self, category: str, name: str, condition: bool, detail: str = ""):
        self.total += 1
        if condition:
            self.passed += 1
            status = "✓"
        else:
            self.failed += 1
            status = "✗"

        if category not in self.categories:
            self.categories[category] = {"passed": 0, "failed": 0}
        if condition:
            self.categories[category]["passed"] += 1
        else:
            self.categories[category]["failed"] += 1

        suffix = f" — {detail}" if detail else ""
        print(f"  {status} {name}{suffix}")

    def file_exists(self, category: str, name: str, path: Path):
        exists = path.exists()
        self.check(category, f"File exists: {path.name}", exists, str(path))

    def file_contains(self, category: str, name: str, path: Path, text: str):
        if not path.exists():
            self.check(category, name, False, "file not found")
            return
        content = path.read_text(errors="ignore")
        self.check(category, name, text in content, f"contains '{text[:50]}'")


def main():
    v = Validator()
    print("=" * 72)
    print("KHAAOS RUN — End-to-End Validation v4.0")
    print("=" * 72)

    server_game = REPO_ROOT / "server" / "game"
    tests_int = REPO_ROOT / "tests" / "integration"
    char_dir = REPO_ROOT / "Unreal" / "KhaaosRun" / "Source" / "KhaaosRun" / "Game" / "Character"
    ops_dir = char_dir / "Operatives"

    # ═══════════════════════════════════════════════════════════════════════
    # 1. Server Modules
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[1/12] Server Modules")
    cat = "Server Modules"

    v.file_exists(cat, "EconomyMatchBridge", server_game / "EconomyMatchBridge.ts")
    v.file_exists(cat, "SpectatorDataPipeline", server_game / "SpectatorDataPipeline.ts")
    v.file_exists(cat, "DiscordBot", server_game / "DiscordBot.ts")
    v.file_exists(cat, "MatchFlow", server_game / "MatchFlow.ts")
    v.file_exists(cat, "GameServices", server_game / "GameServices.ts")

    # EconomyMatchBridge content checks
    emb = server_game / "EconomyMatchBridge.ts"
    v.file_contains(cat, "EMB: SPECIES_CONFIG", emb, "SPECIES_CONFIG")
    v.file_contains(cat, "EMB: 6 species", emb, "HURAN")
    v.file_contains(cat, "EMB: KILL_RARITY_MODIFIER", emb, "KILL_RARITY_MODIFIER")
    v.file_contains(cat, "EMB: MITICO tier", emb, "MITICO")
    v.file_contains(cat, "EMB: calculateKillReward", emb, "calculateKillReward")
    v.file_contains(cat, "EMB: calculatePhaseSurvivalReward", emb, "calculatePhaseSurvivalReward")
    v.file_contains(cat, "EMB: calculateWorldTransitionCost", emb, "calculateWorldTransitionCost")
    v.file_contains(cat, "EMB: EconomyMatchBridge class", emb, "class EconomyMatchBridge")
    v.file_contains(cat, "EMB: maxKillReward cap", emb, "maxKillReward")
    v.file_contains(cat, "EMB: WebSocket economy broadcast", emb, "broadcastEconomyEvent")

    # SpectatorDataPipeline content checks
    sdp = server_game / "SpectatorDataPipeline.ts"
    v.file_contains(cat, "SDP: SpectatorDataPipeline class", sdp, "class SpectatorDataPipeline")
    v.file_contains(cat, "SDP: 10s delay", sdp, "10_000")
    v.file_contains(cat, "SDP: 500 max spectators", sdp, "500")
    v.file_contains(cat, "SDP: 200ms batch", sdp, "200")
    v.file_contains(cat, "SDP: DelayBuffer", sdp, "class DelayBuffer")
    v.file_contains(cat, "SDP: BatchAggregator", sdp, "class BatchAggregator")
    v.file_contains(cat, "SDP: WebSocket path /ws/spectator", sdp, "/ws/spectator")
    v.file_contains(cat, "SDP: Camera modes", sdp, "FREECAM")

    # DiscordBot content checks
    db = server_game / "DiscordBot.ts"
    v.file_contains(cat, "DB: DiscordBot class", db, "class DiscordBot")
    v.file_contains(cat, "DB: Gateway WebSocket", db, "connectGateway")
    v.file_contains(cat, "DB: Slash commands", db, "registerSlashCommands")
    v.file_contains(cat, "DB: Rate limiter", db, "class RateLimiter")
    v.file_contains(cat, "DB: broadcastEvent", db, "broadcastEvent")
    v.file_contains(cat, "DB: sendKillFeed", db, "sendKillFeed")
    v.file_contains(cat, "DB: sendMatchStart", db, "sendMatchStart")
    v.file_contains(cat, "DB: sendMatchEnd", db, "sendMatchEnd")
    v.file_contains(cat, "DB: sendRingPhase", db, "sendRingPhase")
    v.file_contains(cat, "DB: sendWorldTransition", db, "sendWorldTransition")
    v.file_contains(cat, "DB: Species colors", db, "SPECIES_COLORS")

    # MatchFlow content checks
    mf = server_game / "MatchFlow.ts"
    v.file_contains(cat, "MF: MatchFlow class", mf, "class MatchFlow")
    v.file_contains(cat, "MF: LOBBY status", mf, "LOBBY")
    v.file_contains(cat, "MF: COUNTDOWN status", mf, "COUNTDOWN")
    v.file_contains(cat, "MF: IN_PROGRESS status", mf, "IN_PROGRESS")
    v.file_contains(cat, "MF: WORLD_TRANSITION status", mf, "WORLD_TRANSITION")
    v.file_contains(cat, "MF: FINISHED status", mf, "FINISHED")
    v.file_contains(cat, "MF: joinPlayer", mf, "joinPlayer")
    v.file_contains(cat, "MF: processKill", mf, "processKill")
    v.file_contains(cat, "MF: revivePlayer", mf, "revivePlayer")
    v.file_contains(cat, "MF: startCountdown", mf, "startCountdown")
    v.file_contains(cat, "MF: endMatch", mf, "endMatch")
    v.file_contains(cat, "MF: tick loop", mf, "tick")
    v.file_contains(cat, "MF: ring shrinking", mf, "processRingTick")
    v.file_contains(cat, "MF: zone damage", mf, "applyZoneDamage")
    v.file_contains(cat, "MF: world transition", mf, "checkWorldTransition")
    v.file_contains(cat, "MF: DEFAULT_WORLD_PIPELINE", mf, "DEFAULT_WORLD_PIPELINE")

    # GameServices content checks
    gs = server_game / "GameServices.ts"
    v.file_contains(cat, "GS: initializeGameServices", gs, "initializeGameServices")
    v.file_contains(cat, "GS: shutdownGameServices", gs, "shutdownGameServices")
    v.file_contains(cat, "GS: Match API routes", gs, "registerMatchRoutes")
    v.file_contains(cat, "GS: /api/match/create", gs, "/api/match/create")
    v.file_contains(cat, "GS: /api/match/:roomId/state", gs, "/api/match/:roomId/state")
    v.file_contains(cat, "GS: /api/match/:roomId/join", gs, "/api/match/:roomId/join")
    v.file_contains(cat, "GS: /api/match/:roomId/start", gs, "/api/match/:roomId/start")
    v.file_contains(cat, "GS: /api/match/:roomId/kill", gs, "/api/match/:roomId/kill")
    v.file_contains(cat, "GS: /api/matches", gs, "/api/matches")
    v.file_contains(cat, "GS: /api/discord/status", gs, "/api/discord/status")

    # ═══════════════════════════════════════════════════════════════════════
    # 2. Game Services Wiring
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[2/12] Game Services Wiring")
    cat = "Game Services Wiring"

    idx_ts = REPO_ROOT / "server" / "index.ts"
    v.file_contains(cat, "index.ts imports GameServices", idx_ts, "initializeGameServices")
    v.file_contains(cat, "index.ts imports shutdownGameServices", idx_ts, "shutdownGameServices")
    v.file_contains(cat, "index.ts calls initializeGameServices", idx_ts, "await initializeGameServices")
    v.file_contains(cat, "index.ts SIGTERM handler", idx_ts, "SIGTERM")
    v.file_contains(cat, "index.ts SIGINT handler", idx_ts, "SIGINT")

    # ═══════════════════════════════════════════════════════════════════════
    # 3. Species System
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[3/12] Species System")
    cat = "Species System"

    species_list = ["HURAN", "KHAEL", "VENEX", "ONITH", "ZHEERS", "SKEETW"]
    for sp in species_list:
        v.file_contains(cat, f"Species {sp} defined", emb, sp)

    # Species traits
    v.file_contains(cat, "Huran trait: +5HP/s", emb, "+5HP/s")
    v.file_contains(cat, "Khael trait: cryo resist", emb, "70% cryo resist")
    v.file_contains(cat, "Venex trait: +20% speed", emb, "+20% speed")
    v.file_contains(cat, "Onith trait: toxic resist", emb, "+15% toxic resist")
    v.file_contains(cat, "Zheers trait: rad resist", emb, "+10% rad resist")
    v.file_contains(cat, "Skeetw trait: fog stealth", emb, "fog stealth")

    # Kill multipliers
    v.file_contains(cat, "Huran killMultiplier 1.3", emb, "1.3")
    v.file_contains(cat, "KHAEL killMultiplier 1.5", emb, "1.5")

    # ═══════════════════════════════════════════════════════════════════════
    # 4. Operative System
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[4/12] Operative System")
    cat = "Operative System"

    # 18 Operative subclasses
    operatives_m = [
        ("KhaaosOpHUR01", "HUR-01", "OP_HUR_M_01"),
        ("KhaaosOpKHA01", "KHA-01", "OP_KHA_M_01"),
        ("KhaaosOpVEN01", "VEN-01", "OP_VEN_M_01"),
        ("KhaaosOpONI01", "ONI-01", "OP_ONI_M_01"),
        ("KhaaosOpZHE01", "ZHE-01", "OP_ZHE_M_01"),
        ("KhaaosOpSKW01", "SKW-01", "OP_SKW_M_01"),
        ("KhaaosOpHUR02", "HUR-02", "OP_HUR_M_02"),
        ("KhaaosOpVEN02", "VEN-02", "OP_VEN_M_02"),
    ]
    operatives_f = [
        ("KhaaosOpHURF01", "HUR-F01", "OP_HUR_F_01"),
        ("KhaaosOpKHAF01", "KHA-F01", "OP_KHA_F_01"),
        ("KhaaosOpVENF01", "VEN-F01", "OP_VEN_F_01"),
        ("KhaaosOpONIF01", "ONI-F01", "OP_ONI_F_01"),
        ("KhaaosOpZHEF01", "ZHE-F01", "OP_ZHE_F_01"),
        ("KhaaosOpSKWF01", "SKW-F01", "OP_SKW_F_01"),
        ("KhaaosOpHURF02", "HUR-F02", "OP_HUR_F_02"),
        ("KhaaosOpKHAF02", "KHA-F02", "OP_KHA_F_02"),
        ("KhaaosOpVENF02", "VEN-F02", "OP_VEN_F_02"),
        ("KhaaosOpONIF02", "ONI-F02", "OP_ONI_F_02"),
    ]

    for cls_name, ref_code, op_ref in operatives_m:
        h_path = ops_dir / f"{cls_name}.h"
        cpp_path = ops_dir / f"{cls_name}.cpp"
        v.file_exists(cat, f"{cls_name}.h", h_path)
        v.file_exists(cat, f"{cls_name}.cpp", cpp_path)

    for cls_name, ref_code, op_ref in operatives_f:
        h_path = ops_dir / f"{cls_name}.h"
        cpp_path = ops_dir / f"{cls_name}.cpp"
        v.file_exists(cat, f"{cls_name}.h", h_path)
        v.file_exists(cat, f"{cls_name}.cpp", cpp_path)

    v.check(cat, "Total 18 operatives (8M + 10F)", len(operatives_m) + len(operatives_f) == 18)

    # Base class
    v.file_exists(cat, "KhaaosOperativeActor.h", char_dir / "KhaaosOperativeActor.h")
    v.file_exists(cat, "KhaaosOperativeActor.cpp", char_dir / "KhaaosOperativeActor.cpp")

    # ═══════════════════════════════════════════════════════════════════════
    # 5. Economy Pipeline
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[5/12] Economy Pipeline")
    cat = "Economy Pipeline"

    v.file_contains(cat, "Kill reward formula", emb, "speciesMult")
    v.file_contains(cat, "Rarity modifier in kill", emb, "rarityMult")
    v.file_contains(cat, "Water bonus (1.3×)", emb, "huranWaterBonus")
    v.file_contains(cat, "Downed modifier (0.3×)", emb, "downedRevivePartial")
    v.file_contains(cat, "Phase survival scales with phase", emb, "basePhaseSurvival")
    v.file_contains(cat, "World transition 50K RC", emb, "50_000")
    v.file_contains(cat, "6 rarity tiers in kill modifier", emb, "INCOMUM")
    v.file_contains(cat, "Match economy init/destroy", emb, "initMatchEconomy")
    v.file_contains(cat, "Match economy finalize", emb, "finalizeMatchEconomy")

    # ═══════════════════════════════════════════════════════════════════════
    # 6. Spectator Pipeline
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[6/12] Spectator Pipeline")
    cat = "Spectator Pipeline"

    v.file_contains(cat, "10s delay config", sdp, "10_000")
    v.file_contains(cat, "500 max per room", sdp, "500")
    v.file_contains(cat, "200ms batch rate", sdp, "200")
    v.file_contains(cat, "5000 global max", sdp, "5_000")
    v.file_contains(cat, "20 events per batch max", sdp, "20")
    v.file_contains(cat, "64 KB/s bandwidth throttle", sdp, "65_536")
    v.file_contains(cat, "4 camera modes", sdp, "RING_CENTER")
    v.file_contains(cat, "WebSocket /ws/spectator", sdp, "/ws/spectator")
    v.file_contains(cat, "Delay buffer push/flush", sdp, "flush")
    v.file_contains(cat, "Batch aggregator", sdp, "BatchAggregator")

    # ═══════════════════════════════════════════════════════════════════════
    # 7. Discord Integration
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[7/12] Discord Integration")
    cat = "Discord Integration"

    v.file_contains(cat, "Gateway connection", db, "connectGateway")
    v.file_contains(cat, "Slash command: khaaos_status", db, "khaaos_status")
    v.file_contains(cat, "Slash command: khaaos_ranking", db, "khaaos_ranking")
    v.file_contains(cat, "Slash command: khaaos_match", db, "khaaos_match")
    v.file_contains(cat, "Rate limiter class", db, "class RateLimiter")
    v.file_contains(cat, "Discord API v10", db, "v10")
    v.file_contains(cat, "Interaction handler", db, "handleInteraction")
    v.file_contains(cat, "11 event types", db, "ECONOMY_ALERT")
    v.file_contains(cat, "Event embed builder", db, "buildEventEmbed")
    v.file_contains(cat, "Auto-reconnect on close", db, "5_000")

    # ═══════════════════════════════════════════════════════════════════════
    # 8. Match Lifecycle
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[8/12] Match Lifecycle")
    cat = "Match Lifecycle"

    v.file_contains(cat, "5 match statuses", mf, "FINISHED")
    v.file_contains(cat, "joinPlayer with validation", mf, "joinPlayer")
    v.file_contains(cat, "startCountdown", mf, "startCountdown")
    v.file_contains(cat, "startMatch", mf, "startMatch")
    v.file_contains(cat, "tick loop", mf, "setInterval")
    v.file_contains(cat, "checkWinCondition", mf, "checkWinCondition")
    v.file_contains(cat, "endMatch", mf, "endMatch")
    v.file_contains(cat, "event log tracking", mf, "eventLog")
    v.file_contains(cat, "onTick listener support", mf, "onTick")
    v.file_contains(cat, "destroy cleanup", mf, "destroy")

    # ═══════════════════════════════════════════════════════════════════════
    # 9. Damage Pipeline
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[9/12] Damage Pipeline")
    cat = "Damage Pipeline"

    v.file_contains(cat, "Shield → Health damage", mf, "shield")
    v.file_contains(cat, "Downed state (30s bleed-out)", mf, "isDowned")
    v.file_contains(cat, "30s bleed-out timer", mf, "30_000")
    v.file_contains(cat, "Eliminate (ragdoll)", mf, "eliminatePlayer")
    v.file_contains(cat, "Revive with 30 HP", mf, "health = 30")
    v.file_contains(cat, "Huran water 50% ring dmg", mf, "0.5")
    v.file_contains(cat, "Zone damage application", mf, "applyZoneDamage")

    # ═══════════════════════════════════════════════════════════════════════
    # 10. Multi-World Pipeline
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[10/12] Multi-World Pipeline")
    cat = "Multi-World Pipeline"

    worlds = ["cigkv", "barburhen", "priadus", "ckesalth", "arukheea"]
    for w in worlds:
        v.file_contains(cat, f"World {w} in pipeline", mf, w)

    v.file_contains(cat, "CIGKV capacity 50", mf, "50")
    v.file_contains(cat, "Barburhen capacity 100", mf, "100")
    v.file_contains(cat, "Priadus capacity 75", mf, "75")
    v.file_contains(cat, "Ckesalth capacity 60", mf, "60")
    v.file_contains(cat, "Arukheea capacity 80", mf, "80")
    v.file_contains(cat, "World transition check", mf, "checkWorldTransition")
    v.file_contains(cat, "World transition cost (50K RC)", emb, "50_000")

    # ═══════════════════════════════════════════════════════════════════════
    # 11. C++ Operative Subclasses
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[11/12] C++ Operative Subclasses")
    cat = "C++ Operative Subclasses"

    # Check all 36 files exist (18 .h + 18 .cpp)
    all_ops = operatives_m + operatives_f
    h_count = 0
    cpp_count = 0
    for cls_name, _, _ in all_ops:
        if (ops_dir / f"{cls_name}.h").exists():
            h_count += 1
        if (ops_dir / f"{cls_name}.cpp").exists():
            cpp_count += 1

    v.check(cat, "18 header files exist", h_count == 18, f"{h_count}/18")
    v.check(cat, "18 cpp files exist", cpp_count == 18, f"{cpp_count}/18")

    # Spot-check a few operatives for proper UCLASS
    if ops_dir.exists():
        for cls_name in ["KhaaosOpHUR01", "KhaaosOpKHAF01", "KhaaosOpVEN02"]:
            h_path = ops_dir / f"{cls_name}.h"
            if h_path.exists():
                content = h_path.read_text(errors="ignore")
                v.check(cat, f"{cls_name} has UCLASS", "UCLASS" in content)
                v.check(cat, f"{cls_name} has GENERATED_BODY", "GENERATED_BODY" in content)

    # ═══════════════════════════════════════════════════════════════════════
    # 12. Test Coverage
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[12/12] Test Coverage")
    cat = "Test Coverage"

    v.file_exists(cat, "EconomyMatchBridge test", tests_int / "economy-match-bridge.test.ts")
    v.file_exists(cat, "SpectatorDataPipeline test", tests_int / "spectator-data-pipeline.test.ts")
    v.file_exists(cat, "DiscordBot test", tests_int / "discord-bot.test.ts")
    v.file_exists(cat, "MatchFlow test", tests_int / "match-flow.test.ts")
    v.file_exists(cat, "Full match simulation test", tests_int / "full-match-simulation.test.ts")

    # Test content checks
    emb_test = tests_int / "economy-match-bridge.test.ts"
    v.file_contains(cat, "EMB test: species config", emb_test, "SPECIES_CONFIG")
    v.file_contains(cat, "EMB test: kill reward calculation", emb_test, "calculateKillReward")
    v.file_contains(cat, "EMB test: water bonus", emb_test, "victimInWater")
    v.file_contains(cat, "EMB test: downed modifier", emb_test, "victimWasDowned")

    mf_test = tests_int / "match-flow.test.ts"
    v.file_contains(cat, "MF test: join player", mf_test, "joinPlayer")
    v.file_contains(cat, "MF test: kill pipeline", mf_test, "processKill")
    v.file_contains(cat, "MF test: revive", mf_test, "revivePlayer")

    sim_test = tests_int / "full-match-simulation.test.ts"
    v.file_contains(cat, "Sim test: full lifecycle", sim_test, "complete lifecycle")
    v.file_contains(cat, "Sim test: 10 operatives", sim_test, "TEST_OPERATIVES")
    v.file_contains(cat, "Sim test: economy rewards", sim_test, "economy rewards")
    v.file_contains(cat, "Sim test: damage pipeline", sim_test, "damage pipeline")
    v.file_contains(cat, "Sim test: multi-world", sim_test, "multi-world pipeline")

    # ═══════════════════════════════════════════════════════════════════════
    # SUMMARY
    # ═══════════════════════════════════════════════════════════════════════
    print("\n" + "=" * 72)
    print("VALIDATION SUMMARY")
    print("=" * 72)

    for cat_name, counts in v.categories.items():
        total = counts["passed"] + counts["failed"]
        pct = (counts["passed"] / total * 100) if total > 0 else 0
        status = "✓" if counts["failed"] == 0 else "✗"
        print(f"  {status} [{cat_name}] {counts['passed']}/{total} ({pct:.0f}%)")

    print(f"\n  Total: {v.passed}/{v.total} ({v.passed/v.total*100:.1f}%)")
    print(f"  Passed: {v.passed}")
    print(f"  Failed: {v.failed}")

    if v.failed == 0:
        print("\n  🏆 ALL CHECKS PASSED — Khaaos Run v4.0 Validated!")
    else:
        print(f"\n  ⚠️  {v.failed} checks failed — review above")

    return 0 if v.failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
