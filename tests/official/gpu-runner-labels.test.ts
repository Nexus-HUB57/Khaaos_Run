// Contrato: consistência de labels do GPU runner self-hosted.
// Protege contra o bug real que bloqueava o CI: o workflow exigia
// runs-on: [self-hosted, gpu] mas o setup script registrava o runner com
// labels "self-hosted,linux,ue5.8,x64" — nenhum runner atendia o job e a
// compilação UE5 ficava em fila para sempre. Toda mudança de labels precisa
// bater nos DOIS lados (workflow ↔ setup script).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORKFLOW = '.github/workflows/ue5-headless-compile.yml';
const SETUP = 'scripts/setup-gpu-runner.sh';
const HELPER = 'scripts/register-gpu-runner-token.sh';

function extractWorkflowLabels(source: string): string[] {
  const match = source.match(/runs-on:\s*\[([^\]]+)\]/);
  assert.ok(match, 'workflow sem runs-on em formato de lista');
  return match[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
}

function extractScriptLabels(source: string): string[] {
  const match = source.match(/RUNNER_LABELS="\$\{RUNNER_LABELS:-([^}]+)\}"/);
  assert.ok(match, 'setup script sem default de RUNNER_LABELS');
  return match[1].split(',').map((s) => s.trim()).filter(Boolean);
}

test('labels do runner no setup script batem exatamente com runs-on do workflow', () => {
  const wf = readFileSync(path.join(root, WORKFLOW), 'utf8');
  const setup = readFileSync(path.join(root, SETUP), 'utf8');

  const jobBlock = wf.split('ue5-headless-compile:')[1] ?? '';
  const wfLabels = extractWorkflowLabels(jobBlock);
  const scriptLabels = extractScriptLabels(setup);

  // Mesmo conjunto, mesma ordem (runs-on exige TODOS os labels; ordem extra
  // no runner é irrelevante, mas manter idêntica evita confusão de revisão)
  assert.deepEqual(wfLabels, scriptLabels,
    `labels divergentes — workflow: [${wfLabels}] vs setup script: [${scriptLabels}]`);
});

test('labels essenciais presentes (self-hosted, gpu, ue5.8)', () => {
  const setup = readFileSync(path.join(root, SETUP), 'utf8');
  const labels = extractScriptLabels(setup);
  for (const required of ['self-hosted', 'linux', 'gpu', 'ue5.8', 'x64']) {
    assert.ok(labels.includes(required), `label essencial ausente: ${required}`);
  }
});

test('helper de registro via API existe e nunca imprime o token', () => {
  assert.ok(existsSync(path.join(root, HELPER)), `helper ausente: ${HELPER}`);
  const helper = readFileSync(path.join(root, HELPER), 'utf8');
  assert.match(helper, /actions\/runners\/registration-token/, 'endpoint da API ausente');
  assert.match(helper, /Authorization: Bearer/, 'auth header ausente');
  // Token gerado NÃO pode ser ecoado em nenhum comando (vazaria no log de CI).
  // Asserções por linha (m flag): echo/log seguido do token na MESMA linha é
  // vazamento; printf redirecionado a arquivo com perms 600 é o caminho legítimo.
  assert.doesNotMatch(helper, /^\s*echo[^\n>]*\$?REG_TOKEN/m, 'REG_TOKEN ecoado no stdout!');
  assert.doesNotMatch(helper, /^\s*log\s[^\n]*\$REG_TOKEN/m, 'REG_TOKEN passado para log!');
  assert.doesNotMatch(helper, /^\s*printf[^\n]*(?<!>\s")\$REG_TOKEN"\s*$/m, 'REG_TOKEN imprimido sem redirect!');
  // O caminho legítimo: printf → arquivo com chmod 600
  assert.match(helper, /printf '%s' "\$REG_TOKEN" > "\$TOKEN_FILE"/, 'gravação segura do token-file ausente');
  assert.match(helper, /chmod 600 "\$TOKEN_FILE"/, 'token-file deve ter perms 600');
});

test('setup script encadeia fluxo documentado com token do helper', () => {
  const setup = readFileSync(path.join(root, SETUP), 'utf8');
  assert.match(setup, /RUNNER_REGISTRATION_TOKEN/, 'setup deve aceitar RUNNER_REGISTRATION_TOKEN');
  assert.match(setup, /config\.sh/, 'setup deve chamar ./config.sh do actions-runner');
  // Doc aponta para o helper automático
  assert.match(setup, /register-gpu-runner-token\.sh/, 'setup não documenta o helper de token');
});
