// MP-ZEX staging — validação de ambiente compartilhada.
// Extraída de run-mp-zex-08-staging.mjs (comportamento idêntico) para que o
// workflow de despacho único (mp-zex-staging.yml), o script 08 e futuros
// cenários validem da MESMA forma: secrets obrigatórios, HTTPS fora do
// loopback, host que identifique staging e duas contas distintas.
// Nenhum valor de credencial é retornado ou impresso aqui.

const REQUIRED_SECRETS = [
  'KR_STAGING_BASE_URL',
  'KR_STAGING_TEST_USER_A', 'KR_STAGING_TEST_PASSWORD_A',
  'KR_STAGING_TEST_USER_B', 'KR_STAGING_TEST_PASSWORD_B',
];

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '::1'];

/**
 * Valida o ambiente de staging e devolve { base, httpBase, credentials }.
 * Lança Error com mensagem segura (sem valores) quando algo falta ou é recusado.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
export function resolveStagingConfig(env) {
  const missing = REQUIRED_SECRETS.filter((name) => !env[name]);
  if (missing.length) {
    throw new Error(`Secrets ausentes no environment staging: ${missing.join(', ')}`);
  }

  const base = new URL(env.KR_STAGING_BASE_URL);
  const hostIsLoopback = LOOPBACK_HOSTS.includes(base.hostname);
  const allowLocalHttp = hostIsLoopback && env.KR_STAGING_ALLOW_LOCAL_HTTP === '1';
  if (base.protocol !== 'https:' && !allowLocalHttp) {
    throw new Error('Recusado: staging remoto deve usar HTTPS; HTTP só é permitido em loopback para teste local explícito.');
  }
  const hostIsClearlyStaging = /(^|[.-])(stage|staging)([.-]|$)/i.test(base.hostname);
  if (!hostIsLoopback && !hostIsClearlyStaging && env.KR_STAGING_ALLOW_CUSTOM_HOST !== 'true') {
    throw new Error('Recusado: o host não identifica staging. Configure KR_STAGING_ALLOW_CUSTOM_HOST=true no environment apenas para um domínio de staging confirmado.');
  }
  if (env.KR_STAGING_TEST_USER_A === env.KR_STAGING_TEST_USER_B) {
    throw new Error('As duas contas de teste precisam ser distintas.');
  }

  return {
    base,
    httpBase: base.origin,
    credentials: {
      a: [env.KR_STAGING_TEST_USER_A, env.KR_STAGING_TEST_PASSWORD_A],
      b: [env.KR_STAGING_TEST_USER_B, env.KR_STAGING_TEST_PASSWORD_B],
    },
  };
}

/** Nomes obrigatórios — expostos para o gate do workflow e para o runbook. */
export const STAGING_REQUIRED_SECRETS = REQUIRED_SECRETS;
