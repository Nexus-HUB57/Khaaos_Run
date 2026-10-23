# Khaaos Run — Fase 4: Multi-World Design Document

## Visão Geral

Fase 4 expande Khaaos Run de um único mapa de treino (CIGKV) para um ecossistema
de 4 mundos competitivos, cada um com mecânicas únicas, requisitos de progressão,
e economia própria. A progressão é linear: CIGKV → W1 → W2 → W3 → W4.

---

## Estado de implementação — 23/10/2026

O `game-runtime` agora contém um **slice local de protótipo** de Barburhen, selecionável no modal Zu. Ele reutiliza a arena procedural curta de CIGKV, mas oferece zonas nomeadas de Setor Urbano, Estação Fria, Parque Ferrífero e Usina Industrial, landmarks próprios para os trechos urbano/ferroviário, spawn e distribuição de loot por setor, paleta fria e regra temporária de 1,5× para dano do Ring e KRC por abate. CIGKV continua como cenário padrão.

Este slice não implementa o mundo final de 12 km, partidas de 100 jogadores, quatro variantes Zu, sistema sazonal/blizzard, todos os setores de produção ou matchmaking multi-world. Os valores e a taxonomia nas tabelas abaixo continuam sendo **alvos de design**, não funcionalidades verificadas. Antes de congelar o mapa final, reconciliar os setores conceituais Industrial/Residential/Military/Wasteland/Port com os quatro distritos do slice local.

O cliente também permite selecionar os 16 operativos do catálogo canônico e aplica identidade/paleta visual ao ator. Habilidades próprias, balanceamento por arquétipo e integração equivalente no cliente UE5 permanecem pendentes.

---

## Hierarquia de Mundos

```
CIGKV (Treino, sempre desbloqueado)
  │
  ├── W1/C1 Barburhen (10 partidas CIGKV)
  │     │
  │     ├── W2/C2 Priadus (5 partidas W1)
  │     │     │
  │     │     ├── W3/C3 Ckesalth (5 partidas W2)
  │     │     │     │
  │     │     │     └── W4/C4 Arukheea (5 partidas W3)
```

---

## W1/C1 Barburhen — Primeiro Mundo Competitivo

### Lore
Barburhen é a primeira prova além do campo de instrução. Uma zona industrial-militar
abandonada onde o inverno é tão brutal quanto os outros jogadores. Os sobreviventes
do CIGKV que provam seu valor são enviados aqui — e muitos não retornam.

### Especificações Técnicas
| Parâmetro | Valor |
|-----------|-------|
| MaxPlayers | 100 |
| RingDuration | 5400s (1.5h) |
| MapSize | 12km × 12km |
| ZonePhases | 4 (mais rápido + mais dano que CIGKV) |
| ZEX | 30 |
| Zu Variants | 4 (cinto/saltar/máscara/**gelo**) |
| SpawnPoints | 100 |
| LootPoints | 120 |
| KRCEarnMultiplier | 1.5x |
| Entry | 10 partidas CIGKV |

### Setores (5)
| Setor | Fração | Descrição |
|-------|--------|-----------|
| Industrial | 2/10 (20%) | Fábricas abandonadas, telhados acessíveis |
| Residential | 2/10 (20%) | Prédios residenciais, combate vertical |
| Military | 3/10 (30%) | Base militar, bunkers, melhor loot |
| Wasteland | 2/10 (20%) | Terreno aberto, pouca cobertura |
| Port | 1/10 (10%) | Porto, contrabando, loot raro |

### Sistema de Estações
- **Verão** (30 min): Dano menor, loot mais comum
- **Inverno** (30 min): Dano 1.5x na zona, loot mais raro, blizzard/frostbite

### Giants Challenge
- Top 50 jogadores por kills se classificam
- Evento após o Ring com prize pool de 100,000 KRC
- Duração: 600s

### Zu4 Gelo — Único de Barburhen
Entrada cinematográfica por deslizamento no gelo. O jogador começa em uma
superfície congelada e deve controlar o escorregão até a zona segura.
Decisão errada = -35% HP (mais punitivo que as outras variantes).

---

## W2/C2 Priadus — Arquipélago Aquático

### Lore
Priadus é um arquipélago tropical onde a guerra acontece entre ilhas, recifes
e o oceano profundo. Jogadores nadam, pilotam botes, e mergulham nas profundezas.
A maré decide quem sobrevive.

### Especificações Técnicas
| Parâmetro | Valor |
|-----------|-------|
| MaxPlayers | 75 |
| RingDuration | 7200s (2h) |
| MapSize | 8km × 8km |
| ZonePhases | 3 (Beach→Shallows→Deep) |
| ZEX | 20 (baseados em ilhas) |
| Zu Variants | 3 (cinto/saltar/**nadando**) |
| SpawnPoints | 75 |
| LootPoints | 90 |
| KRCEarnMultiplier | 2.0x |
| Entry | 5 partidas W1 |

### Setores (4)
| Setor | Fração | Descrição |
|-------|--------|-----------|
| Archipelago | 4/10 (40%) | Ilhas principais, combate em pé |
| Reef | 2/10 (20%) | Recifes rasos, loot subaquático |
| DeepOcean | 3/10 (30%) | Oceano profundo, pressão, submarinos |
| VolcanoIsland | 1/10 (10%) | Ilha vulcânica, loot mais raro |

### Mecânicas Aquáticas
- **Beach**: Combate em pé, água rasa, correntezas fracas
- **Shallows**: Natação, combate em botes, correntezas moderadas
- **Deep**: Mergulho, dano de pressão (3 dmg/s), correntezas fortes, visibilidade limitada
- Tubarões atacam jogadores inativos na água
- Redemoinhos surgem em fases avançadas

### Zu3 Nadando — Único de Priadus
O jogador começa na água e deve nadar até uma ilha. Tempo limite antes de
cansaço. Decisão: escolher a ilha certa (algumas têm emboscadas).

---

## W3/C3 Ckesalth — Montanha Vertical

### Lore
Ckesalth é a montanha que ninguém deveria escalar. Uma fortaleza vertical
onde cada metro de altitude é conquistado com sangue. Ziplines, escadas, e
paredes escaláveis criam um campo de batalha tridimensional.

### Especificações Técnicas
| Parâmetro | Valor |
|-----------|-------|
| MaxPlayers | 60 |
| RingDuration | 5400s (1.5h) |
| MapSize | 6km × 6km |
| VerticalExtent | 2000m |
| ZonePhases | 4 (Base→Mid→Peak→Summit) |
| ZEX | 25 (baseados em altitude) |
| Zu Variants | 3 (cinto/saltar/**escalando**) |
| SpawnPoints | 60 |
| LootPoints | 80 |
| KRCEarnMultiplier | 2.5x |
| Entry | 5 partidas W2 |

### Setores (4)
| Setor | Fração | Descrição |
|-------|--------|-----------|
| BaseCamp | 2/8 (25%) | Acampamento base, altitude 0-400m |
| MidMountain | 3/8 (37.5%) | Encostas, escadas, cavernas, 400-1000m |
| PeakZone | 2/8 (25%) | Pico, neve, ziplines, 1000-1600m |
| SummitArena | 1/8 (12.5%) | Arena final, 1600-2000m |

### Mecânicas Verticais
- **Vantagem de Elevação**: Jogadores acima têm bônus de dano (+15% por 100m)
- **Ar Fino**: Acima de 1500m, dano de sufocamento (1 dmg/s, escala com altitude)
- **Avalanches**: Evento Pulso Khaaos pode causar avalanche (dano em área)
- **Ziplines**: Travessia rápida entre pontos elevados
- **Escalada**: Mecânica de grip check, queda se falhar
- ZEX em maior altitude dão XP bonus (1.0x-1.5x baseado na altitude)

### Zu3 Escalando — Único de Ckesalth
O jogador começa escalando uma parede. Deve completar a escalada dentro do
tempo limite. Falha no grip check = queda (dano de queda) + posição exposta.

---

## W4/C4 Arukheea — Deserto de Cânions

### Lore
Arukheea é o deserto onde o sol mata e os cânions escondem. Tempestades de
areia cegam os desesperados, e oásis são a única salvação. Só os veteranos
de Ckesalth sobrevivem aqui — e mesmo assim, o calor não perdoa.

### Especificações Técnicas
| Parâmetro | Valor |
|-----------|-------|
| MaxPlayers | 80 |
| RingDuration | 6000s (~1h40m) |
| MapSize | 10km × 10km |
| ZonePhases | 4 (Dunes→Canyon→Oasis→Arena) |
| ZEX | 22 (oásis + cânion) |
| Zu Variants | 3 (cinto/saltar/**areia**) |
| SpawnPoints | 80 |
| LootPoints | 100 |
| KRCEarnMultiplier | 3.0x |
| Entry | 5 partidas W3 |

### Setores (4)
| Setor | Fração | Descrição |
|-------|--------|-----------|
| Dunes | 3/10 (30%) | Dunas abertas, pouco cobertura, calor extremo |
| Canyon | 3/10 (30%) | Cânions profundos, sombra, loot escondido |
| Oasis | 2/10 (20%) | Oásis curativos, loot comum |
| Arena | 2/10 (20%) | Arena final, onda de calor, sem sombra |

### Mecânicas Desérticas
- **Dano de Calor**: 1.5 dmg/s × HeatIntensity (fase-dependente)
- **Oásis**: Cura 5 HP/s, cancela dano de calor, XP bonus 1.5x
- **Tempestades de Areia**: A cada 900s (60% chance)
  - Visibilidade reduzida 60-90%
  - Dano 1-3 dmg/s dentro da tempestade
  - Movem-se pelo mapa (velocidade 50-200)
  - Duração 60-180s
- **Areia Movediça**: Zonas de perigo em Dunes, prendem jogadores
- **Hidratação**: Sistema de hidratação (100 → 0), dano abaixo de 20%

### Zu3 Areia — Único de Arukheea
O jogador começa no meio de uma tempestade de areia. Deve encontrar abrigo
(um cânion ou bunker) dentro do tempo limite. Sem abrigo = dano contínuo
até a tempestade acabar ou encontrar cobertura.

---

## Economia Multi-Mundo

### KRC (Khaaos Run Coin)
Moeda do jogo, gerenciada pelo Atomic Ledger imutável.

### Multiplicadores de Ganho por Mundo
| Mundo | KRCEarnMultiplier | LootValueMultiplier | ExtractionBonus |
|-------|-------------------|--------------------|-----------------|
| CIGKV | 1.0x | 1.0x | 1.0x |
| W1 Barburhen | 1.5x | 1.2x | 1.5x |
| W2 Priadus | 2.0x | 1.3x | 1.3x |
| W3 Ckesalth | 2.5x | 1.4x | 1.3x |
| W4 Arukheea | 3.0x | 1.5x | 1.5x |

### Atomic Ledger
- Append-only, idempotency keys, SHA256 hash chain
- Double-entry bookkeeping (débito + crédito sempre balanceados)
- Operações: Mint, Burn, Transfer, EscrowLock, EscrowRelease, EscrowRefund
- Rollback via compensating transactions (nunca deleta)
- Verificação de integridade (VerifyIntegrity) a cada escrita

### Compliance Framework
- KYC (Know Your Customer): Verificação de identidade para transações > 5,000 KRC
- AML (Anti-Money Laundering): Detecção de padrões suspeitos
  - Rapid movement: 20+ transações em 1h
  - Circular transfers: KRC retornando à origem
- Banco Central do Brasil: Reporting automático
- IRPF: Ganho de capital sobre KRC
- Limites: 10,000/tx, 50,000/dia, 500,000/cumulativo
- Status: Pending/Approved/Restricted/Suspended

---

## Progressão e Inventário

### Portões de Progressão
| Portão | Requer | Resultado |
|--------|--------|-----------|
| CIGKV→W1 | 10 partidas CIGKV | Desbloqueia Barburhen |
| W1→W2 | 5 partidas W1 | Desbloqueia Priadus |
| W2→W3 | 5 partidas W2 | Desbloqueia Ckesalth |
| W3→W4 | 5 partidas W3 | Desbloqueia Arukheea |

### Regras de Inventário
| Tipo | Transferência | Persistência |
|------|---------------|-------------|
| Cosmetics | ✅ Entre mundos | Permanente |
| Weapons | ❌ Travado no mundo | Permanente (no mundo) |
| Consumables | ❌ Reset por match | Por match |
| Achievements | ✅ Cross-world | Permanente |

### Leaderboards
- Cada mundo tem leaderboard própria
- Ranking por score acumulado
- Top 1000 entradas por mundo
- Atualizado após cada match

---

## Sistema "Dedo-Duro" (Inatividade)

Cada mundo pune jogadores inativos (que evitam combate):

| Mundo | Threshold | Dano/s | Manifestação |
|-------|-----------|--------|-------------|
| CIGKV | 120s | 2.0 | Ratos, mosquitos |
| W1 Barburhen | 90s | 3.0 | Gelo (Inverno), ratos |
| W2 Priadus | 100s | 2.5 | Tubarões |
| W3 Ckesalth | 100s | 2.5 | Avalanches |
| W4 Arukheea | 100s | 2.5 | Desidratação acelerada |

---

## Arquitetura de Implementação

### Classes C++ (UE5.8)
```
Game/World/
├── Barburhen/
│   ├── KhaaosBarburhenLevel.h/.cpp    (AKhaaosBarburhenLevel : ALevelScriptActor)
│   └── KhaaosBarburhenMapData.h/.cpp  (UKhaaosBarburhenMapData : UPrimaryDataAsset)
├── Priadus/
│   ├── KhaaosPriadusLevel.h/.cpp
│   └── KhaaosPriadusMapData.h/.cpp
├── Ckesalth/
│   ├── KhaaosCkesalthLevel.h/.cpp
│   └── KhaaosCkesalthMapData.h/.cpp
├── Arukheea/
│   ├── KhaaosArukheeaLevel.h/.cpp
│   └── KhaaosArukheeaMapData.h/.cpp
└── KhaaosMultiWorldPersistence.h/.cpp  (UEngineSubsystem)

Game/Economy/
├── KhaaosAtomicLedger.h/.cpp          (UEngineSubsystem)
└── KhaaosComplianceFramework.h/.cpp   (UEngineSubsystem)
```

### Config INI
```
Config/
├── DefaultBarburhen.ini
├── DefaultPriadus.ini
├── DefaultCkesalth.ini
└── DefaultArukheea.ini
```

### Convenções
- C++20, UE5.8
- `#pragma once` em todos headers
- `GENERATED_BODY()` em todas USTRUCT/UCLASS
- Prefixo `Khaaos` em todas classes
- `UPROPERTY`/`UFUNCTION` com categorias `Khaaos|Mundo|Grupo`
- Comentários em Português Brasileiro para conceitos de jogo
- `DOREPLIFETIME` para propriedades replicadas
- `HasAuthority()` guard em Tick para lógica de servidor
