# Tie-out audit: figures computed by more than one code path

Read-only audit. No repo file was changed. All numbers below are test copy (the fictional sample portfolios), not live data.

**How it was run.** The three sample portfolios were built the way the app loads them (`buildSampleFund`, `buildSampleVentures` + `withSampleVentureData`, with the fund-level sample records from `sampleFundData` / `sampleVentureFundData`), as of 2026-11-28, last completed quarter 2026-09-30. Scripts are in `/tmp/claude-0/-home-user-underwriting-calculator/35575dbe-b549-510c-b85a-27c9d8d4e33d/scratchpad/` (`base.cjs`, `occ.cjs`, `debt.cjs`, `cov.cjs`, `econ.cjs`, `misc.cjs`).

**What the existing test covers.** `tests/node/sampleTieOut.test.cjs` (126 checks, all pass) ties the sample *documents* to the fund: abstracts vs. inputs, leases vs. rent roll, sale documents, Yardi aged receivables vs. unit rents, all-in basis and SF vs. `fund.json`, capital projects vs. plan vs. Capex Budget, PM fee payee, venture documents. It does **not** compare one screen or report with another. None of the findings below is caught by it or by `coverage1122.test.cjs` (252 pass).

Severity: High = two places show different numbers today on the sample data. Medium = can differ under realistic input. Low = same today, fragile duplicate logic.

---

## Findings, most serious first

### 1. High — Capital called / dry powder: Portfolio Summary and Home say $0 called, Reports say $68.7M (Sample Industrial Venture I)
- `lib/fundSummary.js:73-80` (`capitalSummary`, used by `components/FundSummary.jsx:83` and Home fund cards `lib/home.js:334-339`) uses `actualCapital(...).hasActuals`, which is true for **any** ledger row (`lib/capitalActivity.js:64`).
- `lib/fundFlows.js:49-52` (`hasCapitalActivity`, used by `fundValuation` → Valuations, Reports, Benchmarking) ignores rows of type `distribution` and `expense`.
- The venture's only ledger row is the sample sale distribution (2026-07-15, $45,967,455.58). Result:
  - Portfolio Summary / Home card: called **$0 (0.0%)**, dry powder **$80,000,000**.
  - Quarterly report (`lib/quarterlyReport.js:123`): LP capital called **$68,665,847 (85.8%)**.
- Same split on Sample Separate Account A with no ledger at all: Portfolio Summary $23,227,778 (92.9%, "purchase equity to date", LP + GP) vs. report $23,567,475 (94.3%, LP contributions from the waterfall including fees). Two definitions under one label.
- Fix: `capitalSummary` uses `hasCapitalActivity(terms)` for the switch and takes "called" from the same LP flows `fundValuation` uses (one shared `lpCalledAt(terms, deals, date)`). Tie-out assertion: for each sample portfolio, `capitalSummary.called` as of quarter end = report `capital.called`.

### 2. High — Asset Summary "Latest NAV" and fair value include the sold asset
- `lib/assetSummary.js:62` takes `a.rows.at(-1)` for every asset, including one already sold (its last row is the quarter before the sale); `:149` and `:182-187` sum them and label the total with `val.lastQ`. Shown in the header tile `components/AssetSummary.jsx:496` and in the Excel export (`assetSummaryXlsx`).
- Sample Industrial Venture I: Asset Summary fair value **$204,650,000**, NAV **$106,319,090**; Valuations / Reports / Home for the same quarter: gross asset value **$125,700,000**, Fund NAV **$59,554,996** (`lib/valuations.js:266-270`). Loan total $103,049,735 vs. $68,474,735 on Portfolio Debt; SF 900,000 vs. 600,000; occupancy 82.6% vs. 78.3% (report) / 80.3% (risk report).
- Fix: totals for value, NAV, loan, SF and occupancy use `notSold(deals, todayISO)` and only rows whose `quarterEnd === val.lastQ`; or take the fund totals straight from `val.quarters.at(-1)`. Assertion: `assetSummary.totals.valuation.{value,nav}` = `fundValuation.quarters.at(-1).{gav,nav}`.

### 3. High — Occupancy: three definitions, different numbers for the same asset
| Asset (test copy) | Rent roll as entered | Leases in effect today | Leases in effect at 9/30 |
|---|---|---|---|
| Example Summit Business Center | 90.11% | 87.00% | 88.55% |
| Example Foundry Flex Park | 67.91% | 74.38% | 75.66% |
| Example Orchard Commerce Center | 89.40% | 87.93% | 89.40% |

- Rent roll as entered (ignores later leases and move-outs): `rentRollOccupancy` `lib/uwActual.js:92` → fund quarterly report row `lib/quarterlyReport.js:71` (and its PDF / Excel, `occupancyOf` `:178`), Underwritten vs. Actual current year `lib/uwActual.js:114,126`; `unitStats` `lib/leases.js:95` → Asset Summary `lib/assetSummary.js:91,163`; firm occupancy on Home `lib/enterprise.js:46-54`.
- Leases in effect on the date (`unitsToday`): Business Plan KPIs `lib/businessPlan.js:203-209`, risk report vacancy `lib/riskReport.js:134,148`, asset quarterly report `lib/assetReport.js:44,78`, Vacant Units, fund limits.
- Visible conflicts today: the fund report's row for Foundry says 67.91% while the asset report for the same asset and quarter says 75.66%; Underwritten vs. Actual says 67.91% while the Business Plan says 74.38%; fund occupancy is 78.27% (report, Home) vs. 80.27% (risk report).
- Model Fund I ties (no later leases in its sample), which is why nothing has shown this.
- Fix: one `occupancyAt(inputs, dateISO)` in `lib/leases.js` built on `unitsToday`, called by all of the above with the screen's own date. Assertion: for every sample asset, report row = asset report = KPI at the quarter end; fund figure = SF-weighted sum.

### 4. High — GP promote: Portfolio Plan / Portfolio Impact / Sell-Hold vs. GP Economics / Portfolio Return
- `lib/fundPlan.js:59-63` (`gpPromote`) derives promote as GP distributions less the GP's pro-rata share. `lib/assetFees.js:28` (`gpEconomics`) uses the waterfall's own `wf.gpCarry` since 1.1.12 ("older results derive it").
- Sample Industrial Venture I: **$2,889,417** (Portfolio Plan `components/FundPlan.jsx:206`, `lib/fundPlan.js:160,225`, `lib/fundImpact.js:77`, Sell/Hold) vs. **$2,704,856** (GP Economics, Firm Economics, `components/FundAnalysis.jsx:136`, `components/ReturnsAnalysis.jsx:89`). Separate Account A: **$2,652,671** vs. **$2,461,760**. Model Fund I ties ($23,010,549). `sampleTieOut` checks only that the documents don't move the gpEconomics figure.
- Fix: `fundPlan.gpPromote` returns `gpEconomics(wf).gpPromote`. Assertion: `fundProjection.returns.gpPromote` = `fundGpEconomics.promote.total` on all three portfolios.

### 5. High — Gross multiple: Portfolio Plan / Portfolio Return vs. Asset Summary
- `lib/fundPlan.js:148-153` (and the same formula again inline in `components/FundAnalysis.jsx:674-676`) = positive quarterly flows ÷ negative quarterly flows, so a quarter with negative cash flow counts as extra capital.
- `lib/assetSummary.js:113,178` = (sum of annual cash flow + reversion) ÷ purchase equity, the model's own equity multiple.
- Separate Account A (one asset; model multiple 1.980x): Portfolio Plan **1.90x** vs. Asset Summary **1.98x**. Venture I: **1.53x** vs. **1.62x**. Model Fund I 3.319x vs. 3.320x.
- Related: per-asset IRR in `fundProjection.assets[].irr` (dated quarterly flows, e.g. Airport Flex 34.33%) vs. the model IRR shown on Asset Summary (33.65%); pooled IRR 36.87% (`fundPlan.js:152`) vs. 36.17% (`assetSummary.js:177`).
- Fix: one `grossReturns(deals, terms)` in `lib/fundPlan.js` used by Asset Summary totals and FundAnalysis; decide one multiple definition. Assertion: a one-asset portfolio's gross multiple = that asset's model multiple.

### 6. High — Loan maturity: reports show the initial maturity (already passed); Portfolio Debt shows the extended one
- `lib/quarterlyReport.js:82`, `lib/assetReport.js:89` and `lib/riskReport.js:192` use purchase date + loan term. `lib/fundDebt.js:50-54` counts extensions already used (and Home's loan alerts use it, `lib/home.js:223`).
- Example Summit Business Center: reports **2026-02-28**, Portfolio Debt **2027-02-28**. Example Orchard: **2026-06-30** vs. **2027-06-30**. Example Foundry: **2026-11-15** vs. **2027-11-15**; the risk report flags "loan matures 2026-11-15" for a date in the past. A third source, `inputs.loanTerms.maturityDate` (from the loan document), is tied by the tie-out test to purchase + term only.
- Fix: reports and risk report read `loanAt(...).currentMaturity`. Assertion: report maturity = `fundLoans` maturity for every sample loan.

### 7. High — LTV and "value" on Portfolio Debt vs. Valuations / Reports / limits
- `lib/fundDebt.js:29-32` (`valueAt`): latest mark, else **purchase price**. `lib/valuations.js:129,174`: an asset held at cost is carried at **price + capex budget**; `lib/riskReport.js:129-130` and `lib/fundLimits.js:47-48` use price + capex too. `lib/dealDocApply.js:666` (Loan Agreement view) divides by purchase price always. Asset Summary `:101` is loan ÷ price.
- Model Fund I at 9/30/2026: Portfolio Debt value $68,380,000, weighted LTV **70.5%** (`components/FundDebt.jsx:36`, computed inline); Reports / Valuations / limit check value $71,530,000, LTV **67.3%** (`lib/quarterlyReport.js:124`, `fundLimits.js:99`). Harbor Light: 69.1% (Portfolio Debt, and the covenant certificate that goes to the lender) vs. 66.4% (asset report, risk report). Airport Flex "LTV" is 65.5% (certificate, on the mark), 66.4% (risk report on cost) and 69.2% (Loan Agreement view, on price).
- Venture I: Portfolio Debt weighted LTV 58.2% (balance-weighted average of asset LTVs) vs. 54.5% (debt ÷ value) everywhere else: a second definition under the same name.
- Fix: `valueAt` returns the valuation row's value for the quarter (`assetValuation(...).byQuarter`), and the fund LTV is total balance ÷ total value in one exported helper. Assertion: per asset and per fund, Portfolio Debt value and LTV at quarter end = the report's.

### 8. High — Covenant tests: three sources that disagree
- Loan document / Debt tab: `inputs.loanCovenants` (`dscr`, `debtYieldPct`, `ltvPct` from the abstract; `dscrMin`, `dscrEnabled`… from the Debt tab) — used only by `covenantTests` `lib/dealDocApply.js:660-672`.
- Portfolio Debt and the covenant compliance certificate: `loanTests` `lib/fundDebt.js:18-26` reads `inputs.covenants` and `inputs.minDscr` (nothing in the app writes either), so it falls back to the **loan sizing constraints** and LTV + 10 points.
- Risk report: `Number(inp.minDscr) || 1.25` (`lib/riskReport.js:194,326`), always 1.25x.
- Airport Flex Park: the sample loan agreement has one covenant (DSCR 1.25x). The certificate tests DSCR 1.25x, **debt yield 8%** and **LTV 75%**, two covenants the loan does not have. Example Foundry Flex Park: Debt tab says DSCR covenant on at 1.25x, risk report tests 1.25x, the certificate has **no DSCR test** (sizing test switched off).
- Fix: one `covenantsOf(inputs)` reading `loanCovenants` (document value first, then the Debt tab's enabled tests), used by `loanTests`, the risk report and `covenantTests`. Assertion: for each sample loan document, the certificate's tests = the document's covenants.

### 9. High — "NOI actual (annualized)" in a quarterly report is not as of the quarter
- `kpiActuals(inputs, asOf)` `lib/businessPlan.js:299-306` takes the last 12 months of actuals on file and ignores `asOf` for NOI. Used by `lib/quarterlyReport.js:56,72`, `lib/assetReport.js:38,80`, `lib/businessPlanPdf.js:48`.
- Example Summit, Q3 2026 report: shows **$5,155,656** (includes October 2026); the 12 months ending September are **$5,124,642**. The Q1 2026 report built today shows the same $5,155,656 (should be $4,938,554). Occupancy in the fund report has the same problem (`:71`, no date at all), so the quarter-over-quarter "Occupancy" change in `quarterSummary` (`:189`) can only move when the list of assets changes, never because a lease started or ended.
- Fix: filter months `<= asOf.slice(0,7)` in `kpiActuals`. Assertion: report NOI for quarter Q = trailing months ending in Q, and differs from the next quarter's when actuals differ.

### 10. High — WALT: SF-weighted in one place, rent-weighted in another
- `lib/businessPlan.js:197-201` (Business Plan KPIs, asset report, plan targets) weights by SF. `lib/leases.js:142` (Asset Summary, Leases, Rent Roll) weights by rent; it also computes `waltSF` and does not show it.
- Same date, same leases: Example Foundry **2.28** vs. **2.53** years; Summit 1.92 vs. 1.97; Orchard 1.81 vs. 1.90.
- Also: the Leases tab computes WALT as of the **purchase date** on the rent roll as entered (`components/Leases.jsx:359`), Rent Roll as of today on today's leases (`components/UnitRoll.jsx:418`): Airport Flex 1.62 vs. 0.84 years.
- Fix: `assetKpis` takes `walt` from `leaseAnalytics(inputsToday(...), asOf)`; pick one weighting. Assertion: KPI WALT = `leaseAnalytics().walt` for every sample asset.

### 11. High — Sample income statement file disagrees with the app's sample actuals
- `docs/sample-yardi/income-statement-2026.csv` (written by `scripts/sample-yardi/generate.cjs:96-116`: budget ÷ 12 with three variances) and the actuals the app loads (`lib/samplePlans.js:35` `sampleActuals`: budget × a wiggle and its own stories) are two separate sets of monthly figures for the same assets. All 40 rows differ, e.g. Airport Flex Park 2026-02: app **$39,571**, file **$38,534**. The file also has a January 2026 row for Airport Flex (bought 1/30); the app starts in February.
- The tie-out test only checks that the generator reproduces the file.
- Fix: the generator writes the file from `samplePlanFor(...).actuals` (or the app's actuals are the parsed file). Assertion: every file row's NOI = `businessPlan.actuals[month].noi`.

### 12. High (small amount) — Model Fund I's sample distribution proposal: amount $10,682, LP $0, GP $0
- `lib/sampleFundData.js:88-94` and `components/DistributionAnalysis.jsx:125` save `amount`, `lp`, `gp` but not `heldBack` (`lib/distributions.js:187-192`). For Model Fund I the whole $10,681.64 is held by the waterfall, so the saved record and the list (`DistributionAnalysis.jsx:306`) show an amount whose parts add to zero; "Record as paid" would post a $10,682 distribution "LP 0, GP 0" to capital activity.
- Fix: store `heldBack` and show it, or cap the proposal at what the waterfall pays out. Assertion: every saved proposal has `amount = lp + gp + heldBack`.

### 13. Medium — Hand-written sample cash file
- `docs/sample-yardi/cash-balances-2026-09.csv` is "written by hand, not by the generator" (README). Balances are made up (total $941,639.18), property codes (`afp01`…) differ from the other files (`mf1-01`…), and it has 6 of the 7 assets owned at 9/30/2026 (Southpoint Flex missing). The tie-out test checks property names only.
- Fix: generate it from `assetDistributable(...)` (the projected balance) with the `mf1-NN` codes. Assertion: one row per asset held at the date, each balance = the app's.
- Unconfirmed: `tests/fixtures/sample-yardi/` is the older set built from the test scenario, not from the sample fund; I did not check which tests still read amounts from it.

### 14. Medium — Property debt in reports is the original loan, not the balance
- `lib/quarterlyReport.js:79,88,124` and `lib/assetReport.js:89` use `r.debt.loanAmount`; the same report's NAV bridge (`nav.debt`), Portfolio Debt and the risk report use the balance at the date. Ties today only because every sample loan is interest-only.
- Reproduced with an amortizing copy of Airport Flex (25-year amortization, bought 2023): report "Property debt" **$4,980,000**, LTV 66.4%; NAV debt, Portfolio Debt and risk report **$4,703,165**, LTV 62.7%.
- Fix: report rows take `row.debt` from the valuation. Assertion: `report.debt.total === report.nav.debt`.

### 15. Medium — Hold-year conventions differ
- `lib/uwActual.js:101-106` counts by calendar month; `lib/fundDebt.js:13`, `lib/riskReport.js:102`, `lib/valuations.js:178-179` by anniversary date; `lib/assetMetrics.js:32-38` by 365.25-day years capped at the hold.
- Route 9 Small Bay (bought 2026-03-16) on 2027-03-05: Underwritten vs. Actual uses year **2**, Portfolio Debt and break-even use year **1**, so "current-year NOI" differs between tabs for part of each anniversary month. After the hold ends, `assetMetrics` stays on the last year while the others move on.
- Fix: one exported `holdYearAt(acq, iso)` in `lib/fundTimeline.js`.

### 16. Medium — Cost: three figures called cost / basis / total cost
- Valuations, Reports, risk report, limits: price + capex budget (`lib/valuations.js:129`). Dispositions: all-in basis incl. closing costs (`lib/assetMetrics.js:16-22`). Underwritten vs. Actual "Total cost": equity + loan incl. cap premium (`lib/uwActual.js:30`).
- Airport Flex Park: **$7,500,000 / $7,788,000 / $7,815,858**. Unrealized gain on Valuations is measured against the lowest. The tie-out test covers only all-in basis vs. the documents.
- Also `lib/quarterlyReport.js:70` and `lib/assetReport.js:73` compute unrealized as value − original cost, while `lib/valuations.js:192` uses cost + capex entered on marks; equal today (no sample mark has capex).
- Fix: label them distinctly or use `allInBasis` everywhere; reports read `row.unrealized`.

### 17. Low — Asset counts and dates on fund cards
- `capitalSummary.assets` (`lib/fundSummary.js:75,90`; Home card) counts every asset bought by today including sold ones: Venture I shows **3** where Home's firm summary and the report show **2**.
- Home "NAV" (`lib/home.js:332` and the Portfolio Management lane in `lanes`) is Fund NAV (value − debt + reserves) at the last quarter; Reports "NAV" is LP NAV. Venture I: $59.6M vs. $51.5M. Labelled differently on Valuations, not on Home.

### 18. Low — Inline totals in components
- `components/FundDebt.jsx:35-36` (weighted DSCR / LTV), `components/FundAnalysis.jsx:625-627, 674-676, 688-692, 740-741` (equity, price, SF, gross in/out, calls), `components/UnitRoll.jsx:142-144, 800` (occupied SF, contracted rent), `components/VacantUnits.jsx:19` recompute figures the libs already return. Same numbers today except where noted above.

---

## Checked and tie

| Figure | Paths compared | Result |
|---|---|---|
| Property debt balance at quarter end | valuation, report NAV bridge, Portfolio Debt, risk report | equal on all three portfolios (interest-only loans) |
| Gross asset value at quarter end | valuation, sum of report rows, firm AUM (ventures) | equal |
| LP NAV, net LP IRR, TVPI | valuation, report, Home card IRR | equal |
| Sub line balance at quarter end | valuation, Distribution Analysis | equal ($26,477,237 Model Fund I) |
| Purchase equity | model, `fundProjection`, GP Economics, Asset Summary | equal |
| Fees by type | GP Economics totals = sum of years = sum of assets + fund fee | equal |
| Net LP multiple, LP capital | `fundProjection` vs. `fundGpEconomics` | equal |
| DSCR, current year | Portfolio Debt vs. risk report | equal |
| Annual in-place rent | `leaseAnalytics` (today) vs. risk report | equal |
| NOI annualized | fund report vs. asset report (same quarter) | equal (both share finding 9) |
| Exit date, sold status | Asset Summary, `fundProjection`, GP Economics, valuation | equal |
| PDFs | `lib/*Pdf.js` render the builder's object; only `fundDebtPdf.js:51` re-sums balances | no own formulas found |
| Construction CSV in the app vs. `docs/sample-yardi` | `phaseT3.test.cjs:12` | already asserted |

## Not covered

- Stress test, sensitivity tables, Cash Yield, Debt Sizing, Returns Analysis, Capital Analysis components against the engine.
- Fund Impact and Sell/Hold scenario figures beyond the promote and multiple definitions.
- Benchmarking (PME, quartiles) beyond confirming it reads `fundValuation`.
- Tenant credit, delinquency totals (aged receivables → fund → firm), TI funding, property management totals (insurance premium on Home vs. PM tab).
- Pipeline report and Quick Underwrite vs. the full model.
- Firm Economics / GP Partners party splits (only fund-level totals checked).
- Excel exports cell by cell (they read the same result objects as the screens; not diffed).
- Browser tests and anything in the live database.
- Lease, loan, sale and venture documents (already covered by the existing tie-out test; not re-audited).
