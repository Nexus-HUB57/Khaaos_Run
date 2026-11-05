/**
 * Contrato de paridade do protocolo DBNO entre as TRÊS superfícies de jogo:
 *
 *   1. game-runtime 3D (simulador autoritativo) — src/game3d/sim3d.js `DBNO`
 *   2. UE5.8 (produto alvo) — KhaaosPlayerState.h `DownedTimeLimitSeconds`,
 *      KhaaosReviveSystem.h `DownedTimeLimit` e o heal `Heal(30.0f)`
 *   3. servidor raiz (MatchFlow) — consome @shared/dbno (sem mágica local)
 *
 * O protocolo "DBNO de 7 s" é o acordo canônico (Fase 7 + commit
 * "DBNO recovery window and synergy lab", que harmonizou 3D↔UE5 — este
 * gate fecha o ponto de consumo que ficou para trás: MatchFlow 30 s).
 * Qualquer mudança local que fuja do contrato quebra este teste ANTES de
 * divergir em runtime.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const REPO = path.resolve(import.meta.dirname, "../..");

const read = (rel: string): string =>
  readFileSync(path.join(REPO, rel), "utf-8");

const DBNO_CONTRACT_PATH = "shared/dbno.ts";
const SIM3D_PATH = "game-runtime/src/game3d/sim3d.js";
const PS_H_PATH = "Unreal/KhaaosRun/Source/KhaaosRun/Player/KhaaosPlayerState.h";
const RS_H_PATH = "Unreal/KhaaosRun/Source/KhaaosRun/Game/Revive/KhaaosReviveSystem.h";
const RS_CPP_PATH = "Unreal/KhaaosRun/Source/KhaaosRun/Game/Revive/KhaaosReviveSystem.cpp";
const MATCHFLOW_PATH = "server/game/MatchFlow.ts";

test("dbno: contrato compartilhado (@shared/dbno) carrega os valores acordados", () => {
  const src = read(DBNO_CONTRACT_PATH);
  assert.match(src, /bleedOutSeconds:\s*7\b/);
  assert.match(src, /bleedOutDecay:\s*1\b/);
  assert.match(src, /reviveHealFlatHp:\s*30\b/);
  // importável e tipável em runtime
  void import("../../shared/dbno");
});

test("dbno: game-runtime 3D (sim3d.js) espelha a janela de 7 s e o heal de 30", () => {
  const src = read(SIM3D_PATH);
  assert.match(src, /bleedOutSeconds:\s*7\b/);
  assert.match(src, /bleedOutDecay:\s*1\b/);
  assert.match(src, /reviveLifeFraction:\s*0\.3\b/);
  // o heal 3D é expresso em fração do scale 100 → 30 HP
  assert.match(src, /Math\.round\(100\s*\*\s*DBNO\.reviveLifeFraction\)/);
});

test("dbno: UE5.8 fixa a janela em 7.0f nos dois pontos (PlayerState + ReviveSystem)", () => {
  assert.match(read(PS_H_PATH), /DownedTimeLimitSeconds\s*=\s*7\.0f/);
  assert.match(read(RS_H_PATH), /DownedTimeLimit\s*=\s*7\.0f/);
  // o revive reportado só é válido com a janela autoritativa encerrada
  assert.match(read(RS_CPP_PATH), /GetDownedTimeRemaining\(\)\s*>\s*0\.0f/);
});

test("dbno: UE5.8 revive com o heal acordado de 30 HP", () => {
  const cpp = read(RS_CPP_PATH);
  const heals = cpp.match(/Heal\(30\.0f\)/g) ?? [];
  assert.ok(heals.length >= 3, `esperado Heal(30.0f) nos 3 caminhos de revive, achei ${heals.length}`);
});

test("dbno: MatchFlow (raiz) consome o contrato e não carrega prazos mágicos", () => {
  const src = read(MATCHFLOW_PATH);
  assert.match(src, /import\s*\{\s*DBNO_CONTRACT\s*\}\s*from\s*"@shared\/dbno"/);
  assert.match(src, /DBNO_CONTRACT\.bleedOutSeconds\s*\*\s*1000/);
  assert.match(src, /DBNO_CONTRACT\.reviveHealFlatHp/);
  // o timeout legado de 30 s não pode reentrar em nenhuma forma
  assert.doesNotMatch(src, /30_000/);
  assert.doesNotMatch(src, /Downed\(30s/);
});
