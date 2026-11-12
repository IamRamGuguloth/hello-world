import { daysBetween, formatDate, formatPeriod } from "@/lib/dates";
import type { Obligation } from "@/lib/queries";

/** The one thing to do next. Everything else on the page is supporting detail. */
export function NextAction({ obligation, today }: { obligation?: Obligation; today: string }) {
  if (!obligation) {
    return <p className="text-2xl font-medium tracking-tight">Nothing due in the next 90 days.</p>;
  }
  const days = daysBetween(today, obligation.due_date);
  const when = days < 0 ? `${-days} day${days === -1 ? "" : "s"} overdue` : days === 0 ? "due today" : `due in ${days} day${days === 1 ? "" : "s"}`;

  return (
    <section aria-labelledby="next-heading">
      <h2 id="next-heading" className="text-xs uppercase tracking-widest text-muted">Next</h2>
      <p className="mt-2 text-2xl font-medium tracking-tight">
        {obligation.form} for {formatPeriod(obligation.period_label)}
      </p>
      <p className={`mt-1 ${days <= 7 ? "text-signal" : "text-muted"}`}>
        {formatDate(obligation.due_date)} · {when}
      </p>
      <p className="mt-3 max-w-prose text-sm text-muted">
        {obligation.title}, on {obligation.portal}. {obligation.penalty_note}
      </p>
    </section>
  );
}
