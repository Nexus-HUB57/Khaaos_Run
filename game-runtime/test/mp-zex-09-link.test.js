// MP-ZEX-09 — regressões do DegradedLink (mp-zex-09-link.mjs).
// Garante as invariantes que o E2E de rede degradada pressupõe: ordem por
// direção sob jitter, spike de "perda" contado e visível no atraso, drain
// sem pendências e RTT efetivo coerente com a configuração.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DegradedLink } from '../scripts/mp-zex-09-link.mjs';

const collectUp = (link, into) => {
  // substitui o coletor de uplink por um que registra a ordem de chegada
  link.onSendUp = (raw) => into.push(JSON.parse(raw).n);
};

test('DegradedLink preserva a ordem por direção sob jitter alto', async () => {
  const delivered = [];
  const link = new DegradedLink({
    upMs: 12, downMs: 12, jitterMs: 10, lossSpikeProbability: 0,
    onSendUp: (raw) => delivered.push(JSON.parse(raw).n),
  });
  for (let n = 0; n < 60; n += 1) link.uplink(JSON.stringify({ n }));
  await link.drain();
  assert.deepEqual(delivered, Array.from({ length: 60 }, (_, i) => i));
});

test('DegradedLink com spike garantido conta perda e atrasa o quadro', async () => {
  let sentAt = 0;
  const link = new DegradedLink({
    upMs: 10, downMs: 10, jitterMs: 0, lossSpikeProbability: 1,
    spikeMinMs: 60, spikeMaxMs: 60, rng: () => 0.5,
    onSendUp: () => { sentAt = performance.now(); },
  });
  const t0 = performance.now();
  link.uplink('{"n":1}');
  await link.drain();
  const elapsed = sentAt - t0;
  assert.ok(elapsed >= 68, `spike de 60ms + base 10ms deve atrasar ≥68ms (medido ${elapsed.toFixed(1)}ms)`);
  const stats = link.stats();
  assert.equal(stats.up.spikes, 1);
  assert.equal(stats.up.frames, 1);
  assert.ok(stats.up.maxMs >= 68);
});

test('DegradedLink drain zera pendências e downlink entrega depois do atraso', async () => {
  const seen = [];
  const link = new DegradedLink({
    upMs: 6, downMs: 8, jitterMs: 0, lossSpikeProbability: 0,
    onSendUp: () => {},
  });
  link.uplink('a');
  link.downlink(() => seen.push('d1'));
  link.downlink(() => seen.push('d2'));
  assert.equal(seen.length, 0); // nada entregue antes do atraso
  await link.drain();
  assert.deepEqual(seen, ['d1', 'd2']);
  const stats = link.stats();
  assert.equal(stats.up.frames, 1);
  assert.equal(stats.down.frames, 2);
  assert.ok(stats.effectiveRttMs >= 13, `rtt efetivo ≈ up+down (medido ${stats.effectiveRttMs})`);
});

test('DegradedLink close() descarta pendências (queda de conexão)', async () => {
  const delivered = [];
  const link = new DegradedLink({
    upMs: 25, downMs: 25, jitterMs: 0, lossSpikeProbability: 0,
    onSendUp: (raw) => delivered.push(raw),
  });
  link.uplink('{"n":1}');
  link.uplink('{"n":2}');
  link.close();
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(delivered, []);
});
