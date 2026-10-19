# Security remediation — 2026-10-17

## Escopo

Esta entrega remedia os bloqueadores levantados na auditoria de segurança do `main`, sem reescrever ou sobrescrever o histórico existente.

## Correções implementadas

- `/api/player/me` agora retorna um DTO allowlisted (`id`, email e perfil), nunca o objeto Passport completo; `access_token` e `refresh_token` não são serializados para o cliente.
- Depósito, transferência, empréstimo, pagamento de empréstimo, compra de item, reparo, salário diário e operações financeiras equivalentes usam transações Drizzle/PostgreSQL com locks de linha e ledger na mesma transação.
- Rotas financeiras mantêm respostas genéricas para falhas internas e preservam apenas códigos públicos de saldo insuficiente, recurso ausente e conflitos de negócio.
- Sessão OIDC usa `httpOnly`, `secure` e `sameSite=lax`; callbacks exigem `PUBLIC_ORIGIN` em produção e rejeitam host não confiável.
- Mutações `/api` validam `Origin` e Fetch Metadata; requisições `cross-site` são recusadas.
- WebSocket tem `maxPayload=16 KiB`, compressão desabilitada, schema Zod para mensagens, limite de 60 mensagens por segundo e erros genéricos.
- Convites e IDs de salas usam `crypto.randomBytes`, sem `Math.random()` para credenciais.
- Matchmaking usa fila Redis compartilhada, lock global de tick/formação e namespace configurável; salas têm lease de ownership e eventos de controle entre nós.
- Produção exige `REDIS_URL`, `REDIS_REQUIRED=true`, senha Redis e `PUBLIC_ORIGIN`; PostgreSQL não é mais publicado em uma porta host pública no compose.
- Middleware HTTP deixou de registrar corpos JSON completos, evitando exposição de tokens, saldos e dados de conta em logs.
- `drizzle-orm` foi atualizado para `0.45.4`, `ws` para `8.22.0`, PostCSS para `8.5.30`, Tailwind para `4.3.3`; `tailwindcss-animate` e o plugin de tipografia não utilizados foram removidos.

## Evidências

- `npm run check`: aprovado.
- `npm run build`: aprovado.
- `npm run test:official`: 205 testes aprovados, 0 falhas.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- `npm audit`: 0 vulnerabilidades.

## Operação

Antes do deploy, preencher no provedor:

- `PUBLIC_ORIGIN=https://<host-canonico>`
- `REDIS_URL=redis://:<senha>@<host>:6379`
- `REDIS_REQUIRED=true`
- `REDIS_NAMESPACE=khaaos`

A migração de banco deve ser executada antes de habilitar tráfego financeiro. O Redis precisa ser compartilhado por todas as réplicas WebSocket; não iniciar réplicas em produção sem esse adapter disponível.
