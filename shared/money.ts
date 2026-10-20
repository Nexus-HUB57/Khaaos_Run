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

/** 5% daily interest, rounded half-up to the nearest KRC cent. */
export function calculateLoanInterestMinorUnits(principalKrc: number | string, days: number): bigint {
  if (!Number.isSafeInteger(days) || days < 1) throw new Error("Prazo inválido");
  const numerator = toMinorUnits(principalKrc) * 5n * BigInt(days);
  return (numerator + 50n) / 100n;
}
