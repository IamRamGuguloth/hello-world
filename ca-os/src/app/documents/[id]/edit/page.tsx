import { notFound } from "next/navigation";
import { DocumentForm } from "@/components/DocumentForm";
import { getEntity } from "@/lib/db";
import { DOC_LABEL, getDocument, listParties } from "@/lib/documents";

export const dynamic = "force-dynamic";

export default async function EditDocument({ params }: { params: Promise<{ id: string }> }) {
  const found = getDocument(Number((await params).id));
  const entity = getEntity();
  if (!found || !entity) notFound();
  const { doc, lines } = found;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-medium tracking-tight">Edit {DOC_LABEL[doc.doc_type].toLowerCase()} {doc.number}</h1>
      <DocumentForm
        ownState={entity.state_code}
        parties={listParties()}
        initial={{
          id: doc.id, doc_type: doc.doc_type, number: doc.number, doc_date: doc.doc_date, party_name: doc.party_name,
          party_kind: doc.supply_type === "sez" ? "sez" : doc.place_of_supply === "96" || (!doc.party_gstin && !doc.party_state) ? "overseas" : doc.party_gstin ? "registered" : "unregistered",
          party_gstin: doc.party_gstin ?? "", party_state: doc.party_state ?? "", party_address: doc.party_address ?? "",
          place_of_supply: doc.place_of_supply && doc.place_of_supply !== "96" && doc.place_of_supply !== doc.party_state ? doc.place_of_supply : "",
          reverse_charge: !!doc.reverse_charge, notes: doc.notes ?? "",
          lines: lines.map((l) => ({
            description: l.description, hsn_sac: l.hsn_sac ?? "", quantity: l.quantity == null ? "" : String(l.quantity),
            amount: (l.taxable_paise / 100).toFixed(2), rate: String(l.rate_bp / 100), itc_eligible: !!l.itc_eligible,
          })),
        }}
      />
    </div>
  );
}
