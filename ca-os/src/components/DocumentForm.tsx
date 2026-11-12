"use client";

import { useActionState, useState } from "react";
import { saveDocumentAction } from "@/app/actions";
import { formatINRExact } from "@/lib/money";
import { STATE_NAMES } from "@/lib/states";
import { DOC_LABEL, isSale, lineTax, supplyType, type DocType, type PartyKind } from "@/lib/tax";

type Line = { description: string; hsn_sac: string; quantity: string; amount: string; rate: string; itc_eligible: boolean };
export type FormValues = {
  id?: number; doc_type: DocType; number: string; doc_date: string; party_name: string; party_kind: PartyKind;
  party_gstin: string; party_state: string; party_address: string; place_of_supply: string;
  reverse_charge: boolean; notes: string; lines: Line[];
};
type Party = { name: string; gstin: string | null; state_code: string | null; address: string | null };

const blankLine = (): Line => ({ description: "", hsn_sac: "", quantity: "1", amount: "", rate: "18", itc_eligible: true });
const paise = (v: string) => Math.round((Number(v.replace(/,/g, "")) || 0) * 100);
const field = "w-full border-b border-rule bg-transparent py-1.5 outline-none focus:border-ink";
const label = "flex flex-col gap-1 text-xs text-muted";

export function DocumentForm({ initial, parties, ownState }: { initial: FormValues; parties: Party[]; ownState: string }) {
  const [v, setV] = useState(initial);
  const [state, action, pending] = useActionState(saveDocumentAction, { problems: [] as string[] });
  const sale = isSale(v.doc_type);
  const set = (patch: Partial<FormValues>) => setV((cur) => ({ ...cur, ...patch }));
  const setLine = (i: number, patch: Partial<Line>) =>
    setV((cur) => ({ ...cur, lines: cur.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  // Choosing a known party fills in the rest.
  const onParty = (name: string) => {
    const known = parties.find((p) => p.name === name);
    set(known
      ? { party_name: name, party_gstin: known.gstin ?? "", party_state: known.state_code ?? "",
          party_address: known.address ?? "", party_kind: known.gstin ? "registered" : v.party_kind }
      : { party_name: name });
  };

  const gstinState = /^\d{2}/.test(v.party_gstin) ? v.party_gstin.slice(0, 2) : "";
  const partyState = gstinState || v.party_state;
  const otherState = sale ? v.place_of_supply || partyState : partyState;
  const supply = supplyType(sale, v.party_kind, otherState || null, ownState);
  const totals = v.lines.reduce(
    (t, l) => {
      const x = lineTax(paise(l.amount), Math.round(Number(l.rate || 0) * 100), supply);
      return { taxable: t.taxable + paise(l.amount), igst: t.igst + x.igst, cgst: t.cgst + x.cgst, sgst: t.sgst + x.sgst };
    },
    { taxable: 0, igst: 0, cgst: 0, sgst: 0 },
  );
  const tax = totals.igst + totals.cgst + totals.sgst;
  const hasGstin = v.party_kind === "registered" || v.party_kind === "sez";

  return (
    <form action={action} className="space-y-10">
      <input type="hidden" name="payload" value={JSON.stringify(v)} />

      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
        <label className={label}>
          {DOC_LABEL[v.doc_type]} number
          <input required value={v.number} onChange={(e) => set({ number: e.target.value })} className={`${field} text-base text-ink`} />
        </label>
        <label className={label}>
          Date
          <input required type="date" value={v.doc_date} onChange={(e) => set({ doc_date: e.target.value })} className={`${field} text-base text-ink`} />
        </label>
        <label className={label}>
          {sale ? "Customer" : "Vendor"}
          <input required list="parties" value={v.party_name} onChange={(e) => onParty(e.target.value)} className={`${field} text-base text-ink`} />
          <datalist id="parties">{parties.map((p) => <option key={p.name} value={p.name} />)}</datalist>
        </label>
        <label className={label}>
          Type
          <select value={v.party_kind} onChange={(e) => set({ party_kind: e.target.value as PartyKind, ...(e.target.value === "registered" || e.target.value === "sez" ? {} : { party_gstin: "" }) })} className={`${field} text-base text-ink`}>
            <option value="registered">GST registered</option>
            <option value="unregistered">Unregistered</option>
            <option value="overseas">Overseas</option>
            <option value="sez">SEZ unit</option>
          </select>
        </label>
        {hasGstin && (
          <label className={label}>
            GSTIN
            <input required value={v.party_gstin} maxLength={15} onChange={(e) => set({ party_gstin: e.target.value.toUpperCase() })} className={`${field} text-base text-ink uppercase`} />
          </label>
        )}
        {v.party_kind === "unregistered" && (
          <label className={label}>
            {sale ? "Customer" : "Vendor"} state
            <StateSelect value={v.party_state} onChange={(s) => set({ party_state: s })} />
          </label>
        )}
        {sale && v.party_kind !== "overseas" && (
          <label className={label}>
            Place of supply
            <StateSelect value={v.place_of_supply} onChange={(s) => set({ place_of_supply: s })} placeholder={partyState ? `Same as customer (${STATE_NAMES[partyState] ?? partyState})` : "Choose"} />
          </label>
        )}
        <label className={`${label} sm:col-span-2`}>
          Address
          <input value={v.party_address} onChange={(e) => set({ party_address: e.target.value })} className={`${field} text-base text-ink`} />
        </label>
      </div>

      <fieldset>
        <legend className="text-xs uppercase tracking-widest text-muted">Lines</legend>
        <div className="mt-2 space-y-5">
          {v.lines.map((l, i) => (
            <div key={i} className="grid grid-cols-6 gap-x-4 gap-y-3 border-t border-rule pt-4 sm:grid-cols-12">
              <label className={`${label} col-span-6 sm:col-span-4`}>
                Description
                <input required value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} className={`${field} text-base text-ink`} />
              </label>
              <label className={`${label} col-span-3 sm:col-span-2`}>
                HSN/SAC
                <input required={sale} inputMode="numeric" value={l.hsn_sac} onChange={(e) => setLine(i, { hsn_sac: e.target.value })} className={`${field} text-base text-ink`} />
              </label>
              <label className={`${label} col-span-3 sm:col-span-1`}>
                Qty
                <input inputMode="decimal" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} className={`${field} text-right text-base text-ink`} />
              </label>
              <label className={`${label} col-span-3 sm:col-span-3`}>
                Amount before GST ₹
                <input required inputMode="decimal" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} className={`${field} text-right text-base text-ink`} />
              </label>
              <label className={`${label} col-span-3 sm:col-span-2`}>
                GST %
                <input required inputMode="decimal" value={l.rate} onChange={(e) => setLine(i, { rate: e.target.value })} className={`${field} text-right text-base text-ink`} />
              </label>
              <div className="col-span-6 flex items-center justify-between text-sm sm:col-span-12">
                {sale ? <span /> : (
                  <label className="flex items-center gap-2 text-muted">
                    <input type="checkbox" checked={l.itc_eligible} onChange={(e) => setLine(i, { itc_eligible: e.target.checked })} />
                    Input credit can be claimed
                  </label>
                )}
                {v.lines.length > 1 && (
                  <button type="button" onClick={() => set({ lines: v.lines.filter((_, j) => j !== i) })} className="text-muted underline-offset-4 hover:underline">
                    Remove line
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => set({ lines: [...v.lines, blankLine()] })} className="mt-4 text-sm underline underline-offset-4">
          Add line
        </button>
      </fieldset>

      {!sale && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={v.reverse_charge} onChange={(e) => set({ reverse_charge: e.target.checked })} />
          <span>
            Reverse charge
            <span className="block text-muted">The vendor did not charge GST and you must pay it yourself, e.g. services bought from abroad.</span>
          </span>
        </label>
      )}

      <dl className="ml-auto max-w-xs space-y-1 text-sm">
        <div className="flex justify-between"><dt className="text-muted">Taxable value</dt><dd>{formatINRExact(totals.taxable)}</dd></div>
        {supply === "intra" ? (
          <>
            <div className="flex justify-between"><dt className="text-muted">CGST</dt><dd>{formatINRExact(totals.cgst)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">SGST</dt><dd>{formatINRExact(totals.sgst)}</dd></div>
          </>
        ) : (
          <div className="flex justify-between"><dt className="text-muted">IGST</dt><dd>{formatINRExact(totals.igst)}</dd></div>
        )}
        <div className="flex justify-between border-t border-rule pt-2 text-base font-medium">
          <dt>{v.reverse_charge ? "Payable to vendor" : "Total"}</dt>
          <dd>{formatINRExact(totals.taxable + (v.reverse_charge ? 0 : tax))}</dd>
        </div>
      </dl>

      <label className={label}>
        Notes
        <input value={v.notes} onChange={(e) => set({ notes: e.target.value })} className={`${field} text-base text-ink`} />
      </label>

      {state.problems.length > 0 && (
        <ul role="alert" className="space-y-1 text-sm text-signal">
          {state.problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}

      <button disabled={pending} className="border border-ink px-4 py-2 hover:bg-ink hover:text-paper disabled:opacity-50">
        {pending ? "Saving…" : `Save ${DOC_LABEL[v.doc_type].toLowerCase()}`}
      </button>
    </form>
  );
}

function StateSelect({ value, onChange, placeholder = "Choose" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${field} text-base text-ink`}>
      <option value="">{placeholder}</option>
      {Object.entries(STATE_NAMES).sort((a, b) => a[1].localeCompare(b[1])).map(([code, name]) => (
        <option key={code} value={code}>{name}</option>
      ))}
    </select>
  );
}
