// GST state codes.
export const STATE_NAMES: Record<string, string> = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand",
  "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim",
  "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura",
  "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha",
  "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat", "26": "Dadra & Nagar Haveli and Daman & Diu",
  "27": "Maharashtra", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu",
  "34": "Puducherry", "35": "Andaman & Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh",
  "38": "Ladakh", "97": "Other Territory",
};

// Two-letter abbreviations, accepted in CSV imports.
const ABBREVIATIONS: Record<string, string> = {
  JK: "01", HP: "02", PB: "03", CH: "04", UK: "05", UT: "05", HR: "06", DL: "07", RJ: "08", UP: "09",
  BR: "10", SK: "11", AR: "12", NL: "13", MN: "14", MZ: "15", TR: "16", ML: "17", AS: "18", WB: "19",
  JH: "20", OD: "21", OR: "21", CG: "22", CT: "22", MP: "23", GJ: "24", DN: "26", DD: "26", MH: "27",
  KA: "29", GA: "30", LD: "31", KL: "32", TN: "33", PY: "34", AN: "35", TS: "36", TG: "36", AP: "37",
  LA: "38", OT: "97",
};

/** Accepts '29', 'KA', 'KA-29', '29-Karnataka'. Returns the 2-digit code or null. */
export function stateCode(raw: string | undefined | null): string | null {
  const v = (raw ?? "").trim().toUpperCase();
  if (!v) return null;
  const digits = /\b(\d{2})\b/.exec(v);
  if (digits) return digits[1];
  const letters = /\b([A-Z]{2})\b/.exec(v);
  return letters ? (ABBREVIATIONS[letters[1]] ?? null) : null;
}

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;
export const isGstin = (v: string) => GSTIN.test(v);
