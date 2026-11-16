# ZU5 — Protocolo dos Vagões, Salto Controlado e Escudo de Pouso (Task 68)

> Extensão oficial do Protocolo de Entrada ZU (trem dos Rings — Task 53).
> SSOT única de verdade: `game-runtime/src/shared/zuTrain.js` — consumida pela
> sim offline (`src/game3d/sim3d.js`), pela autoridade online
> (`server/room3d.js`) e pelo cliente (`trainRide3d.js` / `main3d.js`).

## 1. Cenário canônico

Os 100 operativos chegam à **estação do respectivo mundo** de trem. O comboio é
organizado em **10 vagões × 10 lugares** e os vagões chegam à estação
**escalonados, a cada 5 segundos**. O embarque continua sendo coletivo
(cinemática `TRAIN_INTRO` de 3,4 s), a rota é determinística por seed e a
entrada oficial segue sendo: salto pela porta **ou** desembarque na chegada.

## 2. Timeline (ms desde o matchStart)

| Marco | Valor | Evento |
| --- | --- | --- |
| `EMBARQUE_MS` | 3400 | embarque/apresentação do comboio |
| `DOOR_OPEN_MS` | 8000 | portas abertas — janela de salto antecipado |
| `ARRIVAL_MS` | 16000 | **vagão 1** para na estação (desembarque obrigatório dele) |
| `wagonStopMs(w)` | 16000 + w×5000 | vagão w+1 para (21 s, 26 s, …, **61 s**) |
| `LAST_WAGON_STOP_MS` | 61000 | último vagão parado |
| `COMBAT_UNLOCK_MS` | 31000 | chegada base + grace de 15 s (cânon Task 53) |

Fases canônicas preservadas (`embarque → em_rota → portas → grace → combate`);
a escalonagem dos vagões é **protocolo de eventos** (`wagonArrived`), que
atravessa o grace e o início do combate. As portas permanecem abertas enquanto
houver vagão em rota (`doorWindowOpen` = `[8000, 61000)`).

## 3. Alocação dos vagões (10×10)

```
wagonOfIndex(i)     = floor(i / 10) % 10   // jogador = índice 0 → vagão 1
wagonSeatOfIndex(i) = i % 10               // lugar dentro do vagão
```

Determinístico e idêntico nos dois lados (sim offline e autoridade online).
Salas com menos de 100 atores distribuem-se pelos primeiros vagões; acima de
100, a alocação cicla. O par (vagão, lugar) aparece no snapshot
(`zuTrain.wagon`, `player.wagon`) para o HUD e para a organização da estação.

## 4. Salto Controlado — prevenção dos prováveis acidentes

Tentar saltar **antes do próprio vagão parar** é permitido somente com as
portas abertas e é convertido pelo protocolo em **SALTO CONTROLADO**:

1. **Intertravamento (antes das 8 s)**: portas trancadas em rota fechada —
   o salto é recusado pela autoridade (`doorJump → false`; motivo exibido no
   HUD). Nenhum acidente pode ocorrer porque o salto não acontece.
2. **Corredor seguro** (`safeJumpPose`): o pouso é deslocado para além da
   lateral da porta (`SAFE_CORRIDOR_M = 1,2 m` + folga por vagão
   `CORRIDOR_TIER_M = 0,45 m`) — o operativo **nunca cai na bitola, à frente
   do comboio ou sobre outro fluxo de vagão** → sem **batida** e sem
   **colisão** entre fluxos.
3. **Descarrilamento impossível por construção**: a pose do comboio é função
   pura do tempo (`trainPoseAt`) — nenhum agente altera trilhos, física ou
   rota; saltos não afetam o trem.
4. **Incêndio impossível por construção**: o salto não aplica nenhum estado de
   fogo/desastre ao saltador nem ao vagão; o pouso usa o drop canônico
   `chute` (amortecido, sem dano de queda).
5. **Recibo** (`zuEarlyJump`): evento autoritativo com
   `prevented: ['batida','descarrilamento','incendio','colisao']`, vagão e
   duração do escudo — auditável no HUD/feed e nos logs.
6. **Vagão já parou** → salto manual recusado (`wagonJumpWindowOpen → false`):
   o desembarque é obrigatório, feito pelo protocolo na plataforma.

## 5. Desembarque obrigatório na plataforma (slots anti-colisão)

Quando o vagão w para (`wagonStopMs(w)`), todo passageiro dele é desembarcado
pela autoridade em `platformSlotPose(route, wagon, seat)` — grade
determinística de **100 lugares distintos** (fileiras ao longo da rota por
lugar, faixas laterais por vagão) → 100 operativos pousam **sem sobreposição**.

## 6. Escudo de Pouso ZU — 15 s (ataques + fora da Safe Zone)

Todo pouso (salto controlado **ou** desembarque obrigatório) arma o
**Escudo de Pouso** de 15 s (`zuShieldT`, decai em tempo de partida):

- **Protegido de ataques**: dano com `ownerId` (bala, explosão, melee) é
  rejeitado pela autoridade enquanto `zuShieldT > 0` (sim: `#hurtPlayer`/
  `#damageBot`; servidor: `#damage`).
- **Protegido da penalidade de zona**: o dano de Ring (`kind: 'ring'`) é
  rejeitado nos mesmos 15 s — quem pousou **fora da Safe Zone** tem os 15 s
  para adentrá-la sem queimar; expirado o escudo, o DPS oficial da fase volta
  a valer.
- Dano ambiental canônico dos mundos (ácido/tsunami/esporos/fumaça) NÃO é
  bloqueado pelo escudo (o mundo continua canônico).
- HUD prioriza o escudo: `ESCUDO ZU 12s // VAGÃO 3/10 // ADENTRE A ZONA SEGURA`.

## 7. Passageiros a bordo após o desbloqueio

Os vagões tardios chegam até 61 s — depois dos 31 s de desbloqueio, quem está
**a bordo** segue **fora de alcance de ataques** (`trainOnboard && ownerId →
dano rejeitado`; a IA também não seleciona alvos a bordo). Penalizar quem não
pode agir é armadilha, não mecânica. No desembarque tardio, o escudo de 15 s
entra em vigor normalmente.

## 8. Contratos e paridade

- SSOT pura e determinística: `safeJumpPose` / `platformSlotPose` /
  `wagonStopMs` produzem a MESMA saída em cliente e servidor no mesmo elapsed.
- Eventos: `zuIngress` (+ `wagons/wagonCapacity/wagonGapMs/lastWagonStopMs`),
  `doorJump` (+ `wagon/early/shieldS/prevented`), `zuEarlyJump`, `wagonArrived`
  (+ `disembarked`), `trainArrived` (agora = último vagão), `combatUnlocked`.
- Snapshot: `zuTrain.{wagons, wagonCapacity, wagonGapMs, lastWagonStopMs,
  wagon, shieldS}` e `player.{wagon, zuShieldS}` (online) / `train.{...}`
  (offline).
- Fixture de testes (`test/helpers/zuProtocolo.js`) devolve a arena pós-
  protocolo **sem proteções transitórias** (escudos zerados) — contrato dos
  testes de combate preservado.

## 9. Cobertura de testes

- `test/zu-wagons-safeshield.test.js` (NOVO — 15 testes): alocação 10×10,
  escalonagem de 5 s, corredor seguro do salto controlado, plataforma sem
  sobreposição, recibo de prevenção, escudo contra ring fora da zona (com
  expiração), escudo contra ataques, a bordo fora de alcance, snapshot online.
- `test/zu-train-protocol.test.js`: atualizado ao cânon Task 68 (portas
  abertas até 61 s, chegada escalonada, `wagonArrived` × 10).
- Suíte completa: `node --test` → 1276 testes, 1263 pass, 0 fail, 13 skip.
