# Auditoria free-only — 2026-11-11

## Resultado local

O comando `node scripts/billing-audit-readonly.mjs --free-only` foi executado com sucesso.

- Réplicas reais observadas: **não verificadas**
- Redis real observado: **não verificado**
- Custo real do provedor: **não verificado**
- Comparação com billing: **não executada**
- Rede acessada: **não**
- Credenciais lidas: **não**
- Serviço pago utilizado: **não**
- Checkout, provisionamento e auto-recharge: **não**

A projeção local continua em US$ 194,40/mês para 2 réplicas e 1 Redis, usando US$ 0,09/h como premissa para cada instância. Isso é uma estimativa, não evidência de consumo nem confirmação de free tier.

## Limite de verificação

O modo free-only foi desenhado para não fazer chamadas externas. Por isso, não pode confirmar saldo, uso, limites regionais, franquias, créditos promocionais, egress, armazenamento ou cobrança excedente. Esses itens só podem ser verificados no console/fatura oficial com acesso autenticado; essa consulta foi deliberadamente bloqueada para manter o requisito de custo zero.

## Conclusão

O ambiente gratuito não está comprovado como ativo ou sem excedentes. O status seguro é `unverified`, e nenhuma ação de provisionamento ou billing deve ser tomada com base apenas nesta auditoria local.
