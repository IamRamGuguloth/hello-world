// Pure GST helpers shared by the server and the entry form. No database access.

export type DocType = "invoice" | "credit_note" | "bill" | "vendor_credit";
export type PartyKind = "registered" | "unregistered" | "overseas" | "sez";
export type SupplyType = "intra" | "inter" | "export" | "sez";

export const DOC_LABEL: Record<DocType, string> = {
  invoice: "Invoice", credit_note: "Credit note", bill: "Bill", vendor_credit: "Vendor credit",
};
export const isSale = (t: DocType) => t === "invoice" || t === "credit_note";

/**
 * Sales are taxed by place of supply; purchases by where the supplier is.
 * `otherState` is that state: place of supply for a sale, the vendor's state for a purchase.
 */
export function supplyType(sale: boolean, kind: PartyKind, otherState: string | null, ownState: string): SupplyType {
  if (kind === "overseas") return sale ? "export" : "inter";
  if (kind === "sez") return "sez";
  return otherState === ownState ? "intra" : "inter";
}

/** Split a line's tax into heads. Intra-state: half CGST, half SGST. Otherwise IGST. */
export function lineTax(taxablePaise: number, rateBp: number, supply: SupplyType) {
  const tax = Math.round((taxablePaise * rateBp) / 10_000);
  if (supply !== "intra") return { igst: tax, cgst: 0, sgst: 0 };
  const half = Math.round(tax / 2);
  return { igst: 0, cgst: half, sgst: tax - half };
}
