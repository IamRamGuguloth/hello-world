import { DeadlineList } from "@/components/DeadlineList";
import { LiabilityPanel } from "@/components/LiabilityPanel";
import { NextAction } from "@/components/NextAction";
import { getEntity } from "@/lib/db";
import { formatDate, fyLabel, fyStartYear, todayIST, ymd } from "@/lib/dates";
import { computeLiability, monthsOfPeriod } from "@/lib/gst";
import { pendingObligations, unverifiedRuleCount } from "@/lib/queries";
import { ensureObligations } from "@/lib/rules";

export const dynamic = "force-dynamic";

export default function Dashboard() {
  const entity = getEntity();
  if (!entity) {
    return (
      <p>
        No entity yet. Edit <code>entity.config.json</code>, then run <code>npm run seed</code>.
      </p>
    );
  }

  const today = todayIST();
  ensureObligations(entity, today);

  const [y, m, d] = today.split("-").map(Number);
  const pending = pendingObligations(ymd(y, m, d + 90));

  // The GST period to show is the one whose GSTR-3B is next to file;
  // failing that, last month.
  const gstPeriod = pending.find((o) => o.rule_code === "GSTR3B")?.period_label ?? ymd(y, m - 1, 1).slice(0, 7);
  const liability = computeLiability(monthsOfPeriod(gstPeriod));
  const unverified = unverifiedRuleCount();

  return (
    <div className="space-y-14">
      <header className="flex items-baseline justify-between gap-4 text-sm text-muted">
        <h1 className="text-ink">{entity.legal_name}</h1>
        <p>
          FY {fyLabel(fyStartYear(today))} · {formatDate(today)}
        </p>
      </header>

      <NextAction obligation={pending[0]} today={today} />
      <LiabilityPanel period={gstPeriod} liability={liability} />
      <DeadlineList obligations={pending} today={today} />

      {unverified > 0 && (
        <footer className="text-xs text-muted">
          {unverified} deadline rules have not been checked against their official source yet. Dates follow the
          standard statutory calendar and do not reflect extensions.
        </footer>
      )}
    </div>
  );
}
