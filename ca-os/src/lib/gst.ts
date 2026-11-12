// GST liability for a set of months, computed from the recorded documents.

import { db } from "./db";

export type Heads = { igst: number; cgst: number; sgst: number };
const zero = (): Heads => ({ igst: 0, cgst: 0, sgst: 0 });
export const total = (h: Heads) => h.igst + h.cgst + h.sgst;

export type SetOff = { cash: Heads; creditUsed: Heads; closingCredit: Heads };

/**
 * Utilise input tax credit against output tax in the order the law requires
 * (CGST Act s.49 with Rule 88A):
 *   1. IGST credit pays IGST first; what is left must be fully used against
 *      CGST and SGST, in any proportion, before their own credit is touched.
 *   2. CGST credit pays CGST, then IGST. SGST credit pays SGST, then IGST.
 *   3. CGST credit can never pay SGST, nor the reverse.
 * Where step 1 leaves a choice, leftover IGST credit goes to the head that
 * would otherwise need cash, which minimises the cash outflow.
 */
export function setOff(liability: Heads, credit: Heads): SetOff {
  const due = { ...liability };
  const cr = { ...credit };
  const pay = (from: keyof Heads, to: keyof Heads, cap = Infinity) => {
    const amount = Math.max(0, Math.min(cr[from], due[to], cap));
    cr[from] -= amount;
    due[to] -= amount;
  };

  pay("igst", "igst");
  // Leftover IGST credit: cover shortfalls first, then whatever liability remains.
  pay("igst", "cgst", Math.max(0, due.cgst - cr.cgst));
  pay("igst", "sgst", Math.max(0, due.sgst - cr.sgst));
  pay("igst", "cgst");
  pay("igst", "sgst");

  pay("cgst", "cgst");
  pay("cgst", "igst");
  pay("sgst", "sgst");
  pay("sgst", "igst");

  return {
    cash: due,
    creditUsed: { igst: credit.igst - cr.igst, cgst: credit.cgst - cr.cgst, sgst: credit.sgst - cr.sgst },
    closingCredit: cr,
  };
}

export type Liability = {
  months: string[];
  documentCount: number;
  outputTax: Heads;      // invoices less credit notes
  reverseCharge: Heads;  // tax you owe on reverse-charge purchases; payable in cash only
  openingCredit: Heads;
  periodCredit: Heads;   // eligible ITC per books: bills less vendor credits
  setOff: SetOff;
  cashPayable: number;   // set-off cash + reverse charge
};

/** `months` is one 'YYYY-MM' for a monthly filer or three for a QRMP quarter. */
export function computeLiability(months: string[]): Liability {
  const conn = db();
  const marks = months.map(() => "?").join(",");

  // Sign: credit notes and vendor credits reduce their side.
  const sum = (types: [string, string], where: string) =>
    conn
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN d.doc_type = ? THEN l.igst_paise ELSE -l.igst_paise END), 0) AS igst,
           COALESCE(SUM(CASE WHEN d.doc_type = ? THEN l.cgst_paise ELSE -l.cgst_paise END), 0) AS cgst,
           COALESCE(SUM(CASE WHEN d.doc_type = ? THEN l.sgst_paise ELSE -l.sgst_paise END), 0) AS sgst
         FROM document_lines l JOIN documents d ON d.id = l.document_id
         WHERE d.status = 'final' AND d.period IN (${marks}) AND d.doc_type IN (?, ?) AND ${where}`,
      )
      .get(types[0], types[0], types[0], ...months, ...types) as Heads;

  const outputTax = sum(["invoice", "credit_note"], "d.reverse_charge = 0");
  const reverseCharge = sum(["bill", "vendor_credit"], "d.reverse_charge = 1");
  const periodCredit = sum(["bill", "vendor_credit"], "l.itc_eligible = 1");

  const opening = conn
    .prepare(
      "SELECT opening_itc_igst AS igst, opening_itc_cgst AS cgst, opening_itc_sgst AS sgst FROM gst_periods WHERE period = ?",
    )
    .get(months[0]) as Heads | undefined;
  const openingCredit = opening ?? zero();

  const { n } = conn
    .prepare(`SELECT COUNT(*) AS n FROM documents WHERE status = 'final' AND period IN (${marks})`)
    .get(...months) as { n: number };

  const result = setOff(outputTax, {
    igst: openingCredit.igst + periodCredit.igst,
    cgst: openingCredit.cgst + periodCredit.cgst,
    sgst: openingCredit.sgst + periodCredit.sgst,
  });

  return {
    months,
    documentCount: n,
    outputTax,
    reverseCharge,
    openingCredit,
    periodCredit,
    setOff: result,
    cashPayable: total(result.cash) + total(reverseCharge),
  };
}

/** '2026-10' → ['2026-10'];  'Q2 2026-27' → ['2026-07','2026-08','2026-09']. */
export function monthsOfPeriod(label: string): string[] {
  const q = /^Q([1-4]) (\d{4})-\d{2}$/.exec(label);
  if (!q) return [label];
  const fy = Number(q[2]);
  const first = (Number(q[1]) - 1) * 3 + 4; // month number counted from January of `fy`
  return [0, 1, 2].map((i) => {
    const m = first + i;
    return m <= 12 ? `${fy}-${String(m).padStart(2, "0")}` : `${fy + 1}-${String(m - 12).padStart(2, "0")}`;
  });
}
