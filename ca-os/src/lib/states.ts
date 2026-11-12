// GST state codes, keyed by the two-letter abbreviations Zoho Books exports.
export const STATE_CODES: Record<string, string> = {
  JK: "01", HP: "02", PB: "03", CH: "04", UK: "05", UT: "05", HR: "06", DL: "07", RJ: "08", UP: "09",
  BR: "10", SK: "11", AR: "12", NL: "13", MN: "14", MZ: "15", TR: "16", ML: "17", AS: "18", WB: "19",
  JH: "20", OD: "21", OR: "21", CG: "22", CT: "22", MP: "23", GJ: "24", DN: "26", DD: "26", MH: "27",
  KA: "29", GA: "30", LD: "31", KL: "32", TN: "33", PY: "34", AN: "35", TS: "36", TG: "36", AP: "37",
  LA: "38", OT: "97",
};

/** Accepts '29', 'KA', 'KA-29', '29-Karnataka'. Returns the 2-digit code or null. */
export function stateCode(raw: string | undefined): string | null {
  const v = (raw ?? "").trim().toUpperCase();
  if (!v) return null;
  const digits = /\b(\d{2})\b/.exec(v);
  if (digits) return digits[1];
  const letters = /\b([A-Z]{2})\b/.exec(v);
  return letters ? (STATE_CODES[letters[1]] ?? null) : null;
}

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;
export const isGstin = (v: string) => GSTIN.test(v);
