const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inrExact = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

/** Paise → '₹1,18,050'. Rounded to the rupee, which is how GST returns are filed. */
export function formatINR(paise: number): string {
  return inr.format(Math.round(paise / 100));
}

export function formatINRExact(paise: number): string {
  return inrExact.format(paise / 100);
}

/** '1,180.50' → 118050. Throws on anything that is not a number. */
export function toPaise(value: string | number): number {
  const n = typeof value === "number" ? value : Number(String(value).replace(/[₹,\s]/g, "") || "0");
  if (!Number.isFinite(n)) throw new Error(`Not an amount: "${value}"`);
  return Math.round(n * 100);
}
