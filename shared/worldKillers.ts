/**
 * KHAAOS RUN — Wart B: atribuição canônica de mortes causadas pelo MUNDO.
 * ======================================================================
 * O killfeed da transmissão só falava "jogador mata jogador": o
 * MatchFlow.processKill rejeitava killerId ausente (`if (!killer) return`)
 * e a morte por ANOMALIA Khaaos (quantum) — e por qualquer hazard do mundo —
 * BYPASSAVA o feed inteiro (nem PLAYER_DOWNED, nem PLAYER_ELIMINATED, nem
 * ELIMINATION no pipeline do espectador). No caminho offline o sim emitia
 * botKill sem `by` e o HUD rotulava TUDO como "RING" — a anomalia virava anel.
 *
 * Este módulo é a fonte única dos rótulos de "mundo killer": o servidor
 * (MatchFlow.toSpectatorEvents) usa worldKillerLabel() para nomear a fonte
 * quando killerId é nulo, e o cliente (main3d botKill) aplica o MESMO rótulo
 * para quantum — a paridade dos dois lados é gateada em
 * tests/official/world-killer-parity.test.ts (mesma doutrina do dbno-parity).
 *
 * Os kinds são os HAZARD_DAMAGE_KINDS reais do runtime
 * (game-runtime/src/game3d/spectator3d.js: tsunami/spore/smoke/ring/acid/quantum).
 */

/** Rótulo por kind de hazard — MESMA gramática do killfeed offline ('RING'). */
export const WORLD_KILLER_LABELS: Readonly<Record<string, string>> = Object.freeze({
  quantum: "ANOMALIA", // pilares da anomalia Khaaos (gravidade quântica)
  ring: "ANEL", // cerco em encolhimento
  acid: "ÁCIDO", // W1 Barburhen — poças ácidas
  tsunami: "TSUNAMI", // W1 — parede de água
  spore: "ESPOROS", // W2 Priadus
  smoke: "FUMAÇA", // W3 Ckesalth
});

/** Rótulo para mortes do mundo sem kind reconhecível. */
export const WORLD_KILLER_FALLBACK = "MUNDO";

/** Rótulo canônico da fonte letal quando NÃO há jogador na autoria.
 *  Determinístico, inteiro, sem dependência — importável por servidor e gates. */
export function worldKillerLabel(kind?: string | null): string {
  if (kind && Object.prototype.hasOwnProperty.call(WORLD_KILLER_LABELS, kind)) {
    return WORLD_KILLER_LABELS[kind];
  }
  return WORLD_KILLER_FALLBACK;
}
