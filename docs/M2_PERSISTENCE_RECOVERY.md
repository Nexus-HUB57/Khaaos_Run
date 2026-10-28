# M2 — Integridade de persistência/economia e recuperação

**Marco:** M2 do roadmap mestre (`docs/ROADMAP.md`) — P0.
**Base:** `main` em `fc85beb` + branch `feat/m2-persistence-recovery`.
**Data da evidência:** 27 de outubro de 2026.
**Requisito de aceite:** *preview igual ao débito em matriz de prazos; retries concorrentes não duplicam lançamentos; saldo/ledger reconciliam antes/depois de falha; restore e rollback são repetíveis com RPO/RTO registrados.*

---

## 1. Escopo entregue

O M2 fecha três frentes de integridade de persistência, todas com evidência executada (nada de stub):

1. **Unificação preview ↔ cobrança de empréstimo** — uma única fonte de verdade de preço (`computeLoanTerms` em `shared/money.ts`) consumida pela rota de preview `/api/economy/loan-preview`, pelo motor de simulação (`EconomyEngine.computeLoan`) e pela cobrança transacional (`EconomyService.requestLoan`). Antes desta rodada, o preview calculava 4% ao dia com aritmética de ponto flutuante enquanto a cobrança aplicava 5% ao dia em minor units — o jogador via um valor e era debitado por outro. O client (`client/src/pages/bank.tsx`) já exibia 5% ao dia e continua compatível.
2. **Rollback multi-tabela com falhas injetadas** — suíte PostgreSQL que provoca falha no meio da transação (trigger de injeção no append do ledger) e verifica rollback integral em `loans`, `bank_accounts`, `transactions`, `economy_ledger_entries` **e** no claim de idempotência, seguida de retry com a mesma chave executando exatamente uma vez.
3. **Backup/restore e rollback de migration em ambiente isolado** — scripts de DR com medição de RPO/RTO executados contra PostgreSQL 16 efêmero, mais reverse DDL documentado para a migration do ledger.

## 2. Contrato único de empréstimo (loan parity)

### 2.1 Fonte de verdade

`shared/money.ts` agora define o contrato completo:

| Constante | Valor |
|---|---|
| `LOAN_DAILY_INTEREST_PERCENT` | `5n` (5% ao dia) |
| `LOAN_PRINCIPAL_MIN_KRC` / `MAX_KRC` | 100 / 10 000 KRC |
| `LOAN_DAYS_MIN` / `MAX` | 1 / 30 dias |

`computeLoanTerms(principal, days)` devolve `principal`, `interest`, `totalDue`, `days`, `apr` (strings decimais exatas de 2 casas) e `minor` (bigint). Aritmética 100% em minor units; domínio exige principal **inteiro** em KRC — exatamente o domínio aplicado por `requestLoan` e pelo zod da rota (`loanPreviewInput`), eliminando qualquer assimetria de fronteira.

Cadeia de delegação única:

```
rota POST /api/economy/loan-preview ─┐
                                     ├─> EconomyEngine.computeLoan ──> computeLoanTerms (shared/money)
EconomyService.requestLoan ──────────┘            (sem cópia local de taxa)
```

### 2.2 Matriz de prazos (gate 1)

A suíte `tests/official/m2-loan-parity-recovery.postgres.test.ts` executa a matriz **7 principals × 6 prazos = 42 células** (100, 137, 250, 1000, 2500, 7777, 10000 × 1, 2, 3, 7, 14, 30) e, para cada célula:

- preview (`computeLoan`, a mesma função que a rota serializa) === contrato canônico;
- cobrança (`requestLoan` em banco descartável real) === preview, campo a campo (`principal`, `interest`, `totalDue`);
- oráculo independente em bigint (`principal_minor × 5 × days`, half-up por centavo) === ambos.

Fronteiras rejeitadas de forma idêntica nas três camadas (schema zod, `computeLoan`, serviço): `99`, `10 001`, `0/31 dias`, `1000.5`. Os testes unitários em `tests/official/economy-money.test.ts` cobrem a mesma matriz sem banco (fast feedback) além dos casos de arredondamento e APR.

**Resultado: 0 divergências preview↔débito em 42 células + 5 fronteiras.**

## 3. Idempotência e concorrência (gate 2)

Evidência em `m2-loan-parity-recovery.postgres.test.ts` (banco descartável `*_test`):

- **Replay sequencial**: mesma chave → `replayed: true`, mesmo `operationId`, 1 loan, 2 lançamentos.
- **Replay concorrente (par)**: duas requisições simultâneas com a mesma chave resolvem 201/201 — uma executa, a outra faz replay do corpo comprometido (o `ON CONFLICT` do PostgreSQL serializa o claim).
- **Corrida 8× mesma chave**: todas as 8 respostas 201 com o **mesmo** `operationId`; exatamente 1 loan e 2 lançamentos no ledger.
- **Corrida 8× chaves distintas**: o teto de 3 empréstimos ativos prevalece sob concorrência — exatamente 3 aprovados (201), 5 recusados (403), 6 lançamentos (3 pares balanceados).
- **Chave reutilizada com payload divergente**: 409.

## 4. Rollback multi-tabela com falhas injetadas (gate 3)

Mecânica de injeção: trigger `BEFORE INSERT ON economy_ledger_entries` que lança exceção para usuários `m2-fault-%` — a falha acontece **depois** de inserir o loan, creditar o banco e inserir a transação, exatamente no ponto em que um bug de persistência aconteceria.

| Verificação | Resultado |
|---|---|
| Falha no append do ledger (requestLoan) | transação abortada; `loans=0, transactions=0, ledger=0, claims=0` |
| Saldo/ledger pós-falha | idênticos ao pré-falha (rollback multi-tabela integral) |
| Claim de idempotência pós-falha | descartado com a transação (retry com a mesma chave executa, `replayed: false`) |
| Retry pós-remoção da falha | 201 único; `loans=1, transactions=1, ledger=2`; saldo 1000.00 == ledger 1000.00 |
| Falha no append do ledger (payLoan) | empréstimo permanece aberto; saldo intacto |
| Pagamento com saldo suficiente | 200; saldo/ledger reconciliam; net do ledger = 0.00 |
| Recebível líquido | `system.loan_receivable` espelha o principal em aberto (6100.00) |

## 5. Backup/restore com RPO/RTO (gate 4)

**Execução real** em PostgreSQL 16.2 efêmero (unix socket, bancos 100% descartáveis `khaaos_dr_source` → `khaaos_restore_target`):

| Métrica | Valor medido | Como foi medido |
|---|---|---|
| **RTO (restore)** | **42 ms** | `DROP DATABASE` (desastre) → `pg_restore -Fc -1` concluído e banco aceitando conexões |
| Duração do backup | 35 ms | `pg_dump -Fc` (single transaction) de 31 KB |
| **RPO demonstrado** | **1 linha** (escrita pós-backup) | linha `dr-dave` confirmada após o fim do backup e ausente no restore |
| Integridade do restore | 4/4 tabelas | contagens de linha + checksums MD5 determinísticos por tabela, idênticos ao pré-desastre |
| Invariantes restauradas | constraints 2/2; triggers append-only 3/3 | `pg_constraint`/`pg_trigger` pós-restore |
| Ledger pós-restore | net = 0.00 | soma DEBIT − CREDIT de `economy_ledger_entries` |

Evidência completa: `artifacts/dr/evidence-<timestamp>.json` (gerado a cada execução do script).

### 5.1 Runbook de recuperação

```bash
# pré-requisito: servidor PostgreSQL efêmero ativo (harness local)
source scripts/m2_e2e/postgres_env.sh
export M2_ART_DIR="$(pwd)/artifacts/dr"

# 1) backup + desastre + restore + verificação (RPO/RTO medidos)
scripts/m2_e2e/dr_backup_restore.sh

# 2) rollback da migration do ledger (ambiente isolado)
scripts/m2_e2e/dr_migration_rollback.sh
```

Procedimento operacional em incidente real (produção/staging):

1. **Congelar escritas** (manutenção ou router drain) para limitar a janela de RPO.
2. **Restaurar**: `pg_restore --no-owner -1 <backup>.dump` em banco novo; nunca in-place.
3. **Verificar** antes de reabrir tráfego: contagens por tabela, checksums, net do ledger = 0, constraints e triggers append-only presentes (o script automatiza todas essas checagens).
4. **Reconciliar** a diferença entre o fim do backup e o congelamento usando `npm run economy:reconcile` (relatório read-only de drift) — sem autocorreção; ajustes compensatórios seguem política append-only.

### 5.2 Rollback de versão/migration

`migrations/rollback/0004_correlated_append_only_ledger.down.sql` documenta o reverse DDL da migration do ledger (triggers append-only/balanceamento, índices, tabelas `economy_ledger_entries`/`economy_ledger_migration_state`, colunas `operation_id`).

Execução medida: **RTO de 7 ms**; dados de base (0002/0003) íntegros e consultáveis pós-rollback; escritas aceitas após o rollback. O RPO do rollback é **intencional**: descarta o histórico append-only do ledger — mitigação obrigatória é backup prévio (`dr_backup_restore.sh`), e o próprio script de rollback é executado somente em banco descartável.

> ⚠️ O rollback de migration **nunca** deve rodar em banco de produto sem janela de manutenção aprovada e backup verificado. O padrão expand/contract (adicionar coluna nova, migrar leitura, remover coluna antiga em release posterior) é a estratégia preferida para mudanças futuras; reverse DDL é o caminho de emergência.

### 5.3 Metas operacionais (staging → produção)

| Ambiente | RPO alvo | Estratégia |
|---|---|---|
| Local/sandbox | ilimitado (descartável) | harness desta rodada |
| Staging (SRE/M3) | ≤ 5 min | WAL contínuo (`archive_mode`) + basebackup a cada 24 h |
| Produção | ≤ 1 min | WAL contínuo + streaming replica + PITR |

RTO alvo em staging: ≤ 5 min (restore em banco novo + verificação automatizada + reconcile). A medição desta rodada (42 ms) representa o teto mecânico do `pg_restore` em escala sintética; a escala de produto será re-medida no M3 com o provisionamento aprovado.

## 6. Como reproduzir a evidência

```bash
# gates 1–3 (banco descartável obrigatório)
source scripts/m2_e2e/postgres_env.sh   # cria khaaos_e2e_test + khaaos_dr_source
node --import tsx --test tests/official/economy-money.test.ts
TEST_DATABASE_URL="$TEST_DATABASE_URL" node --import tsx --test tests/official/m2-loan-parity-recovery.postgres.test.ts

# gate 4 (RPO/RTO)
scripts/m2_e2e/dr_backup_restore.sh
scripts/m2_e2e/dr_migration_rollback.sh
```

Arquivos desta rodada:

| Artefato | Papel |
|---|---|
| `shared/money.ts` | contrato canônico (`computeLoanTerms`, constantes de domínio/taxa) |
| `server/game/EconomyEngine.ts` | `computeLoan` delega ao contrato (fim da taxa 4% fantasma) |
| `server/game/economyService.ts` | `requestLoan` usa o mesmo contrato do preview |
| `server/game/mutationSchemas.ts` | `loanPreviewInput` com domínio idêntico ao da cobrança |
| `tests/official/economy-money.test.ts` | matriz unitária + domínio (fast feedback) |
| `tests/official/m2-loan-parity-recovery.postgres.test.ts` | gates 1–3 em PostgreSQL real |
| `scripts/m2_e2e/dr_backup_restore.sh` | gate 4a — backup/restore com RPO/RTO |
| `scripts/m2_e2e/dr_migration_rollback.sh` | gate 4b — rollback de migration |
| `migrations/rollback/0004_correlated_append_only_ledger.down.sql` | reverse DDL documentado |
| `artifacts/dr/evidence-*.json` | evidências executadas |

## 7. Pendências explícitas (fora do escopo desta rodada)

- **Auditoria de dados legados em produção** e separação de roles runtime/owner do banco: exigem acesso a produção que este ambiente não possui; a migração 0003 + testes de legado existentes cobrem o padrão de validação.
- **Backup físico contínuo (WAL archiving) no staging real**: depende do provisionamento aprovado do M3 (infra com DB gerenciado); a meta operacional está registrada na seção 5.3.
- **Redis**: os scripts alpha (`scripts/alpha/backup_system.sh`) cobrem RDB; o RPO de Redis para dados de sessão é aceitável como perda total por design (estado rederivável), documentado no runbook de DR do sistema.
