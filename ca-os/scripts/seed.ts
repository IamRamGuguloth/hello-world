// Creates the database, writes the entity row from entity.config.json and
// generates the compliance calendar. Safe to re-run.
import fs from "node:fs";
import { audit, db, getEntity } from "../src/lib/db";
import { todayIST } from "../src/lib/dates";
import { ensureObligations } from "../src/lib/rules";

const cfg = JSON.parse(fs.readFileSync("entity.config.json", "utf8"));
const existing = getEntity();

db()
  .prepare(
    `INSERT INTO entity (id, legal_name, llpin, pan, tan, gstin, state_code, gst_filing_frequency,
                         tax_audit_applicable, deducts_tds, tracking_from)
     VALUES (1, @legal_name, @llpin, @pan, @tan, @gstin, @state_code, @gst_filing_frequency,
             @tax_audit_applicable, @deducts_tds, @tracking_from)
     ON CONFLICT (id) DO UPDATE SET legal_name = excluded.legal_name, llpin = excluded.llpin,
       pan = excluded.pan, tan = excluded.tan, gstin = excluded.gstin, state_code = excluded.state_code,
       gst_filing_frequency = excluded.gst_filing_frequency,
       tax_audit_applicable = excluded.tax_audit_applicable, deducts_tds = excluded.deducts_tds`,
  )
  .run({
    ...cfg,
    tax_audit_applicable: cfg.tax_audit_applicable ? 1 : 0,
    deducts_tds: cfg.deducts_tds ? 1 : 0,
    // Set once, on first seed: the calendar starts from the day you adopt the system.
    tracking_from: existing?.tracking_from ?? cfg.tracking_from ?? todayIST(),
  });

const entity = getEntity()!;
ensureObligations(entity);
if (!existing) audit("entity.created", "entity", 1, { legal_name: entity.legal_name });

const { n } = db().prepare("SELECT COUNT(*) AS n FROM obligations").get() as { n: number };
console.log(`${entity.legal_name}: ${n} obligations tracked from ${entity.tracking_from}.`);
