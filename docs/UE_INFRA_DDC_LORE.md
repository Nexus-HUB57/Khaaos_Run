# Khaaos Run — UE Infra: Unreal Cloud DDC 1.5.0 + Lore Server (P1 end-to-end)

> **Objetivo**: provisionar a infraestrutura de assets/compilação que o M4 usa
> no host licenciado — o **Unreal Cloud DDC** (cache derivado compartilhado que
> acelera compilações UBT/UAT e cooks repetidos do UE5.8) e o **Lore Server**
> (sistema de versionamento da Epic — fonte de verdade para repositórios de
> assets, com push/clone/resolução centralizados). A stack sobe em compose,
> é validada por smoke honesto no CI e reutiliza o secret
> `UNREAL_ENGINE_LOGIN` funcionalmente (login no ghcr.io).

## 1. Origem dos fatos (sem inventário de configuração)

Toda a configuração abaixo foi extraída de fontes primárias, não de tentativa
e erro. Do **Helm chart OCI** publicado em `ghcr.io/epicgames/unreal-cloud-ddc:1.5.0_helm`
extraímos as probes oficiais (`health/live` e `health/ready`), a porta do
container (80) e a imagem de referência (`ghcr.io/epicgames/unreal-cloud-ddc:1.5.0` —
cada versão publica o par `<ver>` container + `<ver>_helm` chart). Do repositório
**EpicGames/lore** (clonado em `/epic`), a doc
`docs/how-to/deploy-local-lore-server.md` define as portas `41337/tcp` (gRPC),
`41337/udp` (QUIC) e `41339/tcp` (HTTP), o diretório de dados `/data` e o
diretório de config extra `/etc/lore/config`. As duas imagens do contrato P1
foram validadas por HTTP 200 na API de registry do ghcr antes da implementação.

## 2. Stack (infra/ue-infra/docker-compose.yml)

| Serviço | Imagem (contrato P1) | Portas | Persistência |
|---|---|---|---|
| `unreal-cloud-ddc` | `ghcr.io/epicgames/unreal-cloud-ddc:1.5.0` | host 8080 → container 80 | efêmero (cache; volume opcional) |
| `scylla` | `scylladb/scylla:5.2` (perfil CI: `--smp 1 --memory 512M`) | interno (rede compose) | volume `scylla-data` |
| `loreserver` | `ghcr.io/epicgames/lore/loreserver:0.12` (amd64) | 41337 tcp+udp, 41339 | volume `lore-data:/data` + `local.toml` (stores em `/data/immutable` e `/data/mutable`) |

**Descoberta de CI (2ª run, 2026-10-28)**: o DDC 1.5.0 **não sobe sem
ScyllaDB** — o boot valida `ScyllaSettings` com
`LocalDatacenterName` e `LocalKeyspaceSuffix` obrigatórios
(`DataAnnotation validation failed`, exception no `JupiterStartup`). O
compose adiciona o serviço `scylla` e os envs `Scylla__ConnectionString`
(seção `Scylla` do chart, formato ASP.NET `__`), `Scylla__LocalDatacenterName`
(`datacenter1`, DC default do scylla single-node) e
`Scylla__LocalKeyspaceSuffix`. Auth do DDC permanece desabilitada
(`auth.enabled: false` no chart) — modo staging.

**Correção do contrato P1 (evidência de CI, 2026-10-28)**: o digest original
`sha256-042ab40…` é a variante **linux/arm64 (Graviton3/SVE)** — em host
amd64 o pull falha com *"no matching manifest for linux/amd64"* (run do
workflow `UE Infra` antes do fix). O ghcr do Lore publica o par
`<ver>` (amd64, single-manifest) + `<ver>-graviton` (arm64/SVE); para hosts
amd64 (incluindo os runners `ubuntu-latest`) o contrato usa a tag simples
`0.12`. Para graviton/arm64, usar `0.12-graviton`.

O `local.toml` (infra/ue-infra/loreserver/config/local.toml) segue o mínimo
recomendado pela doc oficial: stores persistentes no volume; o certificado
QUIC permanece efêmero no modo staging (a seção `[server.quic.certificate]`
está pronta comentada para produção, bastando montar `cert.pem`/`key.pem`).

## 3. Smoke honesto (scripts/infra/ue_infra_smoke.mjs)

O smoke não exige credenciais nem imprime sucesso inventado. Com retries
(30 × 3 s) para acomodar o boot do serviço .NET do DDC, ele valida:

- `ddc_liveness` e `ddc_readiness` — **exigem HTTP 200** em `health/live` e
  `health/ready` (probes oficiais do chart 1.5.0);
- `ddc_api_v1` — informativo (qualquer resposta HTTP prova a API v1 no ar);
- `lore_http` — porta HTTP 41339 respondendo (gRPC/QUIC ficam em 41337).

Saída contratual: `UE_INFRA_SMOKE_OK` (exit 0) somente quando as três
checagens essenciais passam; `UE_INFRA_SMOKE_FAILED` (exit 1) caso contrário,
listando status por endpoint e número de tentativas. Variáveis opcionais:
`DDC_BASE`, `LORE_HTTP_URL`, `SMOKE_ATTEMPTS`, `SMOKE_WAIT_MS`.

## 4. CI (`.github/workflows/ue-infra-smoke.yml`)

Pipeline de quatro estágios, com honestidade em cada um:

1. **Validação funcional do `UNREAL_ENGINE_LOGIN`** — o secret existe no
   inventário do repo, mas não era referenciado por nenhum workflow. O job o
   consome de verdade: aceita os formatos `user:token` ou token puro, executa
   `docker login ghcr.io` com `--password-stdin` e registra o resultado.
   Falha de login **não quebra** o job (as duas imagens do contrato são
   públicas) — mas emite `::warning::` explícito para revisão do escopo
   `read:packages`. Quando o acesso a imagens privadas da Epic entrar no
   contrato, o login passa a ser bloqueante.
2. **Pull do contrato** — `docker pull` das duas referências: container
   `unreal-cloud-ddc:1.5.0` e `loreserver:0.12` (amd64 — ver correção do
   contrato na seção 2; o digest original `sha256-042ab40…` permanece
   documentado como a variante arm64/Graviton3).
3. **Compose up + smoke** — `docker compose up -d` e o smoke da seção 3.
4. **Telemetria de falha** — em erro, `compose ps` + logs (tail 100) e
   teardown `down -v --remove-orphans` no `always()`.

## 5. Integração com os builds UE5.8 (runner licenciado)

O DDC só produz ganho real quando o build do UE5.8 aponta para ele. O
mecanismo padrão da engine é o grafo de backends do
`[DerivedDataBackendGraph]` com o nó `Shared` sobrescrito por variável de
ambiente (`UE-SharedDataCachePath`). No runner provisionado por
`scripts/build/bootstrap_ue58_runner.sh`, o `.env` do runner passa a aceitar:

```
UE-SharedDataCachePath=<URL do DDC, ex.: http://ddc-host:8080>
```

Como a sintaxe exata do backend HTTP varia entre versões da engine (o par de
nós `Shared`/`Cloud` mudou na linha 5.x), **confirme na doc oficial do
Unreal Cloud DDC para a 5.8** antes do primeiro build de produção; o
`bootstrap_ue58_runner.sh` já garante que o host do runner alcança o DDC
(mesma rede/host compose). O Lore, por sua vez, substitui o "repositório de
assets sem versionamento": o CLI `lore` aponta para `localhost:41337` (gRPC/QUIC)
e o endpoint HTTP 41339 serve verificação de saúde/estado.

## 6. Runbook operacional

```bash
# subir
docker compose -f infra/ue-infra/docker-compose.yml up -d

# validar (contrato: UE_INFRA_SMOKE_OK)
node scripts/infra/ue_infra_smoke.mjs

# estado/logs
docker compose -f infra/ue-infra/docker-compose.yml ps
docker compose -f infra/ue-infra/docker-compose.yml logs -f unreal-cloud-ddc

# derrubar (remove volumes — Lore perde stores; faça backup antes em produção)
docker compose -f infra/ue-infra/docker-compose.yml down -v
```

Limitações conhecidas do modo staging: DDC sem backend persistente (cache
reconstrói após restart — aceitável para CI/smoke; para host licenciado
permanente, configurar backend de storage no chart/compose); Lore com
certificado QUIC efêmero e auth desabilitada (padrão da imagem — nunca
expor 41337/41339 publicamente neste modo).
