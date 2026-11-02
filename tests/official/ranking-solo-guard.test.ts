import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/khaaos_test";
const { applyMatchRankings } = await import("../../server/game/RankingService");

test("ranking: partida com participante único não concede XP nem altera Rating", async () => {
  const results = await applyMatchRankings("solo-training-room", [{
    userId: "single-player-training",
    kills: 50,
    placement: 1,
    isWinner: true,
  }]);

  // O retorno vazio prova que nenhum resultado persistente foi aplicado; o guard roda
  // antes de carregar stats ou chamar o storage, sem conexão a banco nesta suíte.
  assert.deepEqual(results, []);
});
