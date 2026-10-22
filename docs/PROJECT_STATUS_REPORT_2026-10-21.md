# Relatório consolidado — Khaaos_Run

**Data:** 21 de outubro de 2026  
**Repositório:** `Nexus-HUB57/Khaaos_Run`  
**Snapshot de `main`:** `d3e1eb6916e2c0803ebef9c929e4cbc132ec4806` (`d3e1eb6`)  
**Escopo:** investigação do workflow de stress, execução de testes disponíveis, auditoria da instrumentação de cobertura e próximos passos técnicos. Este documento separa validação local, CI efêmera e prontidão de produção.

## Resumo executivo

- O workflow de stress falhava antes de iniciar qualquer job. A expressão de `timeout-minutes` usava `+`, operador aritmético não aceito pelo parser de expressões do GitHub Actions.
- O workflow foi simplificado e corrigido no commit `d3e1eb6`. Agora executa somente o harness local autenticado do runtime, falha se a suíte falhar e não depende de endereços regionais DNS que não resolvem neste ambiente.
- O stress-test corrigido passou no GitHub: [execução 39678539606](https://github.com/Nexus-HUB57/Khaaos_Run/actions/runs/39678539606). A CI principal também passou: [execução 39678532887](https://github.com/Nexus-HUB57/Khaaos_Run/actions/runs/39678532887). Os demais workflows disparados pelo mesmo SHA — `01 C++ Logic`, `02 CI TypeScript`, `04 Unit Tests`, `05 Integration Tests`, `06 EOS Integration`, `07 Economy Validation`, `09 Docker Build` e `10 Security Scan` — também concluíram com sucesso.
- A execução do teste de stress no GitHub exercitou um caso automatizado com 24 clientes WebSocket autenticados em servidor local. **Não** executou carga de 100–2000 bots contra servidores públicos, regiões de produção, Unreal Dedicated Server ou EOS real.
- A contagem de testes é mensurável; **percentual de cobertura de linhas/branches/funções não é**. O projeto não tem instrumentador como `c8`/Istanbul/nyc nem publica LCOV.
- O roadmap mestre ainda tem snapshot anterior (`26758e0`, revisão de 20/10) e deve ser atualizado separadamente para refletir a evidência e os merges mais recentes.

## Investigação e correção do stress-test

### Causa original

A execução [39677245548](https://github.com/Nexus-HUB57/Khaaos_Run/actions/runs/39677245548), no SHA `e2730a4`, foi rejeitada como erro de arquivo de workflow. A linha problemática era:

```yaml
timeout-minutes: ${{ ((github.event.inputs.duration_minutes || 30) + 10) }}
```

O parser de expressões do GitHub Actions não aceita `+`. A execução tinha zero jobs; portanto, a falha não era do teste, do runner nem da aplicação. Depois de corrigir apenas a expressão ainda haveria uma dependência externa enganosa: `sa1.khaaos.run`, `na1.khaaos.run` e `eu1.khaaos.run` não resolviam por DNS na verificação feita em 21/10.

### Ajuste entregue

No commit `d3e1eb6`, `.github/workflows/stress-test.yml` foi refeito para representar fielmente o que o código executa:

- gatilhos agendado e manual, sem perfis e duração declarados mas não consumidos pelo script;
- timeout fixo e válido de 10 minutos;
- instalação explícita das dependências raiz e de `game-runtime`;
- chamada direta a `npm run test:game:stress`, sem fallback que pudesse esconder falha;
- log publicado como artifact;
- nenhum tráfego é gerado contra endpoints públicos.

A suíte local produziu **1 caso aprovado, 0 falhas**. Esse caso abre 24 clientes autenticados e verifica salas, snapshots, métricas e rejeição de token inválido. O [workflow de stress manual](https://github.com/Nexus-HUB57/Khaaos_Run/actions/runs/39678539606) passou em todos os passos.

**Limite explícito:** a antiga interface apresentava perfis de 100/500/1000/2000 bots, mas o script dedicado executava um teste local fixo de 24 clientes e não usava região nem duração. A nova definição remove a promessa não implementada. Carga real e escalável nas regiões requer ambiente provisionado, autorização operacional, controle de custo/rate e um load generator que use o protocolo real; isso continua pendente.

## Status dos workflows no snapshot

No commit `d3e1eb6`, todos os workflows disparados por push listados abaixo terminaram em `success`; o workflow de stress, acionado manualmente após a correção, também terminou em `success`.

| Pipeline | Resultado observado |
|---|---|
| CI principal | Sucesso — [run 39678532887](https://github.com/Nexus-HUB57/Khaaos_Run/actions/runs/39678532887) |
| Stress Test (local runtime) | Sucesso — [run 39678539606](https://github.com/Nexus-HUB57/Khaaos_Run/actions/runs/39678539606) |
| 01 — C++ Logic Tests | Sucesso |
| 02 — CI TypeScript | Sucesso |
| 04 — Unit Tests | Sucesso |
| 05 — Integration Tests | Sucesso |
| 06 — EOS Integration | Sucesso — fluxo mockado |
| 07 — Economy Validation | Sucesso |
| 09 — Docker Build | Sucesso |
| 10 — Security Scan | Sucesso |

“Todos verdes” refere-se às execuções associadas ao commit acima e ao dispatch manual do stress-test; não implica que cada workflow condicionado a secrets, runners/licenças ou outros eventos tenha sido executado. Avisos de depreciação de actions/Ubuntu apareceram, mas não falharam os jobs.

## Cobertura e testes — baseline disponível

### Contagem de testes executados

As contagens foram obtidas executando os scripts declarados no commit `e2730a4`; os commits até `d3e1eb6` após essa base alteraram o workflow de stress e não os fontes de teste JS/TS usados nesta medição.

| Escopo/comando | Testes/casos | Passaram | Ignorados | Falharam | Observação |
|---|---:|---:|---:|---:|---|
| App oficial — bloco TS/TSX de `npm run test:official` | 230 | 229 | 1 | 0 | Testes oficiais do app |
| App oficial — bloco JS do mesmo comando | 39 | 39 | 0 | 0 | E2E/lógica adicional |
| **App oficial — total das duas etapas** | **269** | **268** | **1** | **0** | Contagens de casos, não percentual de cobertura |
| `npm run test:game` | 16 | 14 | 2 | 0 | Dois testes reais de adapters dependem de serviços |
| `npm run test:real` | 2 | 0 | 2 | 0 | PG/Redis reais não estavam configurados na medição local |
| `npm run test:ue5:logic` | 56 asserções | 56 | 0 | 0 | Regras C++ portáveis compiladas com `g++`; não é UnrealBuildTool |
| `npm run test:game:stress` | 1 caso | 1 | 0 | 0 | Harness local com 24 clientes WebSocket autenticados |

Os totais pertencem a comandos diferentes, podem se sobrepor e **não devem ser somados como casos únicos do produto**. A CI usa serviços descartáveis PostgreSQL/Redis para os jobs que os exigem; isso não equivale a teste contra bancos gerenciados de produção. O fluxo EOS atual é mockado. O teste C++ host-side não substitui build UBT, Unreal Editor, Automation Tests ou Dedicated Server.

### Percentual de cobertura de código

**Não mensurável nesta revisão.** Não foram encontrados `c8`, nyc/Istanbul, LCOV/Codecov/Coveralls, configuração equivalente nem artifacts de cobertura. Portanto não há denominador de linhas, branches ou funções e não é correto inferir um percentual a partir da quantidade de testes.

**Passo recomendado para criar baseline real:** adicionar `c8` como devDependency com lockfile, começar por `server/` e `shared/` no app e separar `game-runtime/`; excluir testes/fixtures/gerados com configuração revisada, publicar `text-summary` e `lcov` como artifacts e definir metas graduais após medir a baseline. Não misturar os números de V8/TypeScript com C++ UE5. Para Unreal, coverage exige toolchain/runner compatível e/ou ferramenta de coverage do próprio engine.

### Lacunas de cobertura de maior risco

- matriz negativa de autorização para todas as rotas mutáveis e todos os recursos/ownership;
- tokens WebSocket: replay/revogação, `Origin`, limite agregado por IP/identidade e corrida de reconnect;
- sala privada, snapshots/AOI e privacidade de dados realtime;
- falhas transacionais, retries/idempotência e concorrência multi-tabela da economia;
- smoke browser/React de acessibilidade, navegação, erro/loading e tamanhos móveis;
- validação com provider OIDC real, staging e PostgreSQL/Redis gerenciados;
- código UE5 ainda sem evidência de compilação UBT/Editor/Automation Tests no runner licenciado.

## Plano técnico recomendado — 1 a 3 ciclos

O plano prioriza gates de segurança e evidência executável antes de elevar a escala ou declarar prontidão de produção.

### Ciclo 1 — P0: segurança, autorização e qualidade dos gates

1. Tornar o ticket WebSocket de uso único/revogável (nonce/JTI e consumo atômico), revogar no logout/rotação, validar `Origin` por allowlist e aplicar limites pré-autenticação e agregados por identidade.
2. Exigir convite/ticket ligado a usuário e sala para joins privados; filtrar salas privadas da listagem; usar AOI no caminho efetivo de broadcast e não expor `inviteCode`/estado fora da área autorizada.
3. Validar respawn pela máquina de estados e limitar `count`/custo de geração procgen; testar que entradas inválidas e falhas não mutam estado.
4. Adicionar cobertura de código reproduzível para app e runtime; tornar lint/audit/security scans gates explícitos sem `|| true` ou `exit-code: 0` inadvertido; adicionar lint de workflows Actions.
5. Corrigir documentação/README que descreva como “produção” recursos ainda mockados ou não compilados. Atualizar o roadmap mestre do snapshot `26758e0` para `d3e1eb6` com as novas evidências.

**Aceite:** token repetido e token pós-logout recusados; origem não permitida recusada; sala privada sem convite retorna 403/404; snapshot não contém segredo/estado alheio; respawn inválido e `count` excessivo não alteram estado; coverage inicial publicada com denominador/versionamento; nenhum gate de segurança mascara falhas.

### Ciclo 2 — P0/P1: economia, persistência e operação

1. Unificar preview e cobrança de empréstimo numa função/política única e manter o depósito indisponível até prova de liquidação/contrato adequado.
2. Exercitar sob concorrência e falha injetada operações multi-tabela, rollback, idempotência, ledger e reconciliação; auditar dados legados e constraints pendentes.
3. Definir expand/contract para migrations, restaurar backup em ambiente isolado e registrar RPO/RTO; separar credenciais/roles de runtime e owner.
4. Estabelecer staging real com PostgreSQL/Redis, OIDC, readiness separado de liveness, request IDs, métricas e playbooks; validar rollback do deploy e migration.

**Aceite:** retries concorrentes não duplicam créditos/debits; preview é igual à cobrança em toda a matriz; restore/rollback repetíveis com RPO/RTO registrados; readiness falha se DB/Redis indisponíveis; deploy do SHA só é declarado saudável após smoke autenticado no staging.

### Ciclo 3 — P1/P2: multiplayer distribuído, experiência e paridade UE5/EOS

1. Em duas réplicas com Redis real, implementar ownership de sala com lease/fencing, sequência/deduplicação, TTL cleanup, backpressure e fan-out limitado por AOI.
2. Adicionar testes de browser para fluxo completo, teclado/leitor de tela e breakpoints; criar benchmarks reproduzíveis de UX/performance.
3. Provisionar ambiente UE5.8 licenciado e EOS Dev/Staging antes de anunciar integração real; compilar Editor/Dedicated Server por UBT, rodar Automation Tests, empacotar e conectar dois clientes.
4. Depois de orçamento/autorização operacional, criar um perfil de carga escalável que teste a região selecionada e reporte p50/p95/p99, erros, reconnect, uso de memória e artefatos — separado do smoke local atual.

**Aceite:** teste multi-réplica prova um único owner e rejeita fencing antigo; métricas de carga vêm de execução reproduzível, com alvos acordados e sem erros ocultos; UI sem violações críticas de acessibilidade; UBT/Automation/Dedicated Server e fluxo EOS real passam com evidência identificável, sem placeholders.

## Decisão de prontidão

O estado suportado por evidências é **vertical slice web/runtime com testes e CI passing** e **smoke de stress local autenticado**. Ainda não há evidência para declarar **load test de 100–2000 bots em região pública**, **UE5 compilado por UBT**, **EOS de produção**, **multiplayer multi-réplica**, **backup/restore de produção** ou **go-live completo**. Os próximos gates devem manter essas distinções explícitas.

## Referências principais

- `docs/ROADMAP.md` — roadmap mestre, cuja revisão ainda aponta para base anterior.
- `docs/TEST_COVERAGE_BASELINE.md` — baseline anterior já registra ausência de instrumentação.
- `docs/SECURITY_AUDIT_2026-10-20.md` — achados e riscos técnicos da revisão de segurança.
- `docs/CI_NOTIFICATIONS.md` — configuração de notificações Discord/Slack; HTTP 405 anterior continua exigindo correção do secret para garantir entrega Discord.
- [CI principal no commit d3e1eb6](https://github.com/Nexus-HUB57/Khaaos_Run/actions/runs/39678532887).
- [Stress test local no commit d3e1eb6](https://github.com/Nexus-HUB57/Khaaos_Run/actions/runs/39678539606).
