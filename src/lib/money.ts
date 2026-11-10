/**
 * Money is always stored and computed as integer agorot (1 ₪ = 100 agorot).
 * Floating point is only used for *display* formatting and percentages,
 * never as the source of truth for an amount.
 */
export type Agorot = number;

export function assertAgorot(value: number): Agorot {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Invalid agorot amount: ${value}`);
  }
  return value;
}

/**
 * Parse a user-typed shekel amount ("450", "450.5", "1,234.90", "₪ 12") into agorot
 * using string arithmetic (no float multiplication).
 * Returns null for empty / invalid input.
 */
export function parseShekelsToAgorot(input: string): Agorot | null {
  const cleaned = input.replace(/[₪,\s]/g, "").replace(/[٫]/g, ".");
  if (cleaned === "") return null;
  const m = /^(\d{0,9})(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!m) return null;
  const whole = m[1] === "" ? "0" : m[1];
  const frac = (m[2] ?? "").padEnd(2, "0");
  const value = parseInt(whole, 10) * 100 + parseInt(frac, 10);
  return Number.isSafeInteger(value) ? value : null;
}

/** Agorot -> editable string without currency sign, e.g. 45050 -> "450.5" */
export function agorotToInput(a: Agorot): string {
  const sign = a < 0 ? "-" : "";
  const abs = Math.abs(a);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  if (frac === 0) return `${sign}${whole}`;
  return `${sign}${whole}.${String(frac).padStart(2, "0").replace(/0$/, "")}`;
}

const fmtWhole = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 });

/** Format agorot as "₪1,234" (or "₪1,234.50" when there are agorot). */
export function formatILS(a: Agorot, opts: { forceDecimals?: boolean } = {}): string {
  const negative = a < 0;
  const abs = Math.abs(a);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  let body: string;
  if (frac === 0 && !opts.forceDecimals) {
    body = fmtWhole.format(whole);
  } else {
    // Build string from integer parts to avoid float artefacts.
    body = `${fmtWhole.format(whole)}.${String(frac).padStart(2, "0")}`;
  }
  return `${negative ? "-" : ""}₪${body}`;
}

/** Compact format for chart axes: ₪1.2K */
export function formatILSCompact(a: Agorot): string {
  const shekels = a / 100;
  if (Math.abs(shekels) >= 1000) {
    return `₪${(shekels / 1000).toFixed(shekels % 1000 === 0 ? 0 : 1)}K`;
  }
  return `₪${Math.round(shekels)}`;
}

/**
 * Split a total into `count` integer parts that sum exactly to the total.
 * The remainder agorot are added to the FIRST installment(s), which mirrors
 * how Israeli card issuers typically round (first payment absorbs the remainder).
 */
export function splitInstallments(total: Agorot, count: number): Agorot[] {
  assertAgorot(total);
  if (!Number.isInteger(count) || count < 1) throw new Error("Installment count must be >= 1");
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const base = Math.floor(abs / count);
  const remainder = abs - base * count;
  return Array.from({ length: count }, (_, i) => sign * (base + (i < remainder ? 1 : 0)));
}

export function sum(values: Agorot[]): Agorot {
  let s = 0;
  for (const v of values) s += v;
  return s;
}

/** Percentage (float, for display only). */
export function percent(part: Agorot, whole: Agorot): number {
  if (whole <= 0) return part > 0 ? 100 : 0;
  return (part / whole) * 100;
}
