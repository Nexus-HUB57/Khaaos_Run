# Fase 48 — Identidade Acústica sob o Portão de Fidelidade (AU1–AU4) + Matriz MP-ZEX fechada localmente

> Diretiva: **"Revisar repo e prosseguir desenvolvimento end to end"**. Duas
> frentes em um lote: (A) o módulo de áudio canônico dos mundos
> (`worldAudioProfiles.js`, commit `60f76ff`) estava FORA do instrumento de
> fidelidade F44/F46 — a identidade sonora podia driftar silenciosamente, o
> mesmo buraco que a F47 fechou para `shared/worlds.ts`; (B) a matriz
> multiplayer ZEX (`FASE43_PLANO_TESTES_MULTIPLAYER_REAL.md`) tinha dois
> cenários automatizáveis localmente que continuavam manuais — MP-ZEX-04 e
> MP-ZEX-07.

---

## 1) Fidelidade acústica — checks AU1–AU4 no instrumento F44/F46

### Por que existe

A F41 deu perfil de LUZ dedicado por mundo (check Q1), a F42/F44 ancoraram
dinâmica/dressing/setores no README (D/B/S/R/W/X) — mas a camada de ÁUDIO
entrou no runtime sem portão: `WORLD_AUDIO_PROFILES` podia mudar de rótulo,
superfície ou chuva sem quebrar NADA. O mesmo padrão de deriva silenciosa que
a F47 já tinha erradicado para o contrato E2E. A F48 fecha o buraco: a
identidade acústica passa pelo MESMO snapshot reusado em três pontos (CLI
`audit:fidelity`, preflight UE5.8 e painel `/admin/ue58/fidelity`).

### Contrato (fidelity-audit-lib.mjs `AUDIO_CONTRACT`)

| Check | Escopo | Verificação | Ancoragem |
|---|---|---|---|
| **AU1** | GLOBAL | `WORLD_AUDIO_PROFILES` cobre EXATAMENTE os 5 mundos canônicos — nem mundo inventado, nem mundo canônico sem perfil | conjunto canônico {CIGKV, Barburhen, Priadus, Ckesalth, Arukheea} |
| **AU2** | por mundo | o `label` acústico cita o substantivo canônico do README (ex.: Barburhen = "ruínas industriais"/"chuva ácida"; Priadus = "selva úmida"/"esporos"; Arukheea = "ilha"/"maré") | README (Dinâmica/lore por mundo) |
| **AU3** | por mundo | a `surface` do perfil tem perfil de footstep (fecho: `surface ∈ FOOTSTEP_PROFILES`) — nenhuma cadeia de passos muda | consistência interna versionada |
| **AU4** | por mundo (só onde o cânon é explícito) | chuva coerente com a dinâmica canônica: Barburhen `rain ≥ 0.5` (chuva ácida contínua), Ckesalth `rain = 0` (Deserto das Almas Esquecidas), CIGKV `rain = 0` (campo aberto) | linha **Dinâmica** do README |

**Regra de honestidade**: W2 (neblina de esporos) e W4 (tsunami/maré) NÃO têm
semântica de chuva no README — o AU4 não é emitido para eles. A auditoria não
inventa regra que o cânon não declara (mesma doutrina dos "Plus" documentados
da F44).

### Wiring

- `fidelity-audit-lib.mjs` — novo parâmetro `audio` (padrão `null`: quem não
  passa, não emite AU — mesmo padrão do `sharedWorlds` da F47);
  `AUDIO_CONTRACT` congelado e exportado.
- `fidelity-snapshot.mjs` — importa `worldAudioProfiles.js` (módulo puro,
  headless-safe) e injeta `audio: { worlds, footsteps }` — o portão vale para
  os três consumidores do snapshot (CI, preflight UE5.8, painel /admin).
- `test/fidelity-audit.test.js` — 5 testes novos: repo real AU1–AU4 verdes +
  uma classe de deriva por check (mundo inventado/sumido, rótulo divergente,
  superfície sem footstep, chuva no deserto, seca em Barburhen).

### Evidência

```
✅ [AU1] GLOBAL    perfis acústicos cobrem exatamente os 5 mundos canônicos — 5/5
✅ [AU2] ×5 mundos rótulo acústico cita substantivo canônico do README
✅ [AU3] ×5 mundos superfície de passos tem perfil de footstep (fecho)
✅ [AU4] CIGKV/Barburhen/Ckesalth chuva coerente com a dinâmica canônica
Veredito: FIEL ✅ (94 OK / 0 falhas) — snapshot em ~2 s
```

## 2) MP-ZEX-04 e MP-ZEX-07 — automatizados localmente

### O que cada teste prova

| Cenário | Teste | Prova |
|---|---|---|
| **MP-ZEX-04** | `sim3d.test.js` — "girar a câmera sem transladar NÃO cancela o canal" | 2 s de rotação pura (yaw varrendo 2π, pitch oscilante, SEM dx/dy) mantém o canal vivo em ~50% de progresso, com deslocamento zero; conclusão ao girar concede XP EXATAMENTE uma vez |
| **MP-ZEX-07a** | `room3d.test.js` — "nocaute cancela o canal, libera o terminal e outro jogador assume" | sala SQUAD (DBNO): dano letal nocauteia; canal cancelado, reserva liberada, XP de extração zero, terminal utilizável — p2 assume sem reiniciar a sala |
| **MP-ZEX-07b** | `room3d.test.js` — "ciclo nocaute→morte: um único cancelamento e terminal utilizável" | dano sobre o caído é letal; em TODO o ciclo nocaute→morte existe EXATAMENTE UM `extractCancelled` (sem dupla concessão), canal nulo, terminal íntegro, eventos `knocked` + `eliminated` à vítima |
| **MP-ZEX-07c** | `room3d.test.js` — "fim de partida cancela todos os canais sem XP nem reserva órfã" | relógio zerado com canalização em curso: `FINISHED`, canal nulo, terminal NÃO consumido, `channelerId` nulo, XP intacto, evento `match_end` |

### Descoberta registrada (semântica real do cancelamento)

O teste 07b evidenciou a ordem real dos eventos: a 1ª linha de `#damage`
cancela o canal com reason **'damage'** ANTES do nocaute/morte pousarem no
mesmo tick — as reasons `'knocked'`/`'death'` no `#advanceZexChannel` são
**defense-in-depth** (inalcançáveis pelo caminho de dano, pois o canal já é
nulo). O contrato relevante do plano (§4.2: zero recompensa antecipada/
duplicada) é cumprido e agora está PROVADO: um único evento de cancelamento
por ciclo, XP de extração zero em todos os caminhos de interrupção.

### Técnica de teste (lições)

1. **Raio 0 não fere quem está no centro** (`dist > radius`): o ring letal
   precisa de centro DESLOCADO do ator (padrão do teste canônico de dano).
2. **Nocaute determinístico**: dano do ring é `(4 + pulse×1.4)×dt` ≈ 0,2/tick
   e o pulso (45 ticks) restaura o raio — fixar `life = 1` nocauteia em ~5
   ticks, antes do pulso, sem depender de timing.

### Evidência

```
game-runtime: 1041 pass / 0 fail / 13 skipped (9 testes novos na F48)
audit:fidelity: FIEL ✅ 94 OK / 0 falhas
```

## 3) Estado honesto da matriz multiplayer após a F48

| Cenário | Estado |
|---|---|
| MP-ZEX-01/02/03/05/06 | ✅ automatizados (F43/F44 + corrida local 2026-11-02) |
| **MP-ZEX-04** | ✅ **automatizado na F48** (antes manual) |
| **MP-ZEX-07** | ✅ **automatizado na F48** (knock + morte + fim de partida; antes manual) |
| MP-ZEX-08 | ✅ automatizado E2E local (F43, commit `5f14992`) — **gate staging permanece pendente** |
| MP-ZEX-09/10/11 | ⏳ exigem staging isolado com 2 clientes humanos / touch (ação externa) |

O playtest em staging isolado (dispositivos separados, jitter/perda, HUD
visual) continua sendo o passo de liberação multiplayer — nada da F48 o
substitui; a F48 apenas reduz a superfície manual de 5 para 3 cenários.
