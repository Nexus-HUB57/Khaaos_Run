# Runbook — Ponte administrativa VPS (temporário)

> Status: **temporário**. Este fluxo existe para destravar a operação na VPS de
> staging (143.95.213.237:22022) enquanto o acesso por senha SSH está
> desabilitado no servidor (`sshd` aceita apenas `publickey`).

## O que o workflow `vps-bootstrap.yml` faz

1. Consome o secret **`CREDENCIAIS_SSH`** (chave privada ou senha — o formato
   é detectado automaticamente, valor nunca é impresso).
2. Injeta a chave pública operacional `zai-sandbox-*` em
   `/root/.ssh/authorized_keys` (idempotente: `grep -qxF` antes do append).
3. Executa uma **auditoria read-only** (hostname, SO, portas, serviços,
   tooling, disco) e registra o resultado no step summary da run.

## Doutrina (PB-07)

- O secret `CREDENCIAIS_SSH` permanece no cofre do GitHub; nada transitou por
  chat ou arquivo do repositório.
- O step summary contém apenas **saída de auditoria** (nenhuma credencial).

## Revogação (após uso contínuo)

```bash
# na VPS, remover a linha com o comentário zai-sandbox-*
sed -i '/zai-sandbox-/d' /root/.ssh/authorized_keys
```

E remover o workflow `.github/workflows/vps-bootstrap.yml` do repositório.

## Próximos passos da plataforma

- Hospedar o servidor autoritativo do jogo (game-runtime: `/auth/login`,
  `/ws`) atrás de HTTPS com host rotulado `staging`
  (`staging.143-95-213-237.sslip.io` até o DNS definitivo de
  `gcodegames.top` apontar para a VPS).
- Criar os secrets `KR_STAGING_*` no environment `staging` e despachar o
  MP-ZEX 08+09 (`docs/MPZEX_STAGING_DISPATCH.md`).
