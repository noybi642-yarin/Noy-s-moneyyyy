import { describe, expect, it } from "vitest";
import { cycleKeyFor, getCycle, cycleProgress, shiftCycleKey, isInCycle, cycleDistance } from "@/lib/cycle";
import { todayInJerusalem, isLeapYear, daysInMonth, addDays } from "@/lib/dates";

describe("budget cycle boundaries", () => {
  it("the 2nd starts a new cycle, the 1st belongs to the previous", () => {
    expect(cycleKeyFor("2026-11-02")).toBe("2026-11-02");
    expect(cycleKeyFor("2026-11-30")).toBe("2026-11-02");
    expect(cycleKeyFor("2026-12-01")).toBe("2026-11-02");
    expect(cycleKeyFor("2026-12-02")).toBe("2026-12-02");
  });

  it("uses half-open intervals [start, next start)", () => {
    const c = getCycle("2026-11-02");
    expect(c.start).toBe("2026-11-02");
    expect(c.endExclusive).toBe("2026-12-02");
    expect(c.lastDay).toBe("2026-12-01");
    expect(isInCycle("2026-12-01", c)).toBe(true);
    expect(isInCycle("2026-12-02", c)).toBe(false);
    expect(isInCycle("2026-11-01", c)).toBe(false);
    expect(c.totalDays).toBe(30);
  });

  it("handles year transitions", () => {
    expect(cycleKeyFor("2027-01-01")).toBe("2026-12-02");
    expect(cycleKeyFor("2027-01-02")).toBe("2027-01-02");
    expect(shiftCycleKey("2026-12-02", 1)).toBe("2027-01-02");
    expect(shiftCycleKey("2027-01-02", -1)).toBe("2026-12-02");
    expect(shiftCycleKey("2026-11-02", 14)).toBe("2028-01-02");
    expect(cycleDistance("2026-11-02", "2028-01-02")).toBe(14);
  });

  it("handles leap years and February cycles", () => {
    expect(isLeapYear(2028)).toBe(true);
    expect(isLeapYear(2100)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(getCycle("2028-02-02").totalDays).toBe(29); // Feb 2 .. Mar 1 2028
    expect(getCycle("2027-02-02").totalDays).toBe(28);
    expect(getCycle("2028-02-02").lastDay).toBe("2028-03-01");
    expect(cycleKeyFor("2028-02-29")).toBe("2028-02-02");
    expect(cycleKeyFor("2028-03-01")).toBe("2028-02-02");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
  });

  it("computes progress and remaining days", () => {
    const c = getCycle("2026-11-02");
    expect(cycleProgress(c, "2026-11-02")).toMatchObject({ elapsedDays: 1, remainingDays: 30, status: "current" });
    expect(cycleProgress(c, "2026-11-10")).toMatchObject({ elapsedDays: 9, remainingDays: 22 });
    expect(cycleProgress(c, "2026-12-01")).toMatchObject({ elapsedDays: 30, remainingDays: 1 });
    expect(cycleProgress(c, "2026-12-02").status).toBe("past");
    expect(cycleProgress(c, "2026-10-20").status).toBe("future");
  });
});

describe("timezone behaviour (Asia/Jerusalem)", () => {
  it("rolls to the next day at Israeli midnight, not UTC midnight", () => {
    // Winter (UTC+2): 22:30 UTC on Nov 1 is already 00:30 on Nov 2 in Israel → new cycle.
    expect(todayInJerusalem(new Date("2026-11-01T22:30:00Z"))).toBe("2026-11-02");
    expect(todayInJerusalem(new Date("2026-11-01T21:59:00Z"))).toBe("2026-11-01");
    expect(cycleKeyFor(todayInJerusalem(new Date("2026-11-01T22:30:00Z")))).toBe("2026-11-02");
    // Summer (UTC+3): 21:30 UTC on Jul 1 is 00:30 Jul 2 in Israel.
    expect(todayInJerusalem(new Date("2026-07-01T21:30:00Z"))).toBe("2026-07-02");
    expect(todayInJerusalem(new Date("2026-07-01T20:59:00Z"))).toBe("2026-07-01");
  });

  it("does not depend on the host timezone", () => {
    const prev = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      expect(todayInJerusalem(new Date("2026-11-01T22:30:00Z"))).toBe("2026-11-02");
      expect(addDays("2026-03-27", 1)).toBe("2026-03-28"); // Israeli DST change weekend
    } finally {
      process.env.TZ = prev;
    }
  });
});
