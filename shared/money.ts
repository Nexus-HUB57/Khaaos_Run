const MONEY_SCALE = 2n;
const MONEY_BASE = 10n ** MONEY_SCALE;

/** Parse a JSON number or decimal string without binary floating-point arithmetic. */
export function toMinorUnits(value: number | string): bigint {
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Valor monetário inválido");
  const source = String(value).trim();
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(source);
  if (!match) throw new Error("Valor monetário inválido");

  const sign = match[1] === "-" ? -1n : 1n;
  const fraction = match[3] ?? "";
  const exponent = Number(match[4] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100) throw new Error("Valor monetário fora do limite");

  const digits = BigInt(`${match[2]}${fraction}` || "0");
  const decimalPlaces = fraction.length - exponent;
  const scaleShift = Number(MONEY_SCALE) - decimalPlaces;
  if (scaleShift >= 0) return sign * digits * (10n ** BigInt(scaleShift));

  const divisor = 10n ** BigInt(-scaleShift);
  if (digits % divisor !== 0n) throw new Error("São permitidas no máximo duas casas decimais");
  return sign * (digits / divisor);
}

export function fromMinorUnits(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const whole = absolute / MONEY_BASE;
  const fraction = String(absolute % MONEY_BASE).padStart(Number(MONEY_SCALE), "0");
  return `${sign}${whole}.${fraction}`;
}

export function usdToKrcMinorUnits(usd: number | string, krcPerUsd = 100): bigint {
  return toMinorUnits(usd) * BigInt(krcPerUsd);
}

/** 5% daily interest, rounded half-up to the nearest KRC cent. */
export function calculateLoanInterestMinorUnits(principalKrc: number | string, days: number): bigint {
  if (!Number.isSafeInteger(days) || days < 1) throw new Error("Prazo inválido");
  const numerator = toMinorUnits(principalKrc) * 5n * BigInt(days);
  return (numerator + 50n) / 100n;
}

// ─── Contrato único de empréstimo (M2) ──────────────────────────────────────
// Preview e cobrança compartilham esta função: qualquer mudança de taxa,
// arredondamento ou limites precisa passar por aqui, senão a suíte
// loan-parity (matriz de prazos) falha e o gate M2 bloqueia o merge.

/** Juro diário do empréstimo, em percentual inteiro (5 => 5% ao dia). */
export const LOAN_DAILY_INTEREST_PERCENT = 5n;

/** Domínio válido do empréstimo — idêntico para preview e cobrança. */
export const LOAN_PRINCIPAL_MIN_KRC = 100n;
export const LOAN_PRINCIPAL_MAX_KRC = 10_000n;
export const LOAN_DAYS_MIN = 1;
export const LOAN_DAYS_MAX = 30;

export interface LoanTerms {
  /** Principal em KRC (string decimal exata, 2 casas). */
  principal: string;
  /** Juro total em KRC (string decimal exata, 2 casas). */
  interest: string;
  /** Principal + juro em KRC (string decimal exata, 2 casas). */
  totalDue: string;
  /** Prazo em dias. */
  days: number;
  /** APR de exibição (taxa diária × 365), arredondado a 2 casas. */
  apr: string;
  /** Valores em minor units para inspeção sem perda de precisão. */
  minor: { principal: bigint; interest: bigint; totalDue: bigint };
}

function assertLoanDomain(principalKrc: number | string, days: number): void {
  if (!Number.isSafeInteger(days) || days < LOAN_DAYS_MIN || days > LOAN_DAYS_MAX) {
    throw new RangeError("Prazo do empréstimo fora da faixa permitida");
  }
  const principalMinor = toMinorUnits(principalKrc);
  if (principalMinor % MONEY_BASE !== 0n) {
    throw new RangeError("Valor do empréstimo deve ser um número inteiro de KRC");
  }
  const minMinor = LOAN_PRINCIPAL_MIN_KRC * MONEY_BASE;
  const maxMinor = LOAN_PRINCIPAL_MAX_KRC * MONEY_BASE;
  if (principalMinor < minMinor || principalMinor > maxMinor) {
    throw new RangeError("Valor do empréstimo fora da faixa permitida");
  }
}

/**
 * Termos canônicos do empréstimo: única fonte usada por preview e cobrança.
 * Juro diário inteiro (LOAN_DAILY_INTEREST_PERCENT), aritmética exclusivamente
 * em minor units (bigint). Domínio: principal INTEIRO em KRC entre
 * LOAN_PRINCIPAL_MIN_KRC e LOAN_PRINCIPAL_MAX_KRC, prazo 1..30 dias —
 * idêntico ao domínio aplicado por EconomyService.requestLoan e pela
 * rota /api/economy/loan-preview (gate M2 loan-parity).
 */
export function computeLoanTerms(principalKrc: number | string, days: number): LoanTerms {
  assertLoanDomain(principalKrc, days);
  const principalMinor = toMinorUnits(principalKrc);
  const interestMinor = calculateLoanInterestMinorUnits(principalKrc, days);
  const totalDueMinor = principalMinor + interestMinor;
  const aprRate = Number(LOAN_DAILY_INTEREST_PERCENT) / 100;
  return {
    principal: fromMinorUnits(principalMinor),
    interest: fromMinorUnits(interestMinor),
    totalDue: fromMinorUnits(totalDueMinor),
    days,
    apr: (Math.round(aprRate * 365 * 100) / 100).toFixed(2),
    minor: { principal: principalMinor, interest: interestMinor, totalDue: totalDueMinor },
  };
}
