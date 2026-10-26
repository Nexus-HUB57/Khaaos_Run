# Staging — PG/Redis reais, gate de saturação e autoscaler

Ambiente de staging reproduzível com **dependências reais** (nada de mock):
PostgreSQL 16, Redis 7, N réplicas do servidor autoritativo atrás do nginx e
um autoscaler externo que lê a carga e escala por `docker compose --scale`.

## Subir em 60 segundos

```bash
cd infra/staging
cp .env.example .env      # AJUSTE: ADMIN_TOKEN, AUTH_SECRET, KR_PG_PASSWORD
bash deploy.sh            # build → migrações 001-003 → up → espera /readyz 200
bash verify.sh            # prova: sondas reais, gate ativo, LB round-robin
```

A stack: `postgres` (volume `pgdata`) + `redis` (AOF) + `app` (réplicas,
imagem `game-runtime/Dockerfile`) + `nginx` (round-robin DNS com re-resolução
por requisição — `--scale app=N` funciona sem reload) + `migrate` (one-shot).

## KR_READY_MAX_CONNECTIONS ativo

Definido no `.env` e injetado em cada réplica. Efeitos encadeados:

1. **`/readyz`** da réplica passa a reportar `load.maxConnections` e responde
   **503 `overload`** quando `connections > maxConnections` — o nginx/HPA tira
   a réplica da rotação enquanto ela não esvazia (comprovado no CI:
   `Staging Smoke → Overload gate`).
2. **Autoscaler** usa o mesmo número como capacidade por réplica: carga total
   `= connections / (réplicas × maxConnections)`.

## Autoscaler (autoscaler.mjs)

```bash
cd infra/staging
node autoscaler.mjs                    # dry-run (default): só loga a decisão
KR_AUTOSCALE_DRYRUN=0 node autoscaler.mjs   # executa docker compose --scale
```

Decisão (mesma semântica de `server/autoscale.js`, testada em
`game-runtime/test/staging-autoscaler.test.js`):

| Sinal | Ação |
|-------|------|
| carga ≥ 85% **ou** fila de matchmaking > 0 | `scale_out` (+1 réplica/ciclo) |
| carga < 30%, sem fila | `scale_in` (−1 réplica, piso `min`) |
| quer sair do piso/teto | `ok` com motivo `at_min`/`at_max` |
| última mudança < `KR_AUTOSCALE_COOLDOWN_MS` | decisão adiada (`cooldown`) |

Contagem de réplicas vivas: instâncias distintas vistas em `/healthz`
(`uptimeMs` difere por réplica). Cooldown de 60 s evita flapping.

## Variáveis

| Variável | Default | Papel |
|----------|---------|-------|
| `KR_READY_MAX_CONNECTIONS` | `2000` | gate de saturação por réplica (503 overload) |
| `KR_REGION` | `sa-east` | região reportada nas métricas por região |
| `KR_AUTOSCALE_MIN/MAX` | `1`/`4` | piso e teto de réplicas |
| `KR_AUTOSCALE_OUT_PCT/IN_PCT` | `85`/`30` | limiares de scale_out/scale_in |
| `KR_AUTOSCALE_POLL_MS/COOLDOWN_MS` | `5000`/`60000` | ritmo do autoscaler |
| `KR_AUTOSCALE_DRYRUN` | `1` | `0` executa escala real |

## CI

`Staging Smoke` (`.github/workflows/staging-smoke.yml`) sobe a stack real em
cada PR que toca `infra/staging/**`, `game-runtime/server/**` ou o
`Dockerfile`: migrações, `verify.sh`, gate configuracional, `decide()` contra
o staging vivo e `--scale app=2` provando multi-instância com store
compartilhado.
