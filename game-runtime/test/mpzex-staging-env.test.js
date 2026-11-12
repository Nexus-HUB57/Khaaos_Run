// MP-ZEX staging — regressões da validação de ambiente compartilhada
// (mpzex-staging-env.mjs, extraída de run-mp-zex-08-staging.mjs).
// O gate de secrets é a primeira linha de defesa do despacho único: erros
// aqui significam despacho contra alvo errado ou credenciais em host não
// confirmado. Nenhum valor de credencial aparece nas mensagens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveStagingConfig, STAGING_REQUIRED_SECRETS } from '../scripts/mpzex-staging-env.mjs';

const baseEnv = {
  KR_STAGING_BASE_URL: 'https://staging.khaaos.example',
  KR_STAGING_TEST_USER_A: 'kr_zex_a',
  KR_STAGING_TEST_PASSWORD_A: 'senha-a',
  KR_STAGING_TEST_USER_B: 'kr_zex_b',
  KR_STAGING_TEST_PASSWORD_B: 'senha-b',
};

test('aceita ambiente https de staging e não expõe credenciais', () => {
  const cfg = resolveStagingConfig(baseEnv);
  assert.equal(cfg.base.hostname, 'staging.khaaos.example');
  assert.equal(cfg.httpBase, 'https://staging.khaaos.example');
  // credenciais ficam internas, mas nunca em texto nas mensagens de erro;
  // aqui apenas garantimos o formato esperado (par usuário/senha)
  assert.deepEqual(cfg.credentials.a, ['kr_zex_a', 'senha-a']);
  assert.deepEqual(cfg.credentials.b, ['kr_zex_b', 'senha-b']);
});

test('lista TODOS os secrets ausentes de uma vez, em ordem canônica', () => {
  try {
    resolveStagingConfig({});
    assert.fail('deveria recusar ambiente vazio');
  } catch (error) {
    for (const name of STAGING_REQUIRED_SECRETS) {
      assert.ok(error.message.includes(name), `mensagem deve citar ${name}`);
    }
    assert.ok(!error.message.includes('senha'), 'mensagem não deve conter valores');
  }
});

test('recusa HTTP em host remoto sem KR_STAGING_ALLOW_LOCAL_HTTP', () => {
  try {
    resolveStagingConfig({ ...baseEnv, KR_STAGING_BASE_URL: 'http://staging.khaaos.example' });
    assert.fail('deveria recusar http remoto');
  } catch (error) {
    assert.ok(error.message.includes('HTTPS'));
  }
});

test('permite HTTP apenas em loopback com KR_STAGING_ALLOW_LOCAL_HTTP=1', () => {
  const cfg = resolveStagingConfig({
    ...baseEnv,
    KR_STAGING_BASE_URL: 'http://127.0.0.1:8080',
    KR_STAGING_ALLOW_LOCAL_HTTP: '1',
  });
  assert.equal(cfg.base.port, '8080');
  assert.throws(
    () => resolveStagingConfig({ ...baseEnv, KR_STAGING_BASE_URL: 'http://127.0.0.1:8080' }),
    /HTTPS/,
  );
});

test('recusa host customizado sem rótulo staging e sem allowlist explícita', () => {
  try {
    resolveStagingConfig({ ...baseEnv, KR_STAGING_BASE_URL: 'https://api.khaaos.example' });
    assert.fail('deveria recusar host sem rótulo staging');
  } catch (error) {
    assert.ok(error.message.includes('KR_STAGING_ALLOW_CUSTOM_HOST'));
  }
  const allowed = resolveStagingConfig({
    ...baseEnv,
    KR_STAGING_BASE_URL: 'https://api.khaaos.example',
    KR_STAGING_ALLOW_CUSTOM_HOST: 'true',
  });
  assert.equal(allowed.base.hostname, 'api.khaaos.example');
});

test('exige duas contas distintas', () => {
  assert.throws(
    () => resolveStagingConfig({
      ...baseEnv,
      KR_STAGING_TEST_USER_B: baseEnv.KR_STAGING_TEST_USER_A,
    }),
    /distintas/,
  );
});

test('host com rótulo staging em qualquer posição é aceito', () => {
  for (const host of ['staging.khaaos.example', 'kr-stage.example', 'khaaos-staging-1.example']) {
    const cfg = resolveStagingConfig({ ...baseEnv, KR_STAGING_BASE_URL: `https://${host}` });
    assert.equal(cfg.base.hostname, host);
  }
});
