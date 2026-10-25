# Roadmap mestre de engenharia — Khaaos Run

**Última revisão:** 20 de outubro de 2026
**Base examinada:** `main` em `26758e008c9671f92a8f543eb5fbb2d0a2b3f369` (`26758e0`).
**Escopo:** repositório oficial `Nexus-HUB57/Khaaos_Run`; status baseado em código, testes e evidência disponível nessa revisão. Não presume datas, tamanho de equipe ou disponibilidade de infraestrutura.

## Estado atual

O repositório contém um vertical slice executável em React/TypeScript, Express, PostgreSQL e WebSocket: autenticação OIDC/sessões, inventário War’I, matchmaking, salas, zona, combate, loot, ranking e resultado. Também mantém um runtime Node separado, documentação e uma trilha Unreal Engine 5.8. A trilha UE5 **ainda não foi comprovada por build com UnrealBuildTool nem Automation Tests em instalação real**; checks C++/portáveis no CI não substituem isso.

**Evidência desta branch:** o checkout Stripe BRL test-only, migration 0005, validação de raw-body webhook e testes de state machine estão em revisão. Localmente passaram `npm run check`, `npm run build`, `npm run test:official`, `npm run verify:all`, `drizzle-kit check` e geração Drizzle sem diff. O teste PostgreSQL Stripe foi escrito, mas não foi executado neste sandbox por ausência de serviço local; a execução CI com PostgreSQL efêmero permanece gate obrigatório antes do merge.

Executado em `main` no SHA acima: `npm run verify:all`, com todas as etapas configuradas aprovadas.

- Aplicação oficial: **221 aprovados, 0 falhas, 1 ignorado** na suíte oficial principal; **39/39 aprovados** na suíte E2E adicional.
- Integração PostgreSQL: **1 teste aprovado** na execução local atual. A integração real do CI usa PostgreSQL efêmero; isso não representa auditoria nem migração no banco de produto.
- `game-runtime`: **14 aprovados, 0 falhas, 2 ignorados**; o build e o stress test passaram.
- TypeScript, build do app, build do runtime e checks portáveis de regras UE5 passaram.
- A execução remota do workflow `CI` para o commit `26758e0` terminou com sucesso.

Os totais acima são por etapa/comando e **não devem ser somados como casos únicos**, pois há conjuntos e verificações sobrepostos. `1 ignorado` na suíte oficial e `2 ignorados` no runtime refletem testes condicionais/serviços externos que não estavam ativos na execução local. Não foi feita aqui execução com UnrealBuildTool, ambiente OIDC de produção, staging do jogo ou banco de produto.

### Estado das issues relacionadas

Na consulta de 20/10/2026, as issues **#53–#60 estavam abertas**. Issue aberta não prova ausência de código, e presença de implementação parcial não fecha automaticamente sua issue: cada issue precisa ser atualizada com escopo, testes e evidência próprios. O roadmap descreve o status técnico verificado, não substitui o estado do GitHub Projects/Issues.

### Legenda de status

- **Concluído (código/testes):** comportamento implementado e evidência automatizada disponível; não implica validação em produção.
- **Parcial:** parte do escopo está implementada/testada, mas ainda há critérios de aceite ou dependências pendentes.
- **Pendente:** não há evidência suficiente para declarar concluído.
- **Bloqueado por ambiente:** depende de serviço, configuração, licença ou infraestrutura não disponível nesta revisão.

O roadmap não considera stubs, arquivos ou documentação isoladamente como implementação concluída. Itens dependentes de ambiente externo permanecem abertos até que a configuração e o comportamento real sejam validados.

### Decisões e invariantes de arquitetura

1. **Autoridade de partida:** servidor valida movimento, combate, zona, posse, carga, durabilidade e transições; o cliente solicita ações e renderiza estado.
2. **Persistência:** gravações relevantes ao inventário precedem confirmação/broadcast; falhas não podem deixar estado parcialmente aplicado.
3. **Identidade:** o `userId` do WebSocket vem do token assinado, não da mensagem do cliente. Permanecem pendentes mitigação de replay/uso múltiplo do token e validação de Origin no handshake.
4. **Banco de teste:** testes PostgreSQL exigem URL explícita, ambiente não produtivo e database `_test`; fixtures devem apagar apenas seus registros.
5. **Economia:** KRC permanece moeda de jogo, sem resgate/custódia/fundos reais. Depósitos sem prova de liquidação estão desabilitados. Qualquer expansão de escopo exige revisão especializada antes de implementar.
6. **Unreal:** SPA/servidor TypeScript são a referência executável até UE5 compilar, passar Automation Tests e demonstrar paridade.

## Fase 0 — Fronteiras de segurança e invariantes de domínio

**Objetivo:** impedir operações não autorizadas e transições parcialmente aplicadas antes de ampliar o volume de usuários ou valor econômico.

- [ ] Inventariar todas as rotas mutáveis com recurso, proprietário, papel/capability e efeitos laterais documentados.
- [ ] Aplicar ownership dentro do `WHERE` da mutação SQL sempre que possível, evitando padrão check-then-update e TOCTOU.
- [ ] Validar entrada de dinheiro de jogo, itens, dano, matchmaking e controles com schemas estritos; input inválido retorna erro sem write parcial.
- [ ] Fechar cobertura HTTP negativa para sessão ausente, owner diferente, ID inexistente, faixa inválida, operador e moderador.
- [ ] Separar capabilities de jogador, host, moderador e operador; role nunca é aceita do body ou query string.
- [ ] Adicionar limites e rate limits coerentes para login, token WS, economia, lobby, movimento e ações de combate.
- [ ] Definir política de Origin/CSRF para mutações HTTP e allowlist de Origin para handshake WebSocket.
- [ ] Rever logs para remover tokens, cookies, PII desnecessária e payloads sensíveis.
- [ ] Definir invariantes explícitos para `LOBBY → COUNTDOWN → IN_PROGRESS → FINISHED`, eliminação, abandono e vitória.
**Entrega parcial desta rodada:** a zona e o spawn global de loot exigem a allowlist de operador; reparo/uso de item e pagamento de empréstimo fazem a mutação SQL com filtro de proprietário; entradas das mutações cobertas são estritas e limitadas por Zod. As suítes HTTP verificam que as 41 rotas privadas rejeitam sessões ausentes e expiradas, os quatro controles globais da zona rejeitam jogadores comuns mesmo com role forjado no corpo, leituras de conta/inventário/empréstimos/histórico usam o proprietário da sessão e mutações de itens/empréstimos ocultam recursos alheios ou inexistentes. Entradas inválidas em mutações financeiras, de itens, zona e jogador retornam 400 sem chamar o storage. O aceite 0.1 ainda exige inventário contínuo das rotas e ampliação da cobertura de ownership/IDs para os demais recursos, além de garantir atomicidade quando uma persistência falhar entre etapas.

**Entregue parcialmente:** há controles de zona/spawn por allowlist, escopo por usuário em operações de item e empréstimo, limites Zod em mutações cobertas e identidade WS autenticada. A suíte negativa abrangente e auditoria de todas as rotas ainda não fecham esta fase.

**Gate de aceite:** cada endpoint privado tem teste positivo e negativo; uma identidade não altera recursos de outra; entrada inválida, timeout e retry não deixam estado parcial; logs e mensagens não revelam segredos.

## Fase 1 — PostgreSQL, migrações reproduzíveis e CI
- [x] Agrupar débito/crédito, criação de empréstimo/item e ledger em transações PostgreSQL.
- [x] Usar decimal exato ou unidades inteiras mínimas nas mutações econômicas; saldos usam `numeric` no SQL e entradas usam centavos inteiros.
- [x] Adicionar idempotency key nas mutações econômicas com persistência e replay de resposta.
- [x] Desativar concessão de KRC a partir de montante USD informado pelo cliente; não creditar antes de ordem e pagamento verificados.
- [x] Definir checks no banco para saldos não negativos, lançamentos, durabilidade e estado dos empréstimos (migration 0003, `NOT VALID` até auditoria).
- [ ] Avaliar e adicionar constraints de ownership/FK depois de conferir usuários e registros legados no banco de aplicação.
- [x] Escrever e executar testes concorrentes para compra, transferência, pagamento de empréstimo e salário, além de retries e rollback.

**Entrega inicial (histórica):** depósito, transferência, empréstimo, pagamento, compra, reparo e salário foram encaminhados ao serviço transacional/idempotente. O depósito sem prova de liquidação permanece desabilitado com HTTP 503; as demais operações internas continuam no ledger. A entrega Stripe desta branch é exclusivamente test-mode, desabilitada por padrão, e não cria checkout nem cobrança sem configuração. Nenhum banco de aplicação foi alterado. Os checks `NOT VALID` protegem novos/alterados registros; auditoria de legado e FKs de ownership continuam pendentes. Resgate, refund/chargeback e rollout live não estão habilitados; ver [`docs/INTERNAL_CURRENCY_AND_PAYMENTS.md`](./INTERNAL_CURRENCY_AND_PAYMENTS.md) e [`docs/STRIPE_BRAZIL_CHECKOUT.md`](./STRIPE_BRAZIL_CHECKOUT.md).

**Objetivo:** tornar evolução de schema e persistência repetíveis, isoladas e demonstráveis em cada execução.

- [x] Usar migrações Drizzle versionadas e revisáveis em vez de alteração operacional implícita de schema.
- [x] Adicionar suíte `tests/integration/` usando `DatabaseStorage` e pool PostgreSQL reais, sem mock de storage.
- [x] Restringir testes a URL explícita, host local, ambiente não produtivo e database `_test`; cada fixture apaga apenas os próprios registros.
- [x] Testar criação/leitura de stats e bank account, defaults e atualização persistida de stats.
- [x] Testar item JSONB, ownership no SQL, equipagem e cinco atualizações concorrentes da durabilidade sem lost update.
- [x] Provisionar PostgreSQL 16 efêmero no CI, esperar readiness, aplicar migrações e rodar `test:postgres` como gate bloqueante.
- [x] Documentar Compose descartável, URL, migrações, execução e limites conhecidos em `docs/TESTING_POSTGRES.md`.
- [ ] Definir estratégia expand/contract para mudanças incompatíveis e verificar compatibilidade entre versões de aplicação e schema.
- [ ] Escrever testes concorrentes de compra, transferência, pagamento, ledger e rollback multi-tabela.
- [ ] Definir backup, restore testado, retenção, RPO/RTO e procedimento de rollback de migração.
- [ ] Adicionar constraints e índices somente após conferir query plans e padrões reais de consulta.

### Fase 1.1 — Checkout Stripe sandbox (Brasil)

- [x] Adicionar migration 0005 para ordens server-priced e inbox de eventos Stripe, sem modificar saldos existentes.
- [x] Adicionar Checkout Session avulsa em BRL com catálogo fixo server-side; cliente envia somente `productId` e `Idempotency-Key`.
- [x] Validar assinatura Stripe em raw body, restringir integração a `sk_test_`, exigir webhook secret e preservar checkout desativado no Render.
- [x] Gravar crédito Weapons, histórico e ledger balanceado append-only na mesma transação do webhook pago; deduplicar IDs de evento e conferir SKU, jogador, sessão, moeda e valor.
- [x] Escrever testes unitários de catálogo/assinatura e teste PostgreSQL de checkout idempotente, fulfillment concorrente, colisão de evento, divergência e estados terminais.
- [ ] Passar o teste PostgreSQL no CI com migration 0005 aplicada e validar a execução de staging com credenciais Stripe test-only.
- [ ] Definir nomes, quantidades KRC e preços BRL dos pacotes; confirmar elegibilidade da conta para métodos (Pix está sujeito a disponibilidade/ativação Stripe).
- [ ] Configurar segredos e webhook somente em staging; validar um pagamento de teste e estados pendentes/expirados/retries sem chave live.
- [ ] Implementar refunds, chargebacks, suporte, impostos, termos e lançamentos compensatórios antes de qualquer venda live.
- [ ] Fazer revisão jurídica/fiscal e aprovação explícita do titular antes de remover qualquer gate de produção; a intenção global não libera mercados além do Brasil.

### 0.3 Auditoria e reconciliação da economia

Esta etapa transforma a atomicidade já implementada em evidência operacional auditável. Pré-requisito ainda aberto: auditar o banco real antes de validar checks `NOT VALID` e concluir as decisões de ownership/FK da 0.2.

- [x] Definir contrato de ledger append-only com `operation_id`/chave de idempotência correlacionáveis e lançamentos explícitos por conta de origem/destino; migration 0004 preserva histórico antigo e cria saldos de abertura por carteira.
- [x] Criar consulta/relatório de reconciliação que compare saldos das carteiras com os lançamentos; divergências devem gerar alerta e relatório, nunca autocorreção silenciosa.
- [x] Definir prazo de retenção de idempotency keys maior que a janela de retry/replay suportada; disponibilizar limpeza controlável e segura em dry-run por padrão.
- [ ] Definir fluxo de ajustes administrativos por lançamentos compensatórios append-only, com capability, motivo, ator, horário e trilha de auditoria; proibir correção por update/delete de histórico.
- [ ] Auditar registros legados no banco de aplicação, corrigir anomalias com procedimento revisado, validar as constraints 0003 e avaliar FKs/ownership sem alterar semântica de exclusão de usuários.
- [ ] Executar migrações e testes PostgreSQL num banco efêmero obrigatório no CI; medir reconciliação antes/depois de carga concorrente e de falhas injetadas.

**Aceite:** todo saldo é explicável por lançamentos correlacionados; reconciliação detecta drift sem mutação automática; ajustes são auditáveis e compensatórios; retries continuam seguros dentro da retenção estabelecida; migrações e checks passam do zero em CI.

**Implementação desta rodada:** além do ledger correlacionável e append-only, `npm run economy:reconcile` gera relatório read-only para drift de carteira, operações desbalanceadas, transações sem ledger e claims incompletos, respeitando o marco de adoção do ledger para dados históricos. A janela de retry do cliente é 90 dias; claims completos ficam 365 dias e `economy:idempotency:prune` só apaga mediante `--execute`, em lotes com `SKIP LOCKED`, excluindo respostas incompletas e qualquer sucesso sem posting. Testes PostgreSQL confirmam detecção sem autocorreção, pruning dry-run/execução e rejeição de replay antigo sem novo débito/crédito. Tudo foi testado em banco descartável; nenhum banco de produto foi acessado. Ajustes compensatórios, auditoria de registros legados em produção, CI com banco efêmero obrigatório e separação da role runtime/owner permanecem pendentes.

## Prioridade 1 — entrega reproduzível e dados seguros

**Gate de aceite:** database limpo é migrado do zero no CI; testes demonstram leitura de volta e concorrência; falha de migração impede deploy; backup pode ser restaurado em ambiente isolado. O gate atual cobre persistência básica de jogador/conta/item, mas não substitui testes de ledger, backup ou rollback.

## Fase 2 — War’I: ciclo completo de interface, combate e sincronização

**Objetivo:** entregar uma experiência de inventário e partida coerente, com servidor como autoridade e feedback claro diante de erro ou desconexão.

- [x] Implementar filtros Arsenal/Armamento/Defesa/Bag, busca, detalhes de item, seleção persistida da PackBack e atualizações limitadas ao proprietário.
- [x] Carregar, no início do match, somente a PackBack persistida do jogador; arma e defesa duráveis aplicam efeitos com limites definidos.
- [x] Conectar cura, granada e reconhecimento temporário às ações autoritativas do servidor, consumindo durabilidade de modo atômico e apresentando feedback no HUD.
- [x] Aplicar capacidade e pesos de loot no servidor e validar a carga antes de permitir coleta.
- [x] Tornar a coleta assíncrona transacional do ponto de vista do jogo: reservar o item, aguardar `createItem`, e só então aplicar efeitos/broadcast; se o banco falhar, reabrir o item, restaurar carga e avisar o jogador.
- [x] Adicionar retomada autenticada da sala ativa por `sessionStorage` + mensagem `resume`, restaurando snapshot e PackBack sem reinserir o jogador nem perder estado.
- [x] Ignorar evento `close` tardio do socket anterior depois de o jogador ter sido vinculado ao novo socket.
- [x] Calcular zona na retomada com raio interpolado e tempos restantes coerentes com o tick do servidor; renderizar a geometria como elipse no canvas responsivo.
- [x] Expor estado de conexão, impedir ações enquanto offline e oferecer controle de movimento pelo teclado (setas; Shift para passo maior), com foco e instruções acessíveis.
- [x] Expandir E2E WebSocket autenticado para cobrir match, PackBack, granada/dano/durabilidade, coleta só após persistência, rollback de coleta e retomada sem desconexão falsa.
- [ ] Adicionar testes de UI em navegador para teclado, leitor de tela, estados de erro, loading e breakpoints móveis.
- [ ] Validar fluxo completo de lobby/inventário/partida/pós-partida com dois clientes reais em ambiente de staging, incluindo perda de rede e expiração de sessão.
- [ ] Definir por produto como lidar com desconexão prolongada, reconexão após reinício do processo e retorno a uma partida já finalizada.

**Gate de aceite:** nenhum item aparece como coletado nem produz efeito antes da gravação persistida; falha deixa inventário, carga e grid consistentes; reconnect do mesmo usuário recupera exatamente uma participação e um snapshot; inputs offline não são silenciosamente exibidos como enviados. A jornada automatizada atual cobre servidor/WebSocket e falhas simuladas de persistência; teste de navegador/leitor de tela e prova com múltiplos clientes em staging ainda estão pendentes.

## Fase 3 — Multiplayer distribuído, consistência e integridade competitiva

**Status: PENDENTE — existem componentes Redis/distribuídos, mas ownership, fencing e comportamento multi-réplica não estão demonstrados.**

- Formalizar máquina de estados e transições com testes baseados em invariantes/propriedades.
- Sequência monotônica, deduplicação, replay limitado e reconciliação em reconnect.
- Ownership/particionamento de salas, leases/fencing e pub/sub atômico; evitar duas réplicas controlando uma sala.
- Limites de mensagens/conexões por identidade, backpressure e proteção do fan-out.
- Corrigir reuso/revogação de token WS, validação de Origin e rate limit pré-autenticação/agregado.
- Definir TTL e cleanup de jogadores desconectados, salas finalizadas e entradas de fila.
- Corrigir admissão de salas privadas e garantir que snapshots de produção respeitem AOI; não expor estado global de jogadores/loot.
- Serializar comandos assíncronos por identidade e testar corridas de join/leave/reconnect.
- Canonicalizar matchmaking e medir carga com múltiplas salas/instâncias, incluindo p50/p95/p99, erros, memória e recuperação.

**Gate:** teste real com múltiplas instâncias prova ownership único, fencing, replay ordenado e recuperação; resultados reproduzíveis; limites de latência/erro publicados. Não atendido.

## Fase 4 — Unreal Engine 5.8 e paridade de cliente

**Status: PENDENTE / BLOQUEADO POR AMBIENTE UE LICENCIADO.**

- Estrutura inicial do projeto e checks portáveis existem, mas não contam como build Unreal.
- Abrir/compilar com UnrealBuildTool numa instalação UE 5.8 limpa; substituir stubs por implementações executáveis.
- Rodar Automation Tests de zona, GAS/dano, cues, loot e ciclo de partida.
- Versionar protocolo cliente-servidor e validar auth/ownership/reconnect/rate limits.
- Configurar runner licenciado apropriado; criar mapa mínimo jogável, servidor dedicado e teste de replicação/latência.
- Registrar licenças de assets e decidir via ADR se UE substitui SPA ou permanece cliente adicional.

**Gate:** build UE 5.8 real, Automation Tests e mapa jogável comprovados; contrato backend e licenças rastreáveis. C++/scripts atuais no CI não satisfazem o gate.

## Fase 5 — Economia de jogo, ledger e limites de compliance

**Status: PARCIAL — integridade interna de KRC implementada em parte; controles administrativos e reconciliação do legado pendentes.**

- KRC continua unidade de jogo sem resgate, custódia ou ponte para fundos reais; depósito sem liquidação comprovada permanece desabilitado.
- Ledger append-only, idempotência, operações transacionais, valores precisos e relatório de reconciliação estão implementados e possuem testes locais/CI.
- Concluir ajustes compensatórios auditáveis e revisar permissões/console administrativo.
- Auditar dados legados, validar constraints e testar recuperação sob concorrência/falha.
- Corrigir inconsistência de juros do preview vs. cobrança autoritativa.
- Qualquer carteira, pagamento ou resgate real permanece fora do escopo até revisão formal jurídica/regulatória, fraude, custódia, privacidade e segurança por jurisdição.

**Gate:** saldo reconciliável, ajustes auditáveis, retry seguro e sem ponte para valor real. Parte automatizada passou; gate de operação/legado não.

## Fase 6 — SRE, observabilidade e prontidão de produção

**Status: PARCIAL/ABERTO — CI e health/deploy automatizado existem; readiness real, staging, recuperação e SLOs não comprovados.**

- Separar preview/staging/prod com identidades, bancos, secrets e permissões independentes.
- Validar OIDC/domínio reais; documentar rotação de segredos e revogação de sessões.
- Readiness real de DB/Redis separado de liveness; traces, request IDs e métricas HTTP/DB/fila/match/WS.
- Definir SLOs/SLIs, responsáveis de alerta, dashboards e playbooks de incidente.
- Testar restore, rollback de release/migração, RPO/RTO e falha de dependências em staging.
- Testar carga/soak/fault injection em Redis, DB, rede, worker e réplicas.
- Confirmar configuração real de Render/infra e proteger serviços internos/portas administrativas.
- O workflow CI do repositório passou no commit `26758e0`; notificação Discord/Slack foi adicionada, mas os secrets correspondentes não puderam ser verificados por falta de permissão GitHub nesta sessão.

**Gate:** monitoramento diagnostica sem expor dados; restore, rollback e falhas demonstrados em staging; deploy só após gates verdes. Não atendido.

## Fase 7 — Qualidade contínua, evidência e sustentabilidade

**Status: PARCIAL — testes, checks e documentação existem; governança de decisões, baselines e release ainda incompletos.**

- Registrar ADRs de arquitetura, regras, schema, protocolo e trade-offs de segurança.
- Criar benchmarks reproduzíveis com seeds/versões e dados sintéticos; publicar limitações.
- Separar métricas de balanceamento de métricas operacionais e definir política de privacidade.
- Medir balanceamento com amostras/variância; baselines repetidos de LCP/INP/CLS e JS inicial.
- Documentar setup/contribuição, licença de código/assets e disclosure de vulnerabilidades.
- Manter changelog, matriz de compatibilidade cliente/protocolo/schema e política de depreciação.
- Revisar dependências, cobertura de threat model, acessibilidade e versões suportadas periodicamente.

**Gate:** experimentos reproduzíveis, decisões com ADR, release com compatibilidade/licença/segurança revisadas. Ainda aberto.

## Ordem de execução recomendada

1. **Fase 0 — segurança e autorização:** resolver riscos de token WS, Origin, lobbies privados, estado exposto, respawn e limites; garantir cobertura de rotas mutáveis.
2. **Fase 1/5 — persistência e economia:** fechar preview/cobrança, dados legados, constraints, restore e falhas concorrentes.
3. **Fase 3 — consistência multiplayer:** ownership/fencing, TTL, backpressure, AOI e teste distribuído real.
4. **Fase 6 — staging e operação:** readiness, secrets, SLOs, alertas e rollback/restore demonstrados.
5. **Fase 2 — validação de produto:** sessões reais, UX/acessibilidade e fluxo de jogo em staging, depois dos bloqueadores de segurança.
6. **Fase 4 — UE5 em trilha paralela:** avançar quando houver acesso a UE 5.8 licenciado, sem declarar paridade antes dos gates.
7. **Fase 7 — evidência contínua:** ADRs, benchmarks e governança atravessam todas as fases.

Não avançar para Beta aberto/Go Live com base apenas em checks de código ou metas de inscrições. A decisão exige capacidade demonstrada, segurança, staging, observabilidade, rollback e testes de carga reproduzíveis.

## Como manter este roadmap

Cada atualização deve registrar data, SHA de referência, comandos executados e resultados separados por suíte. Marcar itens como concluídos somente com evidência; separar status de código, testes e operação. Referenciar issue/PR relacionado, proprietário e bloqueio quando conhecido. Não usar checkboxes deste documento para inferir estado de issues; atualizar ambos os sistemas explicitamente.


## Snapshot histórico — 21 de outubro de 2026

Esta seção registra o estado naquela data, não o estado atual. A revisão atual e supersedente está documentada abaixo. A medição deste snapshot foi sobre `ce630f2e7b31397e1b2af38965ef1adf3948b033` (`ce630f2`).

### Estado de validação mais recente

- `npm run verify:all` passou localmente após integrar `c8` no app oficial e no runtime.
- Baseline V8: app — 34,20% linhas, 67,83% branches e 48,17% funções; runtime — 76,64% linhas, 70,34% branches e 71,42% funções. A UI está incluída no denominador e é a maior lacuna de cobertura; consultar `COVERAGE_REPORT_2026-10-23.md` e `TEST_COVERAGE_BASELINE.md`.
- Contagens instrumentadas: app 275 aprovados, 1 ignorado, 0 falhas; runtime 14 aprovados, 2 ignorados, 0 falhas.
- O workflow `Stress Test (local runtime)` agora executa honestamente o harness de 24 clientes em serviço local. Seu sucesso não comprova carga nas regiões públicas nem perfis de 100–2000 bots; um load test remoto depende de ambiente provisionado e autorização.
- CI principal (`39681007161`) e `04 — Unit Tests` (`39681007116`) passaram no commit `b3524d4`; os artifacts `unit-test-results` e `coverage-game-runtime` foram publicados. M0 segue em validação até existir uma segunda execução comparável e os smoke tests de UI planejados.
- A notificação de falha Discord continua sem entrega confirmada: o POST devolveu HTTP 405. A workflow já envia POST JSON; a correção depende de trocar `DISCORD_WEBHOOK_URL` por endpoint oficial válido e confirmar a entrega. O alerta é opcional e não altera o estado dos gates.
- UE5 ainda não tem evidência de build por UnrealBuildTool/Editor nem Automation Tests em runner licenciado; EOS continua mockado. Não declarar esses itens como prontidão de produção.

## Revisão atual e próximos marcos — 23 de outubro de 2026

**Base:** `main` em `37bce8d0cdb8a61c5061cd79602b45ccb8db8055` (`37bce8d`). A branch avançou 51 commits desde o snapshot anterior, incluindo novos sistemas e testes; os percentuais não são comparação direta porque o denominador mudou.

### Estado de validação

- Coverage local do app produziu summary, mas não passou: 270 casos, 267 aprovados, 2 falhas e 1 ignorado; a medição foi sem `TEST_DATABASE_URL`. Runtime: 62 casos, 60 aprovados e 2 ignorados, sem falhas.
- Coverage na ponta atual: app 35,77% linhas / 68,71% branches / 50,71% funções; runtime 44,50% / 74,22% / 77,60%. São números locais parciais; CI desta revisão falhou antes de publicar artifact atualizado do app. Ver [`COVERAGE_REPORT_2026-10-23.md`](COVERAGE_REPORT_2026-10-23.md) e [`TEST_COVERAGE_BASELINE.md`](TEST_COVERAGE_BASELINE.md).
- CI principal (`40002127380`), TypeScript (`40002127431`) e Unit Tests (`40002127508`) falharam. Typecheck reportou incompatibilidades em `server/game/discordApiV1.ts` (métodos/campos de estado, jogador e storage; assinatura de construtor e tipo implícito). O teste de contrato de migrations ainda espera `0005_optimal_steel_serpent`, enquanto a migration versionada atual é `0005_stripe_checkout`.
- Próxima prioridade: (1) corrigir contratos de tipos da API Discord e atualizar seus testes; (2) alinhar o teste à migration real e revisar a ordenação; (3) rerodar `npm run verify:all` e CI com PostgreSQL/Redis efêmeros; (4) publicar artifacts atualizados antes de considerar o baseline estável.
- No job `notify-failure` (`40002127380`), Discord respondeu 405 e Slack 302; nenhum destino confirmou entrega 2xx. A consulta/gestão de Actions secrets retornou HTTP 403. Um administrador precisa validar/substituir ambos os endpoints nas configurações GitHub e confirmar respostas 2xx; não transmitir URLs em chat ou repositório. Detalhes em [`CI_NOTIFICATIONS.md`](CI_NOTIFICATIONS.md).
- As execuções `b3524d4` de 21/10 foram verdes, mas são somente baseline histórica. Falhas da nova ponta significam que não se pode afirmar que a `main` atual esteja 100% verde.

### Milestones técnicos seguintes

#### M0 — Observabilidade de qualidade e cobertura (em validação)

- Integrar `c8` 12.x para `client/src`, `server`, `shared` e `game-runtime`, gerar LCOV e JSON-summary separados e publicar artifacts em CI.
- Reproduzir `verify:all` local/CI; após duas execuções comparáveis, definir thresholds por camada, sem inflar a taxa excluindo componentes de UI ainda sem testes.
- Adicionar testes browser/React para login, lobby→partida→resultado, inventário/economia, estados loading/erro, teclado e leitor de tela.

**Aceite:** artifacts LCOV disponíveis em dois scopes; totals validados contra JSON-summary; CI do commit verde; smoke UI cobre jornada principal e não apresenta violações críticas de acessibilidade. Não fixar meta global arbitrária antes da baseline estável.

#### M1 — P0 segurança e autoridade de jogo

- Tornar tokens WebSocket de uso único/revogáveis e validar Origin; aplicar limites pré-auth e quotas por IP/identidade.
- Proteger lobbies privados com convite ligado a jogador/sala; filtrar listagem; garantir AOI no broadcast real e não expor `inviteCode`/estado fora da autorização.
- Restringir respawn por estado/cooldown e limitar `count`/custo do procgen; testar todas as rotas mutáveis com casos positivos e negativos.

**Aceite:** token reutilizado e token após logout recusados; Origin fora da allowlist recusada; join privado sem convite retorna 403/404; snapshots não expõem dados de outras salas/AOI; inválidos não alteram estado nem deixam efeitos laterais.

#### M2 — P0 integridade de persistência/economia e recuperação

- Unificar preview e cobrança de empréstimo; testar idempotência, concorrência, rollback multi-tabela e reconciliação com falhas injetadas.
- Auditar dados legados e constraints pendentes; definir política append-only para ajustes compensatórios e estratégia expand/contract.
- Demonstrar backup/restore e rollback de versão/migration em ambiente isolado, com RPO/RTO documentados.

**Aceite:** preview igual ao débito em matriz de prazos; retries concorrentes não duplicam lançamentos; saldo/ledger reconciliam antes/depois de falha; restore e rollback são repetíveis com RPO/RTO registrados.

#### M3 — P1 multiplayer distribuído e SRE

- Implementar ownership/fencing de sala em duas réplicas, sequência monotônica, deduplicação, replay limitado, TTL cleanup, backpressure e fan-out AOI.
- Criar staging efetivo com DB/Redis/OIDC, readiness distinto de liveness, request IDs, métricas HTTP/DB/fila/match/WebSocket, SLOs e playbooks.
- Substituir o smoke local por um load generator configurável apenas após provisionamento/limites aprovados; reportar p50/p95/p99, erros e memória para perfis reproduzíveis.

**Aceite:** teste com duas réplicas prova owner único e rejeita fencing antigo; reconnect mantém ordem e não duplica jogadores; soak acordado termina sem crescimento contínuo de memória/crashes e publica latências; readiness falha quando uma dependência necessária está indisponível.

#### M4 — P2 paridade de produto e trilha UE5/EOS real

- Executar testes browser e acessibilidade em ambiente de staging para clientes reais.
- Em runner UE5.8 licenciado, compilar Editor e Dedicated Server por UnrealBuildTool, executar Automation Tests, empacotar e conectar dois clientes.
- Configurar EOS Dev/Staging com credenciais reais protegidas e validar login, sessões/matchmaking, reconnect e encerramento; manter mock apenas como teste unitário.

**Aceite:** artefatos de build e Automation Tests identificáveis com exit 0; mapa jogável e servidor dedicado demonstrados; dois clientes completam login→sessão→ação→reconnect; execução EOS não contém placeholders e produz logs verificáveis.

**Ordem recomendada:** M0 (fechar a publicação/reprodutibilidade dos relatórios) → M1 → M2 → M3; M4 avança em paralelo somente quando houver licença, ambiente e credenciais necessários. Cada milestone exige evidência executada, não apenas arquivos/stubs ou status de issue.
