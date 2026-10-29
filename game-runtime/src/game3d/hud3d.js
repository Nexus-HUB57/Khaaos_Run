// Khaaos Run — HUD tático (estilo FreeFire): barras, munição, minimapa, killfeed,
// crosshair dinâmico, prompts de interação, modais ZU/fim e controles touch.
import { RARITIES } from '../shared/weapons.js';
import { WEAPONS3D, DBNO } from './sim3d.js';
import { getOperativeAbility } from './operativeAbilities.js';
import { buildAtaSteps, ATA_STEP_MS } from './courtAta.js';
import { MYTHIC_SKIN, MYTHIC_STAGE_NAMES, mythicSkinFor } from './attachments3d.js'; // Fase 30/32 — anexos + míticas por arma
import { RateLimiter } from './perf3d.js'; // Fase 35 — throttle do minimapa (achado G4)
import { hudAuraFor, shiftAuraHex, weaponIconVars, crosshairVars, killfeedVars, damageVars, seasonIndexFor, minimapTintFor } from './aura3d.js'; // F36-39 — aura sazonal do HUD + ícone + mira + killfeed/dano + minimapa

const ATTACH_SHORTS = { mira4x: '4X', silenciador: 'SIL', magestendida: 'MAG', gripvertical: 'GRP' };

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
    // Fase 35 — minimapa a 30 Hz (canvas 2D full-redraw a 60+ Hz custava
    // real em touch sem ganho perceptível — achado G4 da revisão GFX/UX)
    this.mmLimiter = new RateLimiter(33);
    this.auraCombat = null; // F39 — vars da temporada p/ killfeed/números (decisão PURA no update)
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

  setAbility(operativeId, online = false) {
    this.operativeId = operativeId;
    this.abilityOnline = online;
    const ability = getOperativeAbility(operativeId);
    const name = $('#abilityName');
    const status = $('#abilityStatus');
    const chip = $('#operativeAbility');
    if (name) name.textContent = ability.name.toLocaleUpperCase('pt-BR');
    // Fase 8 — habilidade autoritativa também no online (cooldown vem do snapshot)
    if (status) status.textContent = 'Q · PRONTA';
    if (chip) chip.title = online
      ? `${ability.description} (autoritativa no servidor)`
      : ability.description;
  }

  feed(who, msg, cls = '') {
    const el = document.createElement('div');
    el.className = `feed-entry ${cls}`;
    el.innerHTML = `<b>${who} //</b> ${msg}`;
    const list = $('#feedList');
    list.prepend(el);
    while (list.children.length > 6) list.lastChild.remove();
  }

  killfeed(killer, victim, head, isPlayerKill, knock = false) {
    const el = document.createElement('div');
    el.className = `kill-entry ${isPlayerKill ? 'mine' : ''}`;
    el.innerHTML = `<span>${killer}</span><i>${knock ? '◌ NOCAUTE' : head ? '☠ HEADSHOT' : '✕'}</i><span>${victim}</span>`;
    // F39 — festival sazonal: só as eliminações do PRÓPRIO jogador (a aura é
    // a skin EQUIPADA — ela celebra a eli do jogador, não o que ele assiste).
    // Variáveis injetadas no elemento: borda na IDENTIDADE (--kf-aura), ícone
    // no glow da ESTAÇÃO (--kf-season), ritmo da entrada pela temporada
    // (--kf-dur). Sem aura/mythic: killfeed neutro (custo 0).
    if (isPlayerKill && this.auraCombat) {
      el.classList.add('mythic');
      el.style.setProperty('--kf-aura', this.auraCombat.aura);
      el.style.setProperty('--kf-season', this.auraCombat.season);
      el.style.setProperty('--kf-dur', this.auraCombat.dur);
    }
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
    const armorTotal = Math.max(0, p.armor + (p.temporaryArmor || 0));
    $('#armorBar').style.width = `${Math.min(100, armorTotal)}%`;
    $('#armorValue').textContent = `${Math.round(armorTotal)}`;
    $('#armorValue').title = p.temporaryArmor > 0 ? `${Math.round(p.armor)} VD permanente + ${Math.round(p.temporaryArmor)} temporária` : '';
    $('#lifeBar').classList.toggle('low', p.life < 30);
    // arma
    const w = WEAPONS3D[p.weapon];
    $('#weaponName').textContent = w?.name ?? '—';
    // Fase 30 — a cor segue a SKIN coletada (MÍTICA pinta o painel de rosa-caos)
    const rar = RARITIES[p.weaponSkin ?? w?.rarity] ?? RARITIES[w?.rarity] ?? null;
    $('#weaponName').style.color = rar?.color ?? '#e8e3d5';
    // Fase 37 — ÍCONE da arma no inventário: silhueta pela CATEGORIA da arma
    // e cor da raridade coletada (mesma fonte do #weaponName — leitura única
    // de "o que tenho na mão"). Sem skin mítica o ícone é neutro (custo 0);
    // com mítica, o festival sazonal entra no bloco do #mythicStage abaixo.
    const iconEl = $('#weaponIcon');
    if (iconEl) {
      iconEl.dataset.cat = w?.category ?? 'sidearm';
      iconEl.style.setProperty('--wi', rar?.color ?? '#e8e3d5');
    }
    $('#ammoMag').textContent = p.weapon === 'sucata' ? '∞' : p.ammoMag;
    $('#ammoReserve').textContent = p.weapon === 'sucata' ? '' : `/ ${p.inventory.ammo[w?.ammo] ?? 0}`;
    // Fase 30/32 — faixa de anexos com CHIP de raridade (gasto→dourado) +
    // estágio da skin mítica da ARMA (catálogo MYTHIC_SKINS)
    const strip = $('#attachStrip');
    if (strip) {
      const atts = p.weaponAttachments ?? [];
      const attRars = p.attachmentRarities ?? [];
      strip.innerHTML = atts.map((a, i) => {
        const rc = RARITIES[attRars[i]]?.color ?? null;
        const title = `${ATTACH_SHORTS[a] ?? a}${attRars[i] ? ` · ${attRars[i]}` : ''}`;
        return `<i title="${title}"${rc ? ` style="border-color:${rc};box-shadow:0 0 5px ${rc}66"` : ''}>${ATTACH_SHORTS[a] ?? '?'}</i>`;
      }).join('');
      strip.classList.toggle('filled', atts.length > 0);
    }
    const mythicEl = $('#mythicStage');
    if (mythicEl) {
      const mDef = mythicSkinFor(p.weapon);
      const mythic = !!mDef && p.weaponSkin === MYTHIC_SKIN.id;
      mythicEl.classList.toggle('hidden', !mythic);
      // F36 — estado SAZONAL do HUD: quando há skin mítica equipada, o corpo
      // recebe data-aura + data-aura-season e as variáveis CSS (--aura/
      // --aura-season/--aura-dur) — a vinheta #auraVignette e o ritmo do
      // festival seguem a estação. Sem skin mítica: corpo limpo (custo 0,
      // decisão PURA de aura3d.hudAuraFor — testável headless).
      const aura = mythic ? hudAuraFor({ weaponId: p.weapon, weaponSkin: p.weaponSkin, mythicStage: p.mythicStage || 1 }) : null;
      if (mythic && aura) {
        mythicEl.textContent = `EV.${p.mythicStage || 1} · ${MYTHIC_STAGE_NAMES[(p.mythicStage || 1) - 1]}`;
        mythicEl.style.color = mDef.aura; // Fase 32 — badge na cor da aura da skin
        // Fase 34/36 — efeito SAZONAL por aura: anel de brilho girando +
        // shimmer de festival na cor PRÓPRIA da arma, RITMO da estação (CSS
        // lê --aura/--aura-dur; anima só quando o badge está visível).
        mythicEl.style.setProperty('--aura', mDef.aura);
        mythicEl.style.setProperty('--aura-season', shiftAuraHex(mDef.aura, aura.hueShift));
        mythicEl.style.setProperty('--aura-dur', String(aura.durMul));
        const body = document.body;
        if (body) {
          body.dataset.aura = mDef.aura;
          body.dataset.auraSeason = aura.season;
          body.style.setProperty('--aura', mDef.aura);
          body.style.setProperty('--aura-season', shiftAuraHex(mDef.aura, aura.hueShift));
        }
        // F39 — variáveis de COMBATE da temporada (killfeed + números de
        // dano): decisão PURA killfeedVars/damageVars (mesma fonte do
        // badge/vinheta/mira/ícone), consumidas por hud.killfeed (entries do
        // jogador) e pelo pool DamageNumbers3D (main3d repassa 1×/frame).
        const kfVars = killfeedVars(aura, mDef.aura);
        const dgVars = damageVars(aura, mDef.aura);
        this.auraCombat = kfVars && dgVars
          ? Object.freeze({ aura: kfVars.aura, season: kfVars.season, dur: kfVars.dur })
          : null;
        // Fase 37 — o ÍCONE da arma entra no festival: MESMAS variáveis da
        // temporada (decisão PURA weaponIconVars — fonte única com badge/
        // vinheta), glow e varredura na cor tingida pela estação. Sem mítica
        // ou sem hex válido: limpa e volta ao ícone neutro (custo 0).
        const iconVars = weaponIconVars(aura, mDef.aura);
        const iconEl2 = $('#weaponIcon');
        if (iconEl2) {
          if (iconVars) {
            iconEl2.classList.add('mythic');
            iconEl2.style.setProperty('--aura', iconVars.aura);
            iconEl2.style.setProperty('--aura-season', iconVars.season);
            iconEl2.style.setProperty('--aura-dur', iconVars.dur);
          } else {
            iconEl2.classList.remove('mythic');
            iconEl2.style.removeProperty('--aura');
            iconEl2.style.removeProperty('--aura-season');
            iconEl2.style.removeProperty('--aura-dur');
          }
        }
        // Fase 38 — a MIRA entra no festival: braços na cor da SKIN
        // (--ch-aura), ponto + glow na cor da ESTAÇÃO (--ch-season) e anel
        // cônico no ritmo --ch-dur (CSS do #crosshair.mythic). Elemento de
        // combate: decisão PURA crosshairVars (mesma fonte do badge/ícone);
        // sem hex válido → limpa e volta à mira neutra (custo 0).
        const chVars = crosshairVars(aura, mDef.aura);
        const chEl = $('#crosshair');
        if (chEl) {
          if (chVars) {
            chEl.classList.add('mythic');
            chEl.style.setProperty('--ch-aura', chVars.aura);
            chEl.style.setProperty('--ch-season', chVars.season);
            chEl.style.setProperty('--ch-dur', chVars.dur);
          } else {
            chEl.classList.remove('mythic');
            chEl.style.removeProperty('--ch-aura');
            chEl.style.removeProperty('--ch-season');
            chEl.style.removeProperty('--ch-dur');
          }
        }
      } else if (!mythic) {
        const body = document.body;
        if (body?.dataset.aura) {
          delete body.dataset.aura;              // volta ao HUD neutro (custo 0)
          delete body.dataset.auraSeason;
        }
        this.auraCombat = null;                  // F39 — killfeed/números neutros (custo 0)
        // Fase 37 — ícone volta ao neutro junto com o corpo (custo 0)
        const iconEl3 = $('#weaponIcon');
        if (iconEl3?.classList.contains('mythic')) {
          iconEl3.classList.remove('mythic');
          iconEl3.style.removeProperty('--aura');
          iconEl3.style.removeProperty('--aura-season');
          iconEl3.style.removeProperty('--aura-dur');
        }
        // Fase 38 — mira volta ao neutro junto com o corpo (custo 0)
        const chEl2 = $('#crosshair');
        if (chEl2?.classList.contains('mythic')) {
          chEl2.classList.remove('mythic');
          chEl2.style.removeProperty('--ch-aura');
          chEl2.style.removeProperty('--ch-season');
          chEl2.style.removeProperty('--ch-dur');
        }
      }
    }
    const reloading = p.reloadT > 0;
    $('#reloadHint').classList.toggle('visible', reloading || (!reloading && p.ammoMag === 0));
    $('#reloadHint').textContent = reloading ? 'RECARREGANDO…' : 'SEM MUNIÇÃO — [R]';
    // topo
    // M3 — AOI: com fan-out por área de interesse o array bots NÃO contém todos
    // os vivos do ring; o snapshot traz aliveCount autoritativo — usa-o quando
    // existir (online), mantém a contagem local no modo offline.
    const alive = s.aliveCount ?? (s.bots.filter(b => b.alive).length + (p.alive ? 1 : 0));
    $('#aliveValue').textContent = String(alive).padStart(2, '0');
    const mm = Math.floor(s.time / 60), ss = Math.floor(s.time % 60);
    $('#matchClock').textContent = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    $('#pulseValue').textContent = `PULSO ${String(s.ring.pulse).padStart(2, '0')}`;
    $('#krcValue').textContent = String(p.krc).padStart(4, '0');
    $('#xpValue').textContent = String(p.xp).padStart(4, '0');
    $('#killsValue').textContent = String(p.kills).padStart(2, '0');
    // medkits
    $('#medkitCount').textContent = `×${p.inventory.medkit}`;
    // Fase 4 — arremessáveis táticos (G/F)
    $('#fragCount').textContent = `×${p.inventory.frag ?? 0}`;
    $('#glooCount').textContent = `×${p.inventory.gloo ?? 0}`;
    // Fase 4 — altímetro da infiltração aérea
    const dropping = !!p.dropPhase;
    $('#altimeter').classList.toggle('visible', dropping);
    if (dropping) {
      const alt = Math.max(0, Math.round(p.y));
      $('#altValue').textContent = String(alt).padStart(3, '0');
      $('#altPhase').textContent = p.dropPhase === 'sky' ? 'QUEDA LIVRE' : 'PARAQUEDAS';
      $('#altFill').style.width = `${Math.min(100, (alt / 140) * 100)}%`;
    }
    // Fase 7 — overlay de nocaute (DBNO): contador de sangramento + progresso do revive
    const knocked = !!p.knocked;
    $('#knockOverlay')?.classList.toggle('hidden', !knocked);
    if (knocked) {
      const max = DBNO.bleedOutSeconds * Math.pow(DBNO.bleedOutDecay, Math.max(0, (p.downedCount ?? 1) - 1));
      $('#knockFill').style.width = `${Math.max(0, Math.min(100, ((p.knockT ?? 0) / max) * 100))}%`;
      const prog = p.reviveProgress ?? 0;
      $('#reviveWrap')?.classList.toggle('hidden', prog <= 0);
      if (prog > 0) $('#reviveFill').style.width = `${Math.min(100, (prog / DBNO.reviveSeconds) * 100)}%`;
    }
    const ability = getOperativeAbility(p.operativeId || this.operativeId);
    const abilityStatus = $('#abilityStatus');
    const abilityChip = $('#operativeAbility');
    if (abilityStatus && abilityChip) {
      // Fase 8 — habilidade funcional nos dois modos: offline resolve na sim local;
      // online o estado vem do snapshot autoritativo (abilityState do servidor)
      const remaining = Math.max(0, p.abilityState?.cooldownTicks || 0) / (s.tickRate || 30);
      abilityStatus.textContent = remaining > 0 ? `Q · ${remaining.toFixed(1)} s` : 'Q · PRONTA';
      abilityChip.classList.toggle('unavailable', remaining > 0);
    }
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
    // minimapa (Fase 35 — 30 Hz; o mundo 3D é interpolado, ninguém lê 60 Hz de radar)
    if (this.mmLimiter.ready()) this.#drawMinimap();
  }

  // Fase 35 — telemetria de performance no HUD (FPS médio + escala DRS + tier).
  // Chamada a 2 Hz pelo main3d; elemento escondido por padrão (setting KR_GFX fps).
  setPerf(fps, scale, tier) {
    const el = $('#perfReadout');
    if (!el) return;
    if (fps == null) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const pct = Math.round((scale ?? 1) * 100);
    el.textContent = `${Math.round(fps)} FPS · RES ${pct}% · ${String(tier ?? '').toUpperCase()}`;
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
    // F39 — TINT SAZONAL POR ESTAÇÃO: o radar obedece ao CALENDÁRIO (mesma
    // fonte da vinheta — seasonIndexFor). Semáforos funcionais (terminais,
    // loot, recon, jogador, anéis) NUNCA mudam — a estação tinge só as
    // camadas decorativas: fundo, grade, véu e a moldura do painel.
    const tint = minimapTintFor(seasonIndexFor(new Date()));
    const frame = this.minimap?.parentElement;
    if (frame) {
      frame.classList.add('seasonal');
      frame.style.setProperty('--mm-edge', tint.edge);
    }
    // fundo
    ctx.fillStyle = 'rgba(10,10,16,.72)';
    ctx.fillRect(-size / 2, -size / 2, size, size);
    // grid — cor da ESTAÇÃO (antes roxo fixo)
    ctx.strokeStyle = tint.grid; ctx.lineWidth = 1;
    for (let g = -200; g <= 200; g += 50) {
      ctx.beginPath(); ctx.moveTo(g * scale, -size / 2); ctx.lineTo(g * scale, size / 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-size / 2, g * scale); ctx.lineTo(size / 2, g * scale); ctx.stroke();
    }
    // véu da estação sobre fundo+grade (ANTES dos marcadores funcionais —
    // alpha ≤ .12: leitura tática preservada, temporada presente)
    ctx.fillStyle = tint.overlay;
    ctx.fillRect(-size / 2, -size / 2, size, size);
    // anel alvo (tracejado) + atual
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255,107,44,.75)';
    ctx.beginPath(); ctx.arc(s.ring.x * scale, s.ring.z * scale, s.ring.target * scale, 0, 7); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(200,255,61,.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.ring.x * scale, s.ring.z * scale, s.ring.radius * scale, 0, 7); ctx.stroke();
    // terminais
    for (const t of s.terminals) {
      const abilityState = p.abilityState;
      const scanned = abilityState?.effect === 'terminalScan' && abilityState.activeTicks > 0 && abilityState.targetTerminalId === t.id;
      ctx.fillStyle = scanned ? '#ffb52e' : (t.active ? '#39ff88' : 'rgba(90,90,90,.5)');
      if (scanned) { ctx.beginPath(); ctx.arc(t.x * scale, t.z * scale, 7, 0, Math.PI * 2); ctx.strokeStyle = '#ffb52e'; ctx.stroke(); }
      ctx.fillRect(t.x * scale - 2.5, t.z * scale - 2.5, 5, 5);
    }
    // contatos de reconhecimento somente enquanto a marca determinística está ativa
    // (offline: revealedTicks; online: flag revealed do snapshot — Fase 8)
    ctx.fillStyle = '#ffb52e';
    for (const bot of s.bots) if (bot.alive && (bot.revealedTicks > 0 || bot.revealed)) {
      ctx.beginPath(); ctx.arc(bot.x * scale, bot.z * scale, 3.5, 0, Math.PI * 2); ctx.fill();
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

  // Fase 26 — BARRA DE HP do alvo quebrável (porta/janela) no alcance.
  // info = null esconde; senão { label, hp, max, cls } — cls pinta a barra
  // (metal = aço, wood = âmbar, glass = ciano-vidro). Igual à vida do jogador:
  // atualização por frame, zero reflow além do width da barra.
  target(info) {
    const el = $('#targetPanel');
    if (!el) return;
    if (!info || !info.max) { el.classList.remove('visible'); return; }
    $('#targetLabel').textContent = info.label;
    $('#targetHp').textContent = `${info.hp}/${info.max}`;
    el.dataset.mat = info.cls || 'wood';
    const pct = Math.max(0, Math.min(100, (info.hp / info.max) * 100));
    $('#targetFill').style.width = `${pct}%`;
    el.classList.toggle('low', pct <= 34);
    el.classList.add('visible');
  }

  showZu() { $('#zuModal').classList.remove('hidden'); }
  hideZu() { $('#zuModal').classList.add('hidden'); }
  // Fase 5 — barra do espectador
  showSpectator({ name, placement } = {}) {
    $('#spectatorBar')?.classList.remove('hidden');
    if (name) $('#specName').textContent = name;
    $('#specPlacement').textContent = placement ? `#${placement}` : '';
  }
  updateSpectator(name) {
    const el = $('#specName');
    if (el && name) el.textContent = name;
  }
  hideSpectator() { $('#spectatorBar')?.classList.add('hidden'); }
  // ---------- Fase 13 — replay da ata da Corte Marcial (jogador eliminado) ----------
  // Renderiza a ata do caso e a reproduz encenada (passos revelados em ritmo
  // fixo; clique adianta; botão reproduz novamente). Best-effort: nunca bloqueia.
  showCourtAta(caso, extra = {}) {
    const modal = $('#courtAtaModal');
    const timeline = $('#ataTimeline');
    if (!modal || !timeline || !caso) return;
    this.#clearAtaTimers();
    $('#ataTitle').textContent = `ATA DO CASO ${caso.id ?? '—'}`;
    const steps = buildAtaSteps(caso, extra);
    timeline.innerHTML = '';
    const nodes = steps.map((step) => {
      const el = document.createElement('div');
      el.className = `ata-step${step.cls ? ` ${step.cls}` : ''}`;
      const h = document.createElement('h4');
      h.textContent = step.tag;
      el.appendChild(h);
      for (const line of step.lines) {
        const p = document.createElement('p');
        p.className = 'ata-line';
        p.textContent = line;
        el.appendChild(p);
      }
      timeline.appendChild(el);
      return el;
    });
    this.ataNodes = nodes;
    this.ataCase = { caso, extra };
    modal.classList.remove('hidden');
    this.#playAta();
  }

  #playAta() {
    const nodes = this.ataNodes ?? [];
    nodes.forEach((n) => n.classList.remove('shown'));
    this.#clearAtaTimers();
    let i = 0;
    const reveal = () => {
      if (i < nodes.length) {
        nodes[i].classList.add('shown');
        i += 1;
        this.ataTimers.push(setTimeout(reveal, ATA_STEP_MS));
      }
    };
    reveal();
  }

  #clearAtaTimers() {
    (this.ataTimers ?? []).forEach(clearTimeout);
    this.ataTimers = [];
  }

  hideCourtAta() {
    this.#clearAtaTimers();
    $('#courtAtaModal')?.classList.add('hidden');
  }

  replayCourtAta() {
    if (this.ataCase) this.showCourtAta(this.ataCase.caso, this.ataCase.extra);
  }

  // Disponibilidade da ata: botões do espectador e do end modal aparecem só
  // quando existe caso do próprio jogador (eliminado → caso aberto pelo POJ).
  setCourtAtaAvailable(on) {
    $('#specAta')?.classList.toggle('hidden', !on);
    $('#endAtaBtn')?.classList.toggle('hidden', !on);
  }

  showEnd(win, stats) {
    const m = $('#endModal');
    m.classList.remove('hidden');
    const placement = stats?.placement && !win ? ` Posição #${stats.placement} entre os operativos do ring.` : '';
    const winner = stats?.winner && !win ? ` Vencedor do ring: ${stats.winner}.` : '';
    $('#endTitle').textContent = win ? 'VOCÊ SOBREVIVEU AO RING' : 'VOCÊ FOI ELIMINADO';
    $('#endTitle').classList.toggle('win', win);
    $('#endText').textContent = win
      ? `Seed ${this.seed} concluída. ${stats.kills} abates, ${stats.xp} XP e ${stats.krc} KRC garantidos. O Marechal aguarda seu retorno ao QG.`
      : `A mensagem de misericórdia aguarda no QG-War'I. ${stats.kills} abates antes da queda.${placement}${winner} O replay desta tentativa fica disponível no console.`;
  }
  hideEnd() { $('#endModal').classList.add('hidden'); }
  setMatchStatus(txt) { $('#matchStatus').textContent = txt; }

  dispose() { /* DOM é recriado a cada partida via location.reload-free reset */ }
}
