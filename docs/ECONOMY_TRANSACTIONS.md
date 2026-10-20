# Economia transacional e idempotente — Priority 0.2

## Implementação inicial

Transferência, solicitação/pagamento de empréstimo, compra/reparo de item e salário diário passam por `server/game/economyService.ts`. Cada operação habilitada grava débito/crédito, recurso (quando aplicável) e linha do ledger no mesmo `db.transaction` do PostgreSQL. O depósito legado foi **desativado**: `POST /api/bank/deposit` retorna HTTP 503 sem chamar serviço econômico ou storage; o método antigo `DatabaseStorage.depositFunds` foi removido. A resposta não significa pagamento aceito nem KRC creditado.

- Todas as operações monetárias exigem `Idempotency-Key` (16–128 caracteres permitidos), escopada pelo usuário autenticado.
- A tabela `economy_idempotency` persiste o hash canônico do método/operação e payload, além do status/corpo da resposta. Um retry idêntico reproduz a resposta; a mesma chave com payload diferente retorna `409`.
- A inserção da chave, as escritas de domínio e o registro da resposta acontecem na mesma transação. A unique index `(user_id, idempotency_key)` serializa retries concorrentes; `FOR UPDATE` no registro bancário serializa alterações de saldo e limites por usuário.
- Valores de entrada são limitados a centavos e convertidos para `bigint` em unidades menores. Adição, subtração e comparação de saldos ocorrem em `numeric` no PostgreSQL, arredondando o saldo para duas casas; não há cálculo de saldo em `Number`.
- O navegador reusa a chave para o mesmo método/URL/payload após falha de rede ou `5xx`, inclusive após recarregar a aba, por até 90 dias desde a primeira tentativa ambígua. Uma resposta de sucesso ou erro `4xx` conclui aquela tentativa local.
- Transferências debitam a conta Weapons e creditam Bonus ou FBM. O destino inválido `weapons` foi removido, pois permitiria debitar sem creditar uma terceira conta.

## Schema e rollout

O novo schema está em `shared/schema.ts`; as migrações aditivas estão em `migrations/0002_economy_idempotency.sql` e `migrations/0003_economy_invariants.sql` (aplicar nessa ordem pelo processo revisado de migrations). Elas foram aplicadas **somente a um PostgreSQL local descartável** para executar os testes; não há `DATABASE_URL` da aplicação disponível e nenhum banco de produto foi alterado. A 0003 instala checks `NOT VALID`: eles passam a proteger novos registros e atualizações, mas não fazem scan dos registros antigos. Antes de validar as constraints no banco da aplicação, audite os dados legados; linhas inválidas podem bloquear qualquer atualização naquela linha até serem corrigidas. Não use `db:push` para substituir o rollout `NOT VALID` sem primeiro auditar os dados e verificar o DDL que será aplicado.

As migrations `0000`–`0004` estão registradas em `migrations/meta/_journal.json`, com breakpoints Drizzle entre statements e snapshot final alinhado ao schema. `npm run db:migrate` é o caminho versionado para aplicá-las. A journal foi validada desde um banco vazio: `drizzle-kit migrate` aplicou as cinco entradas e criou as tabelas do ledger/idempotência; `drizzle-kit check` passou e `drizzle-kit generate` não identificou diff adicional. Esses testes usaram apenas bancos locais descartáveis.

**Validação final da 0003 (2026-10-14):** aplicada desde schema vazio e reaplicada no mesmo banco descartável; um saldo legado inválido foi preservado pela instalação `NOT VALID`, alterações ainda inválidas foram rejeitadas, a correção para valor válido foi permitida, e as constraints foram então validadas. Testes também rejeitaram saldo negativo novo, estado nulo de empréstimo e durabilidade acima do máximo. Nenhum banco de aplicação foi acessado.

Não execute os dois mecanismos em paralelo sem comparar o estado do schema. As migrações econômicas são reexecutáveis com segurança: 0002 usa `IF NOT EXISTS`, 0003 ignora constraints já existentes e 0004 protege o snapshot de abertura contra replay.

## Ledger correlacionável — início da Priority 0.3

A migration `0004_correlated_append_only_ledger.sql` mantém `transactions` como histórico de eventos compatível com a UI e adiciona `economy_ledger_entries` como registro contábil de linhas. Cada chamada econômica ganha um `operation_id` UUID persistido junto à claim de idempotência; a resposta (inclusive replay) devolve o mesmo ID. A linha de evento em `transactions` e todas as linhas do ledger recebem esse mesmo ID e a chave de idempotência. Uma chamada rejeitada por saldo/regra não cria evento nem posting.

As entradas usam KRC `numeric` positivo, `DEBIT`/`CREDIT`, número de linha e código de conta. Carteiras de jogador são tratadas como passivos de saldo normal credor; reconciliação da carteira é `créditos - débitos`. Cada operação precisa balancear débitos e créditos e o PostgreSQL verifica isso com constraint trigger `DEFERRABLE INITIALLY DEFERRED`, ao fim da transação.

| Evento | Lançamentos principais |
|---|---|
| Transferência | Débito na carteira Weapons; crédito em Bonus ou FBM. |
| Empréstimo | Crédito em Weapons; débito em recebíveis de principal. |
| Pagamento de empréstimo | Débito em Weapons; crédito em recebíveis de principal e, separadamente, em receita de juros. |
| Compra/reparo | Débito em Weapons; crédito em vendas/serviços. |
| Salário | Crédito em Bonus; débito em despesa salarial. |

Para as carteiras existentes, a migration cria postings de abertura uma única vez por usuário/conta, contra `equity.opening_balance`, e grava um marcador de migration para evitar que uma reexecução posterior interprete saldos já transacionados como novos saldos iniciais; isso estabelece a base de reconciliação sem reinterpretar o histórico antigo, que não discriminava carteiras. As migrations econômicas 0002–0004 foram exercitadas apenas num PostgreSQL local descartável. O trigger impede `UPDATE`, `DELETE` e `TRUNCATE` via o caminho SQL comum; um dono/superuser do banco ainda pode desabilitar triggers, então a separação de privilégios da role de runtime permanece requisito operacional.

**Verificação:** `economy-postgres.test.ts` aplica 0002–0004 e reaplica a migration do ledger, confere snapshot inicial sem duplicação, replay de `operation_id`, vínculo evento→idempotência→ledger, balanced postings, bloqueio de mutação e reconciliação exata das carteiras com KRC `numeric`.

## Auditoria e retenção operacionais — Priority 0.3

`npm run economy:reconcile` emite um relatório JSON somente leitura: compara cada carteira com créditos menos débitos do ledger, detecta operações desbalanceadas, eventos com `operation_id` sem posting, claims 2xx sem ledger desde o marcador de baseline da migration 0004 e claims sem resposta completa. Claims 2xx anteriores à criação do ledger são legado histórico, não falsos positivos de drift. Sai com código 0 se estiver limpo, 2 se houver anomalia e 1 se a consulta falhar. O relatório nunca ajusta saldos nem altera histórico e não imprime valores brutos de `Idempotency-Key`.

A política é: o cliente conserva a chave de retry por 90 dias; claims idempotentes completos ficam por 365 dias, prazo validado como estritamente superior à janela do cliente. `npm run economy:idempotency:prune` é dry-run por padrão; informa elegíveis, claims incompletos e sucessos sem ledger sem apagar. A limpeza requer `--execute`, processa lotes limitados com `SKIP LOCKED` e exclui claims sem status/corpo de resposta. Qualquer claim 2xx sem posting — inclusive sucessos históricos pré-ledger — fica preservado e sinalizado para revisão manual, para não apagar sua proteção contra duplicidade; CLI retorna código 2 se houver claims incompletos ou sucessos sem ledger. Chaves antigas de operações que ainda constem no ledger retornam `409 IDEMPOTENCY_KEY_EXPIRED` sem executar novo débito/crédito. O ledger append-only mantém a chave opaca como metadado de correlação; ela não é credencial de autenticação.

Exemplos: `npm run economy:reconcile`; `npm run economy:idempotency:prune`; após revisar o relatório, `npm run economy:idempotency:prune -- --execute --batch-size=1000`. Todos os testes e comandos desta rodada usaram banco PostgreSQL descartável; nenhum banco de produto foi consultado ou alterado.

## Lacunas que permanecem na Priority 0.2

1. Auditar saldos negativos, ledger, empréstimos e durabilidade antes de `VALIDATE CONSTRAINT`; avaliar FKs de ownership com a tabela de usuários real. Enquanto isso, ownership das mutações permanece filtrado dentro do SQL da operação.
2. Tornar o PostgreSQL de integração obrigatório no CI/deploy de teste: `economy-postgres.test.ts` já valida as constraints, concorrência de transferência, compra, pagamento, empréstimo e salário, replay, chave com payload diferente e rollback por falha injetada. Execução local: `TEST_DATABASE_URL=<URL de banco descartável *_test> node --import tsx --test tests/official/economy-postgres.test.ts`.

## Moeda interna e pagamentos externos — estado atual

KRC é uma moeda virtual fechada do jogo, não um token, stablecoin, criptoativo ou saldo resgatável. Não existe conversão USD→KRC nem endereço de depósito. Uma compra com moeda fiduciária não pode alterar `bank_accounts` diretamente a partir do browser.

Até a seleção e implementação de um provedor de checkout apropriado, a rota `/api/bank/deposit` responde `503 PAYMENTS_NOT_CONFIGURED`. O caminho antigo de crédito pelo serviço e o método de storage foram removidos; testes de rota e PostgreSQL verificam que nenhum saldo, evento `DEPOSITO` ou posting é criado. Nenhum provedor, credencial, webhook ou liquidação de Mainnet está ativo.

Quando a monetização for aprovada, o servidor criará uma ordem a partir de um catálogo fechado versionado, sem aceitar preço ou quantidade de KRC como autoridade do cliente. Um webhook com assinatura verificada deverá confirmar o valor, moeda, estado final e identificador do pedido; evento duplicado/retry será deduplicado por restrição única. A aplicação do entitlement e do lançamento interno ocorrerá uma vez, em transação PostgreSQL, com eventos de estorno e chargeback registrados por lançamentos compensatórios. Ver `docs/INTERNAL_CURRENCY_AND_PAYMENTS.md` para as decisões e gates.
