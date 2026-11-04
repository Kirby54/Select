import { describe, expect, it } from "vitest";

import { fractionFromPercent } from "@/lib/format";
import { normalizeAmount, parseCatalog } from "./catalog-import";

const FR = ["0.20", "0.10", "0.055", "0.021", "0"];

describe("catalog import", () => {
  it("reads a French spreadsheet export with a header, semicolons and comma decimals", () => {
    const text = "Référence;Libellé;Unité;Prix unitaire;TVA\nPOSE-H;Pose, par heure;h;45,00;20 %\nPT;Plan de travail;m;1 189,50;5,5";
    const { rows, errors } = parseCatalog(text, FR);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { ref: "POSE-H", label: "Pose, par heure", unit: "h", unit_price: "45.00", vat_rate: "0.20" },
      { ref: "PT", label: "Plan de travail", unit: "m", unit_price: "1189.50", vat_rate: "0.055" },
    ]);
  });

  it("refuses a VAT rate the company does not use and explains which line", () => {
    const { rows, errors } = parseCatalog("A1,Shelf,pc,64.50,19\nA2,Box,pc,10,20%", FR);
    expect(rows.map((r) => r.ref)).toEqual(["A2"]);
    expect(errors[0]).toMatch(/^Line 1: VAT "19"/);
  });

  it("normalizes amounts without floating point", () => {
    expect(normalizeAmount("1.234,5")).toBe("1234.50");
    expect(normalizeAmount("1,234.5")).toBe("1234.50");
    expect(normalizeAmount("0,1")).toBe("0.10");
    expect(normalizeAmount("12 €")).toBe("12.00");
    expect(normalizeAmount("abc")).toBeNull();
  });

  it("turns percentages into stored fractions", () => {
    expect(fractionFromPercent("20")).toBe("0.20");
    expect(fractionFromPercent("5,5 %")).toBe("0.055");
    expect(fractionFromPercent("2.1")).toBe("0.021");
    expect(fractionFromPercent("8.1")).toBe("0.081");
    expect(fractionFromPercent("0")).toBe("0");
    expect(fractionFromPercent("150")).toBeNull();
  });
});
