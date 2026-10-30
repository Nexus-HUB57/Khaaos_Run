# Observabilidade distribuída — traces e logs agregados

Último gap de runtime do backlog de produção, agora fechado. Este documento
descreve o desenho, a operação e o caminho de evolução (Loki/Tempo/OTel) da
telemetria nativa do `game-runtime`.

## O que foi entregue

| Peça | Onde | O que faz |
|------|------|-----------|
| Contexto de trace W3C | `server/obs.js` (`parseTraceparent`, `formatTraceparent`, `httpTraceContext`) | Extrai/gera `traceparent` (`00-<32hex>-<16hex>-<flags>`), preserva `traceId` ponta a ponta e gera `spanId` filho por requisição |
| Spans em árvore | `Observability.startSpan/finish` | Duração medida, status (`ok`/`error`), atributos (`http.method`, `http.status_code`, `ws.*`), aninhamento por `parentId` |
| Logs estruturados | `Observability.recordLog` | JSON com `ts/level/event/traceId/spanId/fields` — `http.request`, `http.error`, `ws.connect`, `ws.disconnect` |
| Middleware HTTP | `traceHttpHandler` + wiring em `server/server.js` | Span + log por requisição, headers de resposta `traceparent` e `x-request-id`, falha do handler vira span `error` + 500 estruturado (nunca rejeição não tratada) |
| Ciclo de vida WebSocket | `handleConnection` | Span por sessão (`ws session client-N`) + logs de entrada/saída; amostragem por `KR_OBS_WS_SAMPLE` (padrão `0.05`) para não inundar a 30 Hz |
| Endpoints admin | `GET /admin/traces`, `GET /admin/logs` | Filtros (`limit`, `sinceId`, `traceId`, `minDurationMs`, `name`, `status`, `level`, `event`); RBAC `obs:read` (moderator e admin; player → 403) |
| Agregação multi-instância | `RedisObsExporter` (`KR_OBS_EXPORTER=redis`) | Cada span/log é replicado em Redis Streams (`kr:obs:{prefixo}:spans|logs`) com `MAXLEN ~10000`; `GET /admin/traces?remote=1` lê `XRANGE` de **todas** as instâncias numa resposta só |
| Ring buffers locais | `Observability` | Teto fixo (`maxTraces` 512, `maxLogs` 2048); excedente descartado de forma determinística e sinalizado em `dropped` (resposta dos endpoints) |

## Variáveis de ambiente

| Variável | Padrão | Efeito |
|----------|--------|--------|
| `KR_OBS_EXPORTER` | — | `redis` ativa o `RedisObsExporter` (agregação entre instâncias) |
| `KR_OBS_REDIS_URL` | `KR_REDIS_URL`/`REDIS_URL` | Redis de destino dos streams |
| `KR_OBS_SAMPLE` | `1` | Amostragem de requisições HTTP (`0..1`) |
| `KR_OBS_WS_SAMPLE` | `0.05` | Amostragem de spans de sessão WS |
| `KR_OBS_SERVICE` | `khaaos-runtime` | Nome do serviço embutido em spans/logs (identifica a instância/região) |

## Contrato dos endpoints (admin)

```
GET /admin/traces?limit=100&sinceId=0&traceId=&minDurationMs=&name=&status=
→ { spans: [{ seq, name, traceId, spanId, parentId, durationMs, status, attributes, service }...],
    nextSinceId, dropped, metrics: { spansFinished, spansDropped, exportFailures } }

GET /admin/traces?remote=1          # snapshot de todas as instâncias via Redis
→ { remote: true, spans: [...], logs: [...] }

GET /admin/logs?limit=100&level=&event=&traceId=
→ { logs: [{ seq, ts, level, event, message, traceId, service, fields }...], nextSinceId, dropped }
```

Autorização pela permissão `obs:read` no catálogo `server/rbac.js`
(moderator e admin). Respostas 403 geram evento `rbac.deny` na trilha de
auditoria, como nos demais guards.

## Como depurar um incidente

1. Puxe o `traceparent` (ou `x-request-id`) da resposta/reclamação do jogador.
2. `GET /admin/logs?traceId=<id>` — sequência de eventos daquele jogador
   (login, ws.connect, rejeições de input, disconnect).
3. `GET /admin/traces?traceId=<id>` — spans com duração por rota/sessão;
   `status=error` isola falhas do handler.
4. Com mais de uma instância: `GET /admin/traces?remote=1&traceId=<id>` —
   junta as duas pontas mesmo se o jogador trocou de réplica pelo nginx.

## Evolução (fora de escopo deste PR)

- **OTLP**: um `Exporter` que fala OTLP/gRPC para Tempo/Jaeger — a interface
  (`exportSpan/exportLog`) já é o ponto de encaixe.
- **Logs para Loki**: `promtail` raspando `/admin/logs` (ou stream Redis)
  evita introduzir dependência no runtime.
- **Métricas Prometheus**: `/admin/metrics` já expõe contadores; um
  `/metrics` no formato de exposição do Prometheus é aditivo e não conflita.
- **PG sink** para retenção longa de spans (migração `004_observability.sql`)
  caso o time prefira consulta SQL a streams.
