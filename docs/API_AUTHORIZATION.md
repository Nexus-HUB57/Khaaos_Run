# Matriz de autorização das APIs mutáveis

Este documento registra a fronteira de autorização e as lacunas conhecidas. Autenticação identifica a sessão; **não** implica permissão para administrar o estado global.

No multiplayer, capacidade/carga e o temporizador/multiplicador de Adrenalina são serializados somente para o próprio jogador; posições e vitals que compõem o estado público da sala continuam visíveis aos participantes.

| Rota/método | Recurso afetado | Proprietário/capability | Estado e lacuna principal |
|---|---|---|---|
| `POST /api/bank/deposit` | conta e ledger | usuário autenticado; conta do próprio usuário | input Zod limitado; mutação ainda não transacional (roadmap 0.2) |
| `POST /api/bank/transfer` | saldos e ledger | usuário autenticado; conta do próprio usuário | input Zod limitado; mutação ainda não transacional (0.2) |
| `POST /api/loans` | empréstimo, saldo e ledger | usuário autenticado; empréstimo do próprio usuário | input Zod limitado; mutação ainda não transacional (0.2) |
| `POST /api/loans/:id/pay` | empréstimo, saldo e ledger | proprietário do empréstimo | leitura e update usam ID + userId; débito/update ainda precisam de transação atômica (0.2) |
| `POST /api/items/:id/equip` | loadout | proprietário do item no `UPDATE` | escopo SQL por ID + userId |
| `POST /api/items/purchase` | saldo, item e ledger | usuário autenticado; item criado para o próprio usuário | input Zod limitado; mutação ainda não transacional (0.2) |
| `POST /api/items/:id/use` | durabilidade e vida | proprietário do item e stats do servidor | durabilidade consumida com ID + userId; durante match só WebSocket autoritativo |
| `POST /api/items/:id/repair` | saldo, durabilidade e ledger | proprietário do item | update SQL por ID + userId; coordenação saldo/item ainda não transacional (0.2) |
| `POST /api/player/daily-salary` | salário/saldo/ledger | usuário autenticado, aplicado ao próprio perfil | janela de 24h ainda vulnerável a concorrência; transação/idempotência em 0.2 |
| `POST /api/zone/start`, `POST /api/zone/stop` | sessão global e spawn de loot | allowlist `ZONE_OPERATOR_IDS` | operador verificado no servidor; inputs de start limitados |
| `POST /api/zone/damage` | saúde | usuário autenticado; afeta somente o próprio userId | dano limitado por Zod; revisar exposição da ação de teste fora do runtime |
| `POST /api/zone/heal` | saúde | allowlist `ZONE_OPERATOR_IDS` | ferramenta de teste; capacidade verificada no servidor e no HUD |
| `POST /api/loot/spawn` | loot global (limpa/substitui o conjunto atual) | allowlist `ZONE_OPERATOR_IDS` | operador verificado no servidor; payload vazio |
| `POST /api/loot/:id/pickup` | loot compartilhado e inventário | usuário autenticado; um coletor vence a corrida | ID validado; durante match exige pickup WebSocket autoritativo |
| `POST /api/player/respawn` | estado do jogador | usuário autenticado, próprio userId | não altera outro jogador; revisar política/cooldown de respawn |
| `POST /api/economy/loan-preview` | cálculo efêmero | usuário autenticado | input limitado; sem escrita |
| `POST /api/economy/simulate`, `POST /api/economy/simulate-batch` | cálculo efêmero | usuário autenticado | dimensões limitadas para conter custo; sem escrita |

## Leitura com efeito colateral conhecido

`GET /api/zone/status` avança a fase da sessão chamando `updateZoneSession` quando o tempo termina. A leitura deve passar a calcular o estado efetivo sem escrever, ou o avanço deve ser movido para um tick/worker explícito; isso permanece na entrega de fechamento 0.1.

## Próxima entrega

Fechar a Prioridade 0.1 com testes HTTP de negação/autorização por rota (sem sessão, usuário errado, operador comum vs. operador permitido, ID inexistente e body inválido), completar a revisão dos handlers mutáveis ainda não testados e remover/validar efeitos colaterais em rotas `GET`. Em seguida, avançar para a Prioridade 0.2: transações PostgreSQL, aritmética monetária exata, idempotência e testes concorrentes.
