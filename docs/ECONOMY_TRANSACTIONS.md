# Economia transacional e idempotente — Priority 0.2

## Implementação inicial

As rotas de depósito, transferência, solicitação/pagamento de empréstimo, compra/reparo de item e salário diário agora passam por `server/game/economyService.ts`. Cada operação grava débito/crédito, recurso (quando aplicável) e linha do ledger no mesmo `db.transaction` do PostgreSQL.

- Todas as operações monetárias exigem `Idempotency-Key` (16–128 caracteres permitidos), escopada pelo usuário autenticado.
- A tabela `economy_idempotency` persiste o hash canônico do método/operação e payload, além do status/corpo da resposta. Um retry idêntico reproduz a resposta; a mesma chave com payload diferente retorna `409`.
- A inserção da chave, as escritas de domínio e o registro da resposta acontecem na mesma transação. A unique index `(user_id, idempotency_key)` serializa retries concorrentes; `FOR UPDATE` no registro bancário serializa alterações de saldo e limites por usuário.
- Valores de entrada são limitados a centavos e convertidos para `bigint` em unidades menores. Adição, subtração e comparação de saldos ocorrem em `numeric` no PostgreSQL, arredondando o saldo para duas casas; não há cálculo de saldo em `Number`.
- O navegador reusa a chave para o mesmo método/URL/payload após falha de rede ou `5xx`, inclusive após recarregar a aba. Uma resposta de sucesso ou erro `4xx` conclui aquela tentativa local.
- Transferências debitam a conta Weapons e creditam Bonus ou FBM. O destino inválido `weapons` foi removido, pois permitiria debitar sem creditar uma terceira conta.

## Schema e rollout

O novo schema está em `shared/schema.ts`; as migrações aditivas estão em `migrations/0002_economy_idempotency.sql` e `migrations/0003_economy_invariants.sql` (aplicar nessa ordem pelo processo revisado de migrations). Elas foram aplicadas **somente a um PostgreSQL local descartável** para executar os testes; não há `DATABASE_URL` da aplicação disponível e nenhum banco de produto foi alterado. A 0003 instala checks `NOT VALID`: eles passam a proteger novos registros e atualizações, mas não fazem scan dos registros antigos. Antes de validar as constraints no banco da aplicação, audite os dados legados; linhas inválidas podem bloquear qualquer atualização naquela linha até serem corrigidas. Não use `db:push` para substituir o rollout `NOT VALID` sem primeiro auditar os dados e verificar o DDL que será aplicado.

As migrations `0000`–`0004` estão registradas em `migrations/meta/_journal.json`, com breakpoints Drizzle entre statements e snapshot final alinhado ao schema. `npm run db:migrate` é o caminho versionado para aplicá-las. A journal foi validada desde um banco vazio: `drizzle-kit migrate` aplicou as cinco entradas e criou as tabelas do ledger/idempotência; `drizzle-kit check` passou e `drizzle-kit generate` não identificou diff adicional. Esses testes usaram apenas bancos locais descartáveis.

**Validação final da 0002 (2026-10-14):** aplicada desde schema vazio e reaplicada no mesmo banco descartável; um saldo legado inválido foi preservado pela instalação `NOT VALID`, alterações ainda inválidas foram rejeitadas, a correção para valor válido foi permitida, e as constraints foram então validadas. Testes também rejeitaram saldo negativo novo, estado nulo de empréstimo e durabilidade acima do máximo. Nenhum banco de aplicação foi acessado.

Não execute os dois mecanismos em paralelo sem comparar o estado do schema. As migrações são reexecutáveis com segurança: 0001 usa `IF NOT EXISTS` e 0002 ignora constraints já existentes.

## Ledger correlacionável — início da Priority 0.3

A migration `0004_correlated_append_only_ledger.sql` mantém `transactions` como histórico de eventos compatível com a UI e adiciona `economy_ledger_entries` como registro contábil de linhas. Cada chamada econômica ganha um `operation_id` UUID persistido junto à claim de idempotência; a resposta (inclusive replay) devolve o mesmo ID. A linha de evento em `transactions` e todas as linhas do ledger recebem esse mesmo ID e a chave de idempotência. Uma chamada rejeitada por saldo/regra não cria evento nem posting.

As entradas usam KRC `numeric` positivo, `DEBIT`/`CREDIT`, número de linha e código de conta. Carteiras de jogador são tratadas como passivos de saldo normal credor; reconciliação da carteira é `créditos - débitos`. Cada operação precisa balancear débitos e créditos e o PostgreSQL verifica isso com constraint trigger `DEFERRABLE INITIALLY DEFERRED`, ao fim da transação.

| Evento | Lançamentos principais |
|---|---|
| Depósito | Crédito em Weapons e Bonus; débito em clearing externo pelo total dos dois créditos (o comportamento atual deposita em ambas as carteiras). |
| Transferência | Débito na carteira Weapons; crédito em Bonus ou FBM. |
| Empréstimo | Crédito em Weapons; débito em recebíveis de principal. |
| Pagamento de empréstimo | Débito em Weapons; crédito em recebíveis de principal e, separadamente, em receita de juros. |
| Compra/reparo | Débito em Weapons; crédito em vendas/serviços. |
| Salário | Crédito em Bonus; débito em despesa salarial. |

Para as carteiras existentes, a migration cria postings de abertura uma única vez por usuário/conta, contra `equity.opening_balance`, e grava um marcador de migration para evitar que uma reexecução posterior interprete saldos já transacionados como novos saldos iniciais; isso estabelece a base de reconciliação sem reinterpretar o histórico antigo, que não discriminava carteiras. As migrations 0001–0003 foram exercitadas apenas num PostgreSQL local descartável. O trigger impede `UPDATE`, `DELETE` e `TRUNCATE` via o caminho SQL comum; um dono/superuser do banco ainda pode desabilitar triggers, então a separação de privilégios da role de runtime permanece requisito operacional.

**Verificação:** `economy-postgres.test.ts` aplica e reaplica a 0003, confere snapshot inicial sem duplicação, replay de `operation_id`, vínculo evento→idempotência→ledger, balanced postings, bloqueio de mutação e reconciliação exata das carteiras com KRC `numeric`.

## Lacunas que permanecem na Priority 0.2

1. Auditar saldos negativos, ledger, empréstimos e durabilidade antes de `VALIDATE CONSTRAINT`; avaliar FKs de ownership com a tabela de usuários real. Enquanto isso, ownership das mutações permanece filtrado dentro do SQL da operação.
2. Tornar o PostgreSQL de integração obrigatório no CI/deploy de teste: `economy-postgres.test.ts` já valida as constraints, concorrência de transferência, compra, pagamento, empréstimo e salário, replay, chave com payload diferente e rollback por falha injetada. Execução local: `TEST_DATABASE_URL=<URL de banco descartável *_test> node --import tsx --test tests/official/economy-postgres.test.ts`.
3. Definir retenção/limpeza da tabela de idempotência. No estado atual, as chaves permanecem para sempre, o que preserva replay indefinido, mas exige uma política operacional de crescimento.
