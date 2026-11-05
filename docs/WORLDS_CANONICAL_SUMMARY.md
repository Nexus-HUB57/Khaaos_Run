# KHAAOS RUN — Resumo Canônico dos Mundos

> Atualizado em 2026-11-05 após a reconciliação end-to-end do catálogo, servidor, console web e runtime 3D.

## Regra operacional vigente

Cada Ring utiliza **100 operadores** e possui duração máxima de **10 minutos (600 segundos)**. O cronômetro é dividido em cinco fases de 120 segundos. A regra vale para CIGKV e para os quatro mundos competitivos W1–W4.

O contrato compartilhado está centralizado em `shared/worlds.ts`:

- `WORLD_RING_CAPACITY_OPERATORS = 100`
- `WORLD_MATCH_DURATION_SECONDS = 600`
- `targetDurationMinutes = 10` em todos os cinco mundos
- soma de `safeZonePhases[].durationSeconds = 600` por mundo

## Ordem canônica e ponte operacional

| Ordem | ID canônico | ID operacional | Nome oficial | Capacidade | Duração |
|---:|---|---|---|---:|---:|
| 0 | `CIGKV` | `CIGKV` | Khaaos Ville — Campo de Instrução de Guerra | 100 | 10 min |
| 1 | `Barburhen` | `W1` | O Mundo da Destruição | 100 | 10 min |
| 2 | `Priadus` | `W2` | A Floresta da Escuridão | 100 | 10 min |
| 3 | `Ckesalth` | `W3` | O Deserto das Almas Esquecidas | 100 | 10 min |
| 4 | `Arukheea` | `W4` | A Ilha dos Gritos Calados | 100 | 10 min |

A progressão permanece sequencial: CIGKV é desbloqueado por padrão; Barburhen exige a conclusão inicial; Priadus, Ckesalth e Arukheea continuam sujeitos às regras de extração definidas no catálogo de `shared/worlds.ts`.

## Assinatura de cada mundo

### CIGKV — Khaaos Ville

- **Bioma:** vila militar murada, pátio de armamento, setor de testes e Parque Abandonado.
- **Hazard:** `KHAOS_GRAVITY`, o Pulso Khaaos.
- **Contrajogo:** usar as quatro âncoras canônicas (`NEXUS`, `NORTH`, `EAST`, `WEST`) e os domos de contenção.
- **Dimensão do Ring:** 16.000 m²; bounding box de 160 × 100 m; perímetro de 520 m; densidade de 160 m² por operador.
- **Runtime:** o Pulso Khaaos é materializado em `game-runtime/src/game3d/scenarios.js` e `survivalfx3d.js`.

### W1 — Barburhen, O Mundo da Destruição

- **Bioma:** ruínas urbanas pós-guerra, construções inacabadas, estação ferroviária e setores industriais.
- **Hazard:** `ACID_RAIN`, implementado no runtime por gate específico de Barburhen.
- **Dinâmica:** “Água da Morte”; o anel fecha em direção ao Parque Abandonado.
- **Dimensão do Ring:** 19.000 m²; bounding box de 190 × 100 m; perímetro de 580 m; densidade de 190 m² por operador.
- **Runtime:** a chuva ácida permanece id-gated no simulador; o cenário não declara `survival`, conforme o contrato F42.

### W2 — Priadus, A Floresta da Escuridão

- **Bioma:** selva hostil, pântanos, flora carnívora e neblina alucinógena.
- **Hazard:** `SPORE_FOG`, neblina com esporos tóxicos.
- **Dinâmica:** “Emboscada Verde”; o anel fecha no Templo Antigo.
- **Dimensão do Ring:** 22.000 m²; bounding box de 220 × 100 m; perímetro de 640 m; densidade de 220 m² por operador.
- **Runtime:** `sporeTopY = 90`; acima desse limite há refúgio contra a camada baixa de esporos.

### W3 — Ckesalth, O Deserto das Almas Esquecidas

- **Bioma:** deserto árido, lagoas de petróleo em chamas, areia movediça e fumaça tóxica.
- **Hazard:** `TOXIC_SMOKE`.
- **Dinâmica:** “Assassino Silencioso”; após o marco de cinco minutos, o anel converge para a Vila Sombria.
- **Dimensão do Ring:** 25.000 m²; bounding box de 250 × 100 m; perímetro de 700 m; densidade de 250 m² por operador.
- **Runtime:** `smokeTopY = 180`; o dressing inclui óleo em chamas e areia movediça sem reintroduzir lava vulcânica como hazard canônico.

### W4 — Arukheea, A Ilha dos Gritos Calados

- **Bioma:** ilha isolada, Prisão do Sol da Noite, tsunami iminente, naufrágios e tubarões.
- **Hazard:** `TSUNAMI_WAVE`.
- **Dinâmica:** “Tsunami”; o anel fecha na Prisão do Sol da Noite e o heliporto da torre funciona como rota final.
- **Dimensão do Ring:** 18.000 m²; bounding box de 180 × 100 m; perímetro de 560 m; densidade de 180 m² por operador.
- **Runtime:** `submergeBelowY = 90`; mar e tubarões são materializados no dressing/worldmarks do cenário.

## Integração técnica

O contrato foi alinhado nos seguintes pontos:

- `shared/worlds.ts`: capacidades, duração-alvo, fases e constante compartilhada de 600 segundos.
- `server/game/MatchFlow.ts`: pipeline de cinco mundos, capacidade de 100 e cinco fases de 120 segundos.
- `server/game/MatchmakingService.ts`: limite padrão de 100 jogadores.
- `server/game/RoomManager.ts`: validação e criação de salas até 100 jogadores.
- `shared/game-hierarchy.ts`: hierarquia narrativa sem referências a partidas de 90–120 minutos ou ao Ring legado de 3 horas.
- `shared/ue5-engineering-hub.ts`: `maxPlayers = 100` e `ringCloseSeconds = 600` para todos os bundles.
- `client/src/lib/marshal-console-api.ts`: capacidades exibidas no console iguais a 100 para todos os mundos.

## Fontes e gates de validação

- `README.md`, seção “Ontologia dos Mundos” e tabela de dimensões dos Rings.
- `docs/FASE42_MUNDOS_FIDELIDADE_README.md`.
- `docs/FASE43_DETALHES_MUNDOS.md`.
- `docs/FASE44_AUDITORIA_FIDELIDADE.md`.
- `tests/official/world-catalog.test.ts`.
- `tests/official/worlds-dimensions.test.ts`.
- `tests/official/worlds-fidelity-parity.test.ts`.
- `game-runtime/scripts/audit-fidelity.mjs`.

O teste de catálogo garante explicitamente que os cinco mundos usam 100 operadores, que cada conjunto de fases soma 600 segundos e que os hazards permanecem alinhados ao runtime F42/F47.

## Artefatos operacionais atualizados

A mesma capacidade canônica está refletida nos fixtures de prova em `components_dev/avatars/proofs/`, na configuração de Rings em `components_dev/rings/ring_config.json`, no validador `scripts/validate_e2e_v4.py` e no teste de integração `tests/integration/ring-system.integration.test.ts`. Esses artefatos não devem reintroduzir os valores legados 50, 60, 75 ou 80 operadores.
