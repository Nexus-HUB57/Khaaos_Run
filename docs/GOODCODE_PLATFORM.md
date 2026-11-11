# Plataforma GoodCode Games — gcodegames.top (Khaaos Run)

> P1 — auditar e operar a plataforma que hospeda o Khaaos Run: VPS, domínio,
> staging real (MP-ZEX) e portal público. Este documento é o runbook canônico
> da infraestrutura; mudanças de topologia começam por aqui.

## 1. Topologia

| Camada | Endereço | Papel |
|---|---|---|
| VPS HostGator (São Paulo) | `143.95.213.237` (SSH `22022`) | host dedicado do jogo + portal |
| Runtime autoritativo | `systemd:khaaos-staging` (`node server/server.js`, porta local `8787`) | API/WS do jogo (`/auth/login`, `/ws`, `/healthz`, `/readyz`, `/admin.html`) |
| Cliente web (vite build) | `dist/` servido pelo nginx no host de staging | jogo jogável no navegador |
| Staging (testes MP-ZEX) | `https://staging.143-95-213-237.sslip.io` | host com rótulo `staging` (regra do despacho) |
| Portal GoodCode Games | `https://gcodegames.143-95-213-237.sslip.io` | página pública da plataforma |
| Domínio definitivo | `gcodegames.top` (HostGator) | **pendente**: apontar A → `143.95.213.237` |

`sslip.io` é DNS wildcard: `staging.143-95-213-237.sslip.io` resolve para o IP
da VPS sem registro nenhum — destrava TLS/HTTPS enquanto o domínio definitivo
não é sincronizado no painel (o painel HostGator fica atrás de Cloudflare e
não aceita automação headless; é um passo de 5 minutos no navegador do dono).

## 2. Serviços na VPS (sem tocar nos outros sites)

A VPS hospeda outros projetos do dono (`mybait.org`, `oneverso.com.br`,
baitcoin/aistore). Tudo do Khaaos Run vive isolado em:

- `/opt/khaaos-staging/app` — clone do `game-runtime` (build + `node_modules`);
- `/opt/khaaos-staging/app/.env` (`0600`, dono `khaaos`) — `PORT`, `AUTH_SECRET`,
  `ADMIN_TOKEN`, `KR_USERS_JSON` (contas A/B de teste), `KR_ROOM_CAPACITY=2`,
  `KR_BOT_FILL=0` (staging **dedicado**, doutrina MP-ZEX: sala sem bots);
- `systemd:khaaos-staging` — usuário `khaaos` (`nologin`), `Restart=always`;
- nginx `sites-available/khaaos-staging*.conf` + `gcodegames-portal.conf`;
- TLS: `acme.sh` (webroot `/var/www/letsencrypt`) — **não usar o certbot da
  VPS** (quebrado: josepy/pyOpenSSL incompatíveis); renovação via cron acme.sh;
- certs em `/etc/ssl/khaaos/` (`fullchain.pem`/`key.pem` staging,
  `portal-*.pem` portal).

## 3. Staging dedicado (por que `KR_ROOM_CAPACITY=2` e `KR_BOT_FILL=0`)

O matchmaking cria salas `ring3d-N` com `botFill: roomCapacity - 1` — com
capacidade 16, **14 bots por sala**. Bots atacam os operativos e o dano
**cancela a canalização ZEX** (`room3d #damage → cancel 'damage'`), o que
inviabiliza os cenários MP-ZEX (canal de 4 s). A doutrina
(`docs/MPZEX_STAGING_DISPATCH.md`) já mandava "usar instância de staging
dedicada ao teste": o server agora expõe `KR_ROOM_CAPACITY` e `KR_BOT_FILL`
(defaults preservam o comportamento de produção: 16 / capacity-1). O staging
roda com 2 jogadores e zero bots.

Dinâmica do anel (CIGKV, Fase 42): o anel fecha sobre o **centro do mundo**
`(0,0)` até raio 42 (cenário sem `ringFinal`) e o dano ring é contínuo fora
dele. Os terminais ZEX ficam em `(8,0)` CENTRO, `(-130,-30)` OESTE e
`(120,40)` LESTE — **nenhum par distinto cabe no anel final**. O despacho
MP-ZEX-09 usa papéis assimétricos: **A** (fases 2/3, tardias) canaliza o
terminal dentro do anel final; **B** (fase 1, cedo) o terminal externo com
janela do anel atual suficiente para navegação + canal.

## 4. Bootstrap/redeploy da VPS

Scripts operacionais (o deploy corrente foi executado com eles):

1. empacotar `game-runtime` (sem `node_modules`/`dist`), enviar via SFTP;
2. `npm ci --include=dev` + `npm run build` (client) na VPS (ou build local e
   subir `dist/`);
3. `.env` com `KR_USERS_JSON` gerado por `server/auth.js#hashPassword`
   (scrypt) — senhas só no gerenciador (PB-07);
4. unit `systemd` + `nginx -t` + reload;
5. `acme.sh --issue --webroot` (LE) e `--install-cert` com reload do nginx;
6. health gate: `/healthz` 200 e login A → 200.

O workflow **`VPS Staging Deploy`** (`.github/workflows/vps-staging-deploy.yml`)
automatiza 1–6 contra a VPS a partir de um `workflow_dispatch` (a chave SSH
fica no secret `CREDENCIAIS_SSH`; deploy é manual/consciente para não derrubar
o runtime durante uma partida de teste — doutrina: uma partida por vez).

## 5. Pendências do domínio (humano, 5 min)

1. Painel HostGator → `gcodegames.top` → DNS:
   - `A @ → 143.95.213.237` (portal + jogo);
   - `A staging → 143.95.213.237` (staging MP-ZEX);
   - propagar (TTL 300).
2. Na VPS (após propagação):
   `acme.sh --issue -d gcodegames.top -d staging.gcodegames.top --webroot /var/www/letsencrypt --server letsencrypt`
   e atualizar os `server_name`/certs dos vhosts (substituindo os hosts
   sslip.io), reincluindo os nomes sslip.io como SAN extra se conveniente.
3. Atualizar o secret `KR_STAGING_BASE_URL` (environment `staging`) para
   `https://staging.gcodegames.top` e re-despachar o MP-ZEX 08+09.

## 6. Estado atual (2026-11-11)

- [x] Acesso SSH à VPS (chave `vps-mavis` ed25519; sandbox injetado em
  `authorized_keys`; `CREDENCIAIS_SSH` atualizada no repo).
- [x] Runtime autoritativo no ar (`khaaos-staging`, TLS off interno, proxy nginx).
- [x] HTTPS válido: staging e portal (Let's Encrypt via acme.sh, renovação automática).
- [x] Client web jogável no staging (`/` 200).
- [x] Secrets `KR_STAGING_*` no environment `staging` + repo (URL sslip.io).
- [x] MP-ZEX-08 e MP-ZEX-09 validados end to end contra o staging real.
- [ ] DNS `gcodegames.top`/`staging.gcodegames.top` → VPS (painel, humano).
- [ ] `KR_STAGING_BASE_URL` → domínio definitivo após o DNS.
- [ ] Runner UE5.8 (P0 [R]) — exige host ≥250 GB/32 GB RAM (VPS atual: 4 GB).
