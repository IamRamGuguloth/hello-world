"use server";

import { revalidatePath } from "next/cache";
import { audit, db } from "@/lib/db";
import { todayIST } from "@/lib/dates";
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
