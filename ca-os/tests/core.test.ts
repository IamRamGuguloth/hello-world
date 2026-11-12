import assert from "node:assert/strict";
import { test } from "node:test";
import { fyStartYear, ymd } from "../src/lib/dates";
import { monthsOfPeriod, setOff } from "../src/lib/gst";
import { obligationsFor } from "../src/lib/rules";
import type { Entity } from "../src/lib/db";

const entity: Entity = {
  legal_name: "Test LLP", gstin: null, state_code: "29", gst_filing_frequency: "monthly",
  tax_audit_applicable: 0, deducts_tds: 1, tracking_from: "2026-04-01",
};
const due = (fy: number, code: string, label: string, e = entity) =>
  obligationsFor(fy, e).find((o) => o.rule_code === code && o.period_label === label)?.due_date;

test("financial year boundaries", () => {
  assert.equal(fyStartYear("2026-03-31"), 2025);
  assert.equal(fyStartYear("2026-04-01"), 2026);
  assert.equal(ymd(2026, 13, 20), "2027-01-20");
});

test("monthly GST due dates roll into the next month and year", () => {
  assert.equal(due(2026, "GSTR1", "2026-10"), "2026-11-11");
  assert.equal(due(2026, "GSTR3B", "2026-10"), "2026-11-20");
  assert.equal(due(2026, "GSTR3B", "2026-12"), "2027-01-20");
  assert.equal(due(2026, "GSTR3B", "2027-03"), "2027-04-20");
});

test("TDS: March deposit is due 30 April; Q4 statement 31 May", () => {
  assert.equal(due(2026, "TDS_DEPOSIT", "2026-04"), "2026-05-07");
  assert.equal(due(2026, "TDS_DEPOSIT", "2027-03"), "2027-04-30");
  assert.equal(due(2026, "TDS_RETURN", "Q1 2026-27"), "2026-07-31");
  assert.equal(due(2026, "TDS_RETURN", "Q3 2026-27"), "2027-01-31");
  assert.equal(due(2026, "TDS_RETURN", "Q4 2026-27"), "2027-05-31");
  assert.equal(due(2026, "TDS_CERT", "Q4 2026-27"), "2027-06-15");
});

test("annual LLP and income-tax filings fall in the following FY", () => {
  assert.equal(due(2025, "LLP_FORM11", "FY 2025-26"), "2026-05-30");
  assert.equal(due(2025, "LLP_FORM8", "FY 2025-26"), "2026-10-30");
  assert.equal(due(2025, "ITR5", "FY 2025-26"), "2026-07-31");
  assert.equal(due(2026, "ADVANCE_TAX", "Q4 2026-27"), "2027-03-15");
});

test("tax audit moves the ITR date and adds the audit report", () => {
  const audited = { ...entity, tax_audit_applicable: 1 };
  assert.equal(due(2025, "ITR5", "FY 2025-26", audited), "2026-10-31");
  assert.equal(due(2025, "TAX_AUDIT", "FY 2025-26", audited), "2026-09-30");
  assert.equal(due(2025, "TAX_AUDIT", "FY 2025-26"), undefined);
});

test("QRMP: quarterly returns plus PMT-06 for the first two months", () => {
  const qrmp = { ...entity, gst_filing_frequency: "qrmp" as const };
  assert.equal(due(2026, "GSTR1", "Q2 2026-27", qrmp), "2026-10-13");
  assert.equal(due(2026, "GSTR3B", "Q4 2026-27", qrmp), "2027-04-22");
  assert.equal(due(2026, "GST_PMT06", "2026-04", qrmp), "2026-05-25");
  assert.equal(due(2026, "GST_PMT06", "2026-06", qrmp), undefined);
  assert.equal(due(2026, "GST_PMT06", "2026-04"), undefined);
  assert.deepEqual(monthsOfPeriod("Q4 2026-27"), ["2027-01", "2027-02", "2027-03"]);
});

test("set-off: same-head credit, no cross use of CGST and SGST", () => {
  const r = setOff({ igst: 0, cgst: 900, sgst: 900 }, { igst: 0, cgst: 1500, sgst: 200 });
  assert.deepEqual(r.cash, { igst: 0, cgst: 0, sgst: 700 });
  assert.deepEqual(r.closingCredit, { igst: 0, cgst: 600, sgst: 0 });
});

test("set-off: leftover IGST credit goes to the head that would need cash", () => {
  const r = setOff({ igst: 100, cgst: 100, sgst: 100 }, { igst: 200, cgst: 100, sgst: 0 });
  // Naively paying CGST first would strand ₹1 of CGST credit and need ₹1 cash for SGST.
  assert.deepEqual(r.cash, { igst: 0, cgst: 0, sgst: 0 });
  assert.deepEqual(r.closingCredit, { igst: 0, cgst: 0, sgst: 0 });
});

test("set-off: IGST credit is exhausted before CGST/SGST credit is used", () => {
  const r = setOff({ igst: 0, cgst: 500, sgst: 500 }, { igst: 600, cgst: 500, sgst: 500 });
  assert.deepEqual(r.cash, { igst: 0, cgst: 0, sgst: 0 });
  assert.equal(r.closingCredit.igst, 0);
  assert.equal(r.closingCredit.cgst + r.closingCredit.sgst, 600);
});

test("set-off: CGST and SGST credit can pay IGST", () => {
  const r = setOff({ igst: 1000, cgst: 0, sgst: 0 }, { igst: 100, cgst: 300, sgst: 300 });
  assert.deepEqual(r.cash, { igst: 300, cgst: 0, sgst: 0 });
});
