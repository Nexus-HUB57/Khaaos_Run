// ─── Selftest do EAC Dedicated Smoke (guard de CI — roda sem UE/binário) ─────
//
// Valida, sem runner UE:
//  1. A máquina de estados do matcher (active / stub / absent) sobre logs
//     sintéticos, inclusive stub que DEPOIS vira Active (ordem importa);
//  2. O contrato de exit codes: sem input → exit 3 (estrito) e exit 0 com
//     marcador SKIPPED (--allow-missing-input).
//
// Uso: node scripts/build/eac_dedicated_smoke_selftest.mjs   (exit 0 = ok)

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const smokeUrl = new URL("./eac_dedicated_smoke.mjs", import.meta.url);
const { scanLogForEacStatus } = await import(smokeUrl.href);

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "eac-selftest-"));
  const cases = [
    { name: "active-direto", body: "LogInit: begun\n[2026.10.27-12.00.00:000] EAC Status: Active (SDK real, server=CIGKV)\nLogEnd\n", expect: "active" },
    { name: "stub-antes-active", body: "EAC Status: Running (stub — SDK binários ausentes)\n[2026.10.27] EAC Status: Active (SDK real)\n", expect: "active" },
    { name: "stub-sem-active", body: "LogInit\nEAC Status: Running (stub — SDK binários ausentes)\nLogWorld: Begin Play\n", expect: "stub" },
    { name: "sem-linha", body: "LogInit\nLogWorld: Begin Play\nLogEnd\n", expect: "absent" },
    { name: "linha-parecida-nao-engana", body: "EAC Status: activeling something\n", expect: "absent" },
  ];
  try {
    for (const testCase of cases) {
      const path = join(dir, `${testCase.name}.log`);
      writeFileSync(path, testCase.body);
      const status = await scanLogForEacStatus(path);
      assert.equal(status, testCase.expect, `caso ${testCase.name}: esperado ${testCase.expect}, obtido ${status}`);
      console.log(`[eac-selftest] ok: ${testCase.name} → ${status}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  // Contrato de exit codes (spawn do próprio smoke, sem input)
  const strict = spawnSync(process.execPath, [smokeUrl.pathname], { encoding: "utf8" });
  assert.equal(strict.status, 3, `sem input em modo estrito deve ser exit 3, foi ${strict.status}`);
  assert.match(strict.stderr, /--log|--binary/);

  const lenient = spawnSync(
    process.execPath,
    [smokeUrl.pathname, "--allow-missing-input", "--reason", "selftest"],
    { encoding: "utf8" },
  );
  assert.equal(lenient.status, 0, `sem input com --allow-missing-input deve ser exit 0, foi ${lenient.status}`);
  assert.match(lenient.stdout, /EAC_SMOKE=SKIPPED/);

  // Contrato do stub: exit 4 SEMPRE (estado contraditório é erro)
  const stubDir = mkdtempSync(join(tmpdir(), "eac-selftest-stub-"));
  const stubLog = join(stubDir, "stub.log");
  writeFileSync(stubLog, "EAC Status: Running (stub — SDK binários ausentes)\n");
  try {
    const stubRun = spawnSync(
      process.execPath,
      [smokeUrl.pathname, "--log", stubLog],
      { encoding: "utf8" },
    );
    assert.equal(stubRun.status, 4, `stub deve ser exit 4, foi ${stubRun.status}`);
    assert.match(stubRun.stdout + stubRun.stderr, /EAC_SMOKE=STUB/);
    console.log("[eac-selftest] ok: contratos de exit code (3/0/4)");
  } finally {
    rmSync(stubDir, { recursive: true, force: true });
  }

  console.log("EAC_SELFTEST_OK");
}

main().catch((error) => {
  console.error("[eac-selftest] FALHOU:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
