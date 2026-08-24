import { describe, it, expect } from "vitest";
import { parseFinancialRows } from "./parseFinancials";

// Jason's real July 2026 row (DTS-FINANCIALS.xlsx) — reconciles exactly:
// 16903.61 + (9337.69 + 431.61 + 0 − 2317.59) = 24355.32.
const JUL =
  "2026-07\t33552.45\t6521.97\t15888.22\t450.54\t9337.69\t16903.61\t431.61\t0\t-2317.59\t24355.32\t56.10\t94848.68\t27556.42\t1804.61";

describe("parseFinancialRows", () => {
  it("parses a tab-separated QBO row and passes the reconciliation check", () => {
    const [r] = parseFinancialRows(JUL);
    expect(r.error).toBeNull();
    expect(r.row!.month).toBe("2026-07-01");
    expect(r.row!.net_income).toBe("9337.69");
    expect(r.row!.ending_cash).toBe("24355.32");
  });

  it("accepts commas, $ signs, and (negatives); skips a header line", () => {
    const text =
      "month,income,cogs,opex,interest,ni,beg,opadj,inv,fin,end,ar,liab,eq,dep\n" +
      "2026-02,\"16557.50\",4184.12,6690.99,714.94,3877.80,5165.51,(726.39),0,($4444.53),3872.39,1385.80,103882.45,6173.81,1804.61"
        .replace(/"/g, "");
    const rows = parseFinancialRows(text);
    expect(rows).toHaveLength(1);
    expect(rows[0].error).toBeNull();
    expect(rows[0].row!.operating_adjustments).toBe("-726.39");
    expect(rows[0].row!.financing).toBe("-4444.53");
  });

  it("flags a row that doesn't reconcile instead of letting it into the archive", () => {
    const bad = JUL.replace("24355.32", "25000.00");
    const [r] = parseFinancialRows(bad);
    expect(r.row).toBeNull();
    expect(r.error).toMatch(/reconcile/);
  });

  it("flags wrong column counts and bad cells with the column name", () => {
    const [short] = parseFinancialRows("2026-07\t100\t200");
    expect(short.error).toMatch(/3 columns/);
    const [badNum] = parseFinancialRows(JUL.replace("6521.97", "abc"));
    expect(badNum.error).toMatch(/total_cogs/);
  });

  it("empty text → no rows", () => {
    expect(parseFinancialRows("")).toHaveLength(0);
  });
});
