# Khaaos Run — Auditoria de Segurança

**Data:** 2026-10-14  
**Escopo:** `Nexus-HUB57/Khaaos_Run`, `origin/main`, commit `ee06f26`  
**Objetivo:** avaliar o backend Node/Express, autenticação OIDC/sessões, WebSocket, economia persistente, cadeia de dependências e pipeline de deploy antes de produção.

> **Conclusão:** o código não deve ser promovido a produção sem corrigir os itens P0 abaixo. A suíte funcional passa, mas os testes atuais não cobrem exposição de tokens, concorrência financeira, CSRF, abuso de payload WebSocket nem hardening de dependências.

## Evidências executadas

| Verificação | Resultado |
|---|---:|
| `npm run check` | PASS |
| `npm run test:official` | PASS — 166 testes oficiais + 39 testes de pipeline |
| `npm audit --omit=dev` (root) | **18 vulnerabilidades: 16 altas, 2 moderadas, 0 críticas** |
| `npm --prefix game-runtime audit --omit=dev` | PASS — 0 vulnerabilidades reportadas |
| `npm ci --ignore-scripts --no-audit --no-fund` | PASS |
| Scan manual de segredos hardcoded | Nenhum segredo de produção identificado nos arquivos revisados; valores são referenciados por ambiente/Secrets |

## Achados prioritários

### P0-01 — Tokens OIDC são retornados ao cliente

**Impacto:** crítico — comprometimento de sessão e acesso continuado à conta.

**Evidência:**

- `server/replit_integrations/auth/replitAuth.ts:43-50` coloca `access_token` e `refresh_token` no objeto Passport armazenado em sessão.
- `server/routes.ts:260-263` responde `{ stats, user: req.user }` em `/api/player/me`, expondo o objeto completo ao navegador.

Um `refresh_token` não deve sair da fronteira do servidor. Se a resposta for capturada por XSS, extensão, proxy ou log de cliente, o invasor pode renovar a sessão.

**Correção obrigatória:** retornar somente um DTO allowlisted (`id`, `email`, `firstName`, `lastName`, imagem e claims não sensíveis); não persistir tokens brutos em sessão sem criptografia/rotação; separar o armazenamento server-side de refresh tokens e invalidar o token no logout.

### P0-02 — Operações financeiras não são atômicas nem idempotentes

**Impacto:** crítico — double-spend, saldo negativo lógico, empréstimos duplicados e divergência entre saldo e ledger sob concorrência/retry.

**Evidência:** `server/routes.ts:83-94`, `101-112`, `129-140`, `147-163`, `190-201` e `236-251` fazem leitura de saldo, atualização de saldo e criação de transação em chamadas separadas, sem transação SQL, lock de linha, constraint de saldo ou idempotency key.

**Correção obrigatória:** encapsular cada mutação em `db.transaction`, bloquear a conta (`SELECT ... FOR UPDATE`), validar invariantes no banco, inserir ledger com chave idempotente e fazer o débito/atualização e evento de auditoria no mesmo commit. Adicionar testes concorrentes com `Promise.all`.

### P0-03 — Drizzle ORM vulnerável a SQL injection

**Impacto:** alto, com potencial crítico dependendo do caminho de identificadores usado.

**Evidência:** `npm audit --omit=dev` reporta `drizzle-orm` direto abaixo de `0.45.2` (`GHSA-gpj5-g38j-94v9`, SQL injection em identificadores). O audit indica correção disponível em `0.45.4`.

**Correção obrigatória:** atualizar `drizzle-orm` para versão corrigida compatível, regenerar `package-lock.json`, revisar qualquer uso de identificadores dinâmicos e executar a suíte completa antes do merge.

## Achados altos

### P1-01 — CSRF ausente nas rotas autenticadas por cookie

As rotas mutáveis `/api/bank/*`, `/api/loans/*`, `/api/items/*`, `/api/player/daily` e `/api/zone/*` usam sessão em cookie (`server/replit_integrations/auth/replitAuth.ts:30-40`), mas não há middleware CSRF nem validação consistente de `Origin`/`Referer`. `SameSite` não é configurado explicitamente.

**Correção:** adicionar proteção CSRF sincronizada ou double-submit, configurar `sameSite: "lax"`/política documentada, `secure: true`, e rejeitar origens não allowlisted em mutações.

### P1-02 — Host header controla callback OIDC e redirect de logout

`server/replit_integrations/auth/replitAuth.ts:95-104` cria estratégia e `callbackURL` com `req.hostname`; `:131-137` monta `post_logout_redirect_uri` com `req.protocol` e `req.hostname`; `:74` ativa `trust proxy`.

Isso permite que host/forwarded-host não allowlisted influencie URLs OIDC e pode causar callback incorreto ou open redirect em configuração de proxy permissiva. A estratégia também pode ser registrada indefinidamente para hosts arbitrários.

**Correção:** definir `PUBLIC_ORIGIN`/allowlist fixa por ambiente, rejeitar `Host` desconhecido, não construir redirect a partir de input de request e limitar o conjunto de estratégias.

### P1-03 — WebSocket sem limite explícito de payload, schema runtime ou rate limit

`server/game/RoomManager.ts:209-227` cria `WebSocketServer` sem `maxPayload`; `:239-248` executa `JSON.parse` de qualquer mensagem e devolve `err.message` ao cliente. Não há limite por conexão para mensagens, ações ou bytes.

**Correção:** definir `maxPayload` pequeno, validar mensagens com schema discriminado (Zod), impor limite por IP/usuário/ação, fechar conexões abusivas com código apropriado e nunca expor mensagens internas de exceção.

### P1-04 — Logs de API capturam corpos de resposta potencialmente sensíveis

`server/index.ts:21-38` sobrescreve `res.json` e grava o JSON completo de toda rota `/api` no log. Isso pode registrar dados pessoais, saldos, transações e objetos de usuário.

**Correção:** log estruturado com request ID, método, rota, status e latência; redaction por campo; nunca logar tokens, cookies, saldos ou payloads completos em produção.

### P1-05 — Mensagens internas de erro podem vazar para clientes

`server/index.ts:45-57` usa `err.message` diretamente no erro HTTP; `RoomManager.ts:246-248` faz o mesmo no WebSocket.

**Correção:** mapear erros conhecidos para códigos públicos e retornar mensagem genérica; manter stack/causa somente no log redigido.

### P1-06 — Dependências de produção e build com vulnerabilidades conhecidas

Além do `drizzle-orm`, o audit reporta vulnerabilidades altas em `ws` (`8.0.0–8.20.1`, incluindo memory exhaustion), `postcss`, `tailwindcss`, `tailwindcss-animate`, `braces/chokidar/micromatch`, `lodash`, `minimatch`, `nanoid`, `path-to-regexp`, `picomatch`, `source-map-js` e `fast-glob`. Há 18 findings no lockfile root.

**Correção:** atualizar diretas e lockfile; substituir ou isolar dependências sem fix (`braces`, `chokidar`, `micromatch`, `tailwindcss-animate`) quando necessário; separar toolchain de build da imagem runtime; adicionar `npm audit --omit=dev` como gate de CI com exceções documentadas e temporárias.

### P1-07 — Pipeline mascara falhas de verificação e pode aceitar imagem antiga

`.github/workflows/deploy.yml:212` usa `docker pull ... || true`; `:269-272` usa `node scripts/verify-all.mjs ... || true`. Assim, falha no pull ou na verificação pós-deploy pode resultar em pipeline verde ou em execução de imagem não pretendida.

**Correção:** remover `|| true` em etapas de integridade; usar digest imutável, falhar o job em qualquer health check/verificação, e só notificar sucesso após validação real. Fixar actions por SHA ou adotar política de pinning automatizada.

## Riscos adicionais a tratar antes de escala

- **Sessões:** `serializeUser`/`deserializeUser` lidam com o objeto inteiro; reduzir a sessão ao mínimo e definir explicitamente `sameSite`, `domain`, TTL absoluto e rotação.
- **Rate limiting HTTP:** não há limite global evidente para login, callback, emissão de token WS ou mutações de economia.
- **Salas em memória:** `RoomManager` mantém rooms e matchmaking no processo (`server/game/RoomManager.ts:193-205`); múltiplas réplicas não compartilham estado, filas ou eventos sem Redis/pub/sub e afinidade de conexão.
- **Códigos de convite:** `server/game/RoomManager.ts:1350-1353` usa `Math.random()` para códigos de 6 caracteres; substituir por `crypto.randomInt`/`randomBytes`, garantir unicidade, expiração e limite de tentativas.
- **Headers de segurança:** não há middleware explícito de Helmet/CSP/HSTS no bootstrap (`server/index.ts`). Adicionar política compatível com o frontend e validar em staging.
- **TLS:** o Node inicia `createServer` HTTP (`server/index.ts:6`); isso é aceitável apenas se o proxy/Render for o único terminador confiável e a rede interna estiver protegida. Documentar e testar o trust boundary; para deploy direto, usar HTTPS/WSS.
- **Banco/Redis de produção:** `infra/deploy/docker-compose.production.yml` expõe PostgreSQL em `5432:5432` e deixa `REDIS_PASSWORD` opcional. Remover publicação pública, exigir senha forte/TLS ou restringir por rede privada/firewall.

## Plano de correção recomendado

1. **Bloquear deploy:** corrigir P0-01, P0-02 e P0-03; adicionar testes de não exposição de tokens e concorrência financeira.
2. **Hardening de borda:** CSRF, allowlist de origem/host, rate limit HTTP/WS, `maxPayload`, schemas runtime, headers e redaction de logs.
3. **Supply chain:** atualizar lockfile e dependências; eliminar findings altas no runtime; pin de actions por SHA.
4. **Confiabilidade distribuída:** Redis/pub/sub para salas, filas e rate limiting; idempotência e observabilidade por request/match.
5. **Reauditoria:** repetir `npm audit`, `npm run check`, `npm run test:official`, testes de carga e DAST em staging antes de habilitar produção.

## Veredito

**Não aprovado para produção no estado atual.** A funcionalidade coberta pelos testes está verde, mas há exposição de credenciais de sessão, risco de corrupção financeira sob concorrência, dependências altas vulneráveis e gaps de proteção de borda/deploy. O relatório está em uma branch separada para revisão; o `main` não foi alterado.
