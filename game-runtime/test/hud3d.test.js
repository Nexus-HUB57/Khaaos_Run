import assert from 'node:assert/strict';
import { test } from 'node:test';

class FakeClassList {
  values = new Set();
  add(...names) { names.forEach((name) => this.values.add(name)); }
  remove(...names) { names.forEach((name) => this.values.delete(name)); }
  contains(name) { return this.values.has(name); }
  toggle(name, force) {
    const next = force === undefined ? !this.values.has(name) : !!force;
    if (next) this.values.add(name); else this.values.delete(name);
    return next;
  }
}

class FakeStyle {
  setProperty(name, value) { this[name] = String(value); }
  removeProperty(name) { delete this[name]; }
}

function fakeCanvasContext() {
  return new Proxy({}, {
    get(target, key) {
      if (!(key in target)) target[key] = () => {};
      return target[key];
    },
    set(target, key, value) { target[key] = value; return true; },
  });
}

class FakeElement {
  constructor(id = '') {
    this.id = id;
    this.dataset = {};
    this.style = new FakeStyle();
    this.classList = new FakeClassList();
    this.listeners = new Map();
    this.children = [];
    this.attributes = {};
    this.textContent = '';
    this.innerHTML = '';
    this.value = '';
    this.width = 720;
    this.height = 720;
    this.parentElement = null;
    this._ctx = fakeCanvasContext();
  }
  addEventListener(type, fn) {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(fn);
    this.listeners.set(type, handlers);
  }
  fire(type, event = {}) {
    const e = { target: this, preventDefault() {}, ...event };
    for (const handler of this.listeners.get(type) ?? []) handler(e);
  }
  getContext() { return this._ctx; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
  setPointerCapture() {}
  setAttribute(name, value) { this.attributes[name] = String(value); }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  prepend(child) { child.parentElement = this; this.children.unshift(child); }
  get lastChild() { return this.children.at(-1) ?? null; }
  remove() {
    if (this.parentElement) {
      const index = this.parentElement.children.indexOf(this);
      if (index >= 0) this.parentElement.children.splice(index, 1);
    }
    this.removed = true;
  }
}

class FakeDocument {
  constructor() {
    this.elements = new Map();
    this.missing = new Set();
    this.body = new FakeElement('body');
    this.documentElement = new FakeElement('documentElement');
    this.touchButtons = ['KeyW', 'KeyF'].map((key) => {
      const button = new FakeElement('touch');
      button.dataset.key = key;
      return button;
    });
  }
  querySelector(selector) {
    if (this.missing.has(selector)) return null;
    if (!this.elements.has(selector)) this.elements.set(selector, new FakeElement(selector.slice(1)));
    return this.elements.get(selector);
  }
  querySelectorAll(selector) { return selector === '[data-key]' ? this.touchButtons : []; }
  createElement(tag) { return new FakeElement(tag); }
  get(id) { return this.querySelector(`#${id}`); }
}

globalThis.document = new FakeDocument();
const { HUD } = await import('../src/game3d/hud3d.js');
const { KhaaosSim3D } = await import('../src/game3d/sim3d.js');
const { MYTHIC_SKIN } = await import('../src/game3d/attachments3d.js');

function makeTimers() {
  const originals = {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };
  const jobs = new Map();
  let id = 1;
  globalThis.setTimeout = (fn, delay = 0) => {
    const key = id++;
    jobs.set(key, { fn, delay });
    return key;
  };
  globalThis.clearTimeout = (key) => jobs.delete(key);
  return {
    jobs,
    runAll(limit = 100) {
      let count = 0;
      while (jobs.size && count < limit) {
        const [key, job] = jobs.entries().next().value;
        jobs.delete(key);
        job.fn();
        count++;
      }
      assert.ok(count < limit, 'timer callbacks should terminate');
    },
    restore() {
      globalThis.setTimeout = originals.setTimeout;
      globalThis.clearTimeout = originals.clearTimeout;
    },
  };
}

function makeHud() {
  const doc = new FakeDocument();
  globalThis.document = doc;
  const sim = new KhaaosSim3D({ seed: 'HUD-COVERAGE', botCount: 3 });
  const calls = { entry: [], restart: [], replay: [] };
  const hud = new HUD({
    sim,
    seed: 'HUD-COVERAGE',
    onEntry: (entry) => calls.entry.push(entry),
    onRestart: (seed) => calls.restart.push(seed),
    onReplayExport: () => calls.replay.push(true),
  });
  return { doc, sim, hud, calls };
}

test('HUD3D binds keyboard/touch controls, map and tactical feedback methods', () => {
  const timers = makeTimers();
  try {
    const { doc, hud, calls } = makeHud();
    let clicks = 0;
    hud.audio = { ui: () => clicks++ };

    doc.get('beltBtn').fire('click');
    doc.get('rushBtn').fire('click');
    doc.get('endBtn').fire('click');
    doc.get('replayBtn').fire('click');
    doc.get('mapBtn').fire('click');
    doc.get('seedInput').fire('change', { target: { value: '  NEXT-SEED  ' } });
    doc.get('seedInput').fire('change', { target: { value: '   ' } });
    assert.deepEqual(calls.entry, ['belt', 'rush']);
    assert.deepEqual(calls.restart, [undefined, 'NEXT-SEED', 'HUD-COVERAGE']);
    assert.deepEqual(calls.replay, [true]);
    assert.equal(clicks, 4);
    assert.equal(hud.mapOpen, true);
    assert.equal(doc.get('tacticalMap').attributes['aria-hidden'], 'false');

    const touch = doc.touchButtons[0];
    touch.fire('touchstart', { preventDefault() {} });
    assert.equal(hud.touchState.KeyW, true);
    touch.fire('touchend');
    assert.equal(hud.touchState.KeyW, false);
    touch.fire('touchcancel');
    assert.equal(hud.touchState.KeyW, false);

    const stick = doc.get('joyBase'), knob = doc.get('joyKnob');
    stick.fire('pointerdown', { pointerId: 7, clientX: 100, clientY: 50 });
    assert.equal(hud.joy.active, true);
    stick.fire('pointermove', { pointerId: 8, clientX: 0, clientY: 0 });
    assert.equal(hud.joy.dx, 1);
    stick.fire('pointermove', { pointerId: 7, clientX: 100, clientY: 100 });
    assert.ok(Math.abs(hud.joy.dx - Math.SQRT1_2) < 1e-9);
    stick.fire('pointerup', { pointerId: 8 });
    assert.equal(hud.joy.active, true);
    stick.fire('pointercancel', { pointerId: 7 });
    assert.equal(hud.joy.active, false);
    assert.equal(hud.joy.dx, 0);
    assert.equal(knob.style.transform, 'translate(-50%,-50%)');

    hud.setAbility('OP_FEMALE_DISRUPTOR_MENA', true);
    assert.match(doc.get('abilityName').textContent, /PULSO/i);
    assert.equal(doc.get('abilityStatus').textContent, 'Q · PRONTA');
    assert.match(doc.get('operativeAbility').title, /autoritativa no servidor/);
    hud.uiClick();
    assert.equal(clicks, 5);

    for (let i = 0; i < 7; i++) hud.feed(`OPERATIVO-${i}`, `evento-${i}`);
    assert.equal(doc.get('feedList').children.length, 6);
    hud.auraCombat = { aura: '#ff2d78', season: '#ab0', dur: '1.2s' };
    hud.killfeed('EU', 'ALVO', true, true, true);
    hud.killfeed('BOT', 'OUTRO', true, false, false);
    hud.killfeed('EU', 'ALVO-2', false, true, false);
    hud.killfeed('EU', 'ALVO-3', true, true, false);
    hud.killfeed('EU', 'ALVO-4', false, false, true);
    assert.equal(doc.get('killfeed').children.length, 4);
    assert.ok(doc.get('killfeed').children.some((entry) => entry.classList.contains('mythic')));
    hud.hitmarker(true);
    assert.ok(doc.get('hitmarker').classList.contains('head'));
    hud.hitmarker(false);
    assert.equal(doc.get('hitmarker').classList.contains('head'), false);
    timers.runAll();
    assert.equal(doc.get('killfeed').children.length, 0);
    assert.equal(doc.get('hitmarker').classList.contains('show'), false);

    hud.prompt('REANIMAR');
    assert.ok(doc.get('interactPrompt').classList.contains('visible'));
    hud.prompt('');
    assert.equal(doc.get('interactPrompt').classList.contains('visible'), false);
    hud.target(null);
    assert.equal(doc.get('targetPanel').classList.contains('visible'), false);
    hud.target({ label: 'PORTA', hp: 34, max: 100, cls: 'metal' });
    assert.equal(doc.get('targetPanel').dataset.mat, 'metal');
    assert.equal(doc.get('targetFill').style.width, '34%');
    assert.equal(doc.get('targetPanel').classList.contains('low'), true);
    hud.target({ label: 'VIDRO', hp: 100, max: 100 });
    assert.equal(doc.get('targetPanel').dataset.mat, 'wood');
    assert.equal(doc.get('targetPanel').classList.contains('low'), false);
    doc.missing.add('#targetPanel');
    hud.target({ label: 'IGNORADO', hp: 1, max: 2 });
    doc.missing.delete('#targetPanel');

    hud.showZu(); hud.hideZu();
    hud.showSpectator({ name: 'MARA', placement: 2 });
    assert.equal(doc.get('specName').textContent, 'MARA');
    assert.equal(doc.get('specPlacement').textContent, '#2');
    hud.showSpectator({});
    hud.updateSpectator('NOVA');
    assert.equal(doc.get('specName').textContent, 'NOVA');
    doc.missing.add('#specName');
    hud.updateSpectator('IGNORADO');
    doc.missing.delete('#specName');
    hud.hideSpectator();
    hud.setCourtAtaAvailable(true);
    assert.equal(doc.get('specAta').classList.contains('hidden'), false);
    hud.setCourtAtaAvailable(false);
    hud.setMatchStatus('SALA ONLINE');
    assert.equal(doc.get('matchStatus').textContent, 'SALA ONLINE');
    hud.setPerf(null, 1, 'low');
    assert.equal(doc.get('perfReadout').classList.contains('hidden'), true);
    hud.setPerf(59.7, .75, 'balanced');
    assert.match(doc.get('perfReadout').textContent, /60 FPS · RES 75% · BALANCED/);
    hud.setPerf(60, 1, 'high');
    doc.missing.add('#perfReadout');
    hud.setPerf(30, .5, 'low');
    doc.missing.delete('#perfReadout');
    assert.equal(hud.toggleMap(false), false);
    assert.equal(hud.toggleMap(true), true);
    hud.closeMap();
    hud.closeMap();
    doc.missing.add('#tacticalMap');
    assert.equal(hud.toggleMap(), false);
    doc.missing.delete('#tacticalMap');
    hud.dispose();
  } finally {
    timers.restore();
  }
});

test('HUD3D renders normal, mythical, downed and recovery-countdown states', () => {
  const { doc, sim, hud } = makeHud();
  const p = sim.player;
  const ctx = doc.get('minimap').getContext('2d');
  let heartbeats = 0;
  hud.audio = { heartbeat: () => heartbeats++ };
  hud.mmLimiter = { ready: () => true };
  hud.setAbility(p.operativeId, false);

  p.weapon = 'm4';
  p.weaponSkin = MYTHIC_SKIN.id;
  p.mythicStage = 3;
  p.weaponAttachments = ['mira4x', 'silenciador', 'magestendida', 'gripvertical'];
  p.attachmentRarities = ['RARO', 'LENDARIO', 'MITICA', 'COMUM'];
  p.life = 24;
  p.armor = 30;
  p.temporaryArmor = 12;
  p.ammoMag = 20;
  p.reloadT = 0;
  p.abilityState = { ...p.abilityState, cooldownTicks: 15, effect: 'terminalScan', activeTicks: 1, targetTerminalId: sim.terminals[0].id };
  p.dropPhase = 'sky';
  p.y = 79;
  p.knocked = true;
  p.knockT = 7;
  p.downedCount = 1;
  p.reviveProgress = .6;
  p.alive = true;
  p.extracted = 1;
  p.kills = 3;
  p.ads = true;
  p.moving = true;
  p.sprinting = true;
  sim.time = 125;
  sim.ring.pulse = 2;
  sim.aliveCount = 9;
  if (sim.bots[0]) { sim.bots[0].revealedTicks = 1; }
  if (sim.bots[1]) { sim.bots[1].revealed = true; }
  if (sim.bots[2]) { sim.bots[2].alive = false; sim.bots[2].revealed = true; }
  if (sim.terminals[1]) sim.terminals[1].active = false;
  if (sim.loot[0]) sim.loot[0].active = false;
  if (sim.loot[1]) sim.loot[1].active = true;
  hud.damageFlash = .2;
  hud.mapOpen = true;
  hud.update(.1, {});

  assert.equal(doc.get('lifeValue').textContent, '24');
  assert.equal(doc.get('armorValue').textContent, '42');
  assert.match(doc.get('armorValue').title, /temporária/);
  assert.equal(doc.get('weaponName').textContent, 'Fuzil de Assalto M4');
  assert.equal(doc.get('ammoMag').textContent, 20);
  assert.match(doc.get('attachStrip').innerHTML, /4X/);
  assert.ok(doc.get('attachStrip').classList.contains('filled'));
  assert.ok(!doc.get('mythicStage').classList.contains('hidden'));
  assert.match(doc.get('mythicStage').textContent, /EV\.3/);
  assert.equal(doc.body.dataset.aura, '#35e1ff');
  assert.ok(doc.get('weaponIcon').classList.contains('mythic'));
  assert.ok(doc.get('crosshair').classList.contains('mythic'));
  assert.equal(doc.get('aliveValue').textContent, '09');
  assert.equal(doc.get('matchClock').textContent, '02:05');
  assert.equal(doc.get('pulseValue').textContent, 'PULSO 02');
  assert.equal(doc.get('medkitCount').textContent, '×1');
  assert.equal(doc.get('fragCount').textContent, '×1');
  assert.equal(doc.get('glooCount').textContent, '×1');
  assert.equal(doc.get('altValue').textContent, '079');
  assert.equal(doc.get('altPhase').textContent, 'QUEDA LIVRE');
  assert.equal(doc.get('knockCountdown').textContent, '7 s');
  assert.equal(doc.get('knockCountdown').attributes['aria-label'], 'Prazo para recuperação: 7 segundos');
  assert.equal(doc.get('knockOverlay').classList.contains('critical'), false);
  assert.equal(doc.get('knockFill').style.width, '100%');
  assert.equal(doc.get('reviveWrap').classList.contains('hidden'), false);
  assert.match(doc.get('abilityStatus').textContent, /Q · 0\.5 s/);
  assert.ok(doc.get('operativeAbility').classList.contains('unavailable'));
  assert.equal(doc.get('objPulse').classList.contains('done'), true);
  assert.equal(doc.get('objExtract').classList.contains('done'), true);
  assert.equal(doc.get('objKills').classList.contains('done'), true);
  assert.equal(doc.get('extractValue').textContent, '1 / 3');
  assert.ok(Number(doc.get('damageVignette').style.opacity) > 0);
  assert.equal(heartbeats, 1);
  assert.ok(ctx.clearRect);

  p.knockT = 1.4;
  p.reviveProgress = 0;
  p.dropPhase = 'parachute';
  p.abilityState.cooldownTicks = 0;
  p.weaponSkin = null;
  p.weapon = 'sucata';
  p.weaponAttachments = [];
  p.attachmentRarities = [];
  p.temporaryArmor = 0;
  p.reloadT = 1;
  p.ammoMag = 0;
  p.life = 100;
  p.alive = false;
  p.ads = false;
  p.moving = false;
  p.sprinting = false;
  p.extracted = 0;
  p.kills = 0;
  sim.aliveCount = undefined;
  sim.time = 60;
  hud.damageFlash = 0;
  hud.update(.1, {});
  assert.equal(doc.get('knockCountdown').textContent, '2 s');
  assert.equal(doc.get('knockOverlay').classList.contains('critical'), true);
  assert.equal(doc.get('reviveWrap').classList.contains('hidden'), true);
  assert.equal(doc.get('weaponIcon').classList.contains('mythic'), false);
  assert.equal(doc.get('crosshair').classList.contains('mythic'), false);
  assert.equal(hud.auraCombat, null);
  assert.equal(doc.body.dataset.aura, undefined);
  assert.equal(doc.get('altPhase').textContent, 'PARAQUEDAS');
  assert.equal(doc.get('reloadHint').classList.contains('visible'), true);
  assert.equal(doc.get('ammoMag').textContent, '∞');
  assert.equal(doc.get('ammoReserve').textContent, '');
  assert.equal(doc.get('aliveValue').textContent, String(sim.bots.filter((bot) => bot.alive).length).padStart(2, '0'));
  assert.equal(doc.get('abilityStatus').textContent, 'Q · PRONTA');
  assert.equal(doc.get('damageVignette').style.opacity, 0);
  assert.equal(heartbeats, 1);

  p.knocked = false;
  p.dropPhase = null;
  p.reloadT = 0;
  p.ammoMag = 7;
  p.life = 70;
  p.alive = true;
  p.weapon = 'unknown-weapon';
  p.weaponSkin = 'UNKNOWN';
  p.weaponAttachments = undefined;
  p.attachmentRarities = undefined;
  p.abilityState = undefined;
  hud.update(.1, {});
  assert.equal(doc.get('knockOverlay').classList.contains('hidden'), true);
  assert.equal(doc.get('weaponName').textContent, '—');
  assert.equal(doc.get('abilityStatus').textContent, 'Q · PRONTA');
  assert.equal(doc.get('altimeter').classList.contains('visible'), false);
});

test('HUD3D stages, replays and clears the court-ata timeline and end modal', () => {
  const timers = makeTimers();
  try {
    const { doc, hud } = makeHud();
    hud.showCourtAta(null);
    hud.showCourtAta({ id: 'CASE-1' });
    assert.equal(doc.get('courtAtaModal').classList.contains('hidden'), false);
    assert.ok(hud.ataNodes.length >= 5);
    assert.ok(hud.ataNodes[0].classList.contains('shown'));
    timers.runAll();
    assert.ok(hud.ataNodes.every((node) => node.classList.contains('shown')));
    hud.hideCourtAta();
    assert.equal(doc.get('courtAtaModal').classList.contains('hidden'), true);
    const caseRecord = {
      id: 'CASE-2', name: 'Soraya Hadd', status: 'julgado', motivo: 'evasao', world: 'Barburhen', day: 2,
      clock: '01:20', veredito: 'honras_de_guerra', juiz: 'Marechal', registro: 'honrado',
      evidencia: { evasoes: 1, incursoes: 4, kills: 3, xp: 120, patente: 'Sargento' },
      krc: { delta: 25, balance: 300, applied: true }, xpVeredito: 10, patenteFinal: 'Tenente',
    };
    hud.showCourtAta(caseRecord, {});
    assert.match(doc.get('ataTitle').textContent, /CASE-2/);
    hud.replayCourtAta();
    assert.ok(hud.ataNodes[0].classList.contains('shown'));
    hud.hideCourtAta();
    hud.replayCourtAta();

    hud.showEnd(true, { kills: 4, xp: 100, krc: 250 });
    assert.match(doc.get('endTitle').textContent, /SOBREVIVEU/);
    assert.ok(doc.get('endTitle').classList.contains('win'));
    assert.match(doc.get('endText').textContent, /4 abates/);
    hud.showEnd(false, { kills: 2, xp: 30, krc: 150, placement: 3, winner: 'ALEX' });
    assert.match(doc.get('endTitle').textContent, /ELIMINADO/);
    assert.equal(doc.get('endTitle').classList.contains('win'), false);
    assert.match(doc.get('endText').textContent, /Posição #3/);
    assert.match(doc.get('endText').textContent, /ALEX/);
    hud.hideEnd();
    assert.equal(doc.get('endModal').classList.contains('hidden'), true);
  } finally {
    timers.restore();
  }
});
