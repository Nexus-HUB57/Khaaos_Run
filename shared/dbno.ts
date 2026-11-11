/**
 * KHAAOS RUN — Contrato canônico do protocolo DBNO (down-but-not-out)
 * ===================================================================
 *
 * Fonte única dos prazos do protocolo "DBNO de 7 s" (Fase 7 do
 * game-runtime, harmonizado com o UE5.8 pelo commit "DBNO recovery
 * window and synergy lab" — `DownedTimeLimitSeconds = 7.0f` em
 * KhaaosPlayerState.h e `DownedTimeLimit = 7.0f` em KhaaosReviveSystem.h).
 *
 * Paridades:
 *   - game-runtime 3D: `DBNO` em src/game3d/sim3d.js (fonte do runtime 3D);
 *   - UE5.8: KhaaosPlayerState.h / KhaaosReviveSystem.h (constexpr 7.0f);
 *   - servidor raiz: server/game/MatchFlow.ts consome ESTE arquivo.
 *
 * A paridade entre as três superfícies é provada por
 * tests/official/dbno-parity.test.ts (regex sobre as fontes reais —
 * qualquer mudança local que fuja do contrato quebra o gate).
 */

export const DBNO_CONTRACT = {
  /** Janela máxima caído antes da eliminação automática (sangramento). */
  bleedOutSeconds: 7,
  /** Multiplicador do prazo por nocaute extra — 1 = prazo fixo acordado de 7 s. */
  bleedOutDecay: 1,
  /** Vida restaurada ao reviver: HP fixos (UE5 `Heal(30.0f)` e MatchFlow). */
  reviveHealFlatHp: 30,
  /** Canalização de revive segurando E (s) — game-runtime 3D. */
  reviveSeconds: 3.2,
  /** Alcance do revive (m) — game-runtime 3D. */
  reviveDistance: 2.4,
} as const;

export type DbnoContract = typeof DBNO_CONTRACT;
