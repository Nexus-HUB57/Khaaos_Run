# Modo free-only

O modo `--free-only` executa somente no filesystem local. Ele lê a projeção JSON e produz uma auditoria estrutural, mas não acessa AWS Cost Explorer, Brev, Stripe, billing, cartão ou qualquer endpoint externo.

```bash
node scripts/billing-audit-readonly.mjs --free-only
```

Garantias do resultado:

- `networkAccessed: false`
- `credentialsRead: false`
- `paidServicesUsed: false`
- `liveBillingContacted: false`

Esse modo não consegue comparar com custos reais do provedor, porque essa comparação exige uma consulta externa autenticada. Em vez disso, ele valida a projeção, a existência dos componentes e o orçamento local. Um plano público ou rotulado como gratuito não é declarado como custo zero sem confirmação oficial de preço, limites e ausência de excedentes.

Para manter o requisito de custo zero end-to-end, não use `--live`, não configure `BREV_API_KEY` e não execute provisionamento ou checkout.
