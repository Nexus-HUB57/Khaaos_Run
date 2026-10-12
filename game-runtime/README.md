# Khaaos Run

Vertical slice jogável do **Campo de Instrução de Guerra Khaaos Ville (CIGKV)** com simulação modular, seeds reproduzíveis, catálogo de armas, loot ponderado e backend authoritative multiplayer.

## Autenticação e RBAC

O servidor usa tokens assinados HMAC-SHA256 com expiração, hash de senha `scrypt` e papéis `player`, `moderator` e `admin`. Configure produção com `AUTH_SECRET` forte e `KR_USERS_JSON` contendo usuários pré-provisionados com `passwordHash` gerado por `hashPassword`.

```bash
AUTH_SECRET='segredo-longo' ADMIN_TOKEN='chave-legada-temporaria' KR_STORE=/var/lib/khaaos/state.json npm run server
```

O login é feito em `POST /auth/login` com `{ "username": "...", "password": "..." }`. WebSocket exige `?token=...`. O painel administrativo exige token JWT com role `admin`; o `ADMIN_TOKEN` existe apenas como compatibilidade operacional temporária.

## Cliente online, reconexão e regiões

```bash
npm install
npm run dev
```

Abra `/?online=1` depois de salvar o JWT em `localStorage.kr_token`, ou use `NetworkClient.login('/...', username, password)`. O cliente envia somente inputs, conecta no `/ws`, guarda o `resumeToken` e reconecta automaticamente com backoff. Sessões ficam reservadas por 15 segundos para retomada.

O matchmaking usa `region` do token (`sa-east`, `us-east` ou `eu-west`) e latências reportadas, agrupando jogadores apenas em salas compatíveis. Salas têm capacidade padrão de 16.

## Persistência e rate limiting

Sessões de reconexão são gravadas por `DurableJsonStore` com escrita atômica e sobrevivem à recriação do processo. O rate limiter usa um adapter com operação `incr` atômica; `SharedMemoryRateStore` é adequado para testes e uma única instância. Em produção, conecte o mesmo contrato a Redis/KeyDB com `INCR` + expiração para compartilhar contadores entre réplicas.

## Painel anti-cheat

```bash
http://localhost:8787/admin.html
```

Com JWT admin, o painel atualiza a cada segundo com conexões, autenticações falhas, rate limits, violações, bans, sessões, fila, regiões, salas e clientes suspeitos. A API é `GET /admin/metrics` com `Authorization: Bearer <jwt>`.

## Testes

```bash
npm test
npm run test:infra
npm run test:stress
```

Os testes cobrem assinatura/RBAC, persistência, reconexão, escolha regional, rate limiting compartilhado entre duas instâncias e 24 conexões WebSocket autenticadas em múltiplas salas.

Antes de produção ainda é necessário substituir o arquivo JSON por storage transacional, conectar um adapter Redis real, usar TLS, adicionar rotação de chaves, SSO/RBAC operacional, matchmaking por ping real e observabilidade distribuída.
