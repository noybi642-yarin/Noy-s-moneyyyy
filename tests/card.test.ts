import { describe, expect, it } from "vitest";
import { installmentChargeDate, nextChargeDate, upcomingChargeDates } from "@/lib/card";

const cfg = { cutoffDay: 1, billingDay: 10 };

describe("credit-card statement allocation", () => {
  it("does not assume the purchase date is the charge date", () => {
    // Statement closes on the 1st; charged on the 10th of the same month.
    expect(installmentChargeDate("2026-11-01", 0, cfg)).toBe("2026-11-10");
    expect(installmentChargeDate("2026-11-02", 0, cfg)).toBe("2026-12-10");
    expect(installmentChargeDate("2026-11-30", 0, cfg)).toBe("2026-12-10");
  });

  it("spreads installments over consecutive statements, across years", () => {
    expect([0, 1, 2].map((i) => installmentChargeDate("2026-11-15", i, cfg))).toEqual([
      "2026-12-10",
      "2027-01-10",
      "2027-02-10",
    ]);
  });

  it("charges in the following month when billing day <= cutoff day", () => {
    const c = { cutoffDay: 20, billingDay: 2 };
    expect(installmentChargeDate("2026-11-20", 0, c)).toBe("2026-12-02");
    expect(installmentChargeDate("2026-11-21", 0, c)).toBe("2027-01-02");
  });

  it("clamps to short months and leap years", () => {
    const c = { cutoffDay: 31, billingDay: 31 };
    // cutoff 31 & billing 31 → billing not > cutoff → charged next month on its last day
    expect(installmentChargeDate("2027-01-31", 0, c)).toBe("2027-02-28");
    expect(installmentChargeDate("2028-01-31", 0, c)).toBe("2028-02-29");
    expect(installmentChargeDate("2027-02-28", 0, c)).toBe("2027-03-31");
  });

  it("finds the next charge date", () => {
    expect(nextChargeDate("2026-11-10", cfg)).toBe("2026-11-10");
    expect(nextChargeDate("2026-11-11", cfg)).toBe("2026-12-10");
    expect(nextChargeDate("2026-12-31", cfg)).toBe("2027-01-10");
    expect(upcomingChargeDates("2026-11-11", cfg, 3)).toEqual(["2026-12-10", "2027-01-10", "2027-02-10"]);
  });
});
