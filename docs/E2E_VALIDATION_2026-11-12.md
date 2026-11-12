# Validação end-to-end — 2026-11-12 (plataforma GoodCode Games + staging real)

> Relatório de validação executada ao vivo nesta data. Cada item traz a fonte
> da evidência (API/run/SSH/HTTP). Nenhum segredo é citado (PB-07).

## 1. Acesso à VPS (HostGator, São Paulo)

- Conexão SSH por chave ed25519 `vps-mavis` em `143.95.213.237:22022`
  validada em runtime (autenticação **privatekey OK**; senha desativada —
  server only publickey, correto).
- Auditoria completa executada sem alterar os demais sites do dono
  (`mybait.org`, `oneverso.com.br`, baitcoin/aistore):

| Item | Observado (2026-11-12T13:26Z) |
|---|---|
| SO | Ubuntu 22.04.5 LTS, uptime 33d, load 0.51 |
| Disco / RAM | 98 GB total, 36 GB livres / 3.8 GB RAM + 2 GB swap |
| nginx | 1.18.0 — vhosts `gcodegames-top.conf`, `gcodegames-portal.conf`, `khaaos-staging-443.conf` |
| Runtime | `systemd:khaaos-staging` (node, porta 8787, enabled) |
| TLS | acme.sh (LE) — `/etc/ssl/khaaos/*.pem` |
| UFW | 22022/80/443 allow, fail2ban ativo |

## 2. Bridge GitHub Actions → VPS (secret `CREDENCIAIS_SSH`)

**Primeira execução real do workflow `VPS Staging Deploy`** (run
[`43228815801`](https://github.com/Nexus-HUB57/Khaaos_Run/actions/runs/43228815801),
#1, 2026-11-12T13:35Z): build runtime+client no runner, envio por SSH com a
chave do secret, `systemctl restart` e health gate —
contrato emitido:

```
VPS_STAGING_DEPLOY_OK (healthz 200 na tentativa 1)
```

Pós-deploy: `/healthz` → `status=ok`, `rooms=0` (estado limpo, doutrina de
uma partida por vez respeitada — nenhum despacho MP-ZEX ativo durante o
deploy; último havia concluído em 2026-11-11T21:23Z).

## 3. Staging real (MP-ZEX) e portal

| Sonda | Resultado |
|---|---|
| `GET https://staging.143-95-213-237.sslip.io/healthz` | **200** JSON completo (`rooms`, `rooms3d`, regiões `sa-east/us-east/eu-west`) |
| `GET https://staging.143-95-213-237.sslip.io/` (client dist) | **200** |
| `GET https://gcodegames.143-95-213-237.sslip.io/` (portal) | **200** |
| `GET http://gcodegames.top/` | **000** — DNS ainda `162.240.81.81` (host morto), pendência humana no painel |

## 4. MP-ZEX 08+09 — despacho único em duas contas reais (reconfirmado)

Run [`43102085504`](https://github.com/Nexus-HUB57/Khaaos_Run/actions/runs/43102085504)
(#30, 2026-11-11T21:19Z, **success**, 4/4 jobs) — contratos extraídos dos logs:

```
[MP-ZEX-08] MP-ZEX-08 PASS: sem XP/extração para A; resume preservado; B canalizando o terminal.
[MP-ZEX-09] MP-ZEX-09 PASS: autoridade do servidor, recompensa única, convergência pós-drain e interrupção limpa sob RTT/jitter/perda.
```

Os 5 secrets `KR_STAGING_*` (environment `staging`) presentes e funcionais —
gate de configuração do despacho emite "Secrets obrigatórios presentes".

## 5. CI e P0 gate (perfil fresco)

- `main @ aeab4ef`: **21 checks success / 4 skipped** (nenhuma falha).
- `scripts/eos/p0_gate.mjs` (2026-11-12T13:36Z):
  - ✔ [S] secrets de staging (5/5)
  - ✔ [V] variáveis de CI (3/3)
  - ✔ [D] workflow de despacho único presente
  - ✘ [A] vínculo Epic (404) → bloqueia [B] 7 secrets `EOS_*` → bloqueia [C]
    anti-placeholder `DefaultEOS.ini` (todos humanos, Fase A1 do checklist)
  - ✘ [R] runner self-hosted UE5.8 (0) — exige host ≥250 GB/32 GB RAM; a VPS
    atual (4 GB) não qualifica por doutrina

## 6. DNS do domínio definitivo `gcodegames.top`

- Servidores DNS autoritativos confirmados no painel HostGator
  (captura do dono, 2026-11-11): `ns1.dns3.hostgator.com.br` /
  `ns2.dns4.hostgator.com.br`.
- `A` atual resolve para `162.240.81.81` (HTTP 000 — host antigo morto).
- Pendência (5 min, navegador do dono): zona DNS do painel
  `A @ → 143.95.213.237` e `A staging → 143.95.213.237`; depois seguir
  `docs/GOODCODE_PLATFORM.md` §5 (acme.sh para `gcodegames.top` +
  `staging.gcodegames.top`, vhosts, secret `KR_STAGING_BASE_URL`, re-despacho
  MP-ZEX).

## 7. Conclusão

Todo o caminho automatizável está verde e com evidência reexecutável:
VPS acessada por chave, bridge Actions→VPS validada em produção pela
primeira vez (`VPS_STAGING_DEPLOY_OK`), staging/portal/client 200,
despacho único MP-ZEX 08+09 `PASS` em duas contas reais e `main` 100% verde.
O que resta depende de passos humanos fora do alcance de automação
(Epic/EULA, DNS do painel, host maior para o runner).
