# Roadmap mestre de engenharia — Khaaos Run

**Nível de planejamento:** engenharia de sistemas avançada (Dev/Ph.D.). Este documento define ordem de risco, invariantes, critérios verificáveis e dependências. Não presume datas, tamanho de equipe ou disponibilidade de infraestrutura.

## Estado atual e escopo

Khaaos Run já tem um vertical slice executável em React/TypeScript, Express, PostgreSQL e WebSocket: autenticação, inventário, matchmaking, salas, zona, combate, loot, ranking e resultado de partida. O `game-runtime` mantém testes próprios. A trilha Unreal Engine 5.8 está iniciada, mas ainda não foi compilada com UnrealBuildTool.

Nesta rodada, a branch de trabalho adiciona testes de integração contra PostgreSQL real, reforça a sincronização do War’I, garante que a coleta de loot só seja confirmada depois da gravação e inclui reconexão autenticada em partida. A zona do canvas passou a usar a geometria elíptica compatível com coordenadas do servidor e recebeu navegação por teclado e estados acessíveis. A validação executada localmente passou: `npm run check`, `npm run test:postgres` (2 casos), `npm run test:official` (44 casos), além de todos os gates de `npm run verify:all` (build, testes do runtime, stress e regras portáveis da zona/loot UE5).

O roadmap não considera a presença de arquivos ou stubs como implementação concluída. Uma tarefa só muda para concluída quando seu comportamento é demonstrável por teste, migração, build ou evidência operacional correspondente. Itens com dependências de serviço externo continuam abertos até que a configuração real seja validada.

### Decisões e invariantes de arquitetura

1. **Autoridade de partida:** o servidor valida movimento, combate, zona, posse, carga, durabilidade e transições de sala. O cliente solicita ações e renderiza snapshots; não define o resultado.
2. **Persistência:** gravações relevantes ao inventário precedem a confirmação/broadcast. Uma falha de persistência deve restaurar o estado de jogo reservado ou deixar a operação explicitamente sem confirmação.
3. **Identidade:** a identidade do WebSocket vem do token assinado do handshake, nunca de `userId` fornecido em mensagem do cliente. A retomada exige token válido, membership ainda presente e correspondência do `roomId`.
4. **Banco de teste:** a suíte de integração exige URL explícita, host local e database com sufixo `_test`; fixtures usam IDs exclusivos e removem apenas suas próprias linhas.
5. **Economia:** KRC permanece unidade de jogo sem resgate, carteira de custódia ou conexão a fundos reais. Qualquer mudança de escopo exige revisão jurídica, de fraude, custódia, compliance e segurança antes de implementação.
6. **Unreal:** a SPA/servidor TypeScript continuam sendo a referência executável até que a trilha UE5 compile, passe Automation Tests e prove paridade de protocolo e jogo.

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
- [x] Definir checks no banco para saldos não negativos, lançamentos, durabilidade e estado dos empréstimos (migration 0003, `NOT VALID` até auditoria).
- [ ] Avaliar e adicionar constraints de ownership/FK depois de conferir usuários e registros legados no banco de aplicação.
- [x] Escrever e executar testes concorrentes para compra, transferência, pagamento de empréstimo e salário, além de retries e rollback.

**Entrega inicial desta rodada:** depósito, transferência, empréstimo, pagamento, compra, reparo e salário usam o serviço transacional/idempotente. O schema e as migrations foram aplicados e os testes concorrentes passaram em PostgreSQL local descartável; não foi alterado nenhum banco da aplicação, pois não há `DATABASE_URL` disponível. Os checks `NOT VALID` protegem novos/alterados registros; a validação dos dados legados e FKs de ownership continuam pendentes. O rollout está descrito em [`docs/ECONOMY_TRANSACTIONS.md`](./ECONOMY_TRANSACTIONS.md).

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

**Objetivo:** preservar invariantes de partida sob concorrência, falhas de processo e escala horizontal.

- [ ] Formalizar máquina de estados de sala e transitions válidas com testes baseados em propriedades/invariantes.
- [ ] Definir sequência monotônica de eventos/snapshots, deduplicação, replay limitado e reconciliação após reconnect.
- [ ] Definir ownership/particionamento de salas entre réplicas; não permitir que duas réplicas comandem a mesma partida.
- [ ] Implementar presença e pub/sub com Redis/KeyDB ou equivalente, incluindo TTL, fencing/lease e operações atômicas.
- [ ] Colocar limites de frequência e tamanho de mensagens, backpressure, cancelamento de subscriptions e proteção de fan-out.
- [ ] Revisar movimento, validação de posição, alcance, lag compensation e relógios forjados com testes de abuso/replay.
- [ ] Definir abandono, reconexão longa, draw, sala sem vencedor e takeover de host sem edge cases silenciosos.
- [ ] Canonicalizar matchmaking: comparar implementação de produção com referência determinística e registrar versão/configuração dos parâmetros.
- [ ] Testar carga com múltiplas salas e instâncias; medir latências p50/p95/p99, erro, uso de memória e tempo de recuperação.

**Gate de aceite:** nenhuma corrida cria duas salas/jogadores para a mesma identidade; resultado pode ser reconstruído a partir de seed e sequência de inputs; limites de latência e erro são publicados para carga declarada; falha de instância não duplica comandos nem distribui snapshots conflitantes.

## Fase 4 — Unreal Engine 5.8 e paridade de cliente

**Objetivo:** transformar a fundação C++/GAS em uma trilha jogável e validada sem declarar compatibilidade por presença de arquivos.

- [x] Adicionar `.uproject`, estrutura inicial de módulos/classes, zona, atributos, loot, combate, economia, IA e SaveGame.
- [ ] Abrir e compilar o projeto com UnrealBuildTool em instalação limpa de UE 5.8; corrigir includes, macros UHT, APIs e módulos reais.
- [ ] Substituir stubs por implementações executáveis e registrar dependências externas/licenças dos assets.
- [ ] Executar Automation Tests para zona, dano/GAS, EffectCauser, GameplayCue, loot e ciclo de match em mundo real.
- [ ] Definir protocolo versionado cliente-servidor (auth, ownership, mensagens, reconnect, rate limits e compatibilidade).
- [ ] Integrar compilação/testes UE em runner licenciado apropriado, sem inserir credenciais ou assets não redistribuíveis no repositório.
- [ ] Construir mapa mínimo jogável e testar replicação, latência, autoridade e reconexão em servidor dedicado.
- [ ] Decidir por ADR se Unreal substitui a SPA ou permanece como cliente adicional, somente após paridade mensurável.

**Gate de aceite:** build limpa em UE 5.8 e Automation Tests passam; existe mapa jogável reproduzível; contrato com backend está versionado; assets possuem licença rastreável. Os checks C++/UE atuais em CI validam regras portáveis e integridade de arquivos, não compilação Unreal real.

## Fase 5 — Economia de jogo, ledger e limites de compliance

**Objetivo:** proteger integridade do valor de jogo e impedir que uma economia simulada seja confundida com custódia ou ativo resgatável.

- [ ] Manter KRC sem resgate, custódia ou ligação a fundos reais enquanto não houver decisão formal separada.
- [ ] Projetar ledger append-only com unidades inteiras/decimais exatos, idempotency keys, hashes encadeados e reconciliação auditável.
- [ ] Executar débito/crédito, criação de item/empréstimo e ledger em transações PostgreSQL; definir constraints de saldo e estado.
- [ ] Adicionar testes concorrentes, retries, duplicação de eventos, falha intermediária e reconciliação contábil.
- [ ] Restringir console administrativo, registrar ator/razão de ajuste e revisar trilha de auditoria.
- [ ] Antes de qualquer moeda resgatável, carteira ou pagamento: revisão jurídica/regulatória por jurisdição, KYC/AML, fraude, custódia, privacidade, auditoria e threat model.

**Gate de aceite:** saldos e ledger reconciliam sob concorrência e retry; correções são auditáveis; não há ponte para valor real antes de revisão e aprovação explícitas. Esta fase não autoriza nem implementa transações reais de Bitcoin.

## Fase 6 — SRE, observabilidade e prontidão de produção

**Objetivo:** detectar falhas, limitar impacto e recuperar serviço/dados com procedimentos testados.

- [ ] Separar ambientes de preview, staging e produção com identidades, bancos, segredos e permissões independentes.
- [ ] Validar OIDC no domínio de produção antes de tráfego real; documentar rotação de `SESSION_SECRET` e `WS_TOKEN_SECRET`.
- [ ] Implementar health/readiness checks reais de dependências, mantendo liveness independente de chamadas lentas ao banco.
- [ ] Instrumentar request IDs, traces, métricas HTTP/DB, filas, matchmaking, partidas e sessões WebSocket.
- [ ] Definir SLOs/SLIs, alertas com owner e playbooks de incidente; medir latência a partir do servidor.
- [ ] Criar dashboards para erro, latência, saturação, pool PostgreSQL, reconexões e duração/falha de partida.
- [ ] Validar restore de backup, rollback de deploy e migração em staging; definir RPO/RTO com responsáveis.
- [ ] Executar load, soak e fault-injection tests para falhas de DB, Redis, worker, réplica e rede.
- [ ] Manter deploy restrito a commit verificado, serializado e health-checked; ativação real de Render permanece condicionada à configuração do serviço e segredo externos.

**Gate de aceite:** incidente pode ser detectado e diagnosticado por métricas/traces sem expor dados sensíveis; rollback e restore são demonstrados em staging; deploy não ocorre após gate vermelho; SLOs e limites são compatíveis com o teste de carga publicado.

## Fase 7 — Validação científica, qualidade contínua e sustentabilidade open source

**Objetivo:** transformar decisões de gameplay e operação em hipóteses testáveis e manter o projeto evolutivo, auditável e contribuível.

- [ ] Registrar ADRs para arquitetura, regras de gameplay, schema, protocolo, migrações e trade-offs de segurança.
- [ ] Definir benchmarks reproduzíveis com seeds, versões, parâmetros e datasets sintéticos sem dados pessoais.
- [ ] Separar métricas de balanceamento de métricas de operação; evitar usar dados de produção para inferência sem política de privacidade.
- [ ] Medir distribuição de loot, duração da partida, taxa de abandono, equilíbrio de armas e sucesso de reconexão; avaliar intervalos/variância em vez de um run isolado.
- [ ] Definir budget de performance frontend após baseline repetido de LCP, INP, CLS e JS inicial em runner estável para desktop/mobile.
- [ ] Criar testes de regressão para economia simulada e matchmaking; publicar metodologia e limitações junto aos resultados.
- [ ] Documentar contribuição, setup local, licença de código/assets, política de segurança e processo de disclosure de vulnerabilidade.
- [ ] Manter release notes, matriz de compatibilidade cliente/protocolo/schema e política de depreciação.
- [ ] Revisar periodicamente dependências, cobertura de threat model, acessibilidade e suporte a versões ativas.

**Gate de aceite:** experimento pode ser reproduzido a partir da documentação e seed; decisões alteradas deixam trilha ADR; release tem changelog, compatibilidade, licença e segurança revisados; nenhum ganho de balanceamento ou performance é afirmado com base em amostra não reprodutível.

## Ordem de execução e gates entre fases

A sequência recomendada é **0 → 1 → 2 → 3 → 6**, mantendo **4** em trilha paralela até atingir paridade, e **5** bloqueada para valor real até revisão externa formal. A Fase 7 fornece o mecanismo de evidência para todas as demais.

- Não escalar partidas distribuídas (Fase 3) antes de fechar identidade, ownership e consistência de dados (Fases 0–1).
- Não habilitar reconnect entre réplicas antes de definir ownership de sala, sequência de eventos e fencing (Fase 3).
- Não usar o primeiro build UE como critério de troca de cliente; exigir testes e compatibilidade de backend (Fase 4).
- Não declarar produção pronta apenas porque `/healthz` responde; exigir staging, rollback, observabilidade e recuperação demonstrados (Fase 6).
- Não conectar dinheiro/custódia real a KRC; a Fase 5 exige decisão e avaliação especializada fora do escopo de implementação rotineira.

## Como manter este roadmap

Cada PR deve ser pequeno o suficiente para revisão, ter teste e atualizar o contrato afetado. Marque um item como concluído apenas com evidência reproduzível. Registre bloqueios de infraestrutura sem transformar hipótese em entrega. Replaneje a ordem quando novos riscos forem descobertos, preservando os invariantes de segurança, persistência e autoridade do servidor.
