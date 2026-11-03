# SSOT dos ledgers de KRC — decisão e reconciliação

**Decisão registrada:** 2026-11-04 (Task 44)
**Escopo:** todo KRC movimentado por caminho financeiro REAL (depósito, compra de pacotes, taxa de alistamento, bônus, fulfillments Stripe) tem como única fonte de verdade o ledger double-entry PostgreSQL `economy_ledger_entries`.

## 1. A decisão

**SSOT = `economy_ledger_entries`** (schema raiz, `shared/schema.ts`; migrations 0003–0009).

Por que este e não outro:

1. **Double-entry auditável por construção** — cada operação tem `operation_id` com linhas DEBIT/CREDIT balanceadas, validadas no commit pelo trigger da migration 0004 (ΣDEBIT = ΣCREDIT por operação), e `idempotency_key` com unique `(user_id, idempotency_key, line_number)` — replay não paga nem credita duas vezes.
2. **É o ledger que os caminhos de dinheiro real já usam** — fulfillment Stripe (`stripePaymentService.processEvent`), taxa+bônus de alistamento (`recordEnrollmentFeeLedger`, Fase 47.1), operações bancárias transacionais (M2), 2PC de payout (`EconomyPayoutSettlement`).
3. **Carteiras derivadas, não independentes** — `bank_accounts` (weapons/bonus/fbm) é projeção de saldo cuja correção é verificável contra o ledger (seção walletDrift da auditoria).
4. **Ferramentas de reconciliação existem e são executadas** — `scripts/economy-reconcile.ts` (relatório JSON, exit 2 quando precisa atenção) e `server/game/economyAudit.ts` (usado também por `economyRetention` e pela suíte oficial PostgreSQL).

## 2. Mapa dos 4 ledgers

| # | Ledger | Onde vive | Papel real | Decisão |
|---|--------|-----------|------------|---------|
| L1 | `economy_ledger_entries` (+ `bank_accounts`, `transactions`, `economy_idempotency`) | servidor raiz, PostgreSQL | Livro financeiro double-entry de TODO valor real | **SSOT** |
| L2 | `Ledger` (in-memory) / `PostgresEconomyStore` → tabela `economy_entries` | `game-runtime/server/economy.js` (migração própria `game-runtime/migrations/003_economy_ledger.sql`) | Economia SIMULADA do servidor de jogo (`REAL_MONEY_ENABLED = Object.freeze(false)` + tripwire `assertRealMoneyDisabled`; KRC/FBM sem valor monetário) | Ledger de simulação — namespace separado, NUNCA reconciliar contra o SSOT nem somar saldos entre eles |
| L3 | `krc_ledger` + `krc_balances` + `two_pc_transactions` | `economy-server/` (PostgreSQL próprio, schema próprio) | Ledger TÉCNICO do protocolo 2PC cross-node (fases lock/commit/refund) | Subordinado ao SSOT: um commit 2PC só vale quando o efeito líquido correspondente existe (ou entra) no L1 |
| L4 | `AtomicLedger` (TS, in-memory) | `server/game/AtomicLedger.ts` | Artefato de design F2–F5; nenhum módulo de runtime importa | **Deprecado no runtime TS** (cabeçalho marcado); o port vivo é o C++ `KhaaosAtomicLedger.cpp` na trilha UE5 |

Regras derivadas:

- **Nenhum caminho novo de valor real pode escrever em L2/L3/L4.** Código novo de dinheiro usa o SSOT (L1) via `insertBalancedOperation`/`economy2pcService`/`StripePaymentService`.
- **L2 é propósito e namespace distintos** (moeda de simulação do jogo, contas `wallet.*`/`system.*` locais). A semelhança de nomes com o L1 (`economy_entries` × `economy_ledger_entries`) é armadilha conhecida — ver §4.
- **L3** guarda só o estado do protocolo 2PC; a liquidificação econômica termina no L1 (payout settlement).

## 3. Trabalho de reconciliação (executado nesta Task)

Máquina de reconciliação do L1 (`server/game/economyAudit.ts`, relatório via `scripts/economy-reconcile.ts`) — agora com 7 cheques:

| Cheque | O que prova |
|--------|-------------|
| `walletDrifts` | Saldo de `bank_accounts` = Σ ledger por conta (`wallet.weapons`/`wallet.bonus`/`wallet.fbm`) |
| `unbalancedOperations` | Toda operação fecha (ΣDEBIT = ΣCREDIT por `operation_id`) |
| `transactionsWithoutLedger` | Toda `transactions` com `operation_id` tem par no ledger |
| `successfulClaimsWithoutLedger` | Toda claim idempotente 2xx pós-snapshot gerou operação |
| `incompleteIdempotencyClaims` | Nenhuma claim ficou sem resposta gravada |
| **`ledgerGlobalDrift` (novo, Task 44)** | **ΣDEBIT global = ΣCREDIT global** — captura corrupção fora do caminho do trigger (edit manual, restauração parcial, truncamento) que o cheque por operação não vê |
| **`paidEnrollmentSessionsWithoutLedger` (novo, Task 44)** | Toda sessão de alistamento `COMPLETED` com bônus tem evidência no ledger citando o protocolo `KR-REG-*` — a invariante do guard financeiro do #252 verificada na leitura (guard `to_regclass`: ambientes sem a migration 0011 pulam a seção) |

Limitações honestas:

- Sessões de alistamento em store **em memória** não aparecem no cheque novo (a auditoria opera sobre o banco). Em produção com gateway real, `ENROLLMENT_STORE=postgres` é **obrigatório** (o wiring de `server/routes.ts` desliga o gateway sem ele — fail-closed).
- L3 vive em banco próprio: reconciliação cruzada 2PC↔SSOT é passo **manual** de runbook (conectar nas duas URLs e conferir `two_pc_transactions.committed` contra as operações `payout` no L1). Automação pendente de infra (uma única instância roda hoje; ver ROADMAP).
- L2 **nunca** entra na conta: é dinheiro de brincadeira por design (`REAL_MONEY_ENABLED=false`).

## 4. Runbook operacional

```bash
# Reconciliação do SSOT (exit 0 = clean, 2 = needs_attention, 1 = erro)
DATABASE_URL=... npx tsx scripts/economy-reconcile.ts
```

- Rodar após qualquer migration financeira, restore de backup ou incidente de carteira.
- `needs_attention` ⇒ investigar cada linha antes de qualquer ajuste manual; ajustes manuais só via operação balanceada nova no ledger (nunca UPDATE de saldo seco), com `idempotency_key` própria e descrição citando o incidente.
- Re-entrega de webhook Stripe é segura por construção: dedup por `(provider, event_id)` + `payload_hash` e ledger único por chave.

## 5. Estado por ferramenta (pós Task 44)

- `scripts/economy-reconcile.ts` — intacto (consome o relatório estendido).
- `tests/official/economy-postgres.test.ts` — estendido: estados limpos incluem os 2 cheques novos + caso negativo (sessão paga sem ledger → `needs_attention`; com ledger → `clean`).
- `tests/official/economy-ledger-ssot.test.ts` (novo) — contrato estático da decisão: doc existe, `REAL_MONEY_ENABLED` congelado em `false`, AtomicLedger deprecado, webhook roteia eventos da taxa antes do processador de pacotes.
