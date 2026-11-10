import assert from "node:assert/strict";
import test from "node:test";
import { CieScheduler, type CieSchedulerRepository } from "../../server/game/cieScheduler.ts";

function fakeRepository(overrides: Partial<CieSchedulerRepository> = {}) {
  const calls = { assertSchemaReady: 0, processDueEvents: 0 };
  const repository: CieSchedulerRepository = {
    async assertSchemaReady() { calls.assertSchemaReady += 1; },
    async processDueEvents() { calls.processDueEvents += 1; return { opened: 0, locked: 0, expired: 0 }; },
    ...overrides,
  };
  return { repository, calls };
}

test("CIE scheduler permanece desligado por padrão e não toca o banco", async () => {
  const { repository, calls } = fakeRepository();
  const scheduler = new CieScheduler(repository, 30_000, false);
  assert.equal(await scheduler.start(), false);
  assert.equal(scheduler.isRunning(), false);
  assert.deepEqual(calls, { assertSchemaReady: 0, processDueEvents: 0 });
  await scheduler.stop();
});

test("scheduler habilitado valida schema e faz poll de recuperação no boot", async () => {
  const { repository, calls } = fakeRepository();
  const scheduler = new CieScheduler(repository, 30_000, true);
  assert.equal(await scheduler.start(), true);
  assert.equal(scheduler.isRunning(), true);
  assert.deepEqual(calls, { assertSchemaReady: 1, processDueEvents: 1 });
  await scheduler.stop();
  assert.equal(scheduler.isRunning(), false);
});

test("poll concorrente no mesmo processo compartilha o trabalho em voo", async () => {
  let release!: (value: { opened: number; locked: number; expired: number }) => void;
  let calls = 0;
  const repo = fakeRepository({
    async processDueEvents() {
      calls += 1;
      return new Promise((resolve) => { release = resolve; });
    },
  });
  const scheduler = new CieScheduler(repo.repository, 30_000, true);
  const first = scheduler.tickOnce(new Date(1_800_000_000_000));
  const second = scheduler.tickOnce(new Date(1_800_000_001_000));
  assert.equal(calls, 1);
  release({ opened: 1, locked: 0, expired: 0 });
  assert.deepEqual(await first, { opened: 1, locked: 0, expired: 0 });
  assert.deepEqual(await second, { opened: 1, locked: 0, expired: 0 });
  await scheduler.stop();
});

test("falha de schema impede o start e não instala timer", async () => {
  const { repository } = fakeRepository({ async assertSchemaReady() { throw new Error("missing migration"); } });
  const scheduler = new CieScheduler(repository, 30_000, true);
  await assert.rejects(scheduler.start(), /missing migration/);
  assert.equal(scheduler.isRunning(), false);
});
