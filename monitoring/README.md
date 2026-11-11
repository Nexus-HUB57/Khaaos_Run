# Observabilidade do game-runtime

A stack de staging usa Prometheus para coletar `/metrics` de cada réplica do `game-runtime`, exporters para Redis/PostgreSQL/host e Grafana para visualização. O Alertmanager recebe as regras SLO e envia as notificações configuradas no arquivo existente de alertas.

## Subir a stack

A partir da raiz do repositório, configure `infra/staging/.env` com `KR_PG_PASSWORD`, `ADMIN_TOKEN`, `AUTH_SECRET` e `GRAFANA_ADMIN_PASSWORD`, depois execute:

```bash
docker compose \
  -f infra/staging/docker-compose.yml \
  -f monitoring/docker-compose.staging.yml \
  up -d --build --scale app=2
```

Interfaces padrão:

- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3000`
- Alertmanager: `http://localhost:9093`

O overlay não altera a stack base: ele apenas acrescenta Prometheus, Alertmanager, Grafana, `redis_exporter`, `postgres_exporter` e `node_exporter`.

## Métricas do relay Redis

As métricas do runtime são expostas em `/metrics`. Quando `KR_DISTRIBUTED=1`, o contrato de observabilidade inclui:

- `khaaos_runtime_redis_pubsub_up`: conexão Redis disponível para ownership e relay.
- `khaaos_runtime_redis_pubsub_publish_total{result="ok|error"}`: resultado das publicações no relay.
- `khaaos_runtime_redis_pubsub_mirror_gaps_total`: gaps de sequência observados no consumidor monotônico.
- `khaaos_runtime_redis_pubsub_mirror_duplicates_total`: mensagens duplicadas descartadas.
- `khaaos_runtime_redis_pubsub_read_errors_total`: falhas de leitura do stream global.
- `khaaos_runtime_distributed_held_rooms` e `khaaos_runtime_distributed_frozen_rooms`: salas sob lease e salas congeladas após perda de ownership.
- `khaaos_runtime_distributed_fence_violations_total`: tentativas rejeitadas por fence antigo.

O transporte atual do relay é Redis Streams com retenção limitada, embora seja tratado operacionalmente como o barramento Pub/Sub cross-replica. Os alertas cobrem indisponibilidade do Redis, erros de publicação, gaps, erros de leitura, fencing e salas congeladas.

## Dashboards e regras

O dashboard `Khaaos Run — Game Runtime Distributed` fica em `infra/grafana/khaaos-runtime-distributed-dashboard.json`. As recording rules e alertas ficam em `monitoring/prometheus/rules/` e são carregadas por `monitoring/prometheus/prometheus-staging.yml`.

Antes de aplicar em produção, valide os endpoints, a topologia de duas réplicas e os canais de notificação do Alertmanager. Alertas `page` devem ser encaminhados ao on-call; alertas `ticket` exigem investigação no próximo ciclo operacional.
