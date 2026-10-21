# Khaaos Run

Vertical slice jogável do **Campo de Instrução de Guerra Khaaos Ville (CIGKV)** com simulação modular, seeds reproduzíveis, catálogo de armas, loot ponderado e backend authoritative multiplayer.

## Escopo e instalação
Este pacote é um runtime JavaScript independente, com `package.json` e `package-lock.json` próprios. Ele não é iniciado pelo servidor web da raiz e não inicializa nem integra automaticamente o servidor Unreal Engine.

Execute a partir da raiz do repositório:
```bash
npm ci --prefix game-runtime
npm --prefix game-runtime run dev
npm --prefix game-runtime test
```
Dentro deste diretório, os comandos equivalentes são `npm ci`, `npm run dev` e `npm test`. Use `npm ci` para respeitar o lockfile; `npm install` fica reservado a alterações intencionais de dependências.

O desenvolvimento local e os testes unitários não exigem a configuração dos adapters PostgreSQL/Redis. Testes/adapters reais e execução server-side com persistência exigem serviços e variáveis explicitamente configurados.

## Relação com a aplicação web e UE5
A aplicação principal (`server/`, `client/`, `shared/`) e `game-runtime/` têm manifests, processos e scripts distintos. A trilha UE5 é um componente C++ separado. Este repositório ainda não documenta aqui um protocolo versionado nem uma jornada integrada validada entre esses componentes. Consulte [`../Unreal/README.md`](../Unreal/README.md) e [`../docs/ROADMAP.md`](../docs/ROADMAP.md) para o estado e os gates pendentes.

## Autenticação e RBAC

O servidor usa tokens assinados HMAC-SHA256 com expiração, hash de senha `scrypt` e papéis `player`, `moderator` e `admin`. Configure produção com `AUTH_SECRET` forte e `KR_USERS_JSON` contendo usuários pré-provisionados com `passwordHash` gerado por `hashPassword`.

```bash
AUTH_SECRET='segredo-longo' ADMIN_TOKEN='chave-legada-temporaria' KR_SESSION_STORE=postgres KR_DATABASE_URL='postgresql://runtime:senha@db:5432/khaaos_runtime' KR_RATE_STORE=redis REDIS_URL='redis://redis:6379' npm run server
```

O login é feito em `POST /auth/login` com `{ "username": "...", "password": "..." }`. WebSocket exige `?token=...`. O painel administrativo exige token JWT com role `admin`; o `ADMIN_TOKEN` existe apenas como compatibilidade operacional temporária.

## Cliente online, reconexão e regiões

```bash
npm ci
npm run dev
```

Abra `/?online=1` depois de salvar o JWT em `localStorage.kr_token`, ou use `NetworkClient.login('/...', username, password)`. O cliente envia somente inputs, conecta no `/ws`, guarda o `resumeToken` e reconecta automaticamente com backoff. Sessões ficam reservadas por 15 segundos para retomada.

O matchmaking usa `region` do token (`sa-east`, `us-east` ou `eu-west`) e latências reportadas, agrupando jogadores apenas em salas compatíveis. Salas têm capacidade padrão de 16.

## Persistência e rate limiting

Em produção, o runtime usa `PostgresSessionStore` quando `KR_SESSION_STORE=postgres`, com `KR_DATABASE_URL`/`DATABASE_URL`, migração versionada em `migrations/001_runtime_sessions.sql` e expiração no banco. O rate limiter usa `RedisRateStore` quando `KR_RATE_STORE=redis`, com `REDIS_URL`/`KR_REDIS_URL`; cada incremento executa `INCR` e `PEXPIRE` na mesma operação Lua, compartilhando contadores entre réplicas. O `DurableJsonStore` e `SharedMemoryRateStore` permanecem apenas para desenvolvimento/testes explícitos.

Para levantar dependências reais localmente:

```bash
docker compose -f docker-compose.real.yml up -d
export KR_DATABASE_URL='postgresql://runtime:runtime_dev_only@127.0.0.1:55433/khaaos_runtime'
export REDIS_URL='redis://127.0.0.1:56379'
npm run db:migrate
npm run test:real
KR_SESSION_STORE=postgres KR_RATE_STORE=redis npm run server
```

## Painel anti-cheat

```bash
http://localhost:8787/admin.html
```

Com JWT admin, o painel atualiza a cada segundo com conexões, autenticações falhas, rate limits, violações, bans, sessões, fila, regiões, salas e clientes suspeitos. A API é `GET /admin/metrics` com `Authorization: Bearer <jwt>`.

Para observabilidade de infraestrutura, `GET /healthz` é um liveness público e não consulta dependências lentas. `GET /readyz` é um readiness público que confirma a presença dos adapters obrigatórios de sessão e rate limit. O WebSocket limita payloads a 16 KiB, desativa compressão por mensagem e encerra conexões que acumularem mais de 256 KiB de saída pendente.

## Testes

```bash
npm test
npm run test:infra
npm run test:stress
```

Os testes cobrem assinatura/RBAC, persistência, reconexão, escolha regional, rate limiting compartilhado entre duas instâncias e 24 conexões WebSocket autenticadas em múltiplas salas.

Antes de produção ainda é necessário substituir o arquivo JSON por storage transacional, conectar um adapter Redis real, usar TLS, adicionar rotação de chaves, SSO/RBAC operacional, matchmaking por ping real e observabilidade distribuída.
