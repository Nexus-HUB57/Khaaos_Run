// Fase 28 — P1: comando Android CLI 100% executável no Windows.
// O comando original (Windows-only, curl.exe/%TEMP%) vira script de verdade:
//   scripts/windows/install_android_cli.cmd  (cmd.exe, usa curl.exe nativo)
//   scripts/windows/install_android_cli.ps1  (fallback PowerShell sem curl)
// A suíte trava os invariantes que tornam o script "100% executável":
// validações de ambiente, download atômico em temp ÚNICO, checagem de
// download vazio, propagação de exit code e CRLF (cmd.exe quebra labels/
// blocos em arquivos LF-only).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const CMD_PATH = path.join(REPO_ROOT, 'scripts', 'windows', 'install_android_cli.cmd');
const PS1_PATH = path.join(REPO_ROOT, 'scripts', 'windows', 'install_android_cli.ps1');

const read = (p: string) => readFileSync(p, 'utf8');

describe('P1 — install_android_cli.cmd (Windows cmd.exe)', () => {
  const content = () => read(CMD_PATH);

  it('existe e usa CRLF (cmd.exe exige para parsing confiável de blocos/labels)', () => {
    const raw = content();
    assert.ok(raw.length > 500, 'script com conteúdo real');
    assert.ok(raw.includes('\r\n'), 'line endings CRLF');
    assert.ok(!/(?<!\r)\n/.test(raw), 'nenhum LF órfão');
  });

  it('baixa a URL canônica do Android CLI com curl.exe', () => {
    const c = content();
    assert.ok(c.includes('https://dl.google.com/android/cli/latest/windows_x86_64/install.cmd'), 'URL canônica');
    assert.ok(c.includes('curl.exe'), 'curl.exe explícito (não curl de shell Unix)');
  });

  it('valida curl.exe e TEMP antes de qualquer download', () => {
    const c = content();
    assert.ok(c.includes('where curl.exe'), 'verifica curl.exe no PATH');
    assert.ok(c.includes('if not defined TEMP'), 'TEMP definido');
    assert.ok(c.includes('if not exist "%TEMP%\\"'), 'pasta TEMP existe');
  });

  it('arquivo temporário ÚNICO (nunca stale de execução anterior)', () => {
    const c = content();
    assert.ok(/khaaos_android_cli_install_%RANDOM%\.cmd/.test(c), 'nome único por execução');
  });

  it('confere download (exit code + existência + 0 bytes) e propaga exit code', () => {
    const c = content();
    assert.ok(c.includes('set "CURL_RC=%errorlevel%"'), 'captura exit code do curl');
    assert.ok(/%%~zA EQU 0/.test(c), 'detecta download vazio');
    assert.ok(c.includes('exit /b %INSTALL_RC%'), 'propaga exit code do instalador');
    assert.ok(c.includes('del /q "%KHAOS_TMP%"'), 'limpa o temporário');
  });
});

describe('P1 — install_android_cli.ps1 (fallback sem curl.exe)', () => {
  const content = () => read(PS1_PATH);

  it('existe, CRLF e mesma URL canônica', () => {
    const raw = content();
    assert.ok(raw.includes('\r\n'), 'line endings CRLF');
    assert.ok(raw.includes('https://dl.google.com/android/cli/latest/windows_x86_64/install.cmd'), 'URL canônica');
  });

  it('temporário único por GUID + valida download + propaga exit code', () => {
    const c = content();
    assert.ok(c.includes('[guid]::NewGuid()'), 'arquivo único por execução');
    assert.ok(c.includes('$env:TEMP'), 'usa TEMP do usuário');
    assert.ok(c.includes('.Length -eq 0'), 'detecta download vazio');
    assert.ok(c.includes('$LASTEXITCODE'), 'propaga exit code do instalador');
    assert.ok(c.includes('Tls12'), 'TLS 1.2 forçado (Windows antigos)');
    assert.ok(c.includes('$ErrorActionPreference'), 'erros param o script');
  });
});
