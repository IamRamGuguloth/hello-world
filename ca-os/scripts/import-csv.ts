// Backfill documents from a spreadsheet saved as CSV — for history you kept
// by hand before using the app. Day to day, enter documents in the app.
//
//   npm run import:csv -- invoice       samples/invoices.csv
//   npm run import:csv -- bill          samples/bills.csv
//   (also: credit_note, vendor_credit)
//
// One row per line item; rows sharing a number (and party) form one document.
// Columns: number, date, party, party_type, gstin, state, place_of_supply,
//          description, hsn_sac, quantity, amount, gst_rate, reverse_charge, itc_eligible
//   party_type      registered | unregistered | overseas | sez   (default: registered if gstin is given)
//   amount          taxable value of the line, before GST
//   gst_rate        percent, e.g. 18
//   state           needed only when there is no GSTIN
// Importing a number that already exists replaces that document.

import { parse } from "csv-parse/sync";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { audit, db } from "../src/lib/db";
import { saveDocument, ValidationError, type DocInput, type DocType, type PartyKind } from "../src/lib/documents";
import { toPaise } from "../src/lib/money";
import { stateCode } from "../src/lib/states";

const [docType, file] = process.argv.slice(2) as [DocType, string];
if (!["invoice", "credit_note", "bill", "vendor_credit"].includes(docType) || !file) {
  console.error("Usage: npm run import:csv -- <invoice|credit_note|bill|vendor_credit> <file.csv>");
  process.exit(1);
}

const raw = fs.readFileSync(file);
const rows: Record<string, string>[] = parse(raw, {
  columns: (h: string[]) => h.map((c) => c.trim().toLowerCase().replace(/[^a-z]+/g, "_")),
  bom: true, skip_empty_lines: true, trim: true,
});
const required = ["number", "date", "party", "description", "amount", "gst_rate"];
const missing = required.filter((c) => !(c in (rows[0] ?? {})));
if (missing.length) {
  console.error(`Missing column(s): ${missing.join(", ")}. Found: ${Object.keys(rows[0] ?? {}).join(", ")}`);
  process.exit(1);
}

/** ISO, DD/MM/YYYY or DD-MM-YYYY. */
function isoDate(v: string): string {
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : v.slice(0, 10);
}
const yes = (v: string | undefined) => /^(true|yes|y|1)$/i.test(v ?? "");
const no = (v: string | undefined) => /^(false|no|n|0)$/i.test(v ?? "");

const docs = new Map<string, DocInput>();
const problems: string[] = [];
for (const r of rows) {
  if (!r.number) continue;
  try {
    const key = `${r.number}|${r.party}`;
    let doc = docs.get(key);
    if (!doc) {
      const existing = db()
        .prepare("SELECT id FROM documents WHERE doc_type = ? AND number = ? AND party_name = ?")
        .get(docType, r.number, r.party) as { id: number } | undefined;
      doc = {
        id: existing?.id, doc_type: docType, number: r.number, doc_date: isoDate(r.date), party_name: r.party,
        party_kind: ((r.party_type || "").toLowerCase() || (r.gstin ? "registered" : "unregistered")) as PartyKind,
        party_gstin: r.gstin || null, party_state: stateCode(r.state), party_address: null,
        place_of_supply: stateCode(r.place_of_supply), reverse_charge: yes(r.reverse_charge), notes: null, lines: [],
      };
      docs.set(key, doc);
    }
    doc.lines.push({
      description: r.description, hsn_sac: r.hsn_sac ?? "", quantity: r.quantity ? Number(r.quantity) : null,
      rate_bp: Math.round(Number(r.gst_rate || "0") * 100), taxable_paise: toPaise(r.amount),
      itc_eligible: !no(r.itc_eligible),
    });
  } catch (err) {
    problems.push(`${r.number}: ${(err as Error).message}`);
  }
}

const runId = Number(
  db().prepare("INSERT INTO import_runs (source, file_name, file_sha256, rows_read) VALUES ('csv',?,?,?)")
    .run(path.basename(file), crypto.createHash("sha256").update(raw).digest("hex"), rows.length).lastInsertRowid,
);
let saved = 0;
for (const doc of docs.values()) {
  try {
    saveDocument({ ...doc, import_run_id: runId });
    saved++;
  } catch (err) {
    if (!(err instanceof ValidationError)) throw err;
    problems.push(`${doc.number}: ${err.problems.join(" ")}`);
  }
}
db().prepare("UPDATE import_runs SET docs_upserted = ?, errors_json = ? WHERE id = ?").run(saved, JSON.stringify(problems), runId);
audit("import.completed", "import_runs", runId, { docType, file: path.basename(file), saved, problems: problems.length });

console.log(`${saved} of ${docs.size} ${docType} document(s) saved from ${rows.length} rows.`);
if (problems.length) {
  console.log(`\n${problems.length} not saved — fix and import again:`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exitCode = 1;
}
