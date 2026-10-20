import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Transaction } from "../../shared/routes";
import { RecentTransactions } from "../../client/src/components/recent-transactions";

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 1,
    userId: "player-1",
    type: "DEPOSITO",
    amountKrc: "125.50",
    amountUsd: "5.00",
    description: "Depósito de teste",
    timestamp: new Date("2026-10-11T12:34:00.000Z"),
    ...overrides,
  };
}

function renderTransactions(transactions?: Transaction[], isLoading = false) {
  return renderToStaticMarkup(createElement(RecentTransactions, { transactions, isLoading }));
}

test("dashboard displays real transaction description, type, amount, and timestamp", () => {
  const html = renderTransactions([transaction()]);

  assert.match(html, /Depósito de teste/);
  assert.match(html, /DEPOSITO/);
  assert.match(html, /125\.50 KRC/);
  assert.match(html, /11\/10\/2026 12:34/);
  assert.doesNotMatch(html, /Login no QG-War'I detectado/);
});

test("dashboard falls back to transaction type when description is empty", () => {
  const html = renderTransactions([transaction({ description: null })]);

  assert.match(html, /DEPOSITO/);
  assert.doesNotMatch(html, /Depósito de teste/);
});

test("dashboard renders an empty state when there are no transactions", () => {
  const html = renderTransactions([]);

  assert.match(html, /NENHUMA TRANSAÇÃO REGISTRADA/);
  assert.doesNotMatch(html, /125\.50 KRC/);
});

test("dashboard renders a loading status instead of an empty state while fetching", () => {
  const html = renderTransactions(undefined, true);

  assert.match(html, /role="status"/);
  assert.match(html, /CARREGANDO HISTÓRICO/);
  assert.doesNotMatch(html, /NENHUMA TRANSAÇÃO REGISTRADA/);
});

test("dashboard limits the recent feed to four transactions", () => {
  const transactions = Array.from({ length: 6 }, (_, index) => transaction({
    id: index + 1,
    description: `Operação ${index + 1}`,
  }));
  const html = renderTransactions(transactions);

  assert.match(html, /Operação 1/);
  assert.match(html, /Operação 4/);
  assert.doesNotMatch(html, /Operação 5/);
  assert.doesNotMatch(html, /Operação 6/);
});

test("dashboard omits invalid timestamps without hiding the transaction", () => {
  const html = renderTransactions([transaction({ timestamp: new Date("invalid") })]);

  assert.match(html, /Depósito de teste/);
  assert.match(html, /125\.50 KRC/);
  assert.doesNotMatch(html, /NaN\/NaN\/NaN/);
});
