# Khaaos Run — Economia Virtual e Compliance (KRC)

> Status: **definição + enforcement por código**. Este documento é o contrato
> que o runtime aplica ANTES de qualquer integração externa de valor. Nenhum
> caminho de compra, venda, saque, carteira, resgate ou custódia existe hoje —
> e o código os bloqueia explicitamente (`REAL_MONEY_ENABLED = false` congelado,
> `assertRealMoneyDisabled()`).

## 1. Moeda única e sem lastro financeiro

- **KRC (Khaaos Run Credits)** é a única moeda do jogo: soft currency obtida
  exclusivamente por gameplay (vitórias CIGKV, eventos, progressão de rank).
- KRC **não tem valor monetário**: não pode ser comprado, vendido, trocado por
  dinheiro, transferido entre jogadores ou sacado. Fora do jogo, KRC não tem
  existência legal nem contábil — é um contador de progressão.
- O tesouro (`treasury:rewards` / `treasury:spends`) é a única fonte de emissão
  e de queima: toda concessão sai do tesouro, todo gasto volta para o tesouro,
  o que mantém a oferta auditável e limitada pelo teto diário.

## 2. Ledger de dupla entrada append-only

- Todo movimento é um lançamento `{ debitAccount → creditAccount, amount }`
  com **valor inteiro positivo** — a conservação é estrutural (migração
  `003_economy_ledger.sql`).
- Lançamentos são **imutáveis**: correção é lançamento novo de reversão, nunca
  `UPDATE`/`DELETE` em produção.
- Saldo é **derivado** (Σ créditos − Σ débitos), nunca armazenado mutável —
  elimina divergência entre saldo e histórico.
- Implementações: `Ledger` (memória, dev/testes) e `PostgresEconomyStore`
  (produção, `KR_ECONOMY_STORE=postgres`).

## 3. Idempotência e anti-fraude

- Toda concessão aceita `idempotency_key` (única no banco): **retry de rede
  nunca duplica prêmio** — o replay devolve o lançamento original.
- **Teto diário por jogador** (`KR_ECONOMY_DAILY_CAP`, padrão 250.000 KRC/dia):
  concessões acima do teto falham com `economy_cap_exceeded` e são auditadas
  como `economy.grant/deny` na trilha de auditoria.
- Concessão é operação de **admin** (`economy:grant` — RBAC): player recebendo
  403 gera evento `rbac.deny`. O serviço rejeita valores não inteiros,
  não positivos e contas malformadas (`invalid_amount`, `invalid_account`,
  `self_transfer`).
- Leitura de saldo/histórico é **sempre derivada do token** (`actor.sub`), nunca
  de parâmetro — um jogador não consegue ler o ledger de outro por construção.

## 4. Odds publicadas (transparência de sorteio)

- Qualquer mecânica com aleatoriedade de prêmio (loot de airdrop, caixas de
  cosméticos) é obrigada a registrar probabilidades visíveis:
  `registerOdds('loot:airdrop', { comum: 0.7, raro: 0.25, lendário: 0.05 })`.
- Sorteio sem odds publicadas **não rola** (`requireOdds` → `odds_not_published`);
  probabilidades que não somam 1 são rejeitadas (`odds_do_not_sum_to_one`).
- Isso atende requisitos de divulgação de chances (loot box regulation) e
  elimina mecânicas de azar não transparentes antes de existirem.

## 5. Valor real: proibido até que TODAS as condições abaixo existam

`REAL_MONEY_ENABLED` é `false` congelado e `assertRealMoneyDisabled()` falha
alto em qualquer tentativa. Para um dia habilitar compras (não planejado), o
checklist obrigatório — em ordem — é:

1. Entidade jurídica com capacidade de processar pagamentos e política fiscal;
2. Provedor de pagamento com antifraude, recibos e reconciliação financeira;
3. Ledger adaptado para valores com lastro (imutabilidade + retenção legal +
   reversões auditadas), separado do KRC;
4. Compliance de jogo: classificação etária por jurisdição, termos de uso de
   economia, política de reembolso, restrições a menores;
5. LGPD/GDPR: base legal para dados de pagamento, DSR (acesso/eliminação),
   residência de dados;
6. Regras anti lavagem (AML) e limites por jogador/jurisdição;
7. Auditoria externa do ledger antes do primeiro real em circulação.

Enquanto qualquer item não existir, o runtime permanece **sem carteira, sem
checkout, sem resgate e sem custódia** — por design, não por omissão.

## 6. Superfície de API (atual)

| Endpoint | Auth | Descrição |
|----------|------|-----------|
| `GET /economy/balance` | token (qualquer papel) | saldo KRC do próprio token |
| `GET /economy/history?sinceId&limit` | token (qualquer papel) | lançamentos próprios, paginação por id |
| `POST /economy/grant` | `economy:grant` (admin) | concessão com idempotência + auditoria |
| `GET /economy/compliance` | `admin:metrics` | relatório: moeda, `realMoneyEnabled: false`, integridade do ledger, odds publicadas, guards ativos |

## 7. Cobertura

`test/economy.test.js`: ledger (dupla entrada, saldo, histórico, invariâncias),
idempotência, teto diário, saldo não negativo, bloqueio de valor real, odds,
HTTP ponta a ponta (401/403/400/200, idempotência via API, compliance) e
variantes PostgreSQL opt-in (`KR_DATABASE_TEST_URL`).
