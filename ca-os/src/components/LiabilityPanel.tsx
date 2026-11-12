import { setOpeningCredit } from "@/app/actions";
import { formatPeriod } from "@/lib/dates";
import { total, type Heads, type Liability } from "@/lib/gst";
import { formatINR } from "@/lib/money";

function Row({ label, heads, strong }: { label: string; heads: Heads; strong?: boolean }) {
  const cell = "py-2 text-right";
  return (
    <tr className={`border-t border-rule ${strong ? "font-medium" : ""}`}>
      <th scope="row" className={`py-2 pr-4 text-left ${strong ? "font-medium" : "font-normal"}`}>{label}</th>
      <td className={cell}>{formatINR(heads.igst)}</td>
      <td className={cell}>{formatINR(heads.cgst)}</td>
      <td className={cell}>{formatINR(heads.sgst)}</td>
      <td className={`${cell} pl-4`}>{formatINR(total(heads))}</td>
    </tr>
  );
}

export function LiabilityPanel({ period, liability }: { period: string; liability: Liability }) {
  const l = liability;
  const hasReverseCharge = total(l.reverseCharge) > 0;
  const input = "w-28 border-b border-rule bg-transparent py-1 text-right outline-none focus:border-ink";

  return (
    <section aria-labelledby="gst-heading">
      <h2 id="gst-heading" className="text-xs uppercase tracking-widest text-muted">
        GST · {formatPeriod(period)}
      </h2>
      <p className="mt-2 text-4xl font-medium tracking-tight">{formatINR(l.cashPayable)}</p>
      <p className="mt-1 text-muted">
        {l.documentCount === 0
          ? "No documents imported for this period yet."
          : `to pay in cash, from ${l.documentCount} documents. Provisional until matched with GSTR-2B.`}
      </p>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="pb-2 text-left font-normal" />
              {["IGST", "CGST", "SGST"].map((h) => (
                <th key={h} scope="col" className="pb-2 text-right font-normal">{h}</th>
              ))}
              <th scope="col" className="pb-2 pl-4 text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody>
            <Row label="Output tax" heads={l.outputTax} />
            <Row label="Opening credit" heads={l.openingCredit} />
            <Row label="Input credit (books)" heads={l.periodCredit} />
            <Row label="Credit used" heads={l.setOff.creditUsed} />
            {hasReverseCharge && <Row label="Reverse charge" heads={l.reverseCharge} />}
            <Row
              label="Pay in cash"
              strong
              heads={{
                igst: l.setOff.cash.igst + l.reverseCharge.igst,
                cgst: l.setOff.cash.cgst + l.reverseCharge.cgst,
                sgst: l.setOff.cash.sgst + l.reverseCharge.sgst,
              }}
            />
            <Row label="Credit carried forward" heads={l.setOff.closingCredit} />
          </tbody>
        </table>
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-muted hover:text-ink">Set opening credit</summary>
        <form action={setOpeningCredit} className="mt-3 flex flex-wrap items-end gap-4">
          <input type="hidden" name="period" value={l.months[0]} />
          {(["igst", "cgst", "sgst"] as const).map((head) => (
            <label key={head} className="flex flex-col gap-1 text-xs text-muted">
              {head.toUpperCase()} ₹
              <input name={head} inputMode="decimal" defaultValue={l.openingCredit[head] / 100} className={`${input} text-sm text-ink`} />
            </label>
          ))}
          <button className="border border-ink px-3 py-1.5 hover:bg-ink hover:text-paper">Save</button>
        </form>
        <p className="mt-2 text-xs text-muted">
          Copy the balance from the Electronic Credit Ledger on the GST portal as at the start of this period.
        </p>
      </details>
    </section>
  );
}
