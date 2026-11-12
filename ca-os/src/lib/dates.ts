// All dates are plain 'YYYY-MM-DD' strings on the IST calendar. Arithmetic goes
// through UTC so the host machine's timezone can never shift a due date.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export function ymd(year: number, month: number, day: number): string {
  // month is 1-12; overflow (month 13, day 0) is normalised by Date.UTC.
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/** Start year of the financial year containing `date`: 2026-11-12 → 2026, 2027-02-01 → 2026. */
export function fyStartYear(date: string): number {
  const [y, m] = date.split("-").map(Number);
  return m >= 4 ? y : y - 1;
}

export function fyLabel(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export function formatDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** '2026-10' → 'Oct 2026'. Other labels pass through unchanged. */
export function formatPeriod(label: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(label);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : label;
}
