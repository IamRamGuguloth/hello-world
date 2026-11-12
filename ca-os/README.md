# CA OS

A local-first compliance dashboard for an Indian LLP: mirrors Zoho Books, computes GST payable, tracks statutory deadlines, and guides manual filing. It never logs in to a government portal.

```bash
npm install
npm run seed
npm run import:zoho -- invoice samples/invoices-2026-10.csv
npm run import:zoho -- bill    samples/bills-2026-10.csv
npm run dev
```

- [System architecture](docs/01-architecture.md)
- [GST data flow](docs/02-gst-data-flow.md)
- [Step 1 plan and weekend checklist](docs/03-step-1-plan.md)

All records live in `data/`, which is git-ignored. Dates and rates in `src/lib/rules.ts` are the standard statutory calendar and must be verified against official sources before you rely on them.
