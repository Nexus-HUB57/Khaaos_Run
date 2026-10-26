import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, AUTOSCALE_DEFAULTS, scaleCompose } from '../../infra/staging/autoscaler.mjs';

const GATE = 1000; // KR_READY_MAX_CONNECTIONS por réplica nos cenários

test('staging autoscaler: banda saudável mantém réplicas e escala por carga/fila', () => {
  assert.equal(AUTOSCALE_DEFAULTS.dryRun, true, 'default é dry-run (nunca escala sem intenção)');
  // 1 réplica, 500 conexões de 1000 → 50%: banda saudável.
  assert.deepEqual(decide({ connections: 500, maxConnections: GATE, replicas: 1 }), { action: 'ok', target: 1, reason: 'healthy band', loadPct: 50, capacity: 1000 });
  // 900/1000 → 90% ≥ 85% → scale_out para 2.
  const out = decide({ connections: 900, maxConnections: GATE, replicas: 1 });
  assert.equal(out.action, 'scale_out');
  assert.equal(out.target, 2);
  assert.match(out.reason, /load/);
  // Fila > 0 força scale_out mesmo com carga baixa.
  const queued = decide({ connections: 10, queue: 3, maxConnections: GATE, replicas: 1 });
  assert.equal(queued.action, 'scale_out');
  assert.equal(queued.reason, 'queue');
  // 100/1000 → 10% < 30% e sem fila → scale_in, respeitando o piso min.
  const inDown = decide({ connections: 100, maxConnections: GATE, replicas: 2, lastScaleAt: 0, now: Date.now() + 120_000 });
  assert.equal(inDown.action, 'scale_in');
  assert.equal(inDown.target, 1);
  // Já no mínimo: nada a fazer.
  assert.equal(decide({ connections: 1, maxConnections: GATE, replicas: 1, lastScaleAt: 0, now: Date.now() + 120_000 }).action, 'ok');
  // Teto max: sinaliza at_max (operação deve subir o teto ou abrir região).
  const capped = decide({ connections: 99_000, maxConnections: GATE, replicas: 4, max: 4 });
  assert.equal(capped.action, 'ok');
  assert.equal(capped.reason, 'at_max');
  assert.equal(capped.target, 4);
});

test('staging autoscaler: cooldown evita flapping e capacidade escala com réplicas', () => {
  const now = Date.now();
  // Escalou há 10 s e cooldown é 60 s: decisão de scale_out vira 'ok/cooldown'.
  const during = decide({ connections: 990, maxConnections: GATE, replicas: 1, lastScaleAt: now - 10_000, now });
  assert.equal(during.action, 'ok');
  assert.equal(during.reason, 'cooldown');
  assert.equal(during.target, 1);
  // Cooldown NÃO bloqueia sair do overload: após cooldown passa.
  const after = decide({ connections: 990, maxConnections: GATE, replicas: 1, lastScaleAt: now - 61_000, now });
  assert.equal(after.action, 'scale_out');
  // Capacidade total = réplicas × gate (2 × 1000), carga recalculada sobre ela.
  const two = decide({ connections: 1_700, maxConnections: GATE, replicas: 2 });
  assert.equal(two.capacity, 2_000);
  assert.equal(two.loadPct, 85);
  assert.equal(two.action, 'scale_out');
});

test('staging autoscaler: scaleCompose respeita dry-run e monta argumentos corretos', async () => {
  const dry = await scaleCompose(3, { composeDir: '/tmp', dryRun: true });
  assert.equal(dry.executed, false);
  assert.deepEqual(dry.args, ['compose', '-f', '/tmp/docker-compose.yml', 'up', '-d', '--no-deps', '--scale', 'app=3']);
});
