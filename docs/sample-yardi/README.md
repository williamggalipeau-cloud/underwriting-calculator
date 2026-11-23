# Sample Yardi exports (fictional)

Fictional exports in the layout of Yardi Voyager reports, for Model Fund I's
nine sample assets. They use generic columns, not Yardi's templates, and are
for testing only. Regenerate them with `node scripts/sample-yardi/generate.cjs`.
`expected.json` holds the totals the tests check.

| File | What it is | Used by |
|---|---|---|
| `aged-receivables-2026-08/09/10.csv` | Aged receivables by tenant at three month-ends (current, 1–30 … over 180, prepayments) | Phase H rent delinquency (Unit Roll → Upload aged report) |
| `tenant-ledger.csv` | Charges and payments for three tenants, Aug–Oct 2026 | Phase H collections (Upload tenant ledger) |
| `income-statement-2026.csv` | Monthly income statement by property, from acquisition to Oct 2026 (the closing budget with deliberate variances) | Phase I budget vs. actual (Asset Business Plan → Import actuals) |
| `construction-jobs-2026-10.csv` | Construction manager job summary: TI by unit and capital jobs with budget, revisions, committed, invoiced, paid, retainage, status | Planned: TI spend by unit (business plan enhancement) |
| `construction-invoices-2026-10.csv` | The invoices behind those jobs | Planned: TI spend by unit |

Deliberate cases:
- **Delinquency:** Harbor Light in default (91–180 days), Ridgeway in legal (over 180 days), Mill Creek prepaid, Southpoint disputing CAM.
- **Income statement:** Airport Flex utilities high in the summer, Route 9 taxes +15%, Harbor Light rent −8% from July.
- **Construction:** Airport Flex unit 001 TI 7.8% over budget, Ridgeway unit 014 TI 34% over, Route 9 unit 018 not started, and two capital jobs not tied to a unit.
