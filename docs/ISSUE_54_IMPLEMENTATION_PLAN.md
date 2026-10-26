# Issue #54 — Plano de implementação: lifecycle de identidade e borda realtime

**Branch de trabalho:** `feat/pr54-identity-revocation-ws-origin`
**Base:** `main` após o merge do PR #74 (`8b7bc51` e commits subsequentes de cobertura)
**Issue:** [#54](https://github.com/Nexus-HUB57/Khaaos_Run/issues/54)

## Objetivo

Fechar os bloqueadores de identidade e transporte apontados no roadmap: tokens WebSocket reutilizáveis, ausência de revogação efetiva, ausência de Origin no handshake, rate limit apenas por socket e logout via GET. A implementação deve preservar a autoridade do servidor e continuar funcionando em múltiplas réplicas.

## Estado encontrado na base

- `server/replit_integrations/auth/replitAuth.ts` usa `express-session` com `connect-pg-simple`, uma única `SESSION_SECRET`, cookie `Secure`/`HttpOnly`/`SameSite=Lax` e refresh OIDC server-side.
- `GET /api/logout` destrói a sessão, mas ainda é uma mutação acionável por navegação e não possui fluxo POST protegido.
- `server/replit_integrations/auth/ws-token.ts` assina HMAC de 60 segundos sem `jti`, consumo único ou consulta de revogação.
- `server/game/RoomManager.ts` valida token no upgrade, mas não valida `Origin`; o limite de 60 mensagens/s é local ao socket e não cobre tentativas inválidas de upgrade.
- `server/game/DistributedState.ts` já fornece conexão Redis, locks, filas, leases de sala e publicação de eventos. Ele será estendido com primitivas atômicas de revogação e rate limit, sem criar um segundo cliente Redis.
- `server/routes.ts` já possui proteção CSRF/Origin para mutações HTTP e emite o token WS em `GET /api/auth/ws-token`; esse caminho será instrumentado e limitado, não duplicado.
- O logging em `server/index.ts` registra método, rota e status, mas ainda não há `requestId` consistente nem redaction centralizado.

## Desenho proposto

### 1. Keyring e rotação sem derrubar sessões

Criar `server/replit_integrations/auth/keyring.ts` com:

- `kid` explícito e chaves `current`/`previous` carregadas de configuração segura;
- janela de convivência configurável (`AUTH_KEY_GRACE_SECONDS`), com relógio injetável nos testes;
- assinatura nova apenas com a chave corrente e verificação com corrente + anterior durante a janela;
- validação de tamanho mínimo e falha fechada em produção;
- nenhum segredo ou token bruto nos logs.

Para `express-session`, suportar `SESSION_SECRET_CURRENT` e `SESSION_SECRET_PREVIOUS` com a ordem exigida pelo Express (corrente para assinar, anterior apenas para verificar). `WS_TOKEN_SECRET_CURRENT`/`WS_TOKEN_SECRET_PREVIOUS` devem usar o mesmo keyring e carregar `kid` no payload.

### 2. Revogação e consumo único

Adicionar ao `DistributedState` operações atômicas com TTL:

- `consumeWsJti(jti, ttl)` via `SET NX PX`, rejeitando replay do mesmo ticket;
- `revokeSession(sessionId, reason, ttl)`;
- `revokeUser(userId, generation/reason, ttl)` para logout, ban e troca de credencial;
- `isRevoked` com fail-closed quando Redis é obrigatório;
- publicação `auth:revoke` para que todas as réplicas fechem sockets locais daquele usuário.

O token WS receberá `jti`, `kid`, `sid`/versão de sessão, `aud`, `iat` e `exp`. O consumo deverá acontecer no handshake depois de validar assinatura, validade, propósito, sessão e Origin; uma segunda conexão com o mesmo ticket será recusada.

### 3. Logout, troca de credencial e ban

- Trocar a mutação pública para `POST /api/logout`, mantendo `GET /api/logout` apenas como resposta 405/redirect compatível sem destruir estado.
- Exigir Origin/Fetch Metadata para o POST e limpar o cookie local.
- Revogar sessão e geração do usuário antes do redirect para o IdP.
- Integrar ban/troca de credencial ao mesmo evento de revogação; o evento deve fechar sockets em todas as réplicas.
- Invalidar refresh state local quando a sessão OIDC for revogada e evitar devolver tokens em DTOs ou erros.

### 4. Rate limiting distribuído

Implementar um `DistributedRateLimiter` sobre `DistributedState`, com script Lua ou operação Redis atômica:

- pré-autenticação WS por IP e Origin/upgrade;
- emissão de token WS por `userId` + IP;
- login/callback por IP e, quando disponível, identidade/nonce;
- mutações HTTP por identidade + rota e por IP;
- mensagens WS por identidade agregada, além do limite por socket já existente;
- resposta `429` com `Retry-After` e sem ecoar credenciais.

Fora da produção, o adapter local poderá ser usado explicitamente para testes; em produção, Redis ausente deve impedir o boot ou retornar indisponibilidade, nunca degradar silenciosamente para um limite local.

### 5. Origin, headers e request ID

- Criar parser de allowlist (`PUBLIC_ORIGIN` e `ALLOWED_WS_ORIGINS`) que compare `URL.origin`, nunca apenas `Host`.
- Validar Origin no `verifyClient` do `RoomManager`; ausência de Origin deve ser rejeitada em produção, com exceção documentada para clientes nativos autenticados por configuração explícita.
- Adicionar `requestId`/correlation ID sanitizado ao início do pipeline HTTP e propagá-lo para logs, respostas de erro e métricas.
- Adicionar headers de segurança para respostas HTTP e redaction de `cookie`, `authorization`, `sec-websocket-protocol`, `access_token`, `refresh_token` e `WS_TOKEN_SECRET`.

## Ordem de implementação

1. **Primitivas:** keyring, parser de Origin, Redis atomic primitives e limiter; testes unitários sem rede.
2. **Token WS:** `jti`/`kid`/sessão, consumo único, revogação e fechamento de sockets; atualizar contratos de handshake.
3. **Sessão HTTP:** rotação, logout POST, revogação por usuário e callback/login rate-limited.
4. **Edge HTTP/WS:** request ID, headers, redaction, limites pré-auth e agregados.
5. **Integração distribuída:** duas instâncias com Redis real/efêmero, pub/sub de revogação e fencing de sockets.
6. **Operação:** variáveis de ambiente, runbook de rotação/rollback e métricas sem PII.

## Matriz de aceite

| Área | Cenário obrigatório | Evidência |
|---|---|---|
| Keyring | Chave nova assina; chave anterior verifica apenas durante grace | teste com relógio controlado |
| WS replay | Mesmo ticket não abre duas conexões | teste com Redis e duas tentativas |
| Revogação | Logout, ban e troca de credencial recusam reconnect e fecham socket ativo | teste multi-réplica |
| Origin | Origin ausente/maliciosa recebe 403; allowlist válida conecta | teste de handshake |
| Limites | IP/usuário compartilha quota entre duas instâncias | teste concorrente com Redis |
| HTTP | `/api/auth/ws-token`, login/callback e mutações retornam 429 sob abuso | testes de rota |
| Logs | Nenhum token, cookie, protocolo WS ou segredo aparece em logs | teste de redaction |
| Compatibilidade | Sessões existentes sobrevivem dentro da janela de rotação | teste de sessão antiga |
| Falha | Redis indisponível em produção falha fechado; desenvolvimento deixa diagnóstico explícito | teste de configuração |

## Entregas planejadas

- Código: `keyring.ts`, `rateLimiter.ts`, extensões de `DistributedState`, `ws-token.ts`, `replitAuth.ts`, `RoomManager.ts`, `server/index.ts` e rotas auth.
- Testes: `auth-keyring`, `auth-revocation`, `ws-origin-replay`, `distributed-rate-limit`, `security-logging` e integração Redis multi-réplica.
- Operação: documentação de variáveis, rotação, grace period, revogação emergencial e rollback.

Não será feito nesta issue: pagamentos reais, custódia de KRC, alteração do modelo de autorização de gameplay ou substituição do OIDC por outro provedor.
