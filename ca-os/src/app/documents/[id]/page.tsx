import Link from "next/link";
import { notFound } from "next/navigation";
import { voidDocumentAction } from "@/app/actions";
import { PrintButton } from "@/components/PrintButton";
import { getEntity } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { DOC_LABEL, getDocument, isLocked, isSale } from "@/lib/documents";
import { formatINRExact } from "@/lib/money";
import { STATE_NAMES } from "@/lib/states";

export const dynamic = "force-dynamic";

const TITLE = { invoice: "Tax Invoice", credit_note: "Credit Note", bill: "Purchase bill", vendor_credit: "Vendor credit" };

export default async function DocumentView({ params }: { params: Promise<{ id: string }> }) {
  const found = getDocument(Number((await params).id));
  const entity = getEntity();
  if (!found || !entity) notFound();
  const { doc, lines } = found;
  const sale = isSale(doc.doc_type);
  const locked = isLocked(doc.doc_type, doc.period);
  const intra = doc.supply_type === "intra";
  const state = (code: string | null) => (code === "96" ? "Outside India" : code ? `${STATE_NAMES[code] ?? ""} (${code})` : "—");

  const us = { name: entity.legal_name, gstin: entity.gstin, address: entity.address, state: entity.state_code };
  const them = { name: doc.party_name, gstin: doc.party_gstin, address: doc.party_address, state: doc.party_state };
  const [from, to] = sale ? [us, them] : [them, us];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4 text-sm print:hidden">
        {doc.status === "void" ? (
          <span className="text-signal">Void</span>
        ) : locked ? (
          <span className="text-muted">Locked: the GST return for this month is filed.</span>
        ) : (
          <>
            <Link href={`/documents/${doc.id}/edit`} className="border border-ink px-3 py-1.5 hover:bg-ink hover:text-paper">Edit</Link>
            <form action={voidDocumentAction}>
              <input type="hidden" name="id" value={doc.id} />
              <button className="py-1.5 text-muted underline-offset-4 hover:underline">Void</button>
            </form>
          </>
        )}
        {sale && doc.status === "final" && <span className="ml-auto"><PrintButton /></span>}
      </div>

      <article className="space-y-8">
        <header className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-medium tracking-tight">{TITLE[doc.doc_type]}</h1>
            <p className="mt-1 text-muted">{doc.number} · {formatDate(doc.doc_date)}</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-medium">{from.name}</p>
            {from.address && <p className="text-muted">{from.address}</p>}
            {from.gstin && <p className="text-muted">GSTIN {from.gstin}</p>}
          </div>
        </header>

        <dl className="grid gap-6 text-sm sm:grid-cols-2 print:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-widest text-muted">{sale ? "Billed to" : "Billed by"}</dt>
            <dd className="mt-1">
              <p>{them.name}</p>
              {them.address && <p className="text-muted">{them.address}</p>}
              <p className="text-muted">{them.gstin ? `GSTIN ${them.gstin}` : "Unregistered"}</p>
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-widest text-muted">Place of supply</dt>
            <dd className="mt-1">{state(doc.place_of_supply)}</dd>
            {doc.supply_type === "export" && <dd className="text-muted">Export of services</dd>}
            {!!doc.reverse_charge && <dd className="text-muted">Tax payable by recipient under reverse charge</dd>}
          </div>
        </dl>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th scope="col" className="pb-2 text-left font-normal">Description</th>
                <th scope="col" className="pb-2 text-left font-normal">HSN/SAC</th>
                <th scope="col" className="pb-2 text-right font-normal">Qty</th>
                <th scope="col" className="pb-2 text-right font-normal">Taxable</th>
                <th scope="col" className="pb-2 text-right font-normal">GST</th>
                <th scope="col" className="pb-2 text-right font-normal">Tax</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.line_no} className="border-t border-rule align-top">
                  <td className="py-2 pr-4">
                    {l.description}
                    {!sale && !l.itc_eligible && <span className="block text-xs text-muted">No input credit</span>}
                  </td>
                  <td className="py-2 pr-4">{l.hsn_sac ?? ""}</td>
                  <td className="py-2 text-right">{l.quantity ?? ""}</td>
                  <td className="py-2 text-right">{formatINRExact(l.taxable_paise)}</td>
                  <td className="py-2 text-right">{l.rate_bp / 100}%</td>
                  <td className="py-2 text-right">{formatINRExact(l.igst_paise + l.cgst_paise + l.sgst_paise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Taxable value</dt><dd>{formatINRExact(doc.taxable_paise)}</dd></div>
          {intra ? (
            <>
              <div className="flex justify-between"><dt className="text-muted">CGST</dt><dd>{formatINRExact(doc.cgst_paise)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">SGST</dt><dd>{formatINRExact(doc.sgst_paise)}</dd></div>
            </>
          ) : (
            <div className="flex justify-between"><dt className="text-muted">IGST</dt><dd>{formatINRExact(doc.igst_paise)}</dd></div>
          )}
          <div className="flex justify-between border-t border-rule pt-2 text-base font-medium">
            <dt>Total</dt><dd>{formatINRExact(doc.total_paise)}</dd>
          </div>
        </dl>

        {doc.notes && <p className="text-sm text-muted">{doc.notes}</p>}
        {sale && (
          <p className="hidden pt-16 text-right text-sm print:block">
            For {entity.legal_name}
            <span className="mt-12 block text-muted">Authorised signatory</span>
          </p>
        )}
      </article>
    </div>
  );
}
