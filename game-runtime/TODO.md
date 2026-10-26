# Khaaos Run — Backlog de Produção

## Entregas comprovadas

- [x] Entregar vertical slice jogável do CIGKV.
- [x] Modularizar simulação, RNG, armas, loot e replay.
- [x] Criar servidor authoritative com anti-cheat.
- [x] Integrar cliente online com snapshots e interpolação.
- [x] Adicionar matchmaking por salas e regiões.
- [x] Implementar tokens assinados, hash scrypt e RBAC base.
- [x] Implementar reconexão por resume token com janela de 15 segundos.
- [x] Implementar persistência atômica de sessões no adapter local.
- [x] Implementar rate limit com adapter compartilhável em memória.
- [x] Adicionar testes de autenticação, persistência, reconexão, regiões e concorrência.
- [x] Expor liveness público em `GET /healthz`, com teste de contrato e sem dados sensíveis.
- [x] Fase 3 — netfeel: predição client-side com reconciliação, fila de inputs com `ackSeq`, lag compensation por rewind e pós-processamento Live Action.
- [x] Fase 4 — infiltração aérea (paraquedas sky/chute autoritativo replicado na predição), granada FRAG (balística + dano radial com atenuação por parede), Gloo Wall (cobertura destrutível 220 HP/60 s em colliders dinâmicos), realismo PBR (normal maps procedurais, envmap, vegetação/nuvens) e HUD de queda/arremessáveis. Cobertura: `test/phase4.test.js` (12 testes).

## Próxima entrega de código

- [x] Formalizar a máquina de estados da sala (`LOBBY → IN_PROGRESS → FINISHED`) com transições válidas, idempotência de início, snapshot da fase e teste de sequência monotônica.
- [x] Garantir sequência monotônica de snapshots/ticks e rejeição de input fora da fase `IN_PROGRESS`.
- [x] Aplicar limite de payload WebSocket de 16 KiB, limite de buffer de saída de 256 KiB e encerramento controlado sob backpressure.
- [x] Expor `GET /readyz` separado de liveness, verificando os adapters obrigatórios sem consultar dependências lentas.
- [x] Adicionar métricas de saturação, mensagens rejeitadas, payloads excedentes e backpressure ao endpoint administrativo.

## Integrações de produção pendentes

- [x] Implementar `PostgresSessionStore` transacional com migração versionada, expiração no banco, readiness e testes reais opt-in.
- [x] Conectar `RedisRateStore` real com `INCR` + `PEXPIRE` atômicos via Lua, readiness e testes reais opt-in.
- [x] Executar os testes reais em CI/staging com PostgreSQL e Redis provisionados, incluindo recuperação, timeout e falha de dependência. Cobertura: job `Game Runtime Tests` (`.github/workflows/ci.yml`) + `test/real-resilience.test.js` via `npm run test:resilience` (`pg_terminate_backend`/`CLIENT KILL`, host non-routable com timeout, ready() rejeita com dependência fora, expiração/cleanup).
- [x] Adicionar TLS, rotação de chaves, revogação e SSO/OIDC operacional. Cobertura: `test/security.test.js` (8 testes) — HTTPS (`tls: {cert,key}` / `KR_TLS_CERT`/`KR_TLS_KEY`), tokens HS256 com `kid` + grace (`retired`) via `POST /admin/keys/rotate|drop`, revogação por `jti` via `POST /auth/logout` (HTTP e WebSocket) e OIDC Authorization Code completo (`server/oidc.js`: discovery, JWKS RS256, nonce/state single-use, provisionamento de usuário).
- [x] Implementar RBAC com auditoria e permissões por recurso. Cobertura: `test/rbac.test.js` (7 testes) — catálogo declarativo (`server/rbac.js`: `room:join/start/input` restritos à própria sala, `admin:metrics`, `keys:rotate`, `audit:read`), trilha append-only (`server/audit.js` ring buffer + `PostgresAuditStore` migração `002_audit_events.sql`), guards HTTP 403 com evento `rbac.deny`, `/admin/audit` com filtros (`actor/action/outcome/sinceId`), payload de métricas sem dados por usuário para papéis não elevados e `room:start` auditado por sala no WebSocket.
- [x] Adicionar ping real, health/readiness de dependências, backpressure e autoscaling por região. Cobertura: `test/health-autoscale.test.js` (5 testes) — `server/health.js` com sondas reais por dependência (latência medida, timeout `2 s`, cache TTL `5 s`), `/readyz` com `checks`/`latencyMs`/`errors` + gate de saturação (`readyGate`/`KR_READY_MAX_CONNECTIONS` → `503 overload`), `GET /admin/ping` forçando sondas frescas, autoscaling determinístico por região em `server/autoscale.js` (`scale_out` ≥ 85% ou com fila, `scale_in` < 30%, thresholds em `SCALE_DEFAULTS`) exposto em `/healthz` (`regions[]`) e `GET /admin/regions`.
- [x] Testar múltiplas instâncias, falha de processo, reconnect após reinício, soak e fault injection. Cobertura: `test/multiinstance.test.js` (réplicas simultâneas com store compartilhado + reconnect entre instâncias degrada para alocação nova sem erro; reinício — sessão persistida sobrevive ao processo e reconnect pós-restart é aceito), `test/fault-injection.test.js` (leitura de sessão quebrada → fail-fresh com `metrics.storeReadFailures`; rate store fora → fail-open com `metrics.rateStoreFailures` e partida viva; audit store quebrado nunca bloqueia login/RBAC) e `test/soak.test.js` (12 jogadores, churn contínuo, snapshots sem interrupção, fila vazia, zero unhandled rejections; `KR_SOAK_MS` para soak real).
- [x] Definir economia e compliance antes de conectar qualquer valor real, carteira, resgate ou custódia. Cobertura: `docs/economy-compliance.md` (contrato) + `server/economy.js` — moeda única KRC sem lastro, `REAL_MONEY_ENABLED=false` congelado + `assertRealMoneyDisabled()` bloqueando trilhas de valor real, ledger de dupla entrada append-only (`Ledger` memória + `PostgresEconomyStore`, migração `003_economy_ledger.sql`), idempotência por chave única, teto diário (`KR_ECONOMY_DAILY_CAP`), odds publicadas obrigatórias (`requireOdds`), RBAC `economy:grant` (admin) e endpoints `/economy/balance|history|grant|compliance` com leitura derivada do token. Testes: `test/economy.test.js` (6).

## Dependências externas bloqueadoras

- [ ] Compilar UE5.8 com UnrealBuildTool e executar Automation Tests em ambiente com Editor/SDK.
- [ ] Criar/importar `.umap`, meshes, materiais e Niagara dos mundos jogáveis.
- [ ] Integrar binários oficiais do EAC SDK e validar build cliente/servidor.
