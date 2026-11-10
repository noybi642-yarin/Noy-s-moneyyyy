import { describe, expect, it } from "vitest";
import { splitInstallments, parseShekelsToAgorot, formatILS, agorotToInput, sum } from "@/lib/money";

describe("installment rounding", () => {
  it("always sums exactly to the total", () => {
    for (const total of [1, 99, 100, 10000, 33333, 45000, 100001, 9999999]) {
      for (let n = 1; n <= 36; n++) {
        if (n > total) continue;
        const parts = splitInstallments(total, n);
        expect(parts).toHaveLength(n);
        expect(sum(parts)).toBe(total);
        expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
        parts.forEach((p) => expect(Number.isInteger(p)).toBe(true));
      }
    }
  });

  it("puts the remainder on the first payments", () => {
    expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitInstallments(10001, 3)).toEqual([3334, 3334, 3333]);
    expect(splitInstallments(45000, 12)).toEqual(Array(12).fill(3750));
  });
});

describe("money parsing and formatting", () => {
  it("parses shekel strings into integer agorot without float math", () => {
    expect(parseShekelsToAgorot("450")).toBe(45000);
    expect(parseShekelsToAgorot("0.1")).toBe(10);
    expect(parseShekelsToAgorot("0.29")).toBe(29);
    expect(parseShekelsToAgorot("1,234.56")).toBe(123456);
    expect(parseShekelsToAgorot("₪ 12.5")).toBe(1250);
    expect(parseShekelsToAgorot(".5")).toBe(50);
    expect(parseShekelsToAgorot("")).toBeNull();
    expect(parseShekelsToAgorot("1.234")).toBeNull();
    expect(parseShekelsToAgorot("abc")).toBeNull();
    expect(parseShekelsToAgorot("-5")).toBeNull();
  });

  it("formats agorot", () => {
    expect(formatILS(45000)).toBe("₪450");
    expect(formatILS(123456)).toBe("₪1,234.56");
    expect(formatILS(-5000)).toBe("-₪50");
    expect(agorotToInput(45050)).toBe("450.5");
    expect(agorotToInput(45005)).toBe("450.05");
    expect(agorotToInput(45000)).toBe("450");
  });
});
