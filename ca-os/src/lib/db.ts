import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.CA_OS_DATA ?? path.join(process.cwd(), "data");
const SCHEMA = path.join(process.cwd(), "db", "schema.sql");

// Survive Next.js dev hot reloads with a single connection.
const g = globalThis as unknown as { __caos_db?: Database.Database };

export function db(): Database.Database {
  if (!g.__caos_db) {
    fs.mkdirSync(path.join(DATA_DIR, "vault"), { recursive: true });
    const conn = new Database(path.join(DATA_DIR, "ca-os.db"));
    conn.exec(fs.readFileSync(SCHEMA, "utf8"));
    g.__caos_db = conn;
  }
  return g.__caos_db;
}

export function audit(action: string, table: string, id: string | number, detail: object = {}) {
  db()
    .prepare("INSERT INTO audit_log (action, entity_table, entity_id, detail_json) VALUES (?,?,?,?)")
    .run(action, table, String(id), JSON.stringify(detail));
}

export type Entity = {
  legal_name: string;
  gstin: string | null;
  state_code: string;
  address: string | null;
  invoice_prefix: string;
  gst_filing_frequency: "monthly" | "qrmp";
  tax_audit_applicable: number;
  deducts_tds: number;
  tracking_from: string;
};

export function getEntity(): Entity | undefined {
  return db().prepare("SELECT * FROM entity WHERE id = 1").get() as Entity | undefined;
}
