# GoodCode Games — Plataforma Khaaos Run (gcodegames.top)

> Estado da infraestrutura P1 — auditoria e configuração da plataforma
> responsável pelo jogo Khaaos Run, no VPS dedicado. Atualizado em 2026-11-11.

## 1. Estado atual (ao vivo)

| Item | Estado | Endereço |
|---|---|---|
| Portal GoodCode Games (Khaaos Run) | ✅ no ar, HTTP 200 | `https://gcodegames.143-95-213-237.sslip.io` |
| Staging autoritativo CIGKV (game-runtime) | ✅ no ar, HTTP 200, certificado Let's Encrypt válido | `https://staging.143-95-213-237.sslip.io` (nginx → node :8787, `khaaos-staging.service`) |
| Health do staging | ✅ `{"status":"ok", ...}` | `GET /healthz` (uptime, ticks, salas, regiões, conexões) |
| Vhost `gcodegames.top` + `www` (:80) | ✅ configurado no nginx (ACME + portal) | aguarda DNS |
| Script de ativação TLS do domínio | ✅ pronto no VPS | `/root/kr_setup_gcodegames_top.sh` |
| DNS `gcodegames.top` | ⏳ **pendente** — aponta para `162.240.81.81` (hospedagem antiga, HTTP morto) | precisa apontar para `143.95.213.237` |
| Nameservers autoritativos | ✅ confirmados no painel do dono (2026-11-11) | `ns1.dns3.hostgator.com.br` / `ns2.dns4.hostgator.com.br` — a edição da zona é feita no HostGator |

## 2. VPS dedicado (HostGator)

- Host: `143.95.213.237` (Ubuntu 22.04, 2 vCPU / 3,8 GB RAM / 98 GB disco, 36 GB livres).
- Acesso: SSH porta `22022`, publickey (chave de serviço injetada; PB-07 — credenciais fora de log).
- Stack no host: nginx (80/443), Docker, PostgreSQL 14, Redis, Node; serviço systemd
  `khaaos-staging` (app: `/opt/khaaos-staging/app`, entrada `server/server.js` :8787).
- Certificados: `acme.sh` com renovação automática via cron (`/root/.acme.sh`).
- Observação: o host também serve outros projetos (mybait.org, oneverso.com.br) — as
  alterações Khaaos ficam isoladas em vhosts e diretórios próprios.

## 3. Runbook — ativação de `gcodegames.top` (após o DNS)

Pré-requisito: registro A apontando o domínio para `143.95.213.237` (ver §4).

```bash
# no VPS (root):
bash /root/kr_setup_gcodegames_top.sh
# 1) confere DNS → 143.95.213.237 (aborta se ainda não propagou)
# 2) emite certificado LE (acme.sh, webroot /var/www/letsencrypt) p/ apex + www
# 3) instala cert + cria vhost :443 (root /var/www/gcodegames) + redirect 80→443
# 4) nginx -t && reload → imprime TLS_ATIVADO_OK
```

Verificação pós-ativação:

```bash
curl -sI https://gcodegames.top        # 200, cert válido
curl -sI https://www.gcodegames.top    # 200
curl -s  https://staging.143-95-213-237.sslip.io/healthz
```

## 4. Troca de DNS no painel HostGator (único passo manual)

O painel é protegido por Cloudflare contra automação headless (bloqueio por
reputação de IP) — a troca é feita na UI, ~1 minuto:

1. Painel HostGator → **Domínios** → `gcodegames.top` → **Configurar domínio**.
2. Editor de DNS/Zone — ajustar os registros:

| Tipo | Nome | Valor | TTL |
|---|---|---|---|
| `A` | `@` (gcodegames.top) | `143.95.213.237` | 3600 |
| `A` | `www` | `143.95.213.237` | 3600 |

3. (Opcional, depois) CNAME `packages` → `gcodegames.top` para distribuição de
   pacotes UE (lore: `packages.khaaosrun.com`), se adotado.

Propagação: TTL 3600; o script do §2 confere o DNS antes de emitir o certificado.

## 5. Decisões e limites

- **Staging dedicado no VPS** (doutrina `docs/MPZEX_STAGING_DISPATCH.md`, opção C):
  sempre ativo (sem hibernação do Render free), HTTPS real, contas de teste
  `kr_zex_a`/`kr_zex_b` (senhas apenas nos secrets do environment `staging`).
- **Runner UE5.8 self-hosted**: este VPS NÃO atende o requisito (mínimo documentado
  ≥ 250 GB disco / 32 GB RAM; host atual tem 98 GB / 3,8 GB) — pendência de
  hardware humano (`docs/EOS_PORTAL_CHECKLIST.md`).
- Segredo de webhook do deploy existente no host (`deploy-webhook-compat.service`,
  porta local) pertence a outro projeto (baitcoin) — não é usado pelo Khaaos Run.
