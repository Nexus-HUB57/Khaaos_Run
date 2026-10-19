# Revalidação P0 — economia e gameplay

- **Data:** 2026-10-18
- **Baseline inspecionada:** `b9d60d9` (`b9d60d959330ed00d6d6448980b2ddcfecc807e5`)
- **Base desta nota:** somente os resultados estruturados fornecidos; nenhuma pesquisa ou execução adicional foi feita.

## Síntese operacional

Os cinco status foram reconciliados abaixo. H4 permanece **fixed** e, conforme solicitado, não são repetidos seus achados nem suas recomendações. H1, H2, H3 e H5 continuam exigindo decisão e/ou ação. Os resultados descrevem inspeção estática e lacunas de cobertura; não há exploit reproduzido nem confirmação de comportamento em produção.

| ID | Status | Severidade indicada | Síntese operacional |
|---|---|---|---|
| H1 — Depósito KRC | `needs-product-decision` | Condicionalmente média | A rota autenticada aceita um montante escolhido pelo cliente e credita KRC sem verificar grant ou liquidação. É preciso decidir se o fluxo é compra paga, concessão gratuita ou ambos antes de alterar a autorização. |
| H2 — Spawn global de loot | `partial` | Moderada | Guarda de operador existe; o spawn apaga todo loot e repõe presets. A intenção de reset global versus escopo por sessão não está decidida. |
| H3 — Pickup REST de loot | `partial` | Moderada; pode ser alta conforme a política | Fora de uma sala ativa, o endpoint autenticado permite reivindicar loot pelo ID, sem validação de sessão/proximidade. A elegibilidade REST fora de partida não está especificada. |
| H4 — Movimento WebSocket autoritativo | `fixed` | Baixa | Status registrado; findings fixed omitidos desta síntese. |
| H5 — Recompensa de partida solo | `still-present` | Média, dependente da política | Um host pode iniciar com 1 jogador apesar do mínimo 2, e o caminho examinado pode atribuir XP/rating e resultado. Falta decidir se partidas abaixo do mínimo são ranqueadas. |

## Evidências principais e gaps

### H1 — Depósito KRC (`needs-product-decision`)

- O esquema da rota recebe somente `amountUsd` (US$ 1–10.000); não recebe identificador de pedido/grant ou prova de pagamento. O handler autenticado converte esse valor em KRC e chama `DatabaseStorage.depositFunds`; a `Idempotency-Key` lida no handler não é passada à operação.
- O storage credita `weaponsBalance` e `bonusBalance` e grava `DEPOSITO`, sem consultar entitlement, pagamento ou `economy_ledger_entries`. O lançamento `external.deposit` no serviço econômico é clearing criado pelo sistema, não prova de liquidação; além disso, a rota examinada não usa esse serviço.
- Os testes citados cobrem autenticação, limites e chamada direta ao serviço econômico, mas não autorizam o crédito pelo endpoint ativo nem comprovam pagamento/grant. O risco descrito é inflação/abuso de economia virtual; os resultados não estabelecem perda de dinheiro real.
- **Gap:** definir o contrato do produto e testar a rota ativa: autorização válida, grant ausente/inválido/não liquidado/de outro usuário/já consumido, rejeição sem mutação, consumo único e idempotência no caminho real.

### H2 — Spawn global de loot (`partial`)

- As rotas de início de zona e spawn exigem operador em allowlist. A evidência dos testes descreve negação de usuários sem sessão ou sem autorização; body forjado não concede privilégio.
- `spawnLootPresets` limpa loot sem filtro de sessão e reemite presets; `zone/start` associa os novos itens à sessão, enquanto o endpoint separado pode criá-los sem sessão. O efeito alcança loot de outras sessões. O fluxo altera inventário por pickup, não KRC.
- **Decisão necessária antes de qualquer alteração:** confirmar se operadores devem provocar reset global durante partidas. Se sim, preservar e documentar o contrato/condições de uso; se não, implementar limpeza e spawn por sessão, inclusive definir explicitamente o contrato do endpoint separado. Não mudar o escopo presumindo que o reset global é dispensável.
- **Gap:** testes de integração de 401/403 garantindo que storage não é chamado nem loot alterado; teste de storage com loot de múltiplas sessões que fixe o comportamento deliberadamente escolhido. Os testes negativos relevantes não rodaram no ambiente analisado por falta de `tsx` (`ERR_MODULE_NOT_FOUND`).

### H3 — Pickup REST de loot (`partial`)

- O endpoint REST autentica o usuário, mas, fora de sala `COUNTDOWN`/`IN_PROGRESS`, a evidência indica que aceita pickup por ID sem validar sessão associada ou distância. O fluxo WebSocket, em contraste, exige partida em andamento, jogador vivo e distância de até 8 usando posição física do servidor; essa validação não é aplicada pelo handler REST.
- Há compare-and-set atômico para que uma linha de loot tenha um vencedor, mas a inserção de item e a eventual cura ocorrem depois, em chamadas separadas; rollback integral do caminho REST não foi verificado. O fluxo não credita/debita KRC.
- **Decisão necessária:** documentar se pickup REST fora de partida é intencionalmente global ou deve exigir sessão/raio. Se restrito, usar associação e posição autoritativa do servidor, nunca coordenadas do cliente. Independentemente da política de elegibilidade, tornar claim, item e efeito de cura uma transação com rollback.
- **Gap:** testes HTTP de casos em partida, lobby/sem sala e loot de sessões ativa/encerrada/diferente/nula; teste de elegibilidade espacial caso seja a regra; testes PostgreSQL de concorrência e falha/rollback entre claim, item e cura. A revisão foi estática, sem concorrência ou falhas contra PostgreSQL real.

### H5 — Recompensa de partida solo (`still-present`)

- `tryStartMatch` permite que o host passe com um jogador apesar de `minPlayersToStart: 2`; countdown e `beginMatch` não revalidam esse mínimo. A verificação de vitória aceita o único sobrevivente e o encaminha a `applyMatchRankings`.
- A implementação de ranking examinada persiste XP/rating e `match_results` sem rejeitar esse participante. Para o caso descrito (rating e média 1000), a recompensa calculada é 120 XP, mais 12 por eliminação, e +16 rating. Não há crédito KRC nesse caminho.
- O comentário no código permite force-start com pelo menos um jogador, mas não define se isso pode gerar progresso competitivo. **Decisão necessária:** decidir se o mínimo é requisito para recompensa ranqueada e se force-start submínimo continua permitido.
- **Gap:** teste do fluxo completo de host solo até fim da partida e efeitos persistidos; teste com `RankingService` real e storage espiado para elegibilidade. Os resultados informam que a suíte não foi executada.

## Sequência mínima recomendada

1. **Fechar decisões de produto antes de alterações potencialmente destrutivas:** (a) H1: compra paga, grant gratuito ou ambos; (b) H2: reset global ou por sessão; (c) H3: elegibilidade de pickup REST fora de partida; (d) H5: force-start e elegibilidade para ranking abaixo do mínimo. Registrar as regras e os casos permitidos/negados.
2. **H1 — corrigir autorização e cobrir a rota ativa:** se pago/concedido por pedido, derivar valor de grant/pedido validado no servidor e consumi-lo atomicamente com crédito, ledger e idempotência; se torneira gratuita, modelar explicitamente como grant de jogo e impor limites server-side. Em ambos os casos, adicionar testes HTTP/integrados de rejeição sem mutação, sucesso e replay idempotente.
3. **H3 — definir elegibilidade e atomicidade:** implementar somente a política decidida; em seguida, transacionar claim condicional + item + cura. Testar HTTP e PostgreSQL para casos de elegibilidade, concorrência (um vencedor) e rollback integral.
4. **H2 — preservar a guarda e fixar o escopo escolhido:** não remover autorização. Manter o reset global e documentar/testar se esse for o contrato; se o produto decidir por sessão, restringir delete/spawn à sessão e testar ambas as rotas com loot em sessões distintas. Confirmar primeiro a execução dos testes existentes com as dependências de teste disponíveis, incluindo `tsx`.
5. **H5 — aplicar o gate correspondente à decisão:** se partidas submínimas não podem ranquear, registrar elegibilidade no início e condicionar persistência de ranking; revalidar início/countdown conforme a política para evitar corrida após operações assíncronas. Se force-start solo e recompensa forem intencionais, preservar o comportamento e testá-lo explicitamente. Executar teste de fluxo e `RankingService` real.
6. **Reexecutar a suíte direcionada e registrar resultados:** separar testes executados de inspeção estática; não considerar a ausência de falha em testes não executados como validação.

## Limitações

- Esta nota consolida somente as evidências fornecidas sobre o worktree/HEAD `b9d60d9`; não inspecionou ou alterou código, não executou testes e não verificou deploy, configuração de operadores, estado real do banco ou efeitos de triggers.
- Os resultados não demonstram exploits reproduzidos. Comportamentos de runtime, concorrência, falhas PostgreSQL, rollback e impacto em produção permanecem sem validação onde indicado.
- KRC é descrito nos resultados como moeda virtual do jogo; não se atribui valor monetário nem se conclui conversibilidade. Para H1, a revisão não estabelece contraprestação real; para H2/H3/H5, os fluxos examinados não creditam KRC.


## Acompanhamento de implementação — 2026-10-18

Esta seção complementa a análise estática anterior com alterações e testes executados no worktree `audit/economy-p0-continuation`, sobre `origin/main`; não altera retroativamente as evidências registradas para o baseline.

### Correções implementadas

- `server/routes.ts` agora encaminha depósito, transferência, solicitação/pagamento de empréstimo, compra, reparo e salário diário ao `EconomyService`, em vez dos caminhos diretos que podiam contornar ledger/idempotência. Todas essas rotas exigem `Idempotency-Key` válido e devolvem os DTOs/status do serviço.
- O pagamento de empréstimo e o reparo já não possuem fallback de débito, atualização de recurso e gravação de transação em chamadas separadas. A interface `IStorage` deixou de declarar operações de empréstimo sem implementação.
- `DatabaseStorage.pickupLoot` agora executa lock e claim do loot, criação do item, validação do jogador vivo e cura opcional em uma transação PostgreSQL única. Uma falha em qualquer etapa reverte todas as mutações.
- Os testes HTTP cobrem a exigência da chave, o encaminhamento das sete mutações econômicas e a preservação de identidade, status e respostas. O teste PostgreSQL injeta uma falha na atualização de saúde após o claim e a inserção, e confirma o rollback do loot, item e saúde.

### Validação executada

- `npm run check`: passou; removeu os erros TypeScript preexistentes no carregamento das rotas e nos contratos.
- `node --import tsx --test tests/official/routes-auth.test.ts tests/official/routes-ownership-validation.test.ts`: **140/140 testes passaram**.
- Com PostgreSQL **16.15** local e migrations aplicadas em banco descartável com sufixo `_test`, `npm run test:postgres`: **3/3 passaram**, incluindo pickup, cura e rollback por falha injetada.
- `npm run verify:all`: iniciado com o banco de teste e ainda pendente no momento desta atualização; o resultado final será registrado após a conclusão.

### Estado atual dos achados

| ID | Estado após implementação | Pendência
|---|---|---|
| H1 — Depósito KRC | Parcialmente mitigado: a rota ativa usa o serviço econômico idempotente e o ledger. | Ainda não há prova servidor-side de pagamento/grant; definir se depósito é compra paga, concessão gratuita ou ambos, então validar e consumir o entitlement atomicamente. |
| H2 — Spawn global de loot | Sem alteração: autorização de operador permanece. | Decidir reset global versus por sessão antes de mudar o escopo destrutivo do spawn. |
| H3 — Pickup REST | Atomicidade corrigida e testada em PostgreSQL real. | Decidir se pickup REST fora de partida pode reivindicar por ID sem sessão/proximidade; caso seja restrito, usar sessão e posição autoritativa do servidor. |
| H4 — Movimento WebSocket | Continua `fixed`; não reaberto por estas alterações. | Nenhuma nesta auditoria. |
| H5 — Recompensa em partida solo | Sem alteração. | Decidir se partidas iniciadas abaixo do mínimo podem receber XP/rating e se o force-start solo permanece permitido. |


### Defeito adicional encontrado durante validação E2E

O teste WebSocket end-to-end revelou que o servidor já implementava `resumeRoom`, mas o enum Zod de mensagens do cliente não aceitava `resume`; a requisição de reconexão era rejeitada antes de chegar ao handler. Corrigi o schema e passei o socket que fechou aos callbacks de close/error, ativando o guard existente contra um close atrasado do socket antigo. O teste E2E agora cobre a retomada autenticada da mesma sala/PackBack e a preservação do novo socket.

O primeiro `verify:all` ficou indefinidamente bloqueado porque esse teste tinha waits sem timeout para a sinalização de persistência e para o fechamento do WebSocket/HTTP. O teste foi endurecido com limites e encerramento explícito de clientes residuais. Após as correções, `node --import tsx --test tests/official/wari-websocket-e2e.test.ts`: **1/1 passou** (aprox. 2,9 s). Um novo `npm run verify:all` está em execução; o resultado será atualizado ao concluir.


### Validação do rollback econômico existente

A suite oficial também falhou inicialmente em `economy-postgres.test.ts` porque a expectativa de erro comparava o texto do wrapper Drizzle, e não a causa PostgreSQL (`injected ledger failure`). Ajustei somente a asserção para verificar mensagem e causa, sem alterar o serviço econômico. Com o banco descartável, o teste focado passou **1/1**; o typecheck passou. O pipeline completo está sendo repetido após este ajuste.


## Resultado final de validação — 2026-10-18

O comando `TEST_DATABASE_URL=<banco local descartável> npm run verify:all` terminou com **exit code 0**. Passaram todas as sete verificações do script: TypeScript, build e testes do app oficial; regras de loot UE5 portáveis; build, testes e stress do runtime. A falha inicial da suite oficial foi corrigida na asserção que agora verifica a causa PostgreSQL original.

Validações PostgreSQL adicionais: `npm run test:postgres` **3/3**; `tests/official/economy-postgres.test.ts` **1/1**; teste WebSocket de reconexão **1/1**. O teste de lógica UE5 é host-portável e compila as regras reais compartilhadas, mas não substitui uma build completa no Unreal Editor/UnrealBuildTool, indisponível neste ambiente.
