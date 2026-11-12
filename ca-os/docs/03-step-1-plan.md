# 3. Step 1: books, tax liability and deadlines

This step is built and working in this folder. The plan below is how to make it yours over a weekend.

## What exists

| Piece | File |
|---|---|
| Full schema (19 tables: identity, books, GST, calendar, vault, audit log, knowledge base) | `db/schema.sql` |
| Connection, schema bootstrap, audit helper | `src/lib/db.ts` |
| Save, validate, lock and void documents | `src/lib/documents.ts` |
| Pure GST helpers shared by server and form | `src/lib/tax.ts` |
| Liability computation and statutory ITC set-off | `src/lib/gst.ts` |
| Deadline rules for an LLP and the idempotent generator | `src/lib/rules.ts` |
| IST-safe dates, paise helpers, state codes | `src/lib/dates.ts`, `money.ts`, `states.ts` |
| Dashboard | `src/app/page.tsx` + `NextAction`, `LiabilityPanel`, `DeadlineList` |
| Sales and purchases list, by month | `src/app/documents/page.tsx` |
| Entry form: invoice, credit note, bill, vendor credit | `src/app/documents/new/page.tsx`, `src/components/DocumentForm.tsx` |
| Document view and printable tax invoice | `src/app/documents/[id]/page.tsx` |
| Server actions | `src/app/actions.ts` |
| CSV backfill for history kept in spreadsheets | `scripts/import-csv.ts` |
| Entity setup and calendar generation | `scripts/seed.ts`, `entity.config.json` |
| Tests: due dates, set-off, supply type, line tax | `tests/core.test.ts` |

### Schema at a glance

```
entity ─────────────── one row: who you are, monthly vs QRMP, audit flags, invoice prefix
parties ────────────── customers and vendors, remembered for the entry form
documents ──────────── invoices, credit notes, bills, vendor credits — the books
document_lines ─────── per-line HSN, rate, tax heads, ITC eligibility
import_runs ────────── every CSV backfill, with file hash and problems found
gst_periods ────────── opening credit, ARNs, cash paid, per month
gstr2b_lines ───────── portal's view of your purchases (Step 2)
compliance_rules ───── rule metadata + source URL + last_verified
obligations ────────── one row per rule per period: due date, status, ack no.
vault_documents ────── file index with SHA-256, linked to obligations
audit_log ──────────── append-only (triggers reject UPDATE and DELETE)
kb_sources / kb_documents / kb_chunks / kb_chunks_fts ── knowledge base (later)
```

Conventions: money is integer paise, rates are basis points, dates are `YYYY-MM-DD` strings on the IST calendar. No floating-point money anywhere.

### The screens

- **Dashboard** — the next obligation; GST payable for the open period with its working; deadlines for the next 90 days, each closable with an ARN/SRN.
- **Sales / Purchases** — one month at a time, with totals. New invoice, credit note, bill or vendor credit.
- **Entry form** — picks the tax type from the place of supply, shows the total as you type, and will not save an invoice that GSTR-1 would reject.
- **Document** — the record, with Edit and Void until the month is filed. For sales, *Print / save PDF* produces the tax invoice.

One typeface, one accent colour used only for overdue or due within seven days, no charts.

## Run it

```bash
cd ca-os
npm install
npm run seed
npm run import:csv -- invoice samples/invoices.csv   # optional sample data
npm run import:csv -- bill    samples/bills.csv
npm run dev            # http://localhost:3000
npm test
```

The sample data should show ₹77,400 payable for October 2026. Delete `data/` to start clean.

## Weekend checklist

**Saturday — set up and backfill**
1. Fill in `entity.config.json`: name, address and GSTIN (they print on invoices), and `state_code`. The state code is a placeholder (`29`, Karnataka): set your own, because it decides CGST/SGST versus IGST on every document. Set `invoice_prefix` to match your current series. Delete `data/` and run `npm run seed`.
2. Put `data/` on an encrypted volume (`CA_OS_DATA=/Volumes/CAOS/data npm run dev`) and set up the nightly backup **before** entering anything real. This database is now your books.
3. Backfill the current financial year's invoices and bills. If they are in a spreadsheet, arrange the columns as in `samples/invoices.csv` and import; otherwise enter them by hand, oldest first so invoice numbers continue correctly.
4. On the dashboard, expand *Set opening credit* and enter the Electronic Credit Ledger balance from the GST portal as at the start of the open month.

**Sunday — make it trustworthy**
5. **Acceptance test:** pick the last month for which GSTR-3B was filed and compare the dashboard with that return. Output tax per head and cash paid must match. Each difference is either a document entered wrongly or something in the filed return you should understand before going solo.
6. Mark already-filed obligations as filed (this also locks those months), and mark anything that does not apply — for example GSTR-9 under the turnover exemption — as not applicable.
7. Verify each rule in `src/lib/rules.ts` against its official source, then record it:
   `UPDATE compliance_rules SET last_verified = date('now') WHERE code = 'GSTR3B';`
   Three need particular attention because they changed recently: the ITR due date for non-audit businesses, DIR-3 KYC frequency, and TDS form numbers under the Income-tax Act, 2025.
8. Raise your next real invoice from the app and print it.

## What Step 1 deliberately leaves out

- **Accounts beyond GST documents.** No ledger, bank entries, P&L or balance sheet yet; see "Bookkeeping beyond GST" in the architecture document. Keep your manual records for those until Step 3.
- **Payments.** An invoice is not yet marked paid or unpaid.
- ITC is taken from your books, not GSTR-2B, so the payable figure is provisional (and says so).
- Closing credit is not yet rolled into the next period automatically.
- Advances, cess, discounts, round-off and TDS on invoices are not modelled.
- The invoice print view is plain: no logo, bank details or signature image.
- Due dates are the statutory ones. Extensions and holiday shifts are not picked up.

## Next components, in order

1. `scripts/import-gstr2b.ts` + `src/lib/reconcile.ts` + a reconcile page: the match table from the data-flow document.
2. `src/lib/gstr1.ts` + a download button: classification and JSON builder, tested against the offline tool.
3. A guided checklist per GST period that ticks itself from database state.
4. Ledger: chart of accounts, automatic journal entries from documents, bank statement import, payments.
5. Vault drop zone on each obligation.
