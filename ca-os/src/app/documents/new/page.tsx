import { DocumentForm } from "@/components/DocumentForm";
import { getEntity } from "@/lib/db";
import { todayIST } from "@/lib/dates";
import { DOC_LABEL, listParties, nextNumber, type DocType } from "@/lib/documents";

export const dynamic = "force-dynamic";
const TYPES: DocType[] = ["invoice", "credit_note", "bill", "vendor_credit"];

export default async function NewDocument({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const requested = (await searchParams).type;
  const type = TYPES.find((t) => t === requested) ?? "invoice";
  const entity = getEntity();
  if (!entity) return <p>Run <code>npm run seed</code> first.</p>;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-medium tracking-tight">New {DOC_LABEL[type].toLowerCase()}</h1>
      <DocumentForm
        ownState={entity.state_code}
        parties={listParties()}
        initial={{
          doc_type: type, number: nextNumber(type), doc_date: todayIST(), party_name: "", party_kind: "registered",
          party_gstin: "", party_state: "", party_address: "", place_of_supply: "", reverse_charge: false, notes: "",
          lines: [{ description: "", hsn_sac: "", quantity: "1", amount: "", rate: "18", itc_eligible: true }],
        }}
      />
    </div>
  );
}
