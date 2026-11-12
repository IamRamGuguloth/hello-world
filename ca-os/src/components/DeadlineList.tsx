import { closeObligation } from "@/app/actions";
import { daysBetween, formatDate, formatPeriod } from "@/lib/dates";
import type { Obligation } from "@/lib/queries";

function Deadline({ o, today }: { o: Obligation; today: string }) {
  const days = daysBetween(today, o.due_date);
  const input = "border-b border-rule bg-transparent py-1 outline-none focus:border-ink";

  return (
    <li className="border-t border-rule">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-baseline gap-4 py-3 [&::-webkit-details-marker]:hidden">
          <span className={`w-24 shrink-0 text-sm ${days <= 7 ? "text-signal" : "text-muted"}`}>
            {formatDate(o.due_date).replace(/ \d{4}$/, "")}
            {days < 0 && <span className="block text-xs">overdue</span>}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block">{o.title}</span>
            <span className="block text-sm text-muted">{formatPeriod(o.period_label)}</span>
          </span>
          <span className="text-xs text-muted group-open:hidden">{o.authority}</span>
        </summary>

        <div className="pb-5 pl-0 sm:pl-28">
          <p className="max-w-prose text-sm text-muted">
            {o.form} on {o.portal}. {o.penalty_note}
          </p>
          <form action={closeObligation} className="mt-4 flex flex-wrap items-end gap-4 text-sm">
            <input type="hidden" name="id" value={o.id} />
            <label className="flex flex-col gap-1 text-xs text-muted">
              ARN / SRN / challan no.
              <input name="ack_no" className={`${input} w-44 text-sm text-ink`} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Filed on
              <input name="filed_on" type="date" defaultValue={today} max={today} className={`${input} text-sm text-ink`} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Paid ₹
              <input name="amount" inputMode="decimal" className={`${input} w-28 text-right text-sm text-ink`} />
            </label>
            <button name="intent" value="filed" className="border border-ink px-3 py-1.5 hover:bg-ink hover:text-paper">
              Mark filed
            </button>
            <button name="intent" value="not_applicable" className="py-1.5 text-muted underline-offset-4 hover:underline">
              Not applicable
            </button>
          </form>
        </div>
      </details>
    </li>
  );
}

export function DeadlineList({ obligations, today }: { obligations: Obligation[]; today: string }) {
  return (
    <section aria-labelledby="deadlines-heading">
      <h2 id="deadlines-heading" className="text-xs uppercase tracking-widest text-muted">
        Deadlines · next 90 days
      </h2>
      {obligations.length === 0 ? (
        <p className="mt-3 text-muted">Nothing pending.</p>
      ) : (
        <ul className="mt-3 border-b border-rule">
          {obligations.map((o) => <Deadline key={o.id} o={o} today={today} />)}
        </ul>
      )}
    </section>
  );
}
