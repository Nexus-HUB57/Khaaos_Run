// Khaaos Run — HUD tático (estilo FreeFire): barras, munição, minimapa, killfeed,
// crosshair dinâmico, prompts de interação, modais ZU/fim e controles touch.
import { RARITIES } from '../shared/weapons.js';
import { WEAPONS3D } from './sim3d.js';

const $ = (sel) => document.querySelector(sel);

export class HUD {
  constructor({ sim, seed, onEntry, onRestart, onReplayExport }) {
    this.sim = sim; this.seed = seed;
    this.onEntry = onEntry; this.onRestart = onRestart; this.onReplayExport = onReplayExport;
    this.minimap = $('#minimap');
    this.mmCtx = this.minimap?.getContext('2d');
    this.lastHeartbeat = 0;
    this.damageFlash = 0;
    this.hitmarkerT = 0;
    this.#bindButtons();
  }

  #bindButtons() {
    $('#beltBtn')?.addEventListener('click', () => { this.uiClick(); this.onEntry('belt'); });
    $('#rushBtn')?.addEventListener('click', () => { this.uiClick(); this.onEntry('rush'); });
    $('#endBtn')?.addEventListener('click', () => { this.uiClick(); this.onRestart(); });
    $('#replayBtn')?.addEventListener('click', () => this.onReplayExport?.());
    $('#seedInput').value = this.seed;
    $('#seedInput')?.addEventListener('change', (e) => {
      this.onRestart(e.target.value.trim() || this.seed);
    });
    document.querySelectorAll('[data-key]').forEach(btn => {
      const key = btn.dataset.key;
      const set = (v) => (e) => { e.preventDefault(); this.touchState ??= {}; this.touchState[key] = v; };
      btn.addEventListener('touchstart', set(true), { passive: false });
      btn.addEventListener('touchend', set(false), { passive: false });
      btn.addEventListener('touchcancel', set(false), { passive: false });
    });
    // joystick touch
    const stick = $('#joyBase'), knob = $('#joyKnob');
    if (stick && knob) {
      const rect = () => stick.getBoundingClientRect();
      this.joy = { active: false, dx: 0, dy: 0, id: null };
      const start = (e) => {
        this.joy.active = true; this.joy.id = e.pointerId;
        stick.setPointerCapture(e.pointerId);
        this.#joyMove(e);
      };
      stick.addEventListener('pointerdown', start);
      stick.addEventListener('pointermove', (e) => { if (this.joy.active && e.pointerId === this.joy.id) this.#joyMove(e); });
      const end = (e) => {
        if (e.pointerId !== this.joy.id) return;
        this.joy.active = false; this.joy.dx = 0; this.joy.dy = 0;
        knob.style.transform = 'translate(-50%,-50%)';
      };
      stick.addEventListener('pointerup', end);
      stick.addEventListener('pointercancel', end);
    }
  }
  #joyMove(e) {
    const r = this._stickRect ??= $('#joyBase').getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    this.joy.dx = dx; this.joy.dy = dy;
    const knob = $('#joyKnob');
    knob.style.transform = `translate(calc(-50% + ${dx * 34}px), calc(-50% + ${dy * 34}px))`;
  }
  uiClick() { this.audio?.ui?.(); }

  feed(who, msg, cls = '') {
    const el = document.createElement('div');
    el.className = `feed-entry ${cls}`;
    el.innerHTML = `<b>${who} //</b> ${msg}`;
    const list = $('#feedList');
    list.prepend(el);
    while (list.children.length > 6) list.lastChild.remove();
  }

  killfeed(killer, victim, head, isPlayerKill) {
    const el = document.createElement('div');
    el.className = `kill-entry ${isPlayerKill ? 'mine' : ''}`;
    el.innerHTML = `<span>${killer}</span><i>${head ? '☠ HEADSHOT' : '✕'}</i><span>${victim}</span>`;
    const list = $('#killfeed');
    list.prepend(el);
    while (list.children.length > 4) list.lastChild.remove();
    setTimeout(() => el.remove(), 6000);
  }

  hitmarker(head) {
    this.hitmarkerT = head ? .28 : .16;
    const hm = $('#hitmarker');
    hm.classList.toggle('head', !!head);
    hm.classList.add('show');
    clearTimeout(this._hmT);
    this._hmT = setTimeout(() => hm.classList.remove('show'), head ? 280 : 160);
  }

  update(dt, input) {
    const s = this.sim, p = s.player;
    // barras
    $('#lifeBar').style.width = `${Math.max(0, p.life)}%`;
    $('#lifeValue').textContent = `${Math.max(0, Math.round(p.life))}`;
    $('#armorBar').style.width = `${Math.max(0, p.armor)}%`;
    $('#armorValue').textContent = `${Math.max(0, Math.round(p.armor))}`;
    $('#lifeBar').classList.toggle('low', p.life < 30);
    // arma
    const w = WEAPONS3D[p.weapon];
    $('#weaponName').textContent = w?.name ?? '—';
    const rar = w ? RARITIES[w.rarity] : null;
    $('#weaponName').style.color = rar?.color ?? '#e8e3d5';
    $('#ammoMag').textContent = p.weapon === 'sucata' ? '∞' : p.ammoMag;
    $('#ammoReserve').textContent = p.weapon === 'sucata' ? '' : `/ ${p.inventory.ammo[w?.ammo] ?? 0}`;
    const reloading = p.reloadT > 0;
    $('#reloadHint').classList.toggle('visible', reloading || (!reloading && p.ammoMag === 0));
    $('#reloadHint').textContent = reloading ? 'RECARREGANDO…' : 'SEM MUNIÇÃO — [R]';
    // topo
    const alive = s.bots.filter(b => b.alive).length + (p.alive ? 1 : 0);
    $('#aliveValue').textContent = String(alive).padStart(2, '0');
    const mm = Math.floor(s.time / 60), ss = Math.floor(s.time % 60);
    $('#matchClock').textContent = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    $('#pulseValue').textContent = `PULSO ${String(s.ring.pulse).padStart(2, '0')}`;
    $('#krcValue').textContent = String(p.krc).padStart(4, '0');
    $('#xpValue').textContent = String(p.xp).padStart(4, '0');
    $('#killsValue').textContent = String(p.kills).padStart(2, '0');
    // medkits
    $('#medkitCount').textContent = `×${p.inventory.medkit}`;
    // objetivos
    $('#objPulse').classList.toggle('done', s.ring.pulse >= 1);
    $('#objExtract').classList.toggle('done', p.extracted >= 1);
    $('#objKills').classList.toggle('done', p.kills >= 3);
    $('#extractValue').textContent = `${p.extracted} / 3`;
    // vignette de dano
    if (this.damageFlash > 0) {
      this.damageFlash -= dt;
      $('#damageVignette').style.opacity = Math.max(0, this.damageFlash * 2.2);
    } else $('#damageVignette').style.opacity = 0;
    // batimento com vida baixa
    if (p.alive && p.life < 30 && p.life > 0) {
      this.lastHeartbeat -= dt;
      if (this.lastHeartbeat <= 0) { this.audio?.heartbeat?.(); this.lastHeartbeat = .9; }
    }
    // crosshair dinâmico — abre com movimento/tiro
    const spreadPx = this.#crosshairSpread(input);
    document.documentElement.style.setProperty('--ch-gap', `${spreadPx}px`);
    // minimapa
    this.#drawMinimap();
  }

  #crosshairSpread(input) {
    const w = WEAPONS3D[this.sim.player.weapon];
    const base = 6;
    if (!w) return base;
    let s = w.spread * 900;
    if (this.sim.player.ads) s *= .4;
    if (this.sim.player.moving) s *= 1.5;
    if (this.sim.player.sprinting) s *= 1.8;
    return Math.round(base + s);
  }

  #drawMinimap() {
    const ctx = this.mmCtx, size = this.minimap.width;
    const s = this.sim, p = s.player;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2, size / 2);
    const scale = size / 420; // mundo 400m
    // fundo
    ctx.fillStyle = 'rgba(10,10,16,.72)';
    ctx.fillRect(-size / 2, -size / 2, size, size);
    // grid
    ctx.strokeStyle = 'rgba(122,90,158,.18)'; ctx.lineWidth = 1;
    for (let g = -200; g <= 200; g += 50) {
      ctx.beginPath(); ctx.moveTo(g * scale, -size / 2); ctx.lineTo(g * scale, size / 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-size / 2, g * scale); ctx.lineTo(size / 2, g * scale); ctx.stroke();
    }
    // anel alvo (tracejado) + atual
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255,107,44,.75)';
    ctx.beginPath(); ctx.arc(s.ring.x * scale, s.ring.z * scale, s.ring.target * scale, 0, 7); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(200,255,61,.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.ring.x * scale, s.ring.z * scale, s.ring.radius * scale, 0, 7); ctx.stroke();
    // terminais
    for (const t of s.terminals) {
      ctx.fillStyle = t.active ? '#39ff88' : 'rgba(90,90,90,.5)';
      ctx.fillRect(t.x * scale - 2.5, t.z * scale - 2.5, 5, 5);
    }
    // loot
    ctx.fillStyle = 'rgba(66,217,222,.8)';
    for (const i of s.loot) if (i.active) ctx.fillRect(i.x * scale - 1, i.z * scale - 1, 2, 2);
    // jogador (seta com rotação do yaw)
    ctx.save();
    ctx.translate(p.x * scale, p.z * scale);
    ctx.rotate(-p.yaw + Math.PI);
    ctx.fillStyle = '#ffd28a';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-4.5, 5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  prompt(text) {
    const el = $('#interactPrompt');
    if (text) { el.textContent = text; el.classList.add('visible'); }
    else el.classList.remove('visible');
  }

  showZu() { $('#zuModal').classList.remove('hidden'); }
  hideZu() { $('#zuModal').classList.add('hidden'); }
  showEnd(win, stats) {
    const m = $('#endModal');
    m.classList.remove('hidden');
    $('#endTitle').textContent = win ? 'VOCÊ SOBREVIVEU AO RING' : 'VOCÊ FOI ELIMINADO';
    $('#endTitle').classList.toggle('win', win);
    $('#endText').textContent = win
      ? `Seed ${this.seed} concluída. ${stats.kills} abates, ${stats.xp} XP e ${stats.krc} KRC garantidos. O Marechal aguarda seu retorno ao QG.`
      : `A mensagem de misericórdia aguarda no QG-War'I. ${stats.kills} abates antes da queda. O replay desta tentativa fica disponível no console.`;
  }
  hideEnd() { $('#endModal').classList.add('hidden'); }
  setMatchStatus(txt) { $('#matchStatus').textContent = txt; }

  dispose() { /* DOM é recriado a cada partida via location.reload-free reset */ }
}
