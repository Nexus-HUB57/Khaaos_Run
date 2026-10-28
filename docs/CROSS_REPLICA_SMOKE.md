# Smoke Cross-Replica ao Vivo (M4) — 2 réplicas reais + Redis + KR_DISTRIBUTED=1

> Marcador de aceite: `F17_CROSSREPLICA_SMOKE_OK`. Executa a cadeia multi-réplica
> REAL da camada distribuída M3/M4 contra uma stack de staging com **duas réplicas
> de aplicação** e **Redis real** (master + réplica), com o modo distribuído
> explicitamente ligado (`KR_DISTRIBUTED=1`).

## 1. O que o smoke prova (7 estágios)

| # | Validação | Evidência |
|---|-----------|-----------|
| 1 | Readiness das duas réplicas com sondas reais de PG/Redis | `/readyz` 200 em app-a e app-b |
| 2 | Camada distribuída ativa com identidades distintas | `/healthz.distributed.{enabled,replicaId}` → `staging-app-a` ≠ `staging-app-b` |
| 3 | Autenticação real por réplica (`KR_DEV_AUTH=0`) | `/auth/login` emite token por instância |
| 4 | Posse (fencing) e convite no Redis | `kr:own:<roomId>` = HASH `{owner, fence≥1}`; `kr:invite:<code>` = `{roomId, replicaId}` |
| 5 | Join cross-réplica com REDIRECT ao dono | `join_private` em B → `redirect {roomId, to, owner}` → reconexão a A → `private_joined` |
| 6 | Séries Prometheus da camada distribuída | `khaaos_runtime_distributed_*` nas duas réplicas + `replica_info{replica_id}` |
| 7 | Resiliência: morte do dono | `docker compose stop app-a` → lease expira no Redis → B saudável → `up -d app-a` ready |

O estágio 7 roda com `--kill-owner` (modo compose). A expiração do lease é
sondada via `EXISTS kr:own:<roomId>` até `0` (janela `KR_OWNERSHIP_TTL_MS`).

## 2. Arquitetura da cadeia validada

```
Cliente A ──ws──▶ réplica A (staging-app-a) ──▶ create_private
                     │  acquire(roomId) ──▶ Redis: kr:own:<id> {owner, fence}
                     │  publishInvite(code) ─▶ Redis: kr:invite:<code> {roomId, replica}
                     │  register(id→address) ▶ Redis: kr:replica:<id> (heartbeat renova)
Cliente B ──ws──▶ réplica B (staging-app-b)
                     │  join_private(code) → lookupInvite → redirectFor(roomId)
                     ◀── { type:'redirect', roomId, to:KR_REPLICA_URL(A), owner }
Cliente B ──ws──▶ réplica A (dono) → join_private → private_joined
```

Invariantes de consistência (Kleppmann — fencing tokens):

1. **Autoridade única**: a sala tem UM dono por vez; o epoch (fence) sobe a cada
   nova posse. Mutação sem posse válida é rejeitada (`no_lease` / `fencing_violation`).
2. **Registro vivo**: o heartbeat renova `kr:replica:<id>` junto com os leases —
   o redirect nunca aponta para uma réplica morta (bug M4 corrigido: o registro
   era escrito uma única vez e expirava em `ttlMs*2`).
3. **Sem sala fantasma**: convite resolvido cujo dono não está no registry →
   `private_not_found` (nunca redireciona para o vazio).
4. **Zero perda de mensagens no setup**: mensagens do cliente que chegam durante
   o `assign` da conexão são bufferizadas e drenadas em ordem (bug M4 corrigido:
   o handler definitivo só era anexado depois do assign — qualquer
   `create_private`/`join_private` imediato era silenciosamente descartado).

## 3. Como rodar

### Staging gerenciado (Docker Compose — modo compose)

```bash
cd infra/staging
cp .env.example .env          # ajuste segredos + KR_USERS_JSON
bash deploy.sh --replicas 2   # app-a/app-b determinísticos (8081/8082) + nginx
bash verify.sh                # inclui o estágio 5 do modo distribuído
node ../../scripts/run-staging-crossreplica-smoke.mjs --mode compose --kill-owner
```

### Sem Docker (modo local — evidência em sandbox/CI leve)

```bash
node scripts/run-staging-crossreplica-smoke.mjs --mode local
# sobe Redis master+réplica reais (ports 56379/56380) + 2 nós do runtime
# (staging-app-a :8081, staging-app-b :8082) com KR_DISTRIBUTED=1 e derruba ao sair
```

Parâmetros úteis: `--a-url/--b-url` (endereços diretos), `--ttl-ms`
(`KR_OWNERSHIP_TTL_MS`), `--user/--pass` (credenciais do `KR_USERS_JSON`),
`KR_SMOKE_REDIS_CLI/KR_SMOKE_REDIS_SERVER` (binários redis no modo local),
`KR_SMOKE_LOGDIR` (logs dos processos; padrão `/tmp/crossreplica-smoke`).

### CI (configurado — `staging-smoke.yml`)

O workflow **Staging Smoke** ganhou o job `cross-replica-smoke`: deploy com
`deploy.sh --replicas 2`, `verify.sh` (asserções distribuídas) e o smoke completo
com `--kill-owner`, com summary por estágio no `$GITHUB_STEP_SUMMARY`.

## 4. Perfis de réplica no staging

| Perfil | Serviço(s) | Identidade | KR_REPLICA_URL | Uso |
|--------|-----------|------------|----------------|-----|
| Escala livre | `app` (`--scale N`) | `HOSTNAME` do container | LB (padrão do `.env`) | autoscaler/produção-like |
| Determinístico | `app-a` + `app-b` (`docker-compose.2replicas.yml`) | `staging-app-a/b` fixos | endereço direto 8081/8082 | smoke cross-replica |

Os dois perfis não sobem juntos (portas/upstream distintos — o override troca o
nginx para `nginx-2replicas.conf` com upstream estático).

## 5. Variáveis de ambiente (camada distribuída)

| Variável | Padrão | Função |
|----------|--------|--------|
| `KR_DISTRIBUTED` | `0` | Liga a camada M3/M4 (ownership/fencing/convites/relay) |
| `KR_REDIS_URL` | — | Store de posse/convites/registro (Redis real no staging) |
| `KR_REPLICA_ID` | `HOSTNAME` | Identidade estável da réplica |
| `KR_REPLICA_URL` | LB | Endereço público anunciado no registro (alvo do redirect) |
| `KR_OWNERSHIP_TTL_MS` | `15000` | TTL do lease de posse |
| `KR_OWNERSHIP_HEARTBEAT_MS` | `5000` | Cadência de renovação de leases + registro |
| `KR_INVITE_TTL_MS` | `1800000` | TTL do convite no índice compartilhado |

## 6. Limitação documentada (herança M3)

O espelho de relay (`mirrorLoop`) consome o stream global `__global__`, que
nenhum publisher escreve — os eventos vão para streams por sala. O smoke não
asseriona `mirrorApplied` até o espelho global ser ativado; os counters
`khaaos_runtime_distributed_mirror_*` permanecem em 0 por design transitório.

## 7. Troubleshooting rápido

- **`private_not_found` no join cross-réplica**: verifique `kr:invite:<code>` no
  Redis e se o dono está no registro (`kr:replica:<id>`). Registro vazio com a
  réplica viva = regressão do heartbeat (ver invariante 2).
- **Redirect para endereço inalcançável**: `KR_REPLICA_URL` deve ser o endereço
  que o CLIENTE alcança (no modo compose do smoke: as portas publicadas 8081/8082).
- **Lease não expira após morte do dono**: confira `KR_OWNERSHIP_TTL_MS` da
  réplica dona e o relógio do Redis (o TTL é server-side).
- **`ws fechou (4001)` no smoke**: token de outra réplica — os tokens são
  assinados por instância; o smoke loga em cada réplica (estágio 3).
