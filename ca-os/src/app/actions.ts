"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, db } from "@/lib/db";
import { todayIST } from "@/lib/dates";
import { saveDocument, ValidationError, voidDocument } from "@/lib/documents";
import { toPaise } from "@/lib/money";

/** Close an obligation as filed (with its acknowledgement number) or as not applicable. */
export async function closeObligation(formData: FormData) {
  const id = Number(formData.get("id"));
  const status = formData.get("intent") === "not_applicable" ? "not_applicable" : "filed";
  const ackNo = String(formData.get("ack_no") ?? "").trim() || null;
  const filedOn = String(formData.get("filed_on") ?? "") || todayIST();
  const amountText = String(formData.get("amount") ?? "").trim();
  const amount = amountText ? toPaise(amountText) : null;

  const result = db()
    .prepare(
      `UPDATE obligations SET status = ?, filed_on = ?, ack_no = ?, amount_paise = ?
       WHERE id = ? AND status = 'pending'`,
    )
    .run(status, status === "filed" ? filedOn : null, ackNo, amount, id);
  if (result.changes) audit(`obligation.${status}`, "obligations", id, { filedOn, ackNo, amount });
  revalidatePath("/");
}

/** Record the electronic credit ledger balance carried into a GST period. */
export async function setOpeningCredit(formData: FormData) {
  const period = String(formData.get("period"));
  if (!/^\d{4}-\d{2}$/.test(period)) throw new Error("Bad period");
  const paise = (name: string) => toPaise(String(formData.get(name) ?? "") || "0");
  const values = { igst: paise("igst"), cgst: paise("cgst"), sgst: paise("sgst") };

  db()
    .prepare(
      `INSERT INTO gst_periods (period, opening_itc_igst, opening_itc_cgst, opening_itc_sgst)
       VALUES (@period, @igst, @cgst, @sgst)
       ON CONFLICT (period) DO UPDATE SET opening_itc_igst = excluded.opening_itc_igst,
         opening_itc_cgst = excluded.opening_itc_cgst, opening_itc_sgst = excluded.opening_itc_sgst`,
    )
    .run({ period, ...values });
  audit("gst_period.opening_credit_set", "gst_periods", period, values);
  revalidatePath("/");
}

/** Create or edit a sales or purchase document from the entry form. */
export async function saveDocumentAction(_prev: { problems: string[] }, formData: FormData): Promise<{ problems: string[] }> {
  let id: number;
  try {
    const v = JSON.parse(String(formData.get("payload")));
    id = saveDocument({
      id: v.id, doc_type: v.doc_type, number: v.number, doc_date: v.doc_date, party_name: v.party_name,
      party_kind: v.party_kind, party_gstin: v.party_gstin || null, party_state: v.party_state || null,
      party_address: v.party_address || null, place_of_supply: v.place_of_supply || null,
      reverse_charge: !!v.reverse_charge, notes: v.notes || null,
      lines: (v.lines as Record<string, string | boolean>[]).map((l) => ({
        description: String(l.description), hsn_sac: String(l.hsn_sac ?? ""),
        quantity: l.quantity ? Number(l.quantity) : null,
        rate_bp: Math.round(Number(l.rate || 0) * 100), taxable_paise: toPaise(String(l.amount || "0")),
        itc_eligible: l.itc_eligible !== false,
      })),
    });
  } catch (err) {
    if (err instanceof ValidationError) return { problems: err.problems };
    return { problems: [(err as Error).message] };
  }
  revalidatePath("/");
  redirect(`/documents/${id}`);
}

export async function voidDocumentAction(formData: FormData) {
  const id = Number(formData.get("id"));
  voidDocument(id);
  revalidatePath("/");
  redirect(`/documents/${id}`);
}
