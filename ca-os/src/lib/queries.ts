import { db } from "./db";

export type Obligation = {
  id: number;
  rule_code: string;
  period_label: string;
  due_date: string;
  status: "pending" | "filed" | "not_applicable";
  title: string;
  form: string;
  portal: string;
  authority: string;
  penalty_note: string;
};

/** Everything still to do that is overdue or due on or before `until`, soonest first. */
export function pendingObligations(until: string): Obligation[] {
  return db()
    .prepare(
      `SELECT o.id, o.rule_code, o.period_label, o.due_date, o.status,
              r.title, r.form, r.portal, r.authority, r.penalty_note
       FROM obligations o JOIN compliance_rules r ON r.code = o.rule_code
       WHERE o.status = 'pending' AND o.due_date <= ?
       ORDER BY o.due_date, r.authority, o.id`,
    )
    .all(until) as Obligation[];
}

export function unverifiedRuleCount(): number {
  const row = db().prepare("SELECT COUNT(*) AS n FROM compliance_rules WHERE last_verified IS NULL").get();
  return (row as { n: number }).n;
}
