import { addMonthsYM, clampedDate, daysInMonth, ISODate, parseISODate } from "./dates";

/**
 * Credit-card billing model (configurable in Settings):
 *
 *  - cutoffDay  (C): the statement closes at the end of day C of each month.
 *                    A purchase made on day <= C belongs to the statement that closes
 *                    that month; a purchase after C belongs to next month's statement.
 *  - billingDay (B): the day the statement is charged to the bank account.
 *                    If B > C the charge happens in the same month the statement closes,
 *                    otherwise in the following month.
 *
 * Installment k (0-based) of a purchase is placed on the statement k months after the
 * statement of the purchase itself. Days are clamped to short months (31 -> 30/28/29).
 */
export interface CardConfig {
  cutoffDay: number;
  billingDay: number;
}

export const DEFAULT_CARD_CONFIG: CardConfig = { cutoffDay: 1, billingDay: 10 };

export function statementCloseMonth(purchaseDate: ISODate, cfg: CardConfig): { y: number; m: number } {
  const { y, m, d } = parseISODate(purchaseDate);
  const cutoff = Math.min(cfg.cutoffDay, daysInMonth(y, m));
  return d <= cutoff ? { y, m } : addMonthsYM(y, m, 1);
}

export function chargeDateForCloseMonth(close: { y: number; m: number }, cfg: CardConfig): ISODate {
  const chargeYM = cfg.billingDay > cfg.cutoffDay ? close : addMonthsYM(close.y, close.m, 1);
  return clampedDate(chargeYM.y, chargeYM.m, cfg.billingDay);
}

export function statementCloseDate(close: { y: number; m: number }, cfg: CardConfig): ISODate {
  return clampedDate(close.y, close.m, cfg.cutoffDay);
}

/** Charge date of installment `index` (0-based) of a card purchase. */
export function installmentChargeDate(purchaseDate: ISODate, index: number, cfg: CardConfig): ISODate {
  const close = statementCloseMonth(purchaseDate, cfg);
  const shifted = addMonthsYM(close.y, close.m, index);
  return chargeDateForCloseMonth(shifted, cfg);
}

/** The first charge date that is on or after `today`. */
export function nextChargeDate(today: ISODate, cfg: CardConfig): ISODate {
  const { y, m } = parseISODate(today);
  for (let delta = -2; delta <= 3; delta++) {
    const close = addMonthsYM(y, m, delta);
    const charge = chargeDateForCloseMonth(close, cfg);
    if (charge >= today) return charge;
  }
  throw new Error("unreachable");
}

/** The charge date of the statement that today's purchases will land on. */
export function chargeDateForPurchaseToday(today: ISODate, cfg: CardConfig): ISODate {
  return installmentChargeDate(today, 0, cfg);
}

/** List of upcoming charge dates starting with the next one. */
export function upcomingChargeDates(today: ISODate, cfg: CardConfig, count: number): ISODate[] {
  const out: ISODate[] = [];
  const { y, m } = parseISODate(today);
  for (let delta = -2; out.length < count && delta < count + 4; delta++) {
    const charge = chargeDateForCloseMonth(addMonthsYM(y, m, delta), cfg);
    if (charge >= today && !out.includes(charge)) out.push(charge);
  }
  return out;
}

export function validateCardConfig(cfg: CardConfig): string | null {
  for (const v of [cfg.cutoffDay, cfg.billingDay]) {
    if (!Number.isInteger(v) || v < 1 || v > 31) return "יום בחודש חייב להיות בין 1 ל-31";
  }
  return null;
}
