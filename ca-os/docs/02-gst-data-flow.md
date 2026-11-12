# 2. GST data flow: from an invoice to a filed GSTR-3B

Monthly filer shown. Under QRMP the same steps run once a quarter, with a PMT-06 payment in the first two months.

Portal behaviour described here (the Invoice Management System, auto-populated GSTR-3B figures, JSON field names) changes several times a year. Treat it as the shape of the process and confirm details on the portal.

## Timeline for one month (October, filed in November)

| When | Step | Where |
|---|---|---|
| All month | 0. Raise invoices, record bills | Zoho Books |
| 1st–5th | 1. Import · 2. Validate · 3. Classify | CA OS |
| by 11th | 4. Generate GSTR-1 JSON, upload, file | CA OS → GST portal |
| by 13th | 5. Review inward invoices in IMS | GST portal |
| 14th | 6. Download GSTR-2B, reconcile | GST portal → CA OS |
| 15th–19th | 7. Decide ITC · 8. Build the 3B worksheet | CA OS |
| by 20th | 9. Pay, file GSTR-3B | GST portal |
| same day | 10. Record ARN, vault the evidence, roll credit forward | CA OS |

## Step by step

**0. Invoice in Zoho.** Tax correctness is decided here, not at filing. Every sales invoice needs: customer GSTIN (or deliberately none), place of supply, HSN/SAC on each line, the right rate, and an unbroken number series.

**1. Import.** `npm run import:zoho` (CSV now, API in Step 2) writes `documents` and `document_lines` and an `import_runs` row with the file's hash. Drafts are skipped, void documents kept as void. Re-importing replaces a document, so Zoho remains the only place edits happen.

**2. Validate.** Nothing proceeds while a blocking check fails.

| Check | Blocks filing? |
|---|---|
| GSTIN format and checksum | Yes |
| Place of supply present; intra/inter split consistent with it | Yes |
| Tax recomputed from taxable value × rate equals Zoho's total | Yes |
| HSN/SAC present with the digit count your turnover requires | Yes |
| Document date falls in the period | Yes |
| Duplicate numbers; gaps in the invoice series (needed for the documents-issued table) | Review |
| Credit note points to an original invoice | Yes |
| Export invoice: LUT on file for the year, or IGST charged | Yes |
| Bill from a registered vendor with no GSTIN captured | Review (ITC lost otherwise) |

The first three are implemented in the importer today; the rest are Step 2.

**3. Classify outward supplies into GSTR-1 tables.**

| Document | Table | JSON key |
|---|---|---|
| Invoice to a registered customer | 4A | `b2b` |
| Inter-state invoice to an unregistered customer above ₹1 lakh | 5 | `b2cl` |
| All other unregistered sales, summed by place of supply and rate | 7 | `b2cs` |
| Export / SEZ | 6A / 6B | `exp` / `b2b` (SEZ type) |
| Credit or debit note, registered / unregistered | 9B | `cdnr` / `cdnur` |
| HSN summary, split B2B and B2C | 12 | `hsn` |
| Documents issued: series from, to, total, cancelled | 13 | `doc_issue` |
| Advances received for services not yet invoiced | 11A | `at` |

**4. Generate, upload and file GSTR-1.** The builder writes `data/vault/gst/2026-27/2026-10/gstr1.json`:

```json
{
  "gstin": "29ABCDE1234F1Z5",
  "fp": "102026",
  "b2b": [{
    "ctin": "29AABCA1234F1Z5",
    "inv": [{
      "inum": "INV-0101", "idt": "05-10-2026", "val": 295000.00,
      "pos": "29", "rchrg": "N", "inv_typ": "R",
      "itms": [{ "num": 1, "itm_det": { "txval": 250000.00, "rt": 18, "camt": 22500.00, "samt": 22500.00, "iamt": 0, "csamt": 0 } }]
    }]
  }],
  "exp": [], "b2cs": [], "cdnr": [],
  "hsn": { "hsn_b2b": [], "hsn_b2c": [] },
  "doc_issue": { "doc_det": [] }
}
```

Guided steps the dashboard will show:
1. Open the JSON in GSTN's **offline tool** first. It applies the portal's own schema checks without touching your live return. Build the generator against the current tool version; do not trust the sketch above for field names.
2. Portal → Returns → October → GSTR-1 → *Prepare offline* → upload. Wait for "Processed"; download the error report if there is one.
3. Compare the portal's summary to the dashboard's totals. They must agree to the rupee.
4. File with DSC. An LLP must sign GST returns with a digital signature; EVC is not available to it.
5. Record the ARN; save the filed PDF to the vault.

A mistake found after filing but before GSTR-3B is corrected through **GSTR-1A** for the same period.

**5. Review inward invoices (IMS).** Suppliers' invoices appear in the Invoice Management System as they file. Accept what is yours, reject what is not, leave the doubtful pending. Anything untouched is treated as accepted when GSTR-2B is drawn up.

**6. Download GSTR-2B and reconcile.** On the 14th: Returns → GSTR-2B → download JSON → import into `gstr2b_lines`. Matching key: supplier GSTIN + invoice number normalised (upper-cased, punctuation and leading zeros stripped), with the date and amounts as tie-breakers.

| Result | Meaning | Action |
|---|---|---|
| `matched` | In books and in 2B, tax equal within ₹1 | Claim |
| `amount_mismatch` | Both sides, tax differs | Claim the lower; ask the vendor to amend |
| in books, not in 2B | Vendor has not filed | **Do not claim.** Chase the vendor; it rolls into the month it appears |
| `not_in_books` | In 2B only | A bill you forgot to enter (add in Zoho, re-import) or not yours (reject in IMS) |

This table *is* the ITC mismatch check. The dashboard's "Input credit (books)" row is provisional until this step replaces it with the reconciled figure.

**7. Decide ITC.** Claimable ITC = matched lines, less blocked credits (section 17(5): food, personal vehicles, and so on — `document_lines.itc_eligible = 0`), less reversals (for example, a vendor unpaid beyond 180 days). Unclaimed-but-valid credit stays available until 30 November after the financial year ends; the system carries it and warns before it lapses.

**8. Build the GSTR-3B worksheet.** The portal pre-fills GSTR-3B from your GSTR-1 and GSTR-2B, and the outward-supply figures are not meant to be edited there. So the worksheet is a comparison sheet: each row shows *your* number beside a box for the *portal's* number.

| 3B table | Source |
|---|---|
| 3.1(a) Outward taxable supplies | Invoices − credit notes, domestic taxable |
| 3.1(b) Zero-rated | Exports and SEZ |
| 3.1(c) Nil-rated, exempt | 0% domestic lines |
| 3.1(d) Inward supplies under reverse charge | Reverse-charge bills |
| 3.2 Inter-state supplies to unregistered persons | B2C inter-state, by place of supply |
| 4(A)(5) All other ITC | Step 7 claimable figure |
| 4(B) Reversals · 4(D) Ineligible | Step 7 reversals and blocked credits |
| 6.1 Payment of tax | Step 9 |

If a pre-filled figure differs from yours, stop. Either the import is stale or GSTR-1 was wrong; fix the cause (re-import, or GSTR-1A) rather than typing over it.

**9. Set-off, pay, file.** `setOff()` applies opening credit plus this month's ITC in the statutory order (IGST credit first and fully; CGST and SGST credit never against each other) and returns cash due per head. Reverse-charge tax is always paid in cash. Then: create the challan on the portal for exactly those amounts → pay → confirm the Electronic Cash Ledger shows the balance → offset liability → file GSTR-3B with DSC → note the ARN.

**10. Close the period.** Mark the obligation filed with ARN and amount, drop the filed PDF and challan into the vault, and write the closing credit as next month's opening. Check it against the portal's Electronic Credit Ledger; a difference is the first sign of an error somewhere above.

## Controls that keep this safe without a CA reviewing it

- **Three-way agreement** every month: Zoho's GST summary = CA OS = portal summary. Any two disagreeing blocks filing.
- **Ledger tie-out** every month: computed closing credit = portal credit ledger.
- **Turnover tie-out** every quarter: cumulative GSTR-1 turnover = Zoho sales ledger.
- **Parallel run** for the first two or three months: prepare everything here, and have your current CA file as usual. Switch over when your numbers and theirs match without explanation.
