# AWS/Brev cost dry-run

`aws-cost-dry-run.mjs` é um estimador offline. Ele não acessa AWS, Brev, Stripe ou qualquer API de cobrança e não precisa de credenciais.

## Exemplo para o fallback

```bash
node scripts/aws-cost-dry-run.mjs \
  --instances 1 \
  --hourly-rate 0.09 \
  --hours-per-day 24 \
  --days 30 \
  --budget 100
```

Com a tarifa informada pelo Brev de US$ 0,09/h, uma instância funcionando continuamente por 30 dias custa aproximadamente **US$ 64,80**, antes de armazenamento, egress, impostos ou outros serviços AWS.

## Cenário por arquivo

```json
{
  "instances": 2,
  "hourlyRate": 0.09,
  "hoursPerDay": 24,
  "days": 30,
  "storageGb": 0,
  "storageRatePerGbMonth": 0,
  "egressGb": 0,
  "egressRatePerGb": 0,
  "fixedMonthly": 0,
  "budget": 150
}
```

Execute com `--input caminho/do/cenario.json`. O resultado inclui itens de compute, storage, egress, custo fixo rateado, total, status do orçamento e a garantia `liveBillingContacted: false`.

## Segurança

O script não implementa provisionamento, compra de créditos, recarga automática, leitura de credenciais ou alteração de instâncias. Tarifas devem ser fornecidas explicitamente e revisadas contra a fatura/console oficial antes de qualquer decisão financeira.
