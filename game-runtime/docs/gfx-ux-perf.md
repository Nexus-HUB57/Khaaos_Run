# GFX/UX Performance — Laço Adaptativo (Fase 34)

Revisão PhD-level da otimização de cenários/gráficos e da experiência do jogador.
Este documento registra o estado revisado, os achados e a arquitetura do laço
fechado de performance entregue na Fase 34.

## 1. Estado revisado (antes da Fase 34)

| Camada | Mecanismo existente | Avaliação |
|---|---|---|
| Tier de qualidade | `quality3d.js` — 3 tiers estáticos (low/medium/high) resolvidos UMA vez por sessão (`?q=`, touch, RAM) | Sem reação a carga runtime |
| LOD de personagens | `lod3d.js` — cadeia full→proxy→silhueta→hidden com histerese + frustum gate (penalidade de distância efetiva) | Sólido; referência de design |
| Grama / props | chunks de grama full/sparse/hidden por câmera (Fase 32); contact shadows instanciadas | OK |
| Pós-FX | `postfx3d.js` — composer (SSR + bloom + grade) | **G2**: `main3d` passava `quality:'high'` hardcoded → tier MEDIUM pagava SSR completo |
| HUD | redraw de minimapa todo frame (60+ Hz) | **G4**: custo real em touch sem ganho perceptível |
| Settings | apenas query string (`?q=`, `?fx=0`) | **U1/U2/U3**: sem painel in-game; sensibilidade hardcoded; shake sem acessibilidade |

## 2. Arquitetura do laço fechado (Fase 34)

```
        ┌──────────────────────────────────────────────────────────┐
        │ loop (main3d)                                            │
        │   dt = clock.getDelta() ──► perfMon.push(dt)             │
        │          │                    │ EMA τ=0.5 s              │
        │          │                    ▼                           │
        │          │        ┌──── warmed? ──── não ──► (só mede)    │
        │          │        │ sim                                   │
        │          │        ▼                                       │
        │          │   drsDecision ── changed? ──► applyRenderScale │
        │          │        │                (pixelRatio × escala)  │
        │          │        ▼                                       │
        │          │   tierDecision (só tier 'auto')                │
        │          │        └── changed? ──► applyTierRuntime       │
        │          │                          (sombras + pós-FX)    │
        └──────────┴────────────────────────────────────────────────┘
```

Módulos (todos puros e headless-testáveis):

- **`src/game3d/perf3d.js`** — `FrametimeMonitor` (EMA de constante de TEMPO,
  `α = 1 − exp(−dt/τ)`, τ = 0.5 s — igualmente estável a 30 e 144 Hz; warmup de
  30 amostras; descarta dt > 0.5 s de aba em background), `drsDecision`,
  `tierDecision`, `RateLimiter`, `postFxPlanFor`, `budgetFor`.
- **`src/game3d/gfxsettings.js`** — settings do jogador `KR_GFX_SETTINGS_V1`
  (blob JSON versionado, sanitização, fallback de memória headless).
- **Wiring** — `main3d.js` (`updatePerf` no loop, `applyRenderScale`,
  `applyTierRuntime`, `rebuildPost`, painel `#gfxPanel`); `hud3d.js`
  (minimapa 30 Hz, telemetria `setPerf`).

## 3. Parâmetros de controle (e por quê)

| Parâmetro | Valor | Justificativa |
|---|---|---|
| `BUDGET_MS` | 15 (high/medium), 22 (low) | 60 fps com folha de 10%; touch prioriza térmica/bateria |
| `DRS_MIN/MAX` | 0.55 / 1.0 | abaixo de 0.55 a crosshair serrilha em 1080p |
| `DRS_OVERLOAD_RATIO` | 1.12 | ignora ruído de ±1 frame |
| `DRS_STEP_DOWN/UP` | −0.12 / +0.05 | descida rápida (overload dói agora), subida espalhada anti-oscilação |
| `DRS_OVERLOAD_HOLD_S` | 0.6 | filtra stalls curtos; hitches sustentados ≥ ~0.9 s reagem com 1 passo |
| `DRS_RECOVER_HOLD_S` + `DRS_DWELL_UP_S` | 2.5 + 2.5 | folga SUSTENTADA antes de gastar nitidez |
| `TIER_OVERLOAD_RATIO` + HOLD | 1.35 + 6 s | tier só desce com DRS NO PISO (último recurso) |
| `TIER_RECOVER_HOLD_S` | 20 s no teto | mundo vazio não empurra o tier pra cima no meio do combate |
| `TIER_DWELL_S` | 10 s | troca de tier reconfigura sombras/pós-FX (custo pontual) |

## 4. Painel do jogador (`⚙ GFX`, `KR_GFX_*`)

- **QUALIDADE** — `auto` (DRS + degraus de tier) ou fixo low/medium/high;
  override manual cancela o auto-tier e aplica na hora.
- **PÓS-FX** — composer ligado/desligado (fallback render direto).
- **RES. DINÂMICA** — liga/desliga o DRS (monitor continua p/ telemetria).
- **TELEMETRIA FPS** — `#perfReadout`: `62 FPS · RES 88% · HIGH` (2 Hz).
- **TREMOR CÂM.** — 0–100% do shake de explosões (**movimento reduzido** em 0).
- **SENSIBILIDADE** — 30–250% do mouse (ADS mantém a razão ~0.52×).

## 5. Protocolo de verificação

- **Headless (CI)**: `game-runtime` `npm test` — `test/perf3d.test.js`
  (simulador de carga de 600 frames: convergência ≤8 mudanças, piso/teto,
  anti ping-pong senoidal, stall único inerte, recuperação ao teto) +
  `test/gfxsettings.test.js` (round-trip, sanitização, override).
- **Browser real (host licenciado)**: 1) abrir `?q=high&fx=1` + `?q=low`;
  2) alternar tier no painel e observar `#perfReadout`; 3) forçar carga
  (24 bots + SSR) e verificar descida de RES sem stutter; 4) conferir
  persistência `KR_GFX_*` recarregando a página.
- **Métricas de sucesso**: EMA final ≤ 18.75 ms sob carga 17.5 ms-base;
  ≤ 8 mudanças de escala/10 s; 0 trocas de tier sob carga senoidal.
