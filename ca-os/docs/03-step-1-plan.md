# 3. Step 1: the Tax Liability & Deadline Dashboard

This step is built and working in this folder. The plan below is how to make it yours over a weekend.

## What exists

| Piece | File |
|---|---|
| Full schema (18 tables: identity, books mirror, GST, calendar, vault, audit log, knowledge base) | `db/schema.sql` |
| Connection, schema bootstrap, audit helper | `src/lib/db.ts` |
| Deadline rules for an LLP and the idempotent generator | `src/lib/rules.ts` |
| Liability computation and statutory ITC set-off | `src/lib/gst.ts` |
| IST-safe date helpers, paise helpers, state codes | `src/lib/dates.ts`, `money.ts`, `states.ts` |
| Zoho Books CSV importer with validation | `scripts/import-zoho-csv.ts` |
| Entity setup and calendar generation | `scripts/seed.ts`, `entity.config.json` |
| Dashboard page | `src/app/page.tsx` |
| Components | `src/components/NextAction.tsx`, `LiabilityPanel.tsx`, `DeadlineList.tsx` |
| Server actions: mark filed / not applicable, set opening credit | `src/app/actions.ts` |
| Tests for due dates and set-off | `tests/core.test.ts` |

### Schema at a glance

```
entity ─────────────── one row: who you are, monthly vs QRMP, audit flags
import_runs ─┬──────── every import, with file hash and problems found
documents ───┤──────── invoices, credit notes, bills, vendor credits (mirror of Zoho)
document_lines ─────── per-line HSN, rate, tax heads, ITC eligibility
gst_periods ────────── opening credit, ARNs, cash paid, per month
gstr2b_lines ───────── portal's view of your purchases (Step 2)
compliance_rules ───── rule metadata + source URL + last_verified
obligations ────────── one row per rule per period: due date, status, ack no.
vault_documents ────── file index with SHA-256, linked to obligations
audit_log ──────────── append-only (triggers reject UPDATE and DELETE)
kb_sources / kb_documents / kb_chunks / kb_chunks_fts ── knowledge base (Step 4)
```

Conventions: money is integer paise, rates are basis points, dates are `YYYY-MM-DD` strings on the IST calendar. No floating-point money anywhere.

### The dashboard, top to bottom

1. **Next** — the single most urgent obligation, with where to file and what lateness costs.
2. **GST for the open period** — cash payable as one number, then the working: output tax, opening credit, input credit, credit used, cash per head, credit carried forward.
3. **Deadlines, next 90 days** — one line each. Expanding a line shows the form, portal and penalty, and the form to close it with an ARN/SRN.

One typeface, one accent colour used only for overdue or due within seven days, no navigation, no charts.

## Run it

```bash
cd ca-os
npm install
npm run seed
npm run import:zoho -- invoice samples/invoices-2026-10.csv
npm run import:zoho -- bill    samples/bills-2026-10.csv
npm run dev            # http://localhost:3000
npm test
```

The sample data should show ₹77,400 payable for October 2026. Delete `data/` to start clean.

## Weekend checklist

**Saturday — your data in**
1. Fill in `entity.config.json`. `state_code` is a placeholder (`29`, Karnataka): set your own, because it decides CGST/SGST versus IGST on every document. Set `gst_filing_frequency` and `tax_audit_applicable` truthfully. Delete `data/` and run `npm run seed`.
2. In Zoho Books, export Invoices, Credit Notes, Bills and Vendor Credits for **last month** as CSV and import each. If the importer reports a missing column it lists the headings it found; add yours to `COLUMNS` in `scripts/import-zoho-csv.ts`. The sample files use the headings I expect from Zoho, which I could not check against a live export.
3. Open the dashboard, expand *Set opening credit*, and enter the Electronic Credit Ledger balance from the GST portal as at the start of that month.
4. **Acceptance test:** compare the dashboard with the GSTR-3B your CA actually filed for that month. Output tax per head and cash paid must match. Every difference is either an importer assumption to fix or something your CA did that you should understand before going solo. Do not move on until it matches.

**Sunday — make it trustworthy**
5. Work through the pending list. Mark anything your CA has already filed as filed, and anything that does not apply (for example GSTR-9 under the turnover exemption) as not applicable.
6. Verify each rule in `src/lib/rules.ts` against its official source, then record it:
   `UPDATE compliance_rules SET last_verified = date('now') WHERE code = 'GSTR3B';`
   The dashboard footer counts the rules still unverified. Three need particular attention because they changed recently: the ITR due date for non-audit businesses, DIR-3 KYC frequency, and TDS form numbers under the Income-tax Act, 2025.
7. Move `data/` onto an encrypted volume (`CA_OS_DATA=/Volumes/CAOS/data npm run dev`) and set up a nightly encrypted backup.

## What Step 1 deliberately leaves out

- ITC is taken from your books, not GSTR-2B, so the payable figure is provisional (and says so).
- Closing credit is not yet rolled into the next period automatically.
- Advances, cess, discounts at document level, and TDS/TCS on invoices are not modelled; the importer flags documents whose totals it cannot reproduce.
- Due dates are the statutory ones. Government extensions and holiday shifts are not picked up until the knowledge service exists.

## Next components, in order

1. `scripts/import-gstr2b.ts` + `src/lib/reconcile.ts` + a `/gst/[period]/reconcile` page: the four-way match table from the data-flow document.
2. `src/lib/gstr1.ts` + a download button: classification and JSON builder, tested against the offline tool.
3. `/gst/[period]` guided checklist: the ten steps as a list that ticks itself from database state.
4. `scripts/sync-zoho.ts`: API sync replacing the CSV export.
5. Vault drop zone on each obligation.
