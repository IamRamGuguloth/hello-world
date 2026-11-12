// Statutory deadline rules for an Indian LLP.
//
// Each rule produces the obligations that RELATE TO a financial year (April
// `fy` to March `fy + 1`), so annual filings for FY 2025-26 come from
// generate(2025) even though they fall due in 2026.
//
// These dates encode the standard statutory calendar. Extensions, holiday
// shifts and amendments are NOT tracked automatically: verify each rule against
// its source and record the date in compliance_rules.last_verified.

import { db, type Entity } from "./db";
import { fyLabel, fyStartYear, todayIST, ymd } from "./dates";

export type Due = { period_label: string; due_date: string };

export type Rule = {
  code: string;
  authority: "GST" | "TDS" | "IT" | "MCA";
  title: string;
  form: string;
  portal: string;
  penalty_note: string;
  source_url: string;
  applies: (e: Entity) => boolean;
  generate: (fy: number, e: Entity) => Due[];
};

/** The 12 months of a financial year as [calendarYear, month 1-12]. */
function fyMonths(fy: number): [number, number][] {
  return Array.from({ length: 12 }, (_, i) => (i < 9 ? [fy, i + 4] : [fy + 1, i - 8]) as [number, number]);
}

const monthLabel = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;

/** One obligation per month, due on `day` of the following month. */
function monthly(fy: number, day: number): Due[] {
  return fyMonths(fy).map(([y, m]) => ({ period_label: monthLabel(y, m), due_date: ymd(y, m + 1, day) }));
}

/** One obligation per quarter, due on the given [monthOffsetFromApril, day] for Q1..Q4. */
function quarterly(fy: number, dues: [number, number][]): Due[] {
  return dues.map(([offset, day], i) => ({
    period_label: `Q${i + 1} ${fyLabel(fy)}`,
    due_date: ymd(fy, 4 + offset, day),
  }));
}

const annual = (fy: number, month: number, day: number): Due[] => [
  { period_label: `FY ${fyLabel(fy)}`, due_date: ymd(fy + 1, month, day) },
];

const always = () => true;
const isQrmp = (e: Entity) => e.gst_filing_frequency === "qrmp";

export const RULES: Rule[] = [
  // ── GST ──
  {
    code: "GSTR1",
    authority: "GST",
    title: "GSTR-1 — outward supplies",
    form: "GSTR-1",
    portal: "gst.gov.in",
    penalty_note: "Late fee ₹50/day (₹20/day for a nil return). Customers cannot see your invoices in their GSTR-2B until filed.",
    source_url: "https://www.gst.gov.in/",
    applies: always,
    generate: (fy, e) =>
      isQrmp(e) ? quarterly(fy, [[3, 13], [6, 13], [9, 13], [12, 13]]) : monthly(fy, 11),
  },
  {
    code: "GSTR3B",
    authority: "GST",
    title: "GSTR-3B — summary return and tax payment",
    form: "GSTR-3B",
    portal: "gst.gov.in",
    penalty_note: "Interest 18% p.a. on tax paid late, plus late fee ₹50/day (₹20/day nil). QRMP due date is the 22nd or 24th depending on state.",
    source_url: "https://www.gst.gov.in/",
    applies: always,
    generate: (fy, e) =>
      isQrmp(e) ? quarterly(fy, [[3, 22], [6, 22], [9, 22], [12, 22]]) : monthly(fy, 20),
  },
  {
    code: "GST_PMT06",
    authority: "GST",
    title: "PMT-06 — monthly tax payment under QRMP",
    form: "PMT-06",
    portal: "gst.gov.in",
    penalty_note: "Interest 18% p.a. on the shortfall.",
    source_url: "https://www.gst.gov.in/",
    applies: isQrmp,
    // First two months of each quarter only; the third month is paid with GSTR-3B.
    generate: (fy) => monthly(fy, 25).filter((_, i) => i % 3 !== 2),
  },
  {
    code: "GSTR9",
    authority: "GST",
    title: "GSTR-9 — annual return",
    form: "GSTR-9",
    portal: "gst.gov.in",
    penalty_note: "Has been exempt for turnover up to ₹2 crore; mark not applicable if the exemption covers you this year.",
    source_url: "https://www.gst.gov.in/",
    applies: always,
    generate: (fy) => annual(fy, 12, 31),
  },

  // ── TDS ──
  {
    code: "TDS_DEPOSIT",
    authority: "TDS",
    title: "TDS deposit",
    form: "Challan ITNS 281",
    portal: "incometax.gov.in (e-Pay Tax)",
    penalty_note: "Interest 1.5% per month from the date of deduction. Expense may be disallowed if TDS is not deposited.",
    source_url: "https://www.incometax.gov.in/",
    applies: (e) => !!e.deducts_tds,
    // 7th of the next month, except March, which is due 30 April.
    generate: (fy) => monthly(fy, 7).map((d, i) => (i === 11 ? { ...d, due_date: ymd(fy + 1, 4, 30) } : d)),
  },
  {
    code: "TDS_RETURN",
    authority: "TDS",
    title: "TDS quarterly statement",
    form: "26Q (and 24Q if you pay salaries)",
    portal: "incometax.gov.in / TRACES",
    penalty_note: "Late fee ₹200/day, capped at the TDS amount. Form numbers changed under the Income-tax Act, 2025: confirm the current form.",
    source_url: "https://www.tdscpc.gov.in/",
    applies: (e) => !!e.deducts_tds,
    generate: (fy) => quarterly(fy, [[3, 31], [6, 31], [9, 31], [13, 31]]),
  },
  {
    code: "TDS_CERT",
    authority: "TDS",
    title: "Issue TDS certificates to deductees",
    form: "Form 16A",
    portal: "TRACES",
    penalty_note: "₹100/day per certificate, capped at the TDS amount.",
    source_url: "https://www.tdscpc.gov.in/",
    applies: (e) => !!e.deducts_tds,
    generate: (fy) => quarterly(fy, [[4, 15], [7, 15], [10, 15], [14, 15]]),
  },

  // ── Income tax ──
  {
    code: "ADVANCE_TAX",
    authority: "IT",
    title: "Advance tax instalment",
    form: "Challan ITNS 280",
    portal: "incometax.gov.in (e-Pay Tax)",
    penalty_note: "Cumulative 15% / 45% / 75% / 100% of the year's tax by Q1–Q4. Interest 1% per month on any shortfall.",
    source_url: "https://www.incometax.gov.in/",
    applies: always,
    generate: (fy) => quarterly(fy, [[2, 15], [5, 15], [8, 15], [11, 15]]),
  },
  {
    code: "TAX_AUDIT",
    authority: "IT",
    title: "Tax audit report",
    form: "Form 3CA/3CB-3CD",
    portal: "incometax.gov.in",
    penalty_note: "Must be signed and uploaded by a practising CA. Penalty 0.5% of turnover, up to ₹1.5 lakh.",
    source_url: "https://www.incometax.gov.in/",
    applies: (e) => !!e.tax_audit_applicable,
    generate: (fy) => annual(fy, 9, 30),
  },
  {
    code: "ITR5",
    authority: "IT",
    title: "Income tax return",
    form: "ITR-5",
    portal: "incometax.gov.in",
    penalty_note: "Late fee and 1% per month interest; business losses cannot be carried forward if filed late. Confirm this year's due date.",
    source_url: "https://www.incometax.gov.in/",
    applies: always,
    // 31 July without a tax audit, 31 October with one.
    generate: (fy, e) => (e.tax_audit_applicable ? annual(fy, 10, 31) : annual(fy, 7, 31)),
  },

  // ── MCA (LLP Act) ──
  {
    code: "LLP_FORM11",
    authority: "MCA",
    title: "LLP annual return",
    form: "Form 11",
    portal: "mca.gov.in",
    penalty_note: "₹100 per day of delay with no upper cap. Needs a designated partner's DSC.",
    source_url: "https://www.mca.gov.in/",
    applies: always,
    generate: (fy) => annual(fy, 5, 30),
  },
  {
    code: "LLP_FORM8",
    authority: "MCA",
    title: "Statement of Account & Solvency",
    form: "Form 8",
    portal: "mca.gov.in",
    penalty_note: "₹100 per day of delay with no upper cap. Accounts need a CA audit if turnover exceeds ₹40 lakh or contribution exceeds ₹25 lakh.",
    source_url: "https://www.mca.gov.in/",
    applies: always,
    generate: (fy) => annual(fy, 10, 30),
  },
  {
    code: "DIR3_KYC",
    authority: "MCA",
    title: "Designated partner KYC",
    form: "DIR-3 KYC",
    portal: "mca.gov.in",
    penalty_note: "DIN is deactivated and ₹5,000 is charged to reactivate. MCA has revised how often this is due: confirm the current frequency.",
    source_url: "https://www.mca.gov.in/",
    applies: always,
    generate: (fy) => annual(fy, 9, 30),
  },
];

/** All obligations for one FY for this entity. Pure: no database access. */
export function obligationsFor(fy: number, e: Entity): (Due & { rule_code: string })[] {
  return RULES.filter((r) => r.applies(e)).flatMap((r) =>
    r.generate(fy, e).map((d) => ({ ...d, rule_code: r.code })),
  );
}

/**
 * Idempotently materialise rules and obligations for the previous, current and
 * next financial year. Called on every dashboard load, so no cron job is needed
 * and a laptop that was asleep for a week still shows the right list.
 */
export function ensureObligations(e: Entity, today = todayIST()): void {
  const conn = db();
  const upsertRule = conn.prepare(`
    INSERT INTO compliance_rules (code, authority, title, form, portal, penalty_note, source_url)
    VALUES (@code, @authority, @title, @form, @portal, @penalty_note, @source_url)
    ON CONFLICT (code) DO UPDATE SET authority = excluded.authority, title = excluded.title,
      form = excluded.form, portal = excluded.portal, penalty_note = excluded.penalty_note,
      source_url = excluded.source_url`);
  const insert = conn.prepare(
    "INSERT OR IGNORE INTO obligations (rule_code, period_label, due_date) VALUES (@rule_code, @period_label, @due_date)",
  );
  const fy = fyStartYear(today);
  conn.transaction(() => {
    for (const { applies, generate, ...meta } of RULES) upsertRule.run(meta);
    for (const year of [fy - 1, fy, fy + 1]) {
      for (const o of obligationsFor(year, e)) if (o.due_date >= e.tracking_from) insert.run(o);
    }
  })();
}
