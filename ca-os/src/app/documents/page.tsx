import Link from "next/link";
import { formatDate, formatPeriod, todayIST, ymd } from "@/lib/dates";
import { DOC_LABEL, isLocked, listDocuments } from "@/lib/documents";
import { formatINR } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function Documents({ searchParams }: { searchParams: Promise<{ side?: string; month?: string }> }) {
  const sp = await searchParams;
  const side = sp.side === "purchases" ? "purchases" : "sales";
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : todayIST().slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const href = (mm: string) => `/documents?side=${side}&month=${mm}`;

  const docs = listDocuments(side, month);
  const live = docs.filter((d) => d.status === "final");
  const sign = (t: string) => (t === "credit_note" || t === "vendor_credit" ? -1 : 1);
  const taxable = live.reduce((s, d) => s + sign(d.doc_type) * d.taxable_paise, 0);
  const tax = live.reduce((s, d) => s + sign(d.doc_type) * (d.igst_paise + d.cgst_paise + d.sgst_paise), 0);
  const primary = side === "sales" ? "invoice" : "bill";
  const secondary = side === "sales" ? "credit_note" : "vendor_credit";
  const locked = isLocked(primary, month);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-2xl font-medium tracking-tight">{side === "sales" ? "Sales" : "Purchases"}</h1>
        <p className="flex items-baseline gap-4 text-sm">
          <Link href={href(ymd(y, m - 1, 1).slice(0, 7))} aria-label="Previous month" className="text-muted hover:text-ink">←</Link>
          <span>{formatPeriod(month)}</span>
          <Link href={href(ymd(y, m + 1, 1).slice(0, 7))} aria-label="Next month" className="text-muted hover:text-ink">→</Link>
        </p>
      </header>

      <p className="text-muted">
        {live.length === 0 ? "Nothing recorded this month." : `${formatINR(taxable)} taxable · ${formatINR(tax)} GST · ${live.length} document${live.length === 1 ? "" : "s"}`}
        {locked && " · Return filed; this month is locked."}
      </p>

      {!locked && (
        <p className="flex gap-6 text-sm">
          <Link href={`/documents/new?type=${primary}`} className="border border-ink px-3 py-1.5 hover:bg-ink hover:text-paper">
            New {DOC_LABEL[primary].toLowerCase()}
          </Link>
          <Link href={`/documents/new?type=${secondary}`} className="py-1.5 text-muted underline-offset-4 hover:underline">
            New {DOC_LABEL[secondary].toLowerCase()}
          </Link>
        </p>
      )}

      {docs.length > 0 && (
        <ul className="border-b border-rule">
          {docs.map((d) => (
            <li key={d.id} className="border-t border-rule">
              <Link href={`/documents/${d.id}`} className={`flex items-baseline gap-4 py-3 hover:bg-rule/30 ${d.status === "void" ? "text-muted line-through" : ""}`}>
                <span className="w-16 shrink-0 text-sm text-muted">{formatDate(d.doc_date).replace(/ \d{4}$/, "")}</span>
                <span className="min-w-0 flex-1">
                  <span className="block">{d.party_name}</span>
                  <span className="block text-sm text-muted">
                    {d.number}{d.doc_type !== primary && ` · ${DOC_LABEL[d.doc_type]}`}
                  </span>
                </span>
                <span>{formatINR(sign(d.doc_type) * d.total_paise)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
