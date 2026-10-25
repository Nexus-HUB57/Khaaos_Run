# Roadmap mestre de engenharia — Khaaos Run

**Última revisão:** 20 de outubro de 2026
**Base examinada:** `main` em `26758e008c9671f92a8f543eb5fbb2d0a2b3f369` (`26758e0`).
**Escopo:** repositório oficial `Nexus-HUB57/Khaaos_Run`; status baseado em código, testes e evidência disponível nessa revisão. Não presume datas, tamanho de equipe ou disponibilidade de infraestrutura.

## Estado atual

O repositório contém um vertical slice executável em React/TypeScript, Express, PostgreSQL e WebSocket: autenticação OIDC/sessões, inventário War’I, matchmaking, salas, zona, combate, loot, ranking e resultado. Também mantém um runtime Node separado, documentação e uma trilha Unreal Engine 5.8. A trilha UE5 **ainda não foi comprovada por build com UnrealBuildTool nem Automation Tests em instalação real**; checks C++/portáveis no CI não substituem isso.

### Evidência de validação nesta revisão

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
3. **Identidade:** o `userId` do WebSocket vem do token assinado, não da mensagem do cliente. Nesta branch, o ticket usa `jti` de uso único consumido com `SET NX`/TTL no Redis e o handshake valida `Origin` contra `PUBLIC_ORIGIN`; Redis indisponível em produção falha fechado.
4. **Banco de teste:** testes PostgreSQL exigem URL explícita, ambiente não produtivo e database `_test`; fixtures devem apagar apenas seus registros.
5. **Economia:** KRC permanece moeda de jogo, sem resgate/custódia/fundos reais. Depósitos sem prova de liquidação estão desabilitados. Qualquer expansão de escopo exige revisão especializada antes de implementar.
6. **Unreal:** SPA/servidor TypeScript são a referência executável até UE5 compilar, passar Automation Tests e demonstrar paridade.

## Fase 0 — Fronteiras de segurança e invariantes de domínio

**Status: PARCIAL — não promover a escala até fechar os bloqueadores indicados.**

### Concluído (código/testes)

- Autenticação OIDC/sessão e proteção de rotas privadas; testes negativos verificam sessões ausentes/expiradas.
- Endpoints protegidos derivam identidade do usuário autenticado; rotas e mutações cobertas validam payloads com schemas.
- Operações de loans/items cobertas usam escopo de proprietário no storage/economia; controles globais de zona usam allowlist de operador.
- WebSocket exige token HMAC de curta duração assinado pelo servidor, deriva do token a identidade e valida mensagens/payloads; testes rejeitam token ausente e `userId` falsificado.
- Mutações HTTP possuem controles CSRF/Origin para métodos não seguros; secrets/tokens não são incluídos deliberadamente nos payloads do perfil.

### Pendente / bloqueadores

- Inventário e cobertura negativa comprovável de **todas** as rotas mutáveis, papéis, recursos e efeitos laterais.
- Ownership/TOCTOU, atomicidade e validação de identidade para todos os recursos/caminhos, não apenas os cobertos atualmente.
- Permanecem pendentes a revogação de tickets por logout/ban, quota pré-autenticação por IP/identidade e limite agregado de conexões. O consumo Redis tem TTL de 90 s para cobrir a tolerância máxima de clock; fallback local só é aceito com `WS_LOCAL_TICKET_FALLBACK=true` e `NODE_ENV=development|test`, não protege entre processos e não é um modo válido para staging/multi-réplica.
- Nesta branch, `/api/logout` não aceita mais GET: o cliente faz POST, que exige `Origin` same-origin e rejeita `Sec-Fetch-Site: cross-site`; a cobertura OIDC valida o fluxo. A alteração ainda precisa ser integrada à `main`.
- Auditar logs e exceções para evitar exposição de detalhes internos; concluir política de limites/rate por IP/identidade para endpoints críticos.
- Fechar fragilidades identificadas na auditoria atual, incluindo respawn sem validação do estado da partida e bypass de sala privada via `roomId`.

**Gate:** cada endpoint privado com teste positivo/negativo; identidade não altera recurso alheio; entradas inválidas, timeout/retry não deixam estado parcial; tokens e PII não aparecem em logs. Não aceito ainda.

## Fase 1 — PostgreSQL, migrações reproduzíveis e integridade da economia

**Status: PARCIAL — persistência e ledger avançaram; legado, recuperação e gates operacionais ainda abertos.**

### Concluído (código/testes)

- Migrações Drizzle versionadas e revisáveis; workflow CI cria PostgreSQL efêmero, aplica migrações e executa `test:postgres` como gate.
- Testes de storage real cobrem stats/conta, ownership, JSONB de item e atualizações concorrentes de durabilidade.
- Economia usa valores precisos/unidades mínimas, operações transacionais/idempotentes e ledger correlacionável append-only; migrations e reconciliação foram exercitadas em PostgreSQL descartável.
- Reconciliação reporta drift sem autocorreção silenciosa; limpeza de chaves idempotentes tem dry-run por padrão e execução explícita.
- Depósitos sem prova de liquidação estão desabilitados; não há integração com dinheiro real.

### Pendente / bloqueadores

- Auditar registros legados em banco de aplicação, validar checks `NOT VALID` e decidir FKs/ownership sem afetar semântica de exclusão.
- Definir fluxo de ajuste compensatório append-only com ator, capability, motivo e trilha de auditoria.
- Estratégia expand/contract e compatibilidade de versões aplicação/schema; rollback de migração comprovado.
- Testes concorrentes/injeção de falha para operações econômicas completas, incluindo rollback multi-tabela e reconciliação antes/depois.
- Backup/restore demonstrado, retenção e RPO/RTO definidos.
- Corrigir divergência do preview de empréstimo: endpoint de preview e serviço autoritativo atualmente calculam taxas diferentes.
- Separar permissões/roles de runtime e owner do banco, se a topologia operacional exigir.

**Gate:** database limpo migra do zero; operações e ledger reconciliam sob concorrência/retry; restore e rollback são demonstrados em ambiente isolado. Parcialmente atendido apenas.

## Fase 2 — War’I: interface, combate e sincronização

**Status: PARCIAL — loop jogável e E2E servidor disponíveis; validação de experiência em navegador/staging pendente.**

### Concluído (código/testes)

- Inventário War’I com filtros, busca, detalhes, PackBack persistida e ownership.
- Arma/defesa duráveis, habilidades, cura/granada/reconhecimento temporário, capacidade de carga e coleta autoritativa.
- Coleta aguarda persistência antes de confirmar; falha pode reverter reserva/carga/efeitos.
- Reconexão autenticada e teste E2E de WebSocket para partida, itens, persistência/rollback e retomada.
- Canvas de zona responsivo, estados de conexão e navegação por teclado.

### Pendente / bloqueadores

- Testes de interface em navegador para leitor de tela, teclado, loading/erros e breakpoints móveis.
- Jornada completa com dois clientes reais em staging, incluindo perda de rede, expiração de sessão e reconexão após restart.
- Política de produto para desconexão prolongada, partida finalizada e perda/reinício do processo.

**Gate:** persistência e estado de jogo consistentes; reconnect não duplica participação; fluxo validado com clientes reais e acessibilidade. Parcialmente atendido.

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
