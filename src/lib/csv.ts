import { agorotToInput } from "./money";
import { PAYMENT_METHOD_LABEL, Snapshot } from "./types";
import { cycleKeyFor } from "./cycle";

function esc(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const SOURCE_LABEL = { manual: "ידני", recurring: "קבוע", planned: "מתוכנן" } as const;

/** Expenses + their payment schedule as CSV (UTF-8 with BOM so Excel shows Hebrew). */
export function expensesToCsv(snap: Snapshot): string {
  const cats = new Map(snap.categories.map((c) => [c.id, c.name]));
  const header = [
    "תאריך רכישה",
    "מחזור תקציב",
    "תיאור",
    "קטגוריה",
    "אמצעי תשלום",
    "סכום (₪)",
    "מספר תשלומים",
    "תשלום",
    "סכום התשלום (₪)",
    "תאריך חיוב צפוי",
    "מקור",
    "הערות",
  ];
  const lines = [header.map(esc).join(",")];
  const sorted = [...snap.expenses].sort((a, b) => (a.purchase_date < b.purchase_date ? -1 : 1));
  for (const e of sorted) {
    const inst = snap.installments.filter((i) => i.expense_id === e.id).sort((a, b) => a.number - b.number);
    const rows = inst.length ? inst : [null];
    for (const i of rows) {
      lines.push(
        [
          e.purchase_date,
          cycleKeyFor(e.purchase_date),
          e.description,
          cats.get(e.category_id) ?? "",
          PAYMENT_METHOD_LABEL[e.payment_method],
          agorotToInput(e.amount),
          e.installments_count,
          i ? `${i.number}/${e.installments_count}` : "",
          i ? agorotToInput(i.amount) : "",
          i?.charge_date ?? "",
          SOURCE_LABEL[e.source],
          e.notes ?? "",
        ]
          .map(esc)
          .join(","),
      );
    }
  }
  return "﻿" + lines.join("\r\n");
}

export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
