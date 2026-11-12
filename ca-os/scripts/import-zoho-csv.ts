// Import a Zoho Books CSV export (one row per line item) into the local mirror.
//
//   npm run import:zoho -- invoice      path/to/Invoice.csv
//   npm run import:zoho -- credit_note  path/to/Credit_Note.csv
//   npm run import:zoho -- bill         path/to/Bill.csv
//   npm run import:zoho -- vendor_credit path/to/Vendor_Credits.csv
//
// Re-importing the same period replaces those documents, so the routine is:
// correct the mistake in Zoho, export again, import again.

import { parse } from "csv-parse/sync";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { audit, db, getEntity } from "../src/lib/db";
import { toPaise } from "../src/lib/money";
import { isGstin, stateCode } from "../src/lib/states";

type DocType = "invoice" | "credit_note" | "bill" | "vendor_credit";
const SALES: DocType[] = ["invoice", "credit_note"];

// Zoho's column headings differ a little between modules and over time. Each
// field lists the headings it accepts; add yours here if the import reports one missing.
const COLUMNS = {
  number: ["Invoice Number", "Credit Note Number", "CreditNotes Number", "Bill Number", "Vendor Credit Number"],
  date: ["Invoice Date", "Credit Note Date", "Bill Date", "Vendor Credit Date", "Date"],
  status: ["Invoice Status", "Credit Note Status", "Bill Status", "Vendor Credit Status", "Status"],
  party: ["Customer Name", "Vendor Name"],
  gstin: ["GST Identification Number (GSTIN)", "GSTIN", "GSTIN/UIN"],
  treatment: ["GST Treatment"],
  pos: ["Place of Supply", "Place of Supply(With State Code)", "Destination of Supply"],
  source: ["Source of Supply"],
  reverse: ["Is Reverse Charge Applied", "Reverse Charge"],
  item: ["Item Name", "Item Desc", "Description"],
  hsn: ["HSN/SAC"],
  qty: ["Quantity"],
  taxable: ["Item Total"],
  rate: ["Item Tax %", "Tax Percentage"],
  total: ["Total"],
  itc: ["ITC Eligibility", "Eligible For ITC"],
} as const;
const REQUIRED: (keyof typeof COLUMNS)[] = ["number", "date", "party", "taxable", "rate", "total"];

const [docType, file] = process.argv.slice(2) as [DocType, string];
if (!["invoice", "credit_note", "bill", "vendor_credit"].includes(docType) || !file) {
  console.error("Usage: npm run import:zoho -- <invoice|credit_note|bill|vendor_credit> <file.csv>");
  process.exit(1);
}
const entity = getEntity();
if (!entity) {
  console.error("Run `npm run seed` first.");
  process.exit(1);
}

const raw = fs.readFileSync(file);
const rows: Record<string, string>[] = parse(raw, { columns: true, bom: true, skip_empty_lines: true, trim: true });
const headers = Object.keys(rows[0] ?? {});
const col = Object.fromEntries(
  Object.entries(COLUMNS).map(([field, names]) => [field, names.find((n) => headers.includes(n))]),
) as Record<keyof typeof COLUMNS, string | undefined>;

const missing = REQUIRED.filter((f) => !col[f]);
if (missing.length) {
  console.error(`Missing column(s): ${missing.map((f) => `${f} (one of: ${COLUMNS[f].join(" | ")})`).join("; ")}`);
  console.error(`Found: ${headers.join(", ")}`);
  process.exit(1);
}
const get = (row: Record<string, string>, field: keyof typeof COLUMNS) => (col[field] ? (row[col[field]!] ?? "") : "");

/** Zoho exports ISO dates by default; DD/MM/YYYY and DD-MM-YYYY are accepted too. */
function isoDate(v: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  throw new Error(`Unrecognised date "${v}"`);
}

type Line = { description: string; hsn: string; qty: number | null; rateBp: number; taxable: number;
              igst: number; cgst: number; sgst: number; itc: number };
type Doc = { number: string; date: string; party: string; gstin: string | null; pos: string | null;
             supply: "intra" | "inter" | "export" | "sez"; reverse: number; status: "final" | "void";
             statedTotal: number; lines: Line[] };

const docs = new Map<string, Doc>();
const problems: string[] = [];
let skippedDrafts = 0;

for (const row of rows) {
  const number = get(row, "number");
  const status = get(row, "status").toLowerCase();
  if (!number) continue;
  if (status === "draft") { skippedDrafts++; continue; }

  try {
    const party = get(row, "party");
    const key = `${number}|${party}`;
    let doc = docs.get(key);
    if (!doc) {
      const gstin = get(row, "gstin").toUpperCase() || null;
      const treatment = get(row, "treatment").toLowerCase();
      const isSale = SALES.includes(docType);
      // Sales: place of supply decides the tax. Purchases: the supplier's state does.
      const otherState = isSale
        ? stateCode(get(row, "pos"))
        : (gstin?.slice(0, 2) ?? stateCode(get(row, "source")));
      const supply = treatment.includes("overseas") ? "export"
        : treatment.includes("sez") ? "sez"
        : otherState && otherState !== entity.state_code ? "inter" : "intra";

      if (gstin && !isGstin(gstin)) problems.push(`${number}: GSTIN "${gstin}" is not a valid format`);
      if (isSale && supply !== "export" && !otherState) problems.push(`${number}: no place of supply; treated as intra-state`);

      doc = {
        number, party, gstin, supply,
        date: isoDate(get(row, "date")),
        pos: supply === "export" ? "96" : (isSale ? otherState : entity.state_code),
        reverse: /^(true|yes|1)$/i.test(get(row, "reverse")) ? 1 : 0,
        status: status === "void" ? "void" : "final",
        statedTotal: toPaise(get(row, "total")),
        lines: [],
      };
      docs.set(key, doc);
    }

    const taxable = toPaise(get(row, "taxable"));
    const rateBp = Math.round(Number(get(row, "rate") || "0") * 100);
    const tax = Math.round((taxable * rateBp) / 10_000);
    const split = doc.supply === "intra";
    const half = Math.round(tax / 2);
    const itcText = get(row, "itc").toLowerCase();
    doc.lines.push({
      description: get(row, "item"),
      hsn: get(row, "hsn"),
      qty: get(row, "qty") ? Number(get(row, "qty")) : null,
      rateBp, taxable,
      igst: split ? 0 : tax,
      cgst: split ? half : 0,
      sgst: split ? tax - half : 0,
      itc: itcText.includes("ineligible") || itcText === "false" || itcText === "no" ? 0 : 1,
    });
    if (SALES.includes(docType) && rateBp > 0 && !get(row, "hsn")) problems.push(`${number}: line without HSN/SAC`);
  } catch (err) {
    problems.push(`${number}: ${(err as Error).message}`);
  }
}

// Cross-check: our recomputed tax must reproduce Zoho's document total (±₹1 per line for rounding).
for (const d of docs.values()) {
  if (d.reverse) continue; // under reverse charge the supplier's total excludes the tax
  const computed = d.lines.reduce((s, l) => s + l.taxable + l.igst + l.cgst + l.sgst, 0);
  if (Math.abs(computed - d.statedTotal) > 100 * d.lines.length) {
    problems.push(`${d.number}: Zoho total ₹${d.statedTotal / 100} but lines add up to ₹${computed / 100} — check discounts, TDS, cess or rounding`);
  }
}

const conn = db();
const run = conn.transaction(() => {
  const runId = conn
    .prepare("INSERT INTO import_runs (source, file_name, file_sha256, rows_read, docs_upserted, errors_json) VALUES ('zoho_csv',?,?,?,?,?)")
    .run(path.basename(file), crypto.createHash("sha256").update(raw).digest("hex"), rows.length, docs.size, JSON.stringify(problems))
    .lastInsertRowid;

  const del = conn.prepare("DELETE FROM documents WHERE doc_type = ? AND number = ? AND party_name = ?");
  const insDoc = conn.prepare(
    `INSERT INTO documents (doc_type, number, doc_date, period, party_name, party_gstin, place_of_supply, supply_type,
                            reverse_charge, status, taxable_paise, igst_paise, cgst_paise, sgst_paise, total_paise, import_run_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insLine = conn.prepare(
    `INSERT INTO document_lines (document_id, line_no, description, hsn_sac, quantity, rate_bp, taxable_paise,
                                 igst_paise, cgst_paise, sgst_paise, itc_eligible) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);

  for (const d of docs.values()) {
    const s = (k: "taxable" | "igst" | "cgst" | "sgst") => d.lines.reduce((t, l) => t + l[k], 0);
    del.run(docType, d.number, d.party);
    const id = insDoc.run(docType, d.number, d.date, d.date.slice(0, 7), d.party, d.gstin, d.pos, d.supply, d.reverse,
      d.status, s("taxable"), s("igst"), s("cgst"), s("sgst"), d.statedTotal, runId).lastInsertRowid;
    d.lines.forEach((l, i) =>
      insLine.run(id, i + 1, l.description, l.hsn, l.qty, l.rateBp, l.taxable, l.igst, l.cgst, l.sgst, l.itc));
  }
  return runId;
});
const runId = run();
audit("import.completed", "import_runs", Number(runId), { docType, file: path.basename(file), documents: docs.size, problems: problems.length });

console.log(`${docs.size} ${docType} document(s) imported from ${rows.length} rows${skippedDrafts ? `, ${skippedDrafts} draft row(s) skipped` : ""}.`);
if (problems.length) {
  console.log(`\n${problems.length} thing(s) to check:`);
  for (const p of problems) console.log(`  - ${p}`);
}
