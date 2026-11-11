/**
 * KHAAOS RUN — Wart B: morte por ANOMALIA (mundo) NÃO bypassa mais o killfeed.
 * =============================================================================
 * Antes: MatchFlow.processKill fazia `if (!killer) return` — qualquer morte sem
 * autor jogador (anomalia Khaaos/quantum, anel, hazards) era DESCARTADA: nem
 * PLAYER_DOWNED, nem PLAYER_ELIMINATED, nem ELIMINATION no pipeline do
 * espectador. A plateia nunca via a morte; o killer '—' nem chegava a existir.
 *
 * Agora: killerId nulo = morte do MUNDO — segue pelo pipeline DBNO completo
 * (7 s acordados, @shared/dbno) SEM crédito de abate/economia/discord, e o
 * feed do espectador nomeia a fonte real via worldKillerLabel
 * (@shared/worldKillers — ANOMALIA/ANEL/…), mesma gramática do killfeed
 * offline (main3d botKill kind==='quantum' → 'ANOMALIA').
 *
 * Porta node:test — runner padrão do repo (lição #128/#132: nunca vitest).
 * A janela DBNO de 7 s é virtualizada com mock.timers (nada de sono real);
 * timers mockados só vivem dentro da janela enable→restore (lição: agendar e
 * disparar na MESMA janela — reset descarta os pendentes).
 */

import { describe, it, beforeEach, afterEach, mock } from "node:test";
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

/** Bridge real com espionagem de recompensa — morte do MUNDO não pode pagar. */
class SpyEconomyBridge extends EconomyMatchBridge {
  rewardCalls = 0;
  override recordReward(roomId: string, result: Parameters<EconomyMatchBridge["recordReward"]>[1]): void {
    this.rewardCalls++;
    super.recordReward(roomId, result);
  }
}

const COUNTDOWN_S = 1;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("MatchFlow — Wart B: mortes do mundo no killfeed do espectador", () => {
  let capture: CapturePipeline;
  let economyBridge: SpyEconomyBridge;
  let match: MatchFlow | null = null;

  beforeEach(async () => {
    capture = new CapturePipeline();
    economyBridge = new SpyEconomyBridge();
    match = new MatchFlow(
      { roomId: "sala-wart-b", countdownSeconds: COUNTDOWN_S, tickIntervalMs: 50 },
      economyBridge,
      capture,
    );
    const names = ["Khael Vance", "Sargento Zheers", "Operante P3", "Operante P4"];
    names.forEach((name, i) => {
      const joined = match!.joinPlayer({
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
    match!.startCountdown();
    await new Promise((r) => setTimeout(r, COUNTDOWN_S * 1000 + 150)); // LOBBY → COUNTDOWN → IN_PROGRESS
    assert.equal(match!.getState().status, "IN_PROGRESS");
  });

  afterEach(() => {
    match?.destroy();
    match = null;
    capture.destroy();
  });

  /** ELIMINATIONs já traduzidas vistas pela plateia (payloads capturados). */
  const feedEliminations = () =>
    capture.captured.flatMap((p) => p.events ?? []).filter((e: any) => e?.type === "ELIMINATION");

  it("morte pela ANOMALIA (killerId nulo) downa, aparece no feed e elimina após os 7 s do DBNO — sem crédito", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      match!.processKill(null, "p1", 999, "quantum"); // downa + agenda o bleed-out de 7 s (mockado)

      const state = match!.getState();
      const p1 = state.players.get("p1")!;
      assert.equal(p1.isDowned, true, "anomalia downa a vítima (DBNO de 7 s)");
      assert.equal(p1.isEliminated, false, "não elimina na hora — janela DBNO vale");
      const p2 = state.players.get("p2")!;
      assert.equal(p2.kills, 0, "ninguém recebe crédito de abate");
      assert.equal(state.totalEliminations, 1, "down conta como eliminação da partida");
      assert.equal(economyBridge.rewardCalls, 0, "morte do mundo NÃO paga recompensa");

      mock.timers.tick(7_050); // dispara o bleed-out virtualizado — sem sono no CI
      assert.equal(p1.isEliminated, true, "bleed-out de 7 s elimina (contrato @shared/dbno)");
    } finally {
      mock.timers.reset();
    }

    await wait(150); // ticks reais empurram payloads com os eventos traduzidos
    const events = feedEliminations().filter((e: any) => e.data?.victim === "Khael Vance");
    const knock = events.find((e: any) => e.data?.knock);
    assert.ok(knock, "plateia vê o DOWN no feed");
    assert.equal(knock.data.killer, "ANOMALIA", "fonte real nomeada (antes: '—'/bypass)");
    const elim = events.find((e: any) => !e.data?.knock);
    assert.ok(elim, "plateia vê a ELIMINAÇÃO no feed");
    assert.equal(elim.data.killer, "ANOMALIA", "eliminação também nomeia a fonte");
  });

  it("finalização pelo MUNDO (anel) em vítima já caída elimina IMEDIATO com rótulo 'ANEL'", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      match!.processKill(null, "p2", 999, "ring");
      assert.equal(match!.getState().players.get("p2")!.isDowned, true, "anel downa");

      // vítima já caída: nova passada do hazard é finalização imediata (sem esperar 7 s)
      match!.processKill(null, "p2", 100, "ring");
      mock.timers.tick(1);
      const p2 = match!.getState().players.get("p2")!;
      assert.equal(p2.isEliminated, true, "mundo finaliza caído na hora");
      assert.equal(economyBridge.rewardCalls, 0, "finalização do mundo não paga");
    } finally {
      mock.timers.reset();
    }

    await wait(150);
    const elim = feedEliminations().find((e: any) => e.data?.victim === "Sargento Zheers" && !e.data?.knock);
    assert.ok(elim, "eliminação aparece no feed");
    assert.equal(elim.data.killer, "ANEL", "rótulo do hazard 'ring' é ANEL");
  });

  it("abate por JOGADOR mantém crédito, recompensa e nome real (regressão do comportamento)", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      match!.processKill("p4", "p3", 999, "rifle");
      mock.timers.tick(7_050); // janela DBNO do jogador também é 7 s
      const state = match!.getState();
      assert.equal(state.players.get("p4")!.kills, 1, "killer ganha o crédito");
      assert.equal(state.players.get("p3")!.isEliminated, true, "vítima eliminada após os 7 s");
      assert.ok(economyBridge.rewardCalls >= 1, "abate de jogador PAGA recompensa");
    } finally {
      mock.timers.reset();
    }

    await wait(150);
    const elim = feedEliminations().find((e: any) => e.data?.victim === "Operante P3" && !e.data?.knock);
    assert.ok(elim, "feed carrega a eliminação");
    assert.equal(elim.data.killer, "Operante P4", "nome real do killer (comportamento intacto)");
  });
});
