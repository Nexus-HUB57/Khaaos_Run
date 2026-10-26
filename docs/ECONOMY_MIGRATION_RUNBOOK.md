# Runbook de migrations da economia

## Escopo

A sequência econômica atual é `0002_economy_idempotency`, `0003_economy_invariants`, `0004_correlated_append_only_ledger` e `0005_optimal_steel_serpent`. O servidor não executa migrations durante o boot; o deploy deve aplicar migrations como etapa explícita e revisável.

## Antes do deploy

1. Apontar `DATABASE_URL` para o ambiente correto e fazer um backup/snapshot.
2. Executar `npm run db:migrate` em uma etapa única do deploy, nunca em cada réplica do servidor.
3. Executar `npm run economy:reconcile` e bloquear o rollout se o relatório não for `clean`.
4. Verificar que `economy_idempotency` e `economy_ledger_entries` estão presentes e que as constraints `economy_idem_key_format` e `economy_ledger_key_format` foram aplicadas.
5. Fazer smoke test com uma chave idempotente nova e repetir exatamente a mesma requisição. O segundo resultado deve preservar `operationId` e não criar novo débito.

## Rollout expand/contract

As migrations 0002–0004 adicionam estruturas sem reescrever o histórico financeiro. A 0003 aplica constraints como `NOT VALID` para permitir correção controlada de legado e posterior `VALIDATE CONSTRAINT`. A 0004 cria o ledger correlacionado, captura saldos legados uma vez e protege linhas contra `UPDATE`, `DELETE` e `TRUNCATE`. A 0005 restringe o formato de chaves para o mesmo contrato aceito por `isValidIdempotencyKey`.

Ativar novas rotas econômicas somente depois da migration. O código novo grava claim, operação, transação e linhas do ledger na mesma transação PostgreSQL; falha em qualquer etapa deve fazer rollback integral.

## Rollback

O rollback de aplicação deve ser feito por troca de versão, não por apagar dados econômicos. Se a 0005 precisar ser revertida, a ação segura é remover apenas as duas constraints novas em uma janela controlada:

```sql
ALTER TABLE economy_idempotency DROP CONSTRAINT IF EXISTS economy_idem_key_format;
ALTER TABLE economy_ledger_entries DROP CONSTRAINT IF EXISTS economy_ledger_key_format;
```

Não remover `economy_idempotency`, `economy_ledger_entries`, triggers append-only ou operation IDs. Se uma migration estrutural falhar, restaurar o snapshot e reexecutar a versão corrigida; não editar manualmente o ledger para “compensar” uma falha.

## Retenção

Claims são mantidos pelo período definido em `shared/economyPolicy.ts`. Executar `npm run economy:idempotency:prune -- --execute` somente após o relatório prévio do mesmo comando indicar que não existem claims incompletos ou operações sem ledger. Uma chave antiga nunca deve ser reutilizada para uma operação diferente.
