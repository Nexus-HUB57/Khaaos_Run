/**
 * KHAAOS RUN — Guarda anti-reversão de suítes (camada 2).
 * O script scripts/guard-test-runner.mjs roda como step de CI ANTES dos testes;
 * esta suíte node:test replica a checagem DENTRO do test:official — mesmo que um
 * merge concorrente remova o step de CI, a suíte falha aqui (lição #127/#132:
 * vitest e suítes mortas sob aliases voltaram por merges concorrentes).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runGuardChecks } from "../../scripts/guard-test-runner.mjs";

describe("guarda anti-reversão de suítes", () => {
  it("manifesto tests/test-suite-guard.json íntegro (zero vitest/aliases, arquivos canônicos presentes)", () => {
    const { ok, violations } = runGuardChecks();
    assert.equal(ok, true, `violações da guarda:\n${violations.map((v) => `  - ${v}`).join("\n")}`);
  });

  it("manifesto exige mínimo de suítes nos três diretórios canônicos", () => {
    const { manifest } = runGuardChecks();
    assert.ok((manifest.minFiles["tests/integration"] ?? 0) >= 11, "tests/integration ≥ 11");
    assert.ok((manifest.minFiles["tests/official"] ?? 0) >= 40, "tests/official ≥ 40");
    assert.ok((manifest.minFiles["game-runtime/test"] ?? 0) >= 45, "game-runtime/test ≥ 45");
    assert.ok((manifest.mustExist ?? []).length >= 10, "≥ 10 arquivos canônicos protegidos");
    assert.ok((manifest.forbiddenDeps ?? []).includes("vitest"), "vitest é dependência proibida");
  });
});
