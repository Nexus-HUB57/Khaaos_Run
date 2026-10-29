# Natural Locomotion — Sistema Anti-Robotização dos Avatares

> M5 · Devs Ph.D · UE5.8 · Copyright Nexus-HUB57

## 1. Problema

Os avatares apresentavam movimento robotizado. Auditoria do pipeline de animação identificou dez causas-raiz:

| # | Causa-raiz | Sintoma visível |
|---|-----------|-----------------|
| 1 | `Speed`/`Direction` sem suavização nos AnimInstances | Blends de locomoção saltam em passos discretos |
| 2 | Zero lean por aceleração | Corpo rígido ao arrancar/frear/fazer strafe |
| 3 | Turn-in-place só booleano, sem easing de root | Personagem "giroca" parado |
| 4 | Foot IK documentado mas nunca implementado | Pés flutuam em terreno irregular |
| 5 | Sem land recovery | Aterrissagem abrupta, sem absorção de impacto |
| 6 | Idle sem vida (zero respiração/micro-movimento) | Estátua parada |
| 7 | CMC com aceleração/braking default brutal | Start/stop instantâneo = marionete |
| 8 | `NetworkSmoothingMode` Linear | Proxies simulados teleportam entre correções |
| 9 | Bots com velocidade/rotação idênticas | Esquadrão marchando em sincronia |
| 10 | `ApplyPhysicsToBones` do BlendManager era stub no-op | Cauda/asas/cristais como ornamentos estáticos |

## 2. Arquitetura

```
┌─────────────────────────────────────────────────────────────────────┐
│  KhaaosLocomotionCore (C++20 puro, ZERO deps UE)                    │
│  ─ Kernel matemático determinístico — unit-tested em CI (49 checks) │
│    SmoothFloat/SmoothAngleDeg · UpdateLean · UpdateStridePhase      │
│    UpdateLandRecovery · UpdateTurnInPlace · UpdateBreath            │
│    UpdateHeadLook · UpdateFootIK · UpdateNetworkSmoothing           │
└──────────────▲──────────────────────────────────────────────────────┘
               │ Step(Config, State, Input) por frame
┌──────────────┴──────────────────────────────────────────────────────┐
│  UKhaaosNaturalLocomotionComponent (TG_PrePhysics)                  │
│  ─ Amostra o CharacterMovementComponent (velocidade, accel, air)    │
│  ─ Line traces por pé (foot_l / foot_r) → offset + tilt            │
│  ─ Perfis por espécie (Zheers pesado ↔ Venex fluido)               │
│  ─ Eventos de footstep procedural → OnFootstepPhase                │
│  ─ LOD self-throttle > 5000cm                                       │
└──────────────▲───────────────────────────────┬──────────────────────┘
               │ BlueprintReadOnly              │ OnFootstepPhase(bool)
┌──────────────┴───────────────┐   ┌───────────▼──────────────────────┐
│  Anim Graph (via AnimInstances)│   │  UKhaaosFootstepSystem           │
│  KhaaosPlayerAnimInstance      │   │  (audio/VFX sincronizados com   │
│  KhaaosSpeciesAnimInstance     │   │   os pés na tela)                │
└────────────────────────────────┘   └──────────────────────────────────┘
```

### Camadas de naturalidade entregues

1. **Suavização de parâmetros** — exponencial criticamente amortecida, independente de framerate, ângulos com wrap shortest-path.
2. **Lean secundário** — roll/pitch por aceleração lateral/forward, com leve overshoot de spring (0.85 de damping ratio). Sem banking falso no ar.
3. **Fase de passada procedural** — contínua, escala com velocidade (passos curtos lentos → zancadas no sprint), eventos alternados de planta de pé (L/R) que dirigem footsteps e o foot IK do AnimBP.
4. **Land recovery** — spring sub-amortecido: impulso negativo no impacto (joelhos absorvem), rebote e estabilização.
5. **Turn-in-place com histerese** — inicia acima de 70°, só termina abaixo de 25°; rotação de root com easing proporcional ao residual. Suprimido em movimento.
6. **Respiração orgânica** — portadora senoidal (0.22 Hz em repouso, ×3.5 no sprint) + value noise determinístico PCG (seed por personagem — 100 avatares nunca respiram em unissono).
7. **Head look-at** — suavizado, clampado (75° yaw / 40° pitch), pitch amortecido ×0.5.
8. **Foot IK real** — line traces por socket de pé, spring criticamente amortecido por pé (offset até 35 cm, tilt até 25°), relaxa no ar.
9. **Envelope de aceleração humano** — `MaxAcceleration=1600`, `BrakingDecelerationWalking=1000`, `GroundFriction=6.5`, `NetworkSmoothingMode=Exponential` (players e operativos).
10. **Bots individualizados** — assinatura de locomoção determinística por nome (velocidade ±12%, turn rate ±25%, gait wobble senoidal ±3% — velocidade nunca é linha reta constante).
11. **Secondary motion real de espécie** — `KhaaosAnimationBlendManager` agora implementa spring-damper por bone em cadeia (atenuação progressiva: fim da cauda/ponta da asa deflete mais), dirigido por aceleração local + yaw rate, aplicado em `TG_PostPhysics` sobre a pose avaliada (`SetBoneTransformByName`, component space), constraints duros por config.
12. **Stops com distance matching** — distância de parada prevista (`v²/2a` sobre o braking do CMC) e fase `StopMatchPhase` 0→1: a animação de stop avança pela DISTÂNCIA restante, não pelo tempo — o avatar para EM cima da marca (sem derrapar com o idle já rodando).
13. **Pose aérea por velocidade vertical** — `AirPoseBlend` (−1 subindo / 0 ápice / +1 caindo), suavizado criticamente amortecido: o salto tem composição de subida, hang time e queda, em vez de uma pose única congelada.
14. **Pé-pivô no turn-in-place** — `PivotFootIsLeft` + `PivotWeight`: giro à direita cruza o pé ESQUERDO (e vice-versa), com histerese de 12° (sem flicker) e peso proporcional ao ângulo residual — a rotação vira uma ação humana de plantar o pé.
15. **Motion Warping de vault** — registry de warp targets (`SetWarpTarget`) + `VaultWarpPhase` (0→1 exatamente na marca) + `VaultWarpScale` (janela ±35% do clip base): o vault cobre a distância REAL até o obstáculo, sem rubber-banding.

## 3. Perfis por espécie (`ApplySpeciesProfile`)

| Espécie | Lean máx | Stride (cm) | Respiração | Land stiffness | Identidade |
|---------|---------|-------------|------------|----------------|------------|
| Zheers | 7° roll | 180 | 0.18 Hz | 130 | Pesado, deliberado |
| Onith | 13° | 140 | 0.26 Hz | 75 | Ágil, saltitante |
| Skeetw | 5° | 165 | **0 Hz (máquina)** | 90 | Rigidez intencional (lore) |
| Huran | 10° | 160 | 0.22 Hz | 90 | Baseline militar (parity Free Fire) |
| Venex | 14° | 150 | 0.24 Hz | 70 | Fluida, enganosa |
| Khael | 6° | 170 | 0.15 Hz | 55 | Flutuante mística |

## 4. Contrato para o Anim Graph (assets)

O AnimBP deve consumir (em vez de velocidade bruta):

- `SmoothedSpeed` / `SmoothedDirection` → blend spaces de locomoção
- `StopEase` → gate de transições start/stop (distance-matching hooks)
- `LeanRoll` / `LeanPitch` → layer aditiva no spine root
- `StridePhase` → sincronizar foot IK procedural e notifies de passo
- `LandRecovery` → blend de land recovery (aprox −1..1)
- `bNaturalTurningInPlace` + `TurnYawOffset` → node de turn-in-place
- `HeadLookYaw` / `HeadLookPitch` → look-at da cabeça
- `IdleBreath` → layer aditiva de respiração (chest/spine)
- `FootIKOffsetL/R` + `FootIKTiltL/R` → node de foot IK
- `StopDistanceCm` / `StopMatchPhase` → node de stop com distance matching
- `AirPoseBlend` → Blend Poses by AirPoseBlend (subida/ápice/queda)
- `PivotFootIsLeft` + `PivotWeight` → turn-in-place espelhado por pé de pivô
- `bHasVaultTarget` + `VaultWarpPhase` + `VaultWarpScale` → Motion Warping do vault

Fallback: sem o componente, os AnimInstances aplicam single-pole smoothing — nenhum parâmetro instantâneo chega ao Anim Graph.

## 5. Testes (CI)

- `tests/ue5/natural_locomotion_test.cpp` — **49 checks standalone** (g++ `-std=c++20 -Wall -Wextra -Werror -pedantic`): convergência, frame-rate independence, wrap shortest-path, clamp de lean, cadência de passadas (walk < sprint, idle = 0 eventos), spring de aterrissagem estável, histerese do turn-in-place, determinismo do noise, estabilidade do foot IK (clamp em cliffs), stop ease, fuzz 60s sem NaN, contrato de `ConsumeFootEvent`.
- `tests/ue5/distance_match_test.cpp` — **38 checks standalone** (Fase 32): cinemática de parada (600→180 cm, 900→405 cm, quadrática), fase de stop monótona 0→1 e reset na arrancada, warp idêntico na razão 1 e clampado na janela ±35%, NaN-safe, pivô (direita→esquerdo, esquerda→direito, histerese 12°, peso linear), air pose (subida −1 / queda +1 / grounded→0, independência 60 vs 120 Hz), fuzz 600 frames sem NaN.
- Registrado em `scripts/test_ue5_logic.sh` (roda em toda a CI junto dos world rule tests).
- `scripts/validate_uht.py` — headers novos registrados em `NEW_FILES` (312/312 checks).

## 6. Arquivos

| Arquivo | Papel |
|---------|-------|
| `Game/Animation/KhaaosLocomotionCore.{h,cpp}` | **Kernel matemático puro** (zero deps UE) — suavização, lean, stride, land, turn, breath, look, foot IK, distance matching, air pose, pivô, warp |
| `Game/Animation/KhaaosNaturalLocomotionComponent.{h,cpp}` | **Novo** — ponte UE5 (sampling, traces, perfis, eventos) |
| `tests/ue5/natural_locomotion_test.cpp` | **49 checks standalone** do kernel |
| `tests/ue5/distance_match_test.cpp` | **38 checks standalone** — stop matching / warp / pivô / air pose |
| `Player/KhaaosCharacter.{h,cpp}` | Componente + envelope de aceleração CMC |
| `Game/Character/KhaaosOperativeActor.{h,cpp}` | Componente + perfil por espécie (operativos) |
| `Player/KhaaosPlayerAnimInstance.{h,cpp}` | Consome o kernel (+ fallback smoothing) |
| `Game/Animation/KhaaosSpeciesAnimInstance.{h,cpp}` | Consome o kernel (+ fallback smoothing) |
| `Game/Character/KhaaosAnimationBlendManager.{h,cpp}` | Spring-damper real por cadeia de bones |
| `Game/AI/KhaaosAIController.{h,cpp}` | Assinatura de locomoção + gait wobble dos bots |
| `scripts/test_ue5_logic.sh` | Teste do kernel registrado |
| `scripts/validate_uht.py` | Headers novos em `NEW_FILES` |
| `scripts/ue5/create_natural_locomotion_assets.py` | **Novo** — cria BS/AO com eixos do contrato, idempotente, relatório JSON |

## 7. Wiring dos assets no host licenciado (UE5.8 Editor)

### 7.1 Automatizado — `create_natural_locomotion_assets.py`

Cria os **containers de asset** com eixos exatamente iguais aos parâmetros do
kernel (idempotente; sem skeleton em `/Game/Characters`, nada é fabricado):

```bash
# dentro do Editor (File → Execute Python Script) ou cmdline:
#   UnrealEditor-Cmd.exe KhaaosRun.uproject -run=pythonscript \
#     -script=<repo>/scripts/ue5/create_natural_locomotion_assets.py [--dry-run]
```

| Asset criado (por espécie) | Eixo 0 | Eixo 1 | Faixa |
|---|---|---|---|
| `BS_NaturalLocomotion` | `SmoothedSpeed` | `SmoothedDirection` (wrap) | 0..1000 cm/s grid 10 · −180..180° grid 15 |
| `AO_NaturalLean` | `LeanRoll` | `LeanPitch` | ±(lean da espécie +2°) · ±9° |

Faixas de lean por espécie vêm da tabela §3 (headroom +2° absorve o overshoot
da spring ζ=0.85). Relatório: `Saved/NaturalLocomotionWiring_report.json`.

### 7.2 Manual — nós do AnimGraph (tabela de ligação)

O Python do Editor não expõe criação de nós do AnimGraph; a ligação abaixo é
feita na UI (ou via `unreal-mcp` no host). Ordem de cima para baixo no grafo:

| # | Parâmetro (Khaaos\|Anim\|Natural) | Nó no AnimGraph | Ligação |
|---|---|---|---|
| 1 | `SmoothedSpeed` + `SmoothedDirection` | `BS_NaturalLocomotion` (Sample) | entra nos eixos X/Y do blend space — **substitui** Speed/Direction crus em todas as amostragens |
| 2 | `LeanRoll` + `LeanPitch` | `AO_NaturalLean` (Aim Offset) dentro de **Layered Blend Per Bone** (spine_01, aditivo, mesh space) | sobreposto à pose base; peso 1 em andamento, fade out com `StopEase` |
| 3 | `StopEase` | gate das transições start/stop da State Machine (distance matching) | `Blend Poses by StopEase`; transição de Stop só abaixo de ~0.15 |
| 4 | `StridePhase` | sincronia de notifies de passo + reset do foot IK por planta | footstep L/R já emite `OnFootstepPhase` (áudio/VFX) |
| 5 | `LandRecovery` | blend da aterrissagem (aprox −1..1) | −1 = absorção (joelhos), →0 estabiliza; ignorar no ar |
| 6 | `bNaturalTurningInPlace` + `TurnYawOffset` | node de turn-in-place | histerese 70°/25° já no kernel; suprimido em movimento |
| 7 | `HeadLookYaw` + `HeadLookPitch` | look-at da cabeça (Aim Offset do pescoço/cabeça) | clamps 75°/40° já aplicados no kernel |
| 8 | `IdleBreath` | **Layered Blend Per Bone** aditivo (spine_02/chest) | −1..1, portadora 0.22 Hz (idle) — nunca em sprint |
| 9 | `FootIKOffsetLeft/Right` + `FootIKTiltLeft/Right` | `TwoBoneIK` por pé (`foot_l`/`foot_r`) + rotação de pé | offsets em cm, tilt em °; relaxar no ar (`bIsInAir`) |
| 10 | `StopDistanceCm` + `StopMatchPhase` | node de stop com **distance matching** (ou `Distance Matching` do LYRA-style) | fase 0→1 pela distância restante; arrival com `StopEase` < 0.15 |
| 11 | `AirPoseBlend` | **Blend Poses by AirPoseBlend** (3 poses: subir/ápice/cair) | −1 = pose de subida, 0 = ápice, +1 = queda; transições já suavizadas no kernel |
| 12 | `PivotFootIsLeft` + `PivotWeight` | turn-in-place **espelhado por pivô** (anim L × anim R) | peso 0..1 cruza para a anim pivô correta; histerese já no kernel |
| 13 | `bHasVaultTarget` + `VaultWarpPhase` + `VaultWarpScale` | **Motion Warping** do vault (target `"Vault"`) | gameplay registra via `SetWarpTarget`; escala clampa em ±35% do clip base |

### 7.3 Validação pós-wiring (host)

1. PIE: acelerar em linha reta → lean roll suave nos strafes, zero salto de parâmetro no `Anim Preview`.
2. 90° instantâneo parado → turn-in-place com easing de root (sem "giroca").
3. Queda de altura média → `LandRecovery` absorve e rebota (sem pose travada).
4. Terreno irregular → pés plantados (offset IK ≤ 35 cm, tilt ≤ 25°).
5. 3+ avatares parados → respiração fora de fase (noise por personagem).
6. Bots em esquadrão → velocidades/turn rates dessincronizados (assinatura por nome).
7. Sprint → freio em cima de uma marca → a animação de stop termina COM o avatar plantado na marca (sem derrapar no idle).
8. Salto → subida/ápice/queda visíveis; vault sobre obstáculo de distâncias diferentes (100/150/190 cm) → o corpo cobre a distância real sem rubber-band.
