"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="border border-ink px-3 py-1.5 hover:bg-ink hover:text-paper">
      Print / save PDF
    </button>
  );
}
