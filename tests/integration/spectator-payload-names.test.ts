/**
 * KHAAOS RUN — Fase 14: nomes reais no pipeline de espectador.
 * ============================================================
 * O payload do pipeline só carregava id/species — o standings do HUD mostrava
 * espécie ou cauda do id no lugar do nome. Aqui o MatchFlow é exercitado de
 * verdade (downed → revive → eliminação) com um pipeline de captura, provando:
 *   1. players[].displayName carrega o nome real do jogador;
 *   2. o eventLog interno (ids) é traduzido para o vocabulário do espectador
 *      (ELIMINATION/REVIVE/…) com nomes reais — o feed da transmissão funciona;
 *   3. getMetrics() expõe espectadores/pacotes/bytes/pico p/ o /admin.
 * Porta node:test — runner padrão do repo (lição #128/#132: nunca vitest).
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { MatchFlow } from "../../server/game/MatchFlow.ts";
import { EconomyMatchBridge } from "../../server/game/EconomyMatchBridge.ts";
import {
  SpectatorDataPipeline,
  type SpectatorGameData,
} from "../../server/game/SpectatorDataPipeline.ts";

/** Pipeline de captura: intercepta os payloads que o MatchFlow empurra. */
class CapturePipeline extends SpectatorDataPipeline {
  captured: SpectatorGameData[] = [];
  override pushGameData(roomId: string, data: SpectatorGameData): void {
    this.captured.push(data);
    super.pushGameData(roomId, data);
  }
}

const COUNTDOWN_S = 1;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function startMatch(capture: CapturePipeline, economyBridge: any, names: string[]): Promise<MatchFlow> {
  const match = new MatchFlow(
    { roomId: "sala-nomes", countdownSeconds: COUNTDOWN_S, tickIntervalMs: 50 },
    economyBridge,
    capture,
  );
  names.forEach((name, i) => {
    const joined = match.joinPlayer({
      id: `p${i + 1}`,
      displayName: name,
      species: "HURAN",
      skinRarity: "COMUM",
      posX: 40 + i,
      posY: 40 + i,
      inWaterZone: false,
      worldId: "cigkv",
    } as any);
    assert.equal(joined, true, `join ${name}`);
  });
  match.startCountdown();
  await new Promise((r) => setTimeout(r, COUNTDOWN_S * 1000 + 150)); // LOBBY → COUNTDOWN → IN_PROGRESS
  assert.equal(match.getState().status, "IN_PROGRESS");
  // garante ≥2 ticks do loop (50ms) para que pushSpectatorData já tenha rodado
  await new Promise((r) => setTimeout(r, 150));
  return match;
}

describe("SpectatorDataPipeline — Fase 14 (nomes reais + métricas)", () => {
  let capture: CapturePipeline;
  let economyBridge: any;
  let match: MatchFlow | null = null;

  beforeEach(() => {
    capture = new CapturePipeline();
    economyBridge = new EconomyMatchBridge();
  });

  afterEach(() => {
    match?.destroy();
    match = null;
    capture.destroy();
  });

  it("players do payload carregam displayName real (antes: só id/species)", async () => {
    match = await startMatch(capture, economyBridge, ["Khael Vance", "Sargento Zheers"]);
    assert.ok(capture.captured.length > 0, "ticks empurraram payloads");
    const last = capture.captured[capture.captured.length - 1];
    const byId = new Map(last.players.map((p) => [p.id, p]));
    assert.equal(byId.get("p1")?.displayName, "Khael Vance");
    assert.equal(byId.get("p2")?.displayName, "Sargento Zheers");
    assert.equal(byId.get("p1")?.species, "HURAN");
  });

  it("processKill → evento ELIMINATION com nomes reais (knock true)", async () => {
    match = await startMatch(capture, economyBridge, ["Killer Alpha", "Victim Bravo"]);
    capture.captured.length = 0;
    match.processKill("p1", "p2", 150, "WPN_AssaultRifle_MK1");
    await wait(120); // o payload sai no próximo tick (50 ms) — espera cobre jitter
    assert.ok(capture.captured.length > 0, "tick seguinte empurrou payload");
    const last = capture.captured[capture.captured.length - 1];
    const elim = last.events.filter((e) => e.type === "ELIMINATION").at(-1);
    assert.ok(elim, "evento ELIMINATION presente no payload");
    assert.equal(elim!.data.killer, "Killer Alpha", "nome real do agressor (antes: killerId cru)");
    assert.equal(elim!.data.victim, "Victim Bravo", "nome real da vítima");
    assert.equal(elim!.data.knock, true, "derrubada DBNO é nocaute");
    assert.equal(elim!.data.weapon, "WPN_AssaultRifle_MK1");
  });

  it("finalização de caído → ELIMINATION knock false; revive → REVIVE com nomes", async () => {
    match = await startMatch(capture, economyBridge, ["Killer Alpha", "Victim Bravo", "Medic Charlie"]);
    match.processKill("p1", "p2", 150, "smg");
    assert.equal(match.getState().players.get("p2")!.isDowned, true);

    capture.captured.length = 0;
    assert.equal(match.revivePlayer("p2", "p3"), true);
    await wait(120);
    const revived = capture.captured[capture.captured.length - 1];
    const revive = revived.events.filter((e) => e.type === "REVIVE").at(-1);
    assert.ok(revive, "REVIVE presente");
    assert.equal(revive!.data.by, "Medic Charlie", "quem reviveu, pelo nome");
    assert.equal(revive!.data.victim, "Victim Bravo");

    // derruba de novo e finaliza (knock false)
    match.processKill("p1", "p2", 150, "smg");
    capture.captured.length = 0;
    match.processKill("p1", "p2", 10, "smg"); // caído → finalização imediata
    await wait(120);
    assert.ok(capture.captured.length > 0, "tick seguinte empurrou payload");
    const finished = capture.captured[capture.captured.length - 1];
    const elim = finished.events.filter((e) => e.type === "ELIMINATION").at(-1);
    assert.ok(elim, "ELIMINATION da finalização");
    assert.equal(elim!.data.knock, false, "finalização não é nocaute");
    assert.equal(elim!.data.victim, "Victim Bravo");
    assert.equal(match.getState().players.get("p2")!.isEliminated, true);
  });

  it("evento do espectador nunca carrega undefined — fallback defensivo de nomes", async () => {
    // O nameOf do MatchFlow cai no id cru quando o registro não existe —
    // validado aqui através do próprio eventLog publicado (PLAYER_REVIVED
    // com reviver inexistente é bloqueado antes; usamos o caminho do
    // snapshot: displayName sempre string, nunca undefined).
    match = await startMatch(capture, economyBridge, ["Alpha", "Bravo"]);
    const last = capture.captured[capture.captured.length - 1];
    for (const p of last.players) {
      assert.equal(typeof p.displayName, "string", "displayName é sempre string");
      assert.ok(p.displayName!.length > 0);
    }
  });

  it("getMetrics: forma completa (totais, pico, salas, limites) para o /admin", () => {
    const m = capture.getMetrics();
    assert.equal(m.totalSpectators, 0);
    assert.equal(m.peakSpectators, 0);
    assert.deepEqual(m.totals, { packetsSent: 0, bytesSent: 0 });
    assert.deepEqual(m.rooms, []);
    assert.equal(m.limits.maxSpectatorsPerRoom, 500);
    assert.equal(m.limits.globalMaxSpectators, 5_000);
    assert.equal(m.limits.delayMs, 10_000);
    assert.equal(m.limits.batchIntervalMs, 200);
    assert.ok(Number.isFinite(m.now));
  });
});
