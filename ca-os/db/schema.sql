-- Guided CA Operating System — SQLite schema.
--
-- Conventions
--   * Money is INTEGER paise. Never REAL. ₹1,180.50 is stored as 118050.
--   * Dates are TEXT 'YYYY-MM-DD' (IST calendar dates). Timestamps are ISO-8601 UTC.
--   * GST periods are TEXT 'YYYY-MM'. Financial years are TEXT '2026-27'.
--   * Tax rates are INTEGER basis points: 18% = 1800.
--   * Every statement is idempotent so the file can be re-applied on each start.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ───────────────────────── 1. Identity ─────────────────────────

CREATE TABLE IF NOT EXISTS entity (
  id                    INTEGER PRIMARY KEY CHECK (id = 1),   -- single-tenant by design
  legal_name            TEXT NOT NULL,
  llpin                 TEXT,
  pan                   TEXT,
  tan                   TEXT,
  gstin                 TEXT,
  state_code            TEXT NOT NULL,                        -- 2-digit GST state code, e.g. '36'
  address               TEXT,                                 -- printed on tax invoices
  invoice_prefix        TEXT NOT NULL DEFAULT 'INV-',
  gst_filing_frequency  TEXT NOT NULL DEFAULT 'monthly' CHECK (gst_filing_frequency IN ('monthly','qrmp')),
  tax_audit_applicable  INTEGER NOT NULL DEFAULT 0,           -- moves ITR due date, adds audit report
  deducts_tds           INTEGER NOT NULL DEFAULT 1,
  -- Obligations due before this date are assumed handled by the outgoing CA and are not generated.
  tracking_from         TEXT NOT NULL
);

-- ───────────────────────── 2. Books ─────────────────────────
-- This database IS the system of record. Documents are entered in the app (or
-- backfilled from CSV) and become read-only once the GST return for their
-- period is filed; after that, corrections are made with a credit note.

CREATE TABLE IF NOT EXISTS import_runs (
  id           INTEGER PRIMARY KEY,
  source       TEXT NOT NULL CHECK (source IN ('csv','gstr2b_json')),
  file_name    TEXT,
  file_sha256  TEXT,
  started_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  rows_read    INTEGER NOT NULL DEFAULT 0,
  docs_upserted INTEGER NOT NULL DEFAULT 0,
  errors_json  TEXT NOT NULL DEFAULT '[]'
);

-- Customers and vendors, remembered so a document form can fill itself in.
CREATE TABLE IF NOT EXISTS parties (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  gstin       TEXT,
  state_code  TEXT,
  address     TEXT
);

CREATE TABLE IF NOT EXISTS documents (
  id               INTEGER PRIMARY KEY,
  doc_type         TEXT NOT NULL CHECK (doc_type IN ('invoice','credit_note','bill','vendor_credit')),
  number           TEXT NOT NULL,
  doc_date         TEXT NOT NULL,
  period           TEXT NOT NULL,                             -- 'YYYY-MM' of doc_date
  party_name       TEXT NOT NULL,
  party_gstin      TEXT,                                      -- NULL = unregistered (B2C) / overseas
  party_state      TEXT,                                      -- 2-digit code; snapshot at the time of the document
  party_address    TEXT,
  place_of_supply  TEXT,                                      -- 2-digit state code; '96' = outside India
  supply_type      TEXT NOT NULL CHECK (supply_type IN ('intra','inter','export','sez')),
  reverse_charge   INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'final' CHECK (status IN ('final','void')),
  taxable_paise    INTEGER NOT NULL,
  igst_paise       INTEGER NOT NULL DEFAULT 0,
  cgst_paise       INTEGER NOT NULL DEFAULT 0,
  sgst_paise       INTEGER NOT NULL DEFAULT 0,
  cess_paise       INTEGER NOT NULL DEFAULT 0,
  total_paise      INTEGER NOT NULL,
  notes            TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  import_run_id    INTEGER REFERENCES import_runs(id),         -- NULL = entered by hand
  UNIQUE (doc_type, number, party_name)
);
CREATE INDEX IF NOT EXISTS idx_documents_period ON documents (period, doc_type);

CREATE TABLE IF NOT EXISTS document_lines (
  id             INTEGER PRIMARY KEY,
  document_id    INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  line_no        INTEGER NOT NULL,
  description    TEXT,
  hsn_sac        TEXT,
  quantity       REAL,
  uqc            TEXT,
  rate_bp        INTEGER NOT NULL,                            -- 1800 = 18%
  taxable_paise  INTEGER NOT NULL,
  igst_paise     INTEGER NOT NULL DEFAULT 0,
  cgst_paise     INTEGER NOT NULL DEFAULT 0,
  sgst_paise     INTEGER NOT NULL DEFAULT 0,
  cess_paise     INTEGER NOT NULL DEFAULT 0,
  itc_eligible   INTEGER NOT NULL DEFAULT 1,                  -- purchases only; 0 = blocked u/s 17(5)
  UNIQUE (document_id, line_no)
);

-- ───────────────────────── 3. GST ─────────────────────────

CREATE TABLE IF NOT EXISTS gst_periods (
  period              TEXT PRIMARY KEY,                       -- 'YYYY-MM'
  -- Electronic credit ledger balance carried into this period.
  opening_itc_igst    INTEGER NOT NULL DEFAULT 0,
  opening_itc_cgst    INTEGER NOT NULL DEFAULT 0,
  opening_itc_sgst    INTEGER NOT NULL DEFAULT 0,
  gstr1_filed_on      TEXT,
  gstr1_arn           TEXT,
  gstr3b_filed_on     TEXT,
  gstr3b_arn          TEXT,
  cash_paid_paise     INTEGER
);

-- Step 2: lines from the GSTR-2B JSON downloaded from the portal.
CREATE TABLE IF NOT EXISTS gstr2b_lines (
  id                   INTEGER PRIMARY KEY,
  period               TEXT NOT NULL,                         -- 2B period it appeared in
  supplier_gstin       TEXT NOT NULL,
  supplier_name        TEXT,
  doc_number           TEXT NOT NULL,
  doc_date             TEXT NOT NULL,
  doc_kind             TEXT NOT NULL CHECK (doc_kind IN ('invoice','credit_note','debit_note')),
  taxable_paise        INTEGER NOT NULL,
  igst_paise           INTEGER NOT NULL DEFAULT 0,
  cgst_paise           INTEGER NOT NULL DEFAULT 0,
  sgst_paise           INTEGER NOT NULL DEFAULT 0,
  cess_paise           INTEGER NOT NULL DEFAULT 0,
  itc_available        INTEGER NOT NULL DEFAULT 1,
  match_status         TEXT NOT NULL DEFAULT 'unmatched'
                       CHECK (match_status IN ('unmatched','matched','amount_mismatch','not_in_books')),
  matched_document_id  INTEGER REFERENCES documents(id),
  import_run_id        INTEGER REFERENCES import_runs(id),
  UNIQUE (supplier_gstin, doc_number, doc_kind)
);

-- ───────────────────────── 4. Compliance calendar ─────────────────────────

-- One row per statutory rule. The due-date logic lives in src/lib/rules.ts,
-- keyed by `code`; this row carries the human-facing metadata and its provenance.
CREATE TABLE IF NOT EXISTS compliance_rules (
  code           TEXT PRIMARY KEY,                            -- 'GSTR3B', 'LLP_FORM8', ...
  authority      TEXT NOT NULL CHECK (authority IN ('GST','TDS','IT','MCA')),
  title          TEXT NOT NULL,
  form           TEXT,
  portal         TEXT,                                        -- where the manual filing happens
  penalty_note   TEXT,
  source_url     TEXT,
  last_verified  TEXT                                         -- date YOU checked it against the source; NULL = unverified
);

-- One row per rule per period: the thing you actually have to do.
CREATE TABLE IF NOT EXISTS obligations (
  id            INTEGER PRIMARY KEY,
  rule_code     TEXT NOT NULL REFERENCES compliance_rules(code),
  period_label  TEXT NOT NULL,                                -- '2026-10', 'Q2 2026-27', 'FY 2025-26'
  due_date      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','filed','not_applicable')),
  filed_on      TEXT,
  ack_no        TEXT,                                         -- ARN / SRN / challan / ack number
  amount_paise  INTEGER,                                      -- tax or fee paid, if any
  notes         TEXT,
  UNIQUE (rule_code, period_label)
);
CREATE INDEX IF NOT EXISTS idx_obligations_due ON obligations (status, due_date);

-- ───────────────────────── 5. Vault & audit trail ─────────────────────────

-- Files live on disk under data/vault/; this table is the index.
CREATE TABLE IF NOT EXISTS vault_documents (
  id             INTEGER PRIMARY KEY,
  category       TEXT NOT NULL CHECK (category IN
                 ('identity','incorporation','dsc','gst_return','tds_return','it_return',
                  'mca_filing','challan','notice','agreement','bank','other')),
  title          TEXT NOT NULL,
  rel_path       TEXT NOT NULL UNIQUE,                        -- relative to data/vault/
  sha256         TEXT NOT NULL,
  size_bytes     INTEGER NOT NULL,
  fy             TEXT,
  obligation_id  INTEGER REFERENCES obligations(id),          -- the filing this file evidences
  issued_on      TEXT,
  expires_on     TEXT,                                        -- DSC validity, LUT year end, ...
  added_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- Append-only. Triggers below make UPDATE and DELETE fail.
CREATE TABLE IF NOT EXISTS audit_log (
  id            INTEGER PRIMARY KEY,
  at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  action        TEXT NOT NULL,                                -- 'obligation.filed', 'import.completed', ...
  entity_table  TEXT,
  entity_id     TEXT,
  detail_json   TEXT NOT NULL DEFAULT '{}'
);
CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;

-- ───────────────────────── 6. Knowledge base (owned by the Python service) ─────────────────────────

CREATE TABLE IF NOT EXISTS kb_sources (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  url         TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('rss','html_index','manual_pdf')),
  -- 1 = law / notification / circular, 2 = official advisory or FAQ, 3 = commentary (ClearTax etc.)
  tier        INTEGER NOT NULL CHECK (tier IN (1,2,3)),
  last_polled TEXT
);

CREATE TABLE IF NOT EXISTS kb_documents (
  id              INTEGER PRIMARY KEY,
  source_id       INTEGER NOT NULL REFERENCES kb_sources(id),
  url             TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  published_on    TEXT,
  effective_from  TEXT,                                       -- when the rule starts applying, if stated
  content_sha256  TEXT NOT NULL,
  fetched_at      TEXT NOT NULL,
  -- Set when a newer document replaces this one; retrieval filters on it.
  superseded_by   INTEGER REFERENCES kb_documents(id)
);

CREATE TABLE IF NOT EXISTS kb_chunks (
  id           INTEGER PRIMARY KEY,
  document_id  INTEGER NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  seq          INTEGER NOT NULL,
  text         TEXT NOT NULL,
  embedding    BLOB,                                          -- float32[]; or move to a sqlite-vec table
  UNIQUE (document_id, seq)
);
CREATE VIRTUAL TABLE IF NOT EXISTS kb_chunks_fts USING fts5(text, content='kb_chunks', content_rowid='id');
