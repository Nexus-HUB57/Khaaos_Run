// Khaaos Run — Fase 11/26 — ZU: chegada de TREM no Ring + DESLIZAMENTO (derail).
//
// Fase 34 — anatomia de TREM DE PASSAGEIROS (formato canônico Zu): nariz
// aerodinâmico (elipsoide + para-brisa curvo), salão com janelas INDIVIDUAIS,
// portas de folha dupla com luminoso, teto curvo (calota cilíndrica) com
// ar-condicionado, pantógrafo no vagão central, gangues (fole) entre veículos
// e lituraria âmbar/ácido (assinatura Khaaos). O nariz aponta para o SENTIDO
// DO MOVIMENTO (yaw0 do carro-cabine).
//
// Dois modos, mesma classe:
//   • mode 'pass' (default — compatível com Fase 11/12/16): o trem cruza a zona
//     e desembarca o esquadrão na infiltração aérea. APENAS visual + câmera;
//     nenhum input é bloqueado; timeline determinística e sincronizável via
//     startAt (anúncio autoritativo do servidor). Contrato público intocado.
//   • mode 'derail' (Fase 26, offline): cinemática interativa — cabine 1ª pessoa,
//     QTE de emergência ([1] CINTO · [2] SALTAR · timeout = falha), descarrilo
//     em bullet-time com destroços determinísticos, incêndio no destino, strobes
//     de emergência, faíscas nos bogies, áudio sintetizado (rumble/crash/alarme/
//     tinnitus) e CAIXAS RESGATÁVEIS ao redor do destroço (vira loot real via
//     onDone → main3d, offline: a sim local é autoritativa).
//
// Determinismo: TODAS as posições são funções puras do tempo t (destroços em
// balística fechada, sem integração por estado), semeado pelo spawn. O modo
// online permanece em 'pass' — consequências de QTE nunca rodam no cliente
// remoto (o servidor segue autoritativo).
import * as THREE from 'three';
import { TRAIN_INTRO_DURATION_MS } from '../shared/clock.js';

const TIMELINE = Object.freeze({
  APPROACH: 0,      // trem surge na borda, câmera acompanha
  OVERSPAWN: 2.0,   // trem cruza a zona de desembarque (pico da cena)
  SETTLE: TRAIN_INTRO_DURATION_MS / 1000, // handover para a câmera do jogador
  DURATION: TRAIN_INTRO_DURATION_MS / 1000,
});

// Fase 26 — timeline do modo 'derail' (estende a base de 3.4 s).
const DT_ = Object.freeze({
  HANDOVER_CHASE: TRAIN_INTRO_DURATION_MS / 1000, // 3.4 — entra na cabine
  QTE_OPEN: 4.6,    // prompt de decisão aparece
  QTE_CLOSE: 5.75,  // fim da janela de reação
  DERAIL: 5.8,      // impacto + bullet-time
  BULLET_END: 7.4,  // fim do bullet-time (escala temporal volta a 1)
  SETTLE: 8.8,      // câmera 3ª pessoa converge para o spawn
  DURATION: 10.6,   // handover final
  BULLET_SCALE: 0.32,
  SCATTER: 1.6,     // segundos de espalhamento dos veículos pós-impacto
});

// Consequências canônicas do QTE (contrato de teste):
// cinto = seguro porém atordoado; saltar = custo de vida, controle imediato;
// falha (timeout) = pior dos dois mundos.
const QTE_OUTCOMES = Object.freeze({
  seatbelt: Object.freeze({ choice: 'seatbelt', hpCost: 0, stunSeconds: 2.5 }),
  jump: Object.freeze({ choice: 'jump', hpCost: 20, stunSeconds: 0 }),
  fail: Object.freeze({ choice: 'fail', hpCost: 35, stunSeconds: 3.5 }),
});

// hash determinístico (spawn semeia o espalhamento — mesmos inputs, mesmo frame)
function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

export class TrainIntro {
  // spawn = { x, z } do jogador local; onDone chamado UMA vez no fim/skip —
  // no modo 'derail' recebe o outcome do QTE ({ choice, hpCost, stunSeconds })
  // ou null (skip sem consequência). startAt (s) = entrada sincronizada (pass).
  constructor({ scene, spawn = { x: 0, z: 118 }, onDone = null, skippable = true, startAt = 0, mode = 'pass', audio = null } = {}) {
    this.scene = scene;
    this.spawn = spawn;
    this.onDone = onDone;
    this.skippable = skippable;
    this.mode = mode === 'derail' ? 'derail' : 'pass';
    this.audio = audio;
    this.t = Math.max(0, Number(startAt) || 0);
    this.done = false;
    this.outcome = null;        // QTE: null até decidido/timeout
    this.qteOpen = false;
    this.crateLoot = null;      // itens resgatáveis (derail; consumidos pelo main3d)
    this.group = new THREE.Group();
    this.group.name = 'zu-train-intro';
    this.#build();
    scene.add(this.group);
    this._skip = (e) => {
      // Fase 26/28 — durante a janela do QTE a decisão é SOBRE a cinemática:
      // teclado 1/2/c/e decide, clique/touch fora decidem via botões
      // (stopPropagation) e QUALQUER OUTRA tecla é ignorada — nunca pula por
      // engano nem escapa do custo canônico (timeout = falha).
      const qteLocked = this.mode === 'derail' && this.qteOpen && !this.outcome;
      if (qteLocked && e?.type !== 'keydown') return; // pointerdown/touchstart fora dos botões: sem skip
      if (qteLocked && e?.type === 'keydown') {
        const k = String(e?.key ?? '').toLowerCase();
        if (k === '1' || k === 'c') { this.chooseQTE('seatbelt'); return; }
        if (k === '2' || k === 'e') { this.chooseQTE('jump'); return; }
        return; // Fase 28 — outras teclas NÃO pulam o QTE (contrato: timeout = falha)
      }
      this.skip();
    };
    if (this.skippable && typeof window !== 'undefined') {
      window.addEventListener('pointerdown', this._skip, { once: false });
      window.addEventListener('keydown', this._skip, { once: false });
      window.addEventListener('touchstart', this._skip, { once: false, passive: true });
    }
    if (this.mode === 'derail') this.#buildQteOverlay();
    if (this.mode === 'derail' && this.t < DT_.HANDOVER_CHASE) this.audio?.trainRumble?.(true, .55);
  }

  // Trem de 4 veículos de passageiros (carro-cabine aerodinâmico + 3 vagões-
  // salão, anatomia Fase 16 preservada: via permanente, bogies e rodas) e, no
  // derail: suporte ELEVADO (pilares), strobes de emergência, faíscas, destroços
  // e caixas resgatáveis ao redor do ponto de impacto.
  #build() {
    const dir = this.spawn.x >= 0 ? 1 : -1;
    this.dir = dir;
    const g = this.group;
    const railZ = this.spawn.z + (this.spawn.z >= 0 ? 30 : -30);
    this.railZ = railZ;

    // ---- materiais (assinatura Khaaos: metal frio + acento âmbar + glow ácido) ----
    const metal = new THREE.MeshStandardMaterial({ color: '#2c3138', roughness: .55, metalness: .65 });
    const metalDark = new THREE.MeshStandardMaterial({ color: '#191d22', roughness: .7, metalness: .55 });
    const accent = new THREE.MeshStandardMaterial({ color: '#b98a1e', roughness: .4, metalness: .5, emissive: '#4a3405', emissiveIntensity: .5 });
    const glow = new THREE.MeshStandardMaterial({ color: '#ffd75e', emissive: '#ffd75e', emissiveIntensity: 1.4, roughness: .3 });
    const windowLit = new THREE.MeshStandardMaterial({ color: '#2a2118', emissive: '#ffcf7a', emissiveIntensity: .85, roughness: .3 });
    const emergencyRed = new THREE.MeshStandardMaterial({ color: '#2a0f10', emissive: '#ff2d3d', emissiveIntensity: .9, roughness: .4 });
    // Fase 34 — aço inox do salão, vidro do para-brisa e borracha das gangues
    const shell = new THREE.MeshStandardMaterial({ color: '#99a1ac', roughness: .32, metalness: .85 });
    const glass = new THREE.MeshStandardMaterial({ color: '#0e1a22', roughness: .12, metalness: .55, emissive: '#39606f', emissiveIntensity: .3 });
    const rubber = new THREE.MeshStandardMaterial({ color: '#14161a', roughness: .95, metalness: .05 });
    const ballastMat = new THREE.MeshStandardMaterial({ color: '#3b352c', roughness: .97 });
    const sleeperMat = new THREE.MeshStandardMaterial({ color: '#4a3a26', roughness: .95 });
    const railMat = new THREE.MeshStandardMaterial({ color: '#565b63', roughness: .35, metalness: .85 });
    this._mats = { metal, metalDark, accent, glow, windowLit, emergencyRed, railMat };

    // ---- via permanente: lastro → dormentes instanciados → 2 trilhos ----
    const ballast = new THREE.Mesh(new THREE.BoxGeometry(520, .22, 4.4), ballastMat);
    ballast.position.set(0, .11, railZ);
    g.add(ballast);
    const SLEEPER_STEP = .75, SPAN = 520;
    const sleeperCount = Math.floor(SPAN / SLEEPER_STEP);
    const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, .1, .26), sleeperMat, sleeperCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < sleeperCount; i++) {
      dummy.position.set(-SPAN / 2 + i * SLEEPER_STEP, .24, railZ);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      sleepers.setMatrixAt(i, dummy.matrix);
    }
    sleepers.instanceMatrix.needsUpdate = true;
    g.add(sleepers);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(SPAN, .16, .1), railMat);
      rail.position.set(0, .34, railZ + side * .75);
      g.add(rail);
    }

    // ---- Fase 26 — pilares do viaduto (derail: a estrutura desmorona) ----
    this.pillars = [];
    if (this.mode === 'derail') {
      const pillarMat = new THREE.MeshStandardMaterial({ color: '#494f57', roughness: .92 });
      for (let i = 0; i < 8; i++) {
        const px = -180 + i * 48;
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(.9, 1.15, 7.2, 8), pillarMat);
        pillar.position.set(px, 3.6, railZ);
        g.add(pillar);
        this.pillars.push({ mesh: pillar, x: px });
      }
    }

    // ---- bogie: castelo + eixos com rodas cilíndricas (eixo ao longo do Z) ----
    const mkBogie = (wheelsPerSide, x) => {
      const bogie = new THREE.Group();
      bogie.position.set(x, .95, 0);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(2.6, .5, 2.5), metalDark);
      frame.position.y = .25;
      bogie.add(frame);
      for (let a = 0; a < wheelsPerSide; a++) {
        for (const side of [-1, 1]) {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, .16, 12), metalDark);
          wheel.rotation.x = Math.PI / 2;                 // eixo Y → Z (rola no X)
          wheel.position.set((a - (wheelsPerSide - 1) / 2) * 1.15, 0, side * 1.18);
          bogie.add(wheel);
          const rim = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .18, 10), railMat);
          rim.rotation.x = Math.PI / 2;
          rim.position.copy(wheel.position);
          bogie.add(rim);
        }
      }
      return bogie;
    };

    // ---- Fase 34 — composição: carro-cabine de passageiros + 3 vagões-salão ----
    // Formato canônico Zu: trem de passageiros de verdade (nariz aerodinâmico,
    // janelas individuais, portas duplas, teto curvo, pantógrafo, gangues).
    this.cars = [];
    const specs = [
      { len: 14, lead: true },
      { len: 11 },
      { len: 11 },
      { len: 11 },
    ];
    // geometrias compartilhadas (mesma forma reuse em todos os veículos)
    const bodyLeadGeo = new THREE.BoxGeometry(10.8, 2.0, 3.0);
    const bodyWagonGeo = new THREE.BoxGeometry(11, 2.3, 3.0);
    const capLeadGeo = new THREE.CylinderGeometry(1.5, 1.5, 10.9, 20);   // calota do teto (eixo → X)
    const capWagonGeo = new THREE.CylinderGeometry(1.5, 1.5, 11.1, 20);
    const noseGeo = new THREE.SphereGeometry(1, 20, 14);                 // elipsoide escalado = nariz
    const shieldGeo = new THREE.SphereGeometry(1, 18, 10, -.7, 1.4, Math.PI * .30, Math.PI * .22); // calota do para-brisa
    const winGeo = new THREE.BoxGeometry(.66, .8, .07);
    const winLeadGeo = new THREE.BoxGeometry(.62, .75, .07);
    const leafGeo = new THREE.BoxGeometry(.6, 1.78, .08);
    const doorWinGeo = new THREE.BoxGeometry(.4, .55, .03);
    const doorLampGeo = new THREE.BoxGeometry(.22, .1, .06);
    const bandGeo = new THREE.BoxGeometry(10.4, .16, .06);               // faixa âmbar da lituraria
    const stripeGeo = new THREE.BoxGeometry(9.4, .12, .06);              // stripe ácido (assinatura)
    const markerGeo = new THREE.BoxGeometry(.16, .14, .12);
    const collarGeo = new THREE.BoxGeometry(.5, 1.66, 2.15);
    const ribGeo = new THREE.BoxGeometry(.16, 1.62, 2.22);
    const bellowsLeadGeo = new THREE.BoxGeometry(3.85, 1.5, 2.05);
    const bellowsWagonGeo = new THREE.BoxGeometry(2.35, 1.5, 2.05);

    // salão: janelas individuais + portas de folha dupla + luminosos + lituraria (2 faces)
    const dressSaloon = (car, { winY, winGeo: wg, winXs, doors, bandY }) => {
      for (const side of [-1, 1]) {
        for (const wx of winXs) {
          const w = new THREE.Mesh(wg, windowLit);
          w.position.set(wx, winY, side * 1.51);
          car.add(w);
        }
        for (const dx of doors) {
          for (const leaf of [-.31, .31]) {
            const p = new THREE.Mesh(leafGeo, metalDark);
            p.position.set(dx + leaf, 2.25, side * 1.535);
            car.add(p);
            const dw = new THREE.Mesh(doorWinGeo, windowLit);
            dw.position.set(dx + leaf, 2.52, side * 1.585);
            car.add(dw);
          }
          const lamp = new THREE.Mesh(doorLampGeo, glow);
          lamp.position.set(dx, 3.0, side * 1.62);
          car.add(lamp);
        }
        const band = new THREE.Mesh(bandGeo, accent);
        band.position.set(0, bandY, side * 1.52);
        car.add(band);
        const stripe = new THREE.Mesh(stripeGeo, glow);
        stripe.position.set(0, 1.75, side * 1.52);
        car.add(stripe);
      }
    };

    // teto: ar-condicionado + vents + antena (assinatura de trem de passageiros)
    const dressRoof = (car, topY, xOff) => {
      const ac = new THREE.Mesh(new THREE.BoxGeometry(2.0, .3, 1.8), metalDark);
      ac.position.set(xOff - 1.4, topY + .15, 0);
      car.add(ac);
      for (const vx of [xOff + 1.2, xOff + 2.1]) {
        const vent = new THREE.Mesh(new THREE.BoxGeometry(.5, .16, .9), metalDark);
        vent.position.set(vx, topY + .08, 0);
        car.add(vent);
      }
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, .55, 6), railMat);
      ant.position.set(xOff - 2.8, topY + .24, 0);
      car.add(ant);
    };

    // pantógrafo articulado (tração elétrica — vagão central)
    const dressPantograph = (car, topY) => {
      const pg = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(.6, .07, 1.5), railMat);
      base.position.y = .14;
      pg.add(base);
      for (const sz of [-.6, .6]) {
        const ins = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .2, 6), railMat);
        ins.position.set(0, .1, sz);
        pg.add(ins);
      }
      const lower = new THREE.Mesh(new THREE.BoxGeometry(1.35, .06, .08), railMat);
      lower.position.set(.72, .55, 0);
      lower.rotation.z = .69;
      pg.add(lower);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(1.0, .05, .07), railMat);
      upper.position.set(1.55, 1.1, 0);
      upper.rotation.z = .46;
      pg.add(upper);
      const head = new THREE.Mesh(new THREE.BoxGeometry(1.9, .05, .16), glow);
      head.position.set(1.9, 1.38, 0);
      pg.add(head);
      for (const [hx, rot] of [[.98, .8], [2.82, -.8]]) {
        const horn = new THREE.Mesh(new THREE.BoxGeometry(.2, .05, .13), railMat);
        horn.position.set(hx, 1.33, 0);
        horn.rotation.z = rot;
        pg.add(horn);
      }
      pg.position.set(-.8, topY, 0);
      car.add(pg);
    };

    // gangue entre veículos: fole de borracha com nervuras; collar nas pontas livres
    const dressGangway = (car, rearX, geo) => {
      const bellows = new THREE.Mesh(geo, rubber);
      bellows.position.set(rearX + geo.parameters.width / 2 + .02, 2.5, 0);
      car.add(bellows);
      const n = Math.max(3, Math.round(geo.parameters.width / .75));
      for (let i = 1; i < n; i++) {
        const rib = new THREE.Mesh(ribGeo, metal);
        rib.position.set(rearX + (geo.parameters.width * i) / n, 2.5, 0);
        car.add(rib);
      }
    };
    const dressCollar = (car, x) => {
      const c = new THREE.Mesh(collarGeo, rubber);
      c.position.set(x, 2.5, 0);
      car.add(c);
    };

    let offset = 0;
    for (const s of specs) {
      const car = new THREE.Group();                       // grupo = veículo inteiro
      const L = s.len;
      const chassis = new THREE.Mesh(new THREE.BoxGeometry(L - .2, .4, 2.6), metalDark);
      chassis.position.y = 1.02;
      car.add(chassis);
      if (s.lead) {
        // carro-cabine: nariz elipsoidal + para-brisa curvo + salão de passageiros
        const body = new THREE.Mesh(bodyLeadGeo, shell);
        body.position.set(1.6, 2.2, 0);
        car.add(body);
        const cap = new THREE.Mesh(capLeadGeo, shell);
        cap.position.set(1.6, 2.2, 0);
        cap.rotation.z = Math.PI / 2;
        car.add(cap);
        const nose = new THREE.Mesh(noseGeo, shell);
        nose.scale.set(2.35, 1.75, 1.5);
        nose.position.set(-4.1, 2.1, 0);
        car.add(nose);
        const shield = new THREE.Mesh(shieldGeo, glass);   // para-brisa curvo (casca parcial)
        shield.scale.set(2.42, 1.8, 1.545);
        shield.position.set(-4.1, 2.1, 0);
        car.add(shield);
        const pilot = new THREE.Mesh(new THREE.BoxGeometry(1.9, .8, 2.3), accent);
        pilot.position.set(-5.5, .85, 0);
        car.add(pilot);
        const coupler = new THREE.Mesh(new THREE.BoxGeometry(.5, .24, .22), metalDark);
        coupler.position.set(-6.7, .9, 0);
        car.add(coupler);
        for (const side of [-1, 1]) {
          const cabWin = new THREE.Mesh(new THREE.BoxGeometry(.8, .5, .07), glass);
          cabWin.position.set(-3.35, 2.8, side * 1.51);
          car.add(cabWin);
          const headlight = new THREE.Mesh(new THREE.CylinderGeometry(.17, .17, .14, 10), glow);
          headlight.rotation.z = Math.PI / 2;
          headlight.position.set(-6.5, 1.05, side * .7);
          car.add(headlight);
          const marker = new THREE.Mesh(markerGeo, glow);
          marker.position.set(-5.9, 2.9, side * .72);
          car.add(marker);
          const skirt = new THREE.Mesh(new THREE.BoxGeometry(11.5, .55, .14), metalDark);
          skirt.position.set(.8, 1.28, side * 1.5);
          car.add(skirt);
        }
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(.17, 10, 8), glow);
        lamp.position.set(-6.35, 1.75, 0);
        car.add(lamp);
        for (const ex of [-2.6, -1.6]) {
          const stack = new THREE.Mesh(new THREE.CylinderGeometry(.22, .28, .7, 8), metalDark);
          stack.position.set(ex, 3.95, 0);
          car.add(stack);
          const ring = new THREE.Mesh(new THREE.CylinderGeometry(.24, .24, .1, 8), glow);
          ring.position.set(ex, 4.28, 0);
          car.add(ring);
        }
        dressSaloon(car, { winY: 2.6, winGeo: winLeadGeo, winXs: [-1.9, -.7, .5, 1.7, 2.9], doors: [4.6], bandY: 2.16 });
        dressRoof(car, 3.7, 3.6);
        dressGangway(car, L / 2, bellowsLeadGeo);
        car.add(mkBogie(3, -L / 2 + 2.6));
        car.add(mkBogie(3, L / 2 - 2.6));
        this.leadAccentMat = accent;
        // Fase 34 — orientação canônica: o nariz (construído em −X local) aponta
        // para o SENTIDO DO MOVIMENTO — dir=1 → yaw π; dir=-1 → yaw 0
        car.userData.yaw0 = this.dir === 1 ? Math.PI : 0;
        car.rotation.y = car.userData.yaw0;
      } else {
        // vagão-salão: teto curvo + janelas individuais + portas duplas nas 2 faces
        const body = new THREE.Mesh(bodyWagonGeo, shell);
        body.position.y = 2.45;
        car.add(body);
        const cap = new THREE.Mesh(capWagonGeo, shell);
        cap.position.y = 2.45;
        cap.rotation.z = Math.PI / 2;
        car.add(cap);
        for (const side of [-1, 1]) {
          const skirt = new THREE.Mesh(new THREE.BoxGeometry(L - .6, .5, .14), metalDark);
          skirt.position.set(0, 1.35, side * 1.5);
          car.add(skirt);
        }
        dressSaloon(car, { winY: 2.78, winGeo, winXs: [-2.35, -1.41, -.47, .47, 1.41, 2.35], doors: [-3.6, 3.6], bandY: 2.28 });
        dressRoof(car, 3.95, -1.0);
        const last = s === specs[specs.length - 1];
        if (!last) dressGangway(car, L / 2, bellowsWagonGeo);
        dressCollar(car, -(L / 2 + .22));
        if (last) dressCollar(car, L / 2 + .22);
        car.add(mkBogie(2, -L / 2 + 1.9));
        car.add(mkBogie(2, L / 2 - 1.9));
      }
      // pantógrafo no vagão central (tração elétrica do trem-unidade)
      if (!s.lead && s === specs[2]) dressPantograph(car, 3.95);
      // Fase 26 — strobe de emergência no teto (pisca vermelho pós-derail)
      if (this.mode === 'derail' && !s.lead) {
        const strobe = new THREE.Mesh(new THREE.SphereGeometry(.12, 8, 6), emergencyRed);
        strobe.position.set(0, 4.12, 0);
        car.add(strobe);
        car.userData.strobe = strobe;
      }
      car.userData.offset = offset;
      car.position.z = railZ; // Fase 34 — trem NA via (bug antigo: carros ficavam em z=0, fora dos trilhos)
      offset += L + 2.4;
      this.cars.push(car);
      g.add(car);
    }
    this.trainLength = offset;
    this.startX = -dir * (260 + this.trainLength);
    this.endX = dir * (260 + this.trainLength);
    this.speed = (this.endX - this.startX) / 9.5; // atravessa a zona em ~9.5 s

    if (this.mode !== 'derail') return;

    // ---- Fase 26 — deriva determinística do desastre (semeada pelo spawn) ----
    const seed = `${Math.round(this.spawn.x)}:${Math.round(this.spawn.z)}`;
    this.derailT = DT_.DERAIL;
    // ponto de impacto: cabeça do trem no instante do derail (função pura)
    this.wreckHeadX = this.startX + this.speed * DT_.DERAIL;
    // alvo de espalhamento por veículo: jitter semeado + tombamento lateral
    this.scatter = this.cars.map((car, i) => ({
      dx: (hash01(`${seed}:dx${i}`) - .5) * 14,
      dz: (hash01(`${seed}:dz${i}`) - .5) * 9,
      tilt: (hash01(`${seed}:t${i}`) - .5) * 1.25,
      yaw: (hash01(`${seed}:y${i}`) - .5) * .9,
      sink: .25 + hash01(`${seed}:s${i}`) * .45,
    }));
    this.#buildDebris(seed);
    this.#buildFireAndCrates(seed);
  }

  // destroços: balística FECHADA (função pura do tempo) — sem estado por frame
  #buildDebris(seed) {
    const g = this.group;
    const chunkMat = this._mats.metalDark;
    const N = 36;
    this.debrisMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(.55, .4, .55), chunkMat, N);
    // Fase 39 (revisão ZU pós-PR #179) — o InstancedMesh nasce com MATRIZES
    // IDENTIDADE (36 cubos em grade no origin) e só recebe balística REAL na
    // 1ª frame pós-impacto: pré-derail o destroço "fantasma" ficava VISÍVEL
    // flutuando em (0,0,0) durante toda a perseguição. Invisível até o crash.
    this.debrisMesh.visible = false;
    this.debris = [];
    for (let i = 0; i < N; i++) {
      const ang = hash01(`${seed}:da${i}`) * Math.PI * 2;
      const dist = 3 + hash01(`${seed}:dd${i}`) * 16;
      this.debris.push({
        x0: this.wreckHeadX, z0: this.railZ,
        vx: Math.cos(ang) * (2.5 + hash01(`${seed}:dv${i}`) * 7),
        vz: Math.sin(ang) * (2 + hash01(`${seed}:dv2${i}`) * 6),
        vy: 4 + hash01(`${seed}:dh${i}`) * 7,
        spin: (hash01(`${seed}:dr${i}`) - .5) * 8,
      });
    }
    this.debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    g.add(this.debrisMesh);
    // pilares que cedem: tombam em arco (rotação pura no tempo)
    this.fallingPillars = this.pillars.slice(2, 5).map((p, i) => ({
      ...p, dir: i % 2 ? 1 : -1, delay: .12 * i,
    }));
  }

  // incêndio do destroço + caixas resgatáveis (posições determinísticas)
  #buildFireAndCrates(seed) {
    const g = this.group;
    // Fase 39 (revisão ZU) — material ÚNICO por chama/puff: #updateDerailFx
    // escreve opacity POR INSTÂNCIA; com material compartilhado só a última
    // escrita vencia (chamas piscavam em uníssono, coluna de fumaça sem
    // gradiente). Clones baratos — dispose() já libera materiais.
    const fireBase = new THREE.MeshBasicMaterial({ color: '#ff7a2a', transparent: true, opacity: .75, blending: THREE.AdditiveBlending, depthWrite: false });
    this.flames = [];
    for (let i = 0; i < 6; i++) {
      const flame = new THREE.Mesh(new THREE.PlaneGeometry(1.6 + hash01(`${seed}:f${i}`) * 1.2, 2.4), fireBase.clone());
      flame.position.set(this.wreckHeadX + (hash01(`${seed}:fx${i}`) - .5) * 22, 1.6, this.railZ + (hash01(`${seed}:fz${i}`) - .5) * 7);
      g.add(flame);
      this.flames.push(flame);
    }
    const smokeBase = new THREE.MeshBasicMaterial({ color: '#15161a', transparent: true, opacity: .5, depthWrite: false });
    this.smokes = [];
    for (let i = 0; i < 7; i++) {
      const puff = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), smokeBase.clone());
      puff.position.set(this.wreckHeadX + (hash01(`${seed}:sx${i}`) - .5) * 26, 4 + i * 2.2, this.railZ + (hash01(`${seed}:sz${i}`) - .5) * 6);
      g.add(puff);
      this.smokes.push(puff);
    }
    // faíscas nos bogies (pré-derail): quads aditivos piscando
    const sparkM = new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.sparks = [];
    for (let i = 0; i < 3; i++) {
      const spark = new THREE.Mesh(new THREE.PlaneGeometry(.35, .14), sparkM);
      g.add(spark);
      this.sparks.push(spark);
    }
    // ---- caixas resgatáveis (loot real via onDone → main3d) ----
    const crateMat = new THREE.MeshStandardMaterial({ color: '#3d4436', roughness: .8, metalness: .25 });
    const claspMat = new THREE.MeshStandardMaterial({ color: '#dfe8ec', emissive: '#42d9de', emissiveIntensity: 1.1, roughness: .3 });
    this.crates = [];
    for (let i = 0; i < 6; i++) {
      const crate = new THREE.Group();
      const c = new THREE.Mesh(new THREE.BoxGeometry(.8, .6, .5), crateMat);
      c.position.y = .3;
      c.castShadow = true;
      const clasp = new THREE.Mesh(new THREE.BoxGeometry(.26, .05, .1), claspMat);
      clasp.position.y = .62;
      crate.add(c, clasp);
      const ang = (i / 6) * Math.PI * 2 + hash01(`${seed}:ca${i}`);
      const dist = 5 + hash01(`${seed}:cd${i}`) * 9;
      crate.position.set(this.wreckHeadX + Math.cos(ang) * dist, 0, this.railZ + Math.sin(ang) * dist * .6);
      crate.rotation.y = hash01(`${seed}:cr${i}`) * Math.PI;
      g.add(crate);
      this.crates.push(crate);
    }
    // itens correspondentes (formas consumidas por sim.#pickup — offline)
    this.crateLoot = [
      { id: 'barrett', kind: 'weapon', name: 'Barrett MK22', rarity: 'RARO' },
      { id: 'm4', kind: 'weapon', name: 'M4 Tático' },
      { kind: 'consumable', id: 'medkit', name: 'Kit Médico' },
      { kind: 'consumable', id: 'medkit', name: 'Kit Médico' },
      { kind: 'armor', id: 'ceramic', amount: 18, name: 'Placa Cerâmica' },
      { kind: 'ammo', id: '5.56', amount: 30, name: '5.56×45' },
    ].map((item, i) => {
      const c = this.crates[i];
      return { ...item, x: c.position.x, z: c.position.z, y: .55, sectorId: 'zu-wreck', active: true };
    });
  }

  // ---- QTE overlay (DOM leve, sem markup novo no index) ----
  #buildQteOverlay() {
    if (typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.id = 'zu-qte';
    el.style.cssText = 'position:fixed;left:50%;bottom:18%;transform:translateX(-50%);z-index:40;'
      + 'font:700 15px/1.4 system-ui,sans-serif;color:#eaf6ff;background:rgba(8,12,18,.86);'
      + 'border:1px solid #38bdf8;border-radius:10px;padding:12px 18px;text-align:center;'
      + 'box-shadow:0 0 24px rgba(56,189,248,.35);display:none;user-select:none;';
    el.innerHTML = '<div style="letter-spacing:.08em;color:#fb923c">ZU — DESLIZAMENTO IMINENTE</div>'
      + '<div style="margin-top:6px">[1] TRAVAR CINTO &nbsp;·&nbsp; [2] SALTAR</div>'
      + '<div id="zu-qte-timer" style="margin-top:6px;font-weight:400;color:#9fb8c6"></div>';
    document.body?.appendChild(el);
    this.qteEl = el;
  }

  #setQteVisible(v) {
    this.qteOpen = v;
    if (this.qteEl) this.qteEl.style.display = v ? 'block' : 'none';
  }

  // decisão do QTE (teclado 1/2 · botões · testes headless chamam direto)
  chooseQTE(choice) {
    if (this.done || !this.qteOpen || this.outcome) return false; // Fase 28 — outcome resolvido não é sobrescrito
    if (!QTE_OUTCOMES[choice]) return false;
    this.outcome = { ...QTE_OUTCOMES[choice] };
    this.#setQteVisible(false);
    return true;
  }

  // Fase 28 — true quando a tecla pertence à decisão do QTE ATIVO (derail com
  // janela aberta e sem outcome). O Game3D consome essas teclas ANTES do input
  // do jogo: [1]/[2] não trocam arma, c não agacha, e não interage — e nenhuma
  // outra tecla escapa do QTE (timeout = falha, não fuga).
  consumesKey(k) {
    return this.mode === 'derail' && this.qteOpen && !this.outcome
      && (k === '1' || k === '2' || k === 'c' || k === 'e');
  }

  // posição da cabeça do trem no tempo t (determinística; pós-derail trava no
  // ponto de impacto — headX permanece função pura do tempo)
  headX(t) {
    const x = this.startX + this.speed * t;
    if (this.mode !== 'derail') return x;
    // clamp na direção do movimento (dir=-1 anda para x negativo)
    return this.dir === 1 ? Math.min(x, this.wreckHeadX) : Math.max(x, this.wreckHeadX);
  }

  update(dt) {
    if (this.done) return true;
    // bullet-time: durante o descarrilo o relógio interno desacelera (Fase 26)
    const inBullet = this.mode === 'derail' && this.t >= DT_.DERAIL && this.t < DT_.BULLET_END;
    this.t += dt * (inBullet ? DT_.BULLET_SCALE : 1);
    const t = this.t;
    const head = this.headX(t);
    const derailed = this.mode === 'derail' && t >= DT_.DERAIL;

    for (const car of this.cars) {
      const baseX = head - this.dir * car.userData.offset;
      car.position.x = baseX;
      car.position.y = 0;
      car.position.z = this.railZ; // na via permanente (toda frame — paridade com o build)
      car.rotation.set(0, car.userData.yaw0 ?? 0, 0);
      if (derailed) {
        // espalhamento determinístico: ease-out em direção ao alvo semeado
        const p = Math.min(1, (t - DT_.DERAIL) / DT_.SCATTER);
        const ease = 1 - Math.pow(1 - p, 3);
        const sc = this.scatter[this.cars.indexOf(car)];
        car.position.x += sc.dx * ease;
        car.position.z = this.railZ + sc.dz * ease;
        car.position.y = -sc.sink * ease;
        car.rotation.z = sc.tilt * ease;
        car.rotation.y = (car.userData.yaw0 ?? 0) + sc.yaw * ease;
      }
    }
    // farol da locomotiva pulsa levemente (presença noturna)
    if (this.leadAccentMat) this.leadAccentMat.emissiveIntensity = .5 + Math.sin(t * 9) * .18;

    if (this.mode === 'derail') {
      this.#updateDerailFx(t, derailed);
      // janela do QTE
      if (!this.qteOpen && !this.outcome && t >= DT_.QTE_OPEN && t < DT_.QTE_CLOSE) this.#setQteVisible(true);
      if (this.qteOpen) {
        if (this.qteEl) {
          const left = Math.max(0, DT_.QTE_CLOSE - t);
          this.qteEl.querySelector('#zu-qte-timer').textContent = `${left.toFixed(1)} s para decidir`;
        }
        if (t >= DT_.QTE_CLOSE) this.outcome = { ...QTE_OUTCOMES.fail };
        if (this.outcome) this.#setQteVisible(false);
      }
      // áudio (hooks opcionais — best-effort)
      if (t >= DT_.QTE_OPEN && !this._rumbleLoud) { this._rumbleLoud = true; this.audio?.trainRumble?.(true, .95); }
      if (derailed && !this._crashed) {
        this._crashed = true;
        this.audio?.metalCrash?.();
        setTimeout(() => { if (!this.done) this.audio?.alarmSiren?.(true); }, 500);
      }
      if (t >= DT_.BULLET_END && !this._tinnitus) { this._tinnitus = true; this.audio?.tinnitus?.(2.5); }
    }

    if (t >= (this.mode === 'derail' ? DT_.DURATION : TIMELINE.DURATION)) this.#finish();
    return this.done;
  }

  // VFX do derail — tudo função pura de t (mesmos inputs ⇒ mesmo frame)
  #updateDerailFx(t, derailed) {
    const g = this.group;
    // Fase 39 (revisão ZU) — destroços só EXISTEM a partir do impacto
    if (derailed && !this.debrisMesh.visible) this.debrisMesh.visible = true;
    // faíscas nos bogies antes do derail
    if (!derailed && t > 1.0) {
      const flick = Math.floor(t * 30);
      this.sparks.forEach((s, i) => {
        const j = hash01(`spark:${flick}:${i}`);
        s.visible = j > .35;
        s.position.set(this.headX(t) - this.dir * (i * 2.2 + 1), .5 + j * .4, this.railZ + (i - 1) * .9);
        s.rotation.y = j * Math.PI;
      });
    } else {
      for (const s of this.sparks) s.visible = false;
    }
    if (!derailed) return;
    const td = t - DT_.DERAIL;
    // destroços: balística fechada + repouso no chão
    const dummy = new THREE.Object3D();
    this.debris.forEach((d, i) => {
      const fl = td * 1.4; // tempo de voo escalado (bullet-time já está no t)
      const x = d.x0 + d.vx * fl;
      const z = d.z0 + d.vz * fl;
      const y = Math.max(.2, d.vy * fl - 4.9 * fl * fl + .4);
      dummy.position.set(x, y, z);
      dummy.rotation.set(d.spin * fl, d.spin * fl * .7, 0);
      dummy.updateMatrix();
      this.debrisMesh.setMatrixAt(i, dummy.matrix);
    });
    this.debrisMesh.instanceMatrix.needsUpdate = true;
    // pilares cedem: tombamento em arco + afundamento
    for (const p of this.fallingPillars) {
      const k = Math.max(0, Math.min(1, (td - p.delay) / 1.9));
      const ease = k * k;
      p.mesh.rotation.z = p.dir * ease * 1.15;
      p.mesh.position.y = 3.6 - ease * 1.4;
    }
    // incêndio: chamas tremulam + fumaça sobe em loop determinístico
    this.flames.forEach((f, i) => {
      const w = 1 + Math.sin(t * 11 + i * 2.1) * .25;
      f.scale.set(w, 1 + Math.cos(t * 9 + i) * .2, 1);
      f.material.opacity = .55 + Math.sin(t * 13 + i) * .2;
      f.lookAt(g.position.x, 2.2, g.position.z); // billboard barato p/ a cena
    });
    this.smokes.forEach((s, i) => {
      const cyc = (td * .35 + i * .35) % 2.4;
      s.position.y = 3.5 + cyc * 3.4;
      s.material.opacity = Math.max(0, .5 - cyc * .18);
      s.scale.setScalar(1 + cyc * .8);
    });
    // strobes de emergência piscam nos veículos tombados
    const strobeOn = Math.sin(t * 14) > .2;
    for (const car of this.cars) if (car.userData.strobe) car.userData.strobe.material.emissiveIntensity = strobeOn ? 1.6 : .15;
  }

  // Câmera cinematográfica multi-estágio (Fase 26):
  //   0→3.4  perseguição externa (contrato Fase 11 preservado)
  //   3.4→5.8 cabine 1ª pessoa (vibração de alta velocidade)
  //   5.8→8.8 bullet-time orbital sobre o impacto (o relógio interno volta a
  //          1× em 7.4, mas o ORBITAL segue até o SETTLE — convergência contínua)
  //   8.8→fim 3ª pessoa converge para o spawn (handover suave)
  cameraPose(cam, playerPos) {
    const t = this.t;
    if (this.mode === 'derail' && t >= DT_.HANDOVER_CHASE) {
      const head = this.headX(t);
      if (t < DT_.DERAIL) {
        // cabine: dentro do vagão 2, olhando à frente; tremor de alta velocidade
        const shake = (Math.sin(t * 31) + Math.sin(t * 47)) * .05;
        const car = this.cars[1];
        car.getWorldPosition(this._tmpPos ??= new THREE.Vector3());
        cam.position.set(this._tmpPos.x, 2.75 + shake * .4, this.railZ + .9 + shake * .2);
        cam.lookAt(head + this.dir * 18, 2.4 + shake, this.railZ);
        return;
      }
      if (t < DT_.SETTLE) {
        // bullet-time: orbital alto sobre o destroço
        const k = (t - DT_.DERAIL) / (DT_.SETTLE - DT_.DERAIL);
        const ang = Math.PI * (.25 + k * .35);
        const rad = 26 - 8 * k;
        cam.position.set(this.wreckHeadX + Math.cos(ang) * rad, 14 + 4 * (1 - k), this.railZ + Math.sin(ang) * rad);
        cam.lookAt(this.wreckHeadX, 2, this.railZ);
        return;
      }
      // aftermath: converge para o spawn (handover igual ao modo pass)
      const k = Math.min(1, (t - DT_.SETTLE) / (DT_.DURATION - DT_.SETTLE));
      const ease = k * k * (3 - 2 * k);
      cam.position.set(
        this.wreckHeadX + (playerPos.x - this.wreckHeadX) * ease,
        12 - 6 * ease,
        this.railZ + ((playerPos?.z ?? 118) - this.railZ) * ease,
      );
      cam.lookAt(playerPos.x, 1.6, playerPos.z);
      return;
    }
    // ---- modo pass / fase de perseguição (contrato original) ----
    const head = this.headX(this.t);
    const k = Math.min(1, this.t / TIMELINE.OVERSPAWN);
    const ease = k * k * (3 - 2 * k);
    const focusX = head - this.dir * 26;
    const camX = focusX - this.dir * (34 - 16 * ease);
    const camZ = this.railZ + this.dir * (26 - 8 * ease); // Fase 39 — sinal constante documentado (spawn.z nunca inverteu o fator)
    const camY = 16 - 5 * ease;
    cam.position.set(camX, camY, camZ);
    cam.lookAt(focusX, 6 - 2 * ease, this.railZ);
  }

  skip() {
    if (this.done || !this.skippable) return;
    this.#finish();
  }

  #finish() {
    if (this.done) return;
    this.done = true;
    // Fase 26 — encerra camadas de áudio do derail (best-effort)
    if (this.mode === 'derail') {
      this.audio?.trainRumble?.(false);
      this.audio?.alarmSiren?.(false);
    }
    this.dispose();
    this.onDone?.(this.mode === 'derail' ? this.outcome : null);
  }

  dispose() {
    if (this.skippable && typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this._skip);
      window.removeEventListener('keydown', this._skip);
      window.removeEventListener('touchstart', this._skip);
    }
    if (this.qteEl?.parentNode) this.qteEl.parentNode.removeChild(this.qteEl);
    this.qteEl = null;
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      o.geometry?.dispose?.();
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
      else o.material?.dispose?.();
    });
  }
}

// banner DOM (reuso do feed + status do HUD — sem markup novo)
export function trainIntroBanner(hud) {
  hud?.feed('ZU', 'Trem de infiltração chegando — desembarque no Ring autorizado.', 'warn');
}
