# Auditoria read-only de billing AWS/Brev

O auditor compara a projeção local com dados reais quando as APIs e credenciais de leitura estão configuradas. Ele não cria instâncias, altera billing, compra créditos, habilita auto-recharge, modifica budgets ou grava secrets.

## AWS

A consulta usa somente `aws ce get-cost-and-usage`, com `DAILY`, métrica `UnblendedCost` e agrupamento por `SERVICE`. O período segue a semântica da AWS: a data inicial é inclusiva e a final é exclusiva. A resposta preserva o campo `Estimated`; custos do período corrente podem ser estimados e não devem ser tratados como fatura final.

A identidade AWS deve receber apenas permissões de leitura equivalentes a `ce:GetCostAndUsage` e, se budgets forem adicionados depois, `budgets:ViewBudget`/`budgets:Describe*` e `aws-portal:ViewBilling`. Não usar `budgets:ModifyBudget`, `aws-portal:ModifyBilling`, EC2 mutating actions ou permissões de pagamento.

## Brev

A documentação pública confirma o painel Billing & Usage e API keys com escopo Read ou Read & Write. Como não há um endpoint público de uso especificado na documentação usada neste projeto, o auditor não inventa uma rota: exige que o operador forneça `BREV_USAGE_URL`, que é chamado somente com `GET`. `BREV_API_KEY` é lida apenas do ambiente e nunca aparece no resultado.

Exemplo de execução live, somente leitura:

```bash
BILLING_AUDIT_CONFIRM_READ_ONLY=true \
BREV_USAGE_URL='https://<endpoint-de-uso-confirmado>' \
BREV_API_KEY="$BREV_READ_ONLY_KEY" \
node scripts/billing-audit-readonly.mjs --live --days 30
```

Sem `--live`, o comando é um dry-run e não toca em nenhuma API:

```bash
node scripts/billing-audit-readonly.mjs --days 30
```

## Planos públicos e gratuitos

Um plano marcado como `public` ou `free` não é prova suficiente de custo zero. A auditoria deve registrar o nome do plano, região, período, limites, franquia, serviços excluídos, consumo excedente e termos de cobrança. Só classifique como `zero-cost` quando a fonte oficial confirmar preço zero para o escopo exato e não houver consumo excedente ou recurso pago associado.

O resultado deve distinguir `projected`, `actual`, `estimated`, `variance` e `unverified`. “Tempo real” significa polling sujeito à latência e ao campo `Estimated` do provedor, não uma garantia de cobrança instantânea.
