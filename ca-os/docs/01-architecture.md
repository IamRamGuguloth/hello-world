# 1. System architecture

## What this system is, and where it stops

A local application that holds your books, computes what you owe, tracks every statutory date, produces the files the portals accept, and walks you through each manual upload. It never logs in to a government portal.

Three things it cannot replace. Plan for them rather than discovering them in October:

| Requirement | Why software cannot do it |
|---|---|
| **LLP audit** (Form 8 accounts) when turnover exceeds ₹40 lakh or partner contribution exceeds ₹25 lakh | The LLP Rules require a practising CA to audit the accounts. |
| **Tax audit** when turnover crosses the Income-tax Act threshold | The audit report can only be uploaded from a CA's login. |
| **CA certificates** (e.g. Form 15CB for some foreign remittances, net-worth certificates) | Statutory certification. |

If Streamline Studios is above the ₹40 lakh line you still need a CA once a year for the audit signature. The system then turns that from a retainer into a single, well-prepared engagement: you hand over complete books, filed returns and a complete vault.

## Components

```
┌───────────────────────────────────────────────────────────────────────┐
│  YOUR MACHINE                                                         │
│                                                                       │
│  ┌──────────────────────────┐        ┌─────────────────────────────┐  │
│  │ TypeScript core          │        │ Python knowledge service    │  │
│  │ (Next.js app + scripts)  │        │ (CLI jobs + 127.0.0.1 API)  │  │
│  │                          │        │                             │  │
│  │ · enter invoices & bills │  HTTP  │ · poll feeds, fetch, chunk  │  │
│  │ · print tax invoices     │ ─────► │ · embed, index              │  │
│  │ · validate, lock periods │ /ask   │ · retrieve + answer with    │  │
│  │ · GST computation        │        │   citations                 │  │
│  │ · 2B reconciliation      │        │ · flag rule changes         │  │
│  │ · GSTR-1 JSON builder    │        │                             │  │
│  │ · deadline rule engine   │        │                             │  │
│  │ · dashboard, guided steps│        │                             │  │
│  └────────────┬─────────────┘        └──────────────┬──────────────┘  │
│               │      read / write                   │ writes kb_*     │
│               ▼                                     ▼ only            │
│        ┌─────────────────────────────────────────────────┐            │
│        │ SQLite (WAL)  data/ca-os.db  — THE BOOKS        │            │
│        └─────────────────────────────────────────────────┘            │
│        ┌─────────────────────────────────────────────────┐            │
│        │ Vault  data/vault/  (files; indexed in SQLite)  │            │
│        └─────────────────────────────────────────────────┘            │
└───────────────────────────────┬───────────────────────────────────────┘
                                │  you, by hand
        JSON / worksheet up     ▼     GSTR-2B JSON, ARNs, challans,
                                      bank statements down
   ┌──────────────┬───────────────────────┬──────────────┬────────┐
   │ gst.gov.in   │ incometax.gov.in      │ mca.gov.in   │ bank   │
   │              │ TRACES                │              │        │
   └──────────────┴───────────────────────┴──────────────┴────────┘
```

## Five decisions that shape everything else

**1. This database is the system of record.** There is no accounting package behind it, so the SQLite file *is* your books. Three consequences:
- **Backups are not optional.** Losing `data/` means losing statutory records. Set up the nightly encrypted backup before entering real data.
- **Filed periods are locked.** Once GSTR-1 for a month is marked filed, that month's invoices cannot be edited or voided; purchases lock with GSTR-3B. The books then always agree with what the government holds, and corrections go through a credit note, as the law expects.
- **Every change leaves a trace.** Creating, editing and voiding a document each write to the append-only `audit_log`.

**2. All tax arithmetic is deterministic code in one language.** Import, validation, set-off, reconciliation and payload generation are TypeScript, sharing types with the UI and covered by tests. No LLM is anywhere in the path that produces a number you file.

**3. Python does only what Python is better at.** Scraping, text extraction, embeddings and retrieval. The two halves share the SQLite file and nothing else, with one exception: the dashboard calls `POST 127.0.0.1:8765/ask` for a knowledge-base answer. Python writes only to the `kb_*` tables.

**4. Deadlines are generated when you open the app, not by cron.** A laptop is not a server; a cron job that fires while the lid is shut silently does nothing. `ensureObligations()` runs on each dashboard load and is idempotent. Use the OS scheduler for one job only: a morning notification (`osascript` / `notify-send`) reading the same table.

**5. The knowledge base advises; it never changes a rule.** When a notification moves a due date, the Python job raises a "rule review" item. You read the source, edit the rule in `src/lib/rules.ts`, and stamp `compliance_rules.last_verified`. A changed tax rule is a code change with a commit, not a silent data update.

## How the four requirements map onto this

### GST engine
Detailed in [02-gst-data-flow.md](02-gst-data-flow.md).

- **Entry.** Sales invoices, credit notes, purchase bills and vendor credits are entered in the app (`/documents`). The form works out intra-state versus inter-state, splits the tax, suggests the next invoice number and remembers each customer and vendor. A saved invoice has a print view that serves as the tax invoice you send.
- **Backfill.** `npm run import:csv` loads history from a spreadsheet saved as CSV, through exactly the same validation as the form.

### Bookkeeping beyond GST — the part still to build
GST needs only invoices and bills. Income tax, Form 8 and TDS need full accounts: the LLP Act requires books on the double-entry system, and ITR-5 asks for a profit and loss account and balance sheet. With no accounting package, that has to live here too. It is the largest remaining piece and comes right after the GST flow:
1. **Chart of accounts and journal** — a `ledger_accounts` table and a balanced `journal_entries` / `journal_lines` pair. Every invoice and bill posts a journal entry automatically (debtors / sales / output GST; expense / input GST / creditors).
2. **Bank statement import** — CSV from your bank, each line matched to an invoice receipt, a bill payment, or categorised to an expense account. This is where salaries, rent, partner drawings and bank charges enter the books.
3. **Reports** — trial balance, P&L, balance sheet, debtors and creditors ageing.
4. **TDS register** — tax deducted on each vendor payment, feeding the quarterly statement.

Until this exists, keep your current manual records for everything that is not a GST document.

### Compliance calendar
`src/lib/rules.ts` holds one rule per statutory obligation as code; `obligations` holds one row per rule per period. Covered today: GSTR-1, GSTR-3B, PMT-06 (QRMP), GSTR-9, TDS deposit, TDS statements, Form 16A, advance tax, tax audit, ITR-5, LLP Form 11, Form 8 and DIR-3 KYC. Not covered, add if they apply to you: professional tax (state-specific), PF/ESI, the LUT renewal for exports (each March), and Form 3 / Form 4 event filings when the LLP agreement or partners change.

### Knowledge base (RAG)

```
kb_sources ──poll──► fetch ──► extract text ──► chunk ──► embed ──► kb_chunks (+ FTS5)
   (daily CLI job)     │ dedupe by content_sha256
                       └─► new doc mentions a tracked form or section? ──► "rule review" item

/ask:  question ──► hybrid search (FTS5 keyword + vector) ──► filter superseded ──►
       rerank by source tier and recency ──► LLM answers ONLY from retrieved chunks ──►
       answer + citations (title, date, URL) ──► shown in dashboard
```

- **Sources are tiered.** Tier 1: law, notifications and circulars (CBIC, CBDT, MCA, e-Gazette). Tier 2: official advisories and FAQs (GST portal news, GSTN advisories, PIB releases). Tier 3: commentary such as ClearTax. Tier 3 helps you find and understand a change; an answer is only trusted when a tier 1 or 2 chunk supports it, and the UI shows which tier each citation is.
- **Check before you scrape.** Not every official site publishes RSS, and commercial sites have terms of use. Prefer official listing pages fetched politely once a day; for anything without a feed, drop the PDF into `data/vault/kb-inbox/` and let the job ingest it (`kind = 'manual_pdf'`).
- **Dates are first-class.** Each document stores `published_on`, `effective_from` and `superseded_by`. Tax questions are almost always "as of when?", so the prompt carries today's date and the financial year, and retrieval prefers the newest non-superseded tier 1 document.
- **Stack.** `feedparser` + `httpx` + `trafilatura` / `pypdf` for ingestion; embeddings stored in SQLite (`sqlite-vec`) beside an FTS5 index, so there is no separate vector database; FastAPI bound to `127.0.0.1` for `/ask`. With a hosted LLM, only your question and public tax text leave the machine — never ledger data.
- **Refuse rather than guess.** If nothing relevant is retrieved, the answer is "not in the knowledge base", with the search terms used.

### Document vault and audit trail

```
data/
├── ca-os.db
└── vault/
    ├── identity/            PAN, TAN allotment, GST registration certificate
    ├── incorporation/       LLP agreement, certificate of incorporation, Form 3 / Form 4
    ├── dsc/                 public certificate (.cer) and token details only
    ├── gst/2026-27/2026-10/ gstr1.json, gstr1-filed.pdf, gstr2b.json, gstr3b-filed.pdf, challan.pdf
    ├── tds/2026-27/Q2/      statement, FVU, acknowledgement, Form 16A set
    ├── income-tax/2025-26/  ITR-5, computation, ITR-V, advance tax challans
    ├── mca/2025-26/         Form 8, Form 11, SRN receipts
    ├── notices/             anything received from a department, with your reply
    └── kb-inbox/            PDFs for the knowledge base
```

- **A DSC cannot be "stored".** The private key lives on the USB token and is not exportable. The vault records which token, whose signature, the public certificate and `expires_on`, so the calendar can warn you 30 days before it lapses — an expired DSC on 29 October is how Form 8 gets filed late.
- **Index.** `vault_documents` stores each file's SHA-256 and links it to the `obligations` row it evidences. Filed returns are made read-only on disk; a mismatch between the stored hash and the file means it was altered.
- **Audit trail.** `audit_log` is append-only, enforced by triggers. Every import, filing and manual override writes a row.
- **Security.** Put `data/` on an encrypted volume (FileVault / LUKS, or a dedicated encrypted disk image you mount to work). `data/` is git-ignored: code goes to GitHub, records never do.
- **Backup.** Nightly encrypted backup (`restic` or similar) of `data/` to a second disk and one off-site location. Test a restore once a quarter.
- **Retention.** Keep everything for at least eight years; GST, income-tax and LLP record-keeping periods all fall within that.

## Build order

| Step | Outcome |
|---|---|
| **1 (this weekend)** | Schema, invoice and bill entry, tax invoice print view, liability computation, compliance calendar, dashboard. Built — see [03-step-1-plan.md](03-step-1-plan.md). |
| 2 | GSTR-2B JSON import and reconciliation. GSTR-1 JSON builder. Guided filing checklists. |
| 3 | Double-entry ledger, bank statement import, P&L and balance sheet. |
| 4 | Vault UI: drop a file on an obligation, hash it, link it. DSC and LUT expiry in the calendar. |
| 5 | TDS register, advance-tax estimator, year-end pack for Form 8 / ITR-5. |
| 6 | Python knowledge service and the ask box. |
