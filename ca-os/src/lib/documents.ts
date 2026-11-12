// The one place a sales or purchase document is validated, taxed and saved.
// The entry form and the CSV importer both go through saveDocument().

import { audit, db, getEntity } from "./db";
import { fyLabel, fyStartYear } from "./dates";
import { isGstin, STATE_NAMES } from "./states";
import { DOC_LABEL, isSale, lineTax, supplyType, type DocType, type PartyKind, type SupplyType } from "./tax";

export { DOC_LABEL, isSale, lineTax };
export type { DocType, PartyKind, SupplyType };

export type LineInput = {
  description: string;
  hsn_sac: string;
  quantity: number | null;
  rate_bp: number;        // 1800 = 18%
  taxable_paise: number;
  itc_eligible: boolean;  // purchases only
};

export type DocInput = {
  id?: number;            // present when editing
  doc_type: DocType;
  number: string;
  doc_date: string;
  party_name: string;
  party_kind: PartyKind;
  party_gstin: string | null;
  party_state: string | null;
  party_address: string | null;
  place_of_supply: string | null;  // sales only; defaults to the customer's state
  reverse_charge: boolean;         // purchases only
  notes: string | null;
  lines: LineInput[];
  import_run_id?: number;
};

export class ValidationError extends Error {
  constructor(public problems: string[]) {
    super(problems.join(" "));
  }
}

/** 'Q3 2026-27' for '2026-11'. */
function quarterLabel(month: string): string {
  const fy = fyStartYear(`${month}-01`);
  const m = Number(month.slice(5));
  return `Q${Math.floor(((m + 8) % 12) / 3) + 1} ${fyLabel(fy)}`;
}

/**
 * A document is locked once the return that reports it has been filed:
 * GSTR-1 for sales, GSTR-3B for purchases. After that the books must keep
 * agreeing with what the government holds, so changes go through a credit note.
 */
export function isLocked(docType: DocType, month: string): boolean {
  const row = db()
    .prepare(
      `SELECT 1 FROM obligations WHERE rule_code = ? AND status = 'filed' AND period_label IN (?, ?)`,
    )
    .get(isSale(docType) ? "GSTR1" : "GSTR3B", month, quarterLabel(month));
  return !!row;
}

/** Next number in the series: increments the trailing digits of the latest one. */
export function nextNumber(docType: DocType): string {
  if (docType !== "invoice" && docType !== "credit_note") return "";
  const last = db()
    .prepare("SELECT number FROM documents WHERE doc_type = ? ORDER BY id DESC LIMIT 1")
    .get(docType) as { number: string } | undefined;
  const m = last && /^(.*?)(\d+)$/.exec(last.number);
  if (m) return m[1] + String(Number(m[2]) + 1).padStart(m[2].length, "0");
  const prefix = docType === "invoice" ? (getEntity()?.invoice_prefix ?? "INV-") : "CN-";
  return `${prefix}0001`;
}

export function saveDocument(input: DocInput): number {
  const entity = getEntity();
  if (!entity) throw new ValidationError(["Run `npm run seed` first."]);
  const conn = db();
  const sale = isSale(input.doc_type);
  const problems: string[] = [];

  const number = input.number.trim();
  const party = input.party_name.trim();
  const gstin = input.party_gstin?.trim().toUpperCase() || null;
  const month = input.doc_date.slice(0, 7);

  if (!number) problems.push("Number is required.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.doc_date) || Number.isNaN(Date.parse(input.doc_date))) problems.push("Date is not valid.");
  if (!party) problems.push(`${sale ? "Customer" : "Vendor"} name is required.`);
  if (gstin && !isGstin(gstin)) problems.push(`GSTIN "${gstin}" is not a valid format.`);
  if ((input.party_kind === "registered" || input.party_kind === "sez") && !gstin) problems.push("A registered party needs a GSTIN.");
  if (input.party_kind !== "registered" && input.party_kind !== "sez" && gstin) problems.push("Remove the GSTIN or mark the party as registered.");
  if (input.lines.length === 0) problems.push("Add at least one line.");

  // Where the other side is: a GSTIN's first two digits are its state.
  const partyState = input.party_kind === "overseas" ? null : (gstin?.slice(0, 2) ?? input.party_state);
  if (partyState && !STATE_NAMES[partyState]) problems.push(`Unknown state code "${partyState}".`);
  const pos = input.party_kind === "overseas" ? "96" : sale ? (input.place_of_supply || partyState) : entity.state_code;
  if (sale && !pos) problems.push("Place of supply is required.");
  if (!sale && input.party_kind !== "overseas" && !partyState) problems.push("Vendor state is required.");

  const supply: SupplyType = supplyType(sale, input.party_kind, sale ? pos : partyState, entity.state_code);

  input.lines.forEach((l, i) => {
    const n = `Line ${i + 1}:`;
    if (!l.description.trim()) problems.push(`${n} description is required.`);
    if (!(l.taxable_paise > 0)) problems.push(`${n} amount must be more than zero.`);
    if (!(l.rate_bp >= 0 && l.rate_bp <= 5000)) problems.push(`${n} GST rate must be between 0 and 50%.`);
    if (sale && !/^\d{4,8}$/.test(l.hsn_sac.trim())) problems.push(`${n} HSN/SAC must be 4 to 8 digits.`);
  });

  // An invoice number may be used once. A vendor's bill number, once per vendor.
  const clash = conn
    .prepare(`SELECT id FROM documents WHERE doc_type = ? AND number = ? AND id IS NOT ? ${sale ? "" : "AND party_name = ?"}`)
    .get(...[input.doc_type, number, input.id ?? null, ...(sale ? [] : [party])]);
  if (clash) problems.push(`${DOC_LABEL[input.doc_type]} ${number} already exists.`);

  const before = input.id
    ? (conn.prepare("SELECT period, status, total_paise FROM documents WHERE id = ?").get(input.id) as
        | { period: string; status: string; total_paise: number }
        | undefined)
    : undefined;
  if (input.id && !before) problems.push("Document not found.");
  for (const m of new Set([month, before?.period].filter(Boolean) as string[])) {
    if (isLocked(input.doc_type, m)) {
      problems.push(`The GST return for ${m} is filed, so its documents are locked. Record a ${sale ? "credit note" : "vendor credit"} instead.`);
    }
  }
  if (problems.length) throw new ValidationError(problems);

  const lines = input.lines.map((l) => ({ ...l, ...lineTax(l.taxable_paise, l.rate_bp, supply) }));
  const sum = (k: "taxable_paise" | "igst" | "cgst" | "sgst") => lines.reduce((t, l) => t + l[k], 0);
  const tax = sum("igst") + sum("cgst") + sum("sgst");
  // Under reverse charge the supplier's document carries no tax; you pay it to the government.
  const total = sum("taxable_paise") + (input.reverse_charge ? 0 : tax);

  const fields = {
    doc_type: input.doc_type, number, doc_date: input.doc_date, period: month, party_name: party,
    party_gstin: gstin, party_state: partyState, party_address: input.party_address?.trim() || null,
    place_of_supply: pos, supply_type: supply, reverse_charge: !sale && input.reverse_charge ? 1 : 0,
    taxable_paise: sum("taxable_paise"), igst_paise: sum("igst"), cgst_paise: sum("cgst"), sgst_paise: sum("sgst"),
    total_paise: total, notes: input.notes?.trim() || null, import_run_id: input.import_run_id ?? null,
  };

  return conn.transaction(() => {
    let id = input.id;
    if (id) {
      conn.prepare(
        `UPDATE documents SET number=@number, doc_date=@doc_date, period=@period, party_name=@party_name,
           party_gstin=@party_gstin, party_state=@party_state, party_address=@party_address,
           place_of_supply=@place_of_supply, supply_type=@supply_type, reverse_charge=@reverse_charge,
           taxable_paise=@taxable_paise, igst_paise=@igst_paise, cgst_paise=@cgst_paise, sgst_paise=@sgst_paise,
           total_paise=@total_paise, notes=@notes WHERE id=@id`,
      ).run({ ...fields, id });
      conn.prepare("DELETE FROM document_lines WHERE document_id = ?").run(id);
    } else {
      id = Number(
        conn.prepare(
          `INSERT INTO documents (doc_type, number, doc_date, period, party_name, party_gstin, party_state, party_address,
             place_of_supply, supply_type, reverse_charge, taxable_paise, igst_paise, cgst_paise, sgst_paise,
             total_paise, notes, import_run_id)
           VALUES (@doc_type, @number, @doc_date, @period, @party_name, @party_gstin, @party_state, @party_address,
             @place_of_supply, @supply_type, @reverse_charge, @taxable_paise, @igst_paise, @cgst_paise, @sgst_paise,
             @total_paise, @notes, @import_run_id)`,
        ).run(fields).lastInsertRowid,
      );
    }
    const insLine = conn.prepare(
      `INSERT INTO document_lines (document_id, line_no, description, hsn_sac, quantity, rate_bp, taxable_paise,
         igst_paise, cgst_paise, sgst_paise, itc_eligible) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    );
    lines.forEach((l, i) =>
      insLine.run(id, i + 1, l.description.trim(), l.hsn_sac.trim() || null, l.quantity, l.rate_bp, l.taxable_paise,
        l.igst, l.cgst, l.sgst, l.itc_eligible ? 1 : 0));

    conn.prepare(
      `INSERT INTO parties (name, gstin, state_code, address) VALUES (?,?,?,?)
       ON CONFLICT (name) DO UPDATE SET gstin = excluded.gstin, state_code = excluded.state_code,
         address = COALESCE(excluded.address, parties.address)`,
    ).run(party, gstin, partyState, fields.party_address);

    audit(input.id ? "document.edited" : "document.created", "documents", id!, {
      doc_type: input.doc_type, number, total_paise: total, previous_total_paise: before?.total_paise,
    });
    return id!;
  })();
}

export function voidDocument(id: number): void {
  const doc = db().prepare("SELECT doc_type, period, number FROM documents WHERE id = ? AND status = 'final'").get(id) as
    | { doc_type: DocType; period: string; number: string }
    | undefined;
  if (!doc) return;
  if (isLocked(doc.doc_type, doc.period)) throw new ValidationError(["This period's GST return is filed; the document is locked."]);
  db().prepare("UPDATE documents SET status = 'void' WHERE id = ?").run(id);
  audit("document.voided", "documents", id, { number: doc.number });
}

export type DocumentRow = {
  id: number; doc_type: DocType; number: string; doc_date: string; period: string; party_name: string;
  party_gstin: string | null; party_state: string | null; party_address: string | null;
  place_of_supply: string | null; supply_type: SupplyType; reverse_charge: number; status: "final" | "void";
  taxable_paise: number; igst_paise: number; cgst_paise: number; sgst_paise: number; total_paise: number;
  notes: string | null;
};
export type LineRow = {
  line_no: number; description: string; hsn_sac: string | null; quantity: number | null; rate_bp: number;
  taxable_paise: number; igst_paise: number; cgst_paise: number; sgst_paise: number; itc_eligible: number;
};

export function getDocument(id: number): { doc: DocumentRow; lines: LineRow[] } | undefined {
  const doc = db().prepare("SELECT * FROM documents WHERE id = ?").get(id) as DocumentRow | undefined;
  if (!doc) return undefined;
  const lines = db().prepare("SELECT * FROM document_lines WHERE document_id = ? ORDER BY line_no").all(id) as LineRow[];
  return { doc, lines };
}

export function listDocuments(side: "sales" | "purchases", month: string): DocumentRow[] {
  const types = side === "sales" ? ["invoice", "credit_note"] : ["bill", "vendor_credit"];
  return db()
    .prepare("SELECT * FROM documents WHERE doc_type IN (?, ?) AND period = ? ORDER BY doc_date DESC, id DESC")
    .all(...types, month) as DocumentRow[];
}

export type Party = { name: string; gstin: string | null; state_code: string | null; address: string | null };
export const listParties = () => db().prepare("SELECT name, gstin, state_code, address FROM parties ORDER BY name").all() as Party[];
