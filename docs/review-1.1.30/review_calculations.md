# Calculation review: findings

Read-only review. Nothing in the repo was changed. All 75 existing Node suites pass, so none of the findings below is caught by a test today.
Every dollar figure below is from the sample fund or a sample asset (test copy, not your firm's data), reproduced with node scripts against the real modules.

## Ranked findings

### 1. High: closing a sale on the Dispositions tab leaves the asset's hold period unchanged
- **Where:** `lib/dispositions.js:144` (`closeSale`), read by `lib/calculations.js:890-895`.
- **What is wrong:** `closeSale` stores the sale price, costs and date but not the hold. The deal model then books the realized price at the end of the originally planned hold and keeps the operating cash flow of the years after the sale. The closing-statement document path does set the hold (`lib/dealDocApply.js:91`), so the two ways of closing disagree.
- **Example:** Airport Flex Park moved to a 2024-01-15 purchase, planned hold 4 years, sold 2026-01-15 for $13.0M.
  - Code gives: hold still 4; equity flows -2,835,858 | 56,318 | 238,600 | 338,825 | 7,698,005; IRR 32.3%; Portfolio Return dates the sale 2028-01-15.
  - Should give: two years of cash flow and the sale in year 2. The Track Record shows 63.8% for the same sale.
- **Confirmed:** yes, by running `closeSale` then `underwrite` and `snapshotDeal`. The sample sold asset closes on its planned exit date, which is why the sample data does not show it.
- **Smallest fix:** in `closeSale`, for a whole-asset sale, also set `holdPeriodYears` the way `dealDocApply.js:91` does.

### 2. High: the "cliff" tier method and the separate-account incentive fee are ignored on some screens
- **Where:** `components/FundAnalysis.jsx:630-640` (Portfolio Return: neither is passed), `lib/valuations.js:234-244` and `lib/sellHold.js:263-272` (tier method not passed). The complete version is `lib/fundPlan.js:37-49` (`waterfallConfig`), used by Fund Plan, GP Economics, Distributions and the sale split.
- **What is wrong:** three places build their own waterfall settings and leave fields out, so the same fund gets a different LP / GP split depending on the screen.
- **Example (sample fund, tier method set to cliff):**
  - Portfolio Return and Sell/Hold: LP distributions $77,039,781, promote $23,009,796, net LP IRR 33.83%.
  - Fund Plan and GP Economics: LP distributions $72,970,341, promote $27,079,235, net LP IRR 31.47%.
  - Valuations: net LP NAV is identical for marginal and cliff ($71,741,271).
- **Example (sample fund as a separate account, 20% incentive fee over 9%):** Portfolio Return promote $23,009,796; Fund Plan and GP Economics $11,788,341.
- **Confirmed:** yes for `sellHold.js` and `valuations.js` (ran `fundScenario`, `fundValuation`, `fundProjection`). For Portfolio Return I copied the screen's settings into node; not checked in the browser.
- **Smallest fix:** use `waterfallConfig(terms)` in all three places (plus `feeAfterISO` where it is passed today).

### 3. High: recording one distribution or fund expense makes "capital called" read $0
- **Where:** `lib/capitalActivity.js:40` and `:64` (`hasActuals`), used by `lib/fundSummary.js:79-88` and `components/FundAnalysis.jsx:720-729`.
- **What is wrong:** `hasActuals` is true for any ledger row, including "distribution" and "expense". `hasCapitalActivity` in `lib/fundFlows.js:49-52` correctly ignores those two types, so the fund's cash flows stay on the model while the capital figures switch to an empty ledger.
- **Example:** sample fund, $100M commitments.
  - No activity: called $34,042,042 (34.0%), dry powder $65,957,958.
  - After one recorded $250,000 distribution (what the Distribution Analysis tab saves): called $0 (0.0%), source "capital activity", dry powder $100,000,000.
- **Confirmed:** yes, with `capitalSummary`. The Portfolio Return capital panel uses the same flag (read, not run).
- **Smallest fix:** in `actualCapital`, set `hasActuals` from rows of type call, draw or repay only.

### 4. Medium: the loan-sizing tests are applied before lender-funded capex is added
- **Where:** `lib/calculations.js:666` (capex added after the binding test), `:641-647` and `:929-931` (loan-to-cost leaves capex out of cost).
- **What is wrong:** the minimum DSCR, minimum debt yield and maximum loan-to-cost are met on the loan before capex, then the capex budget is added on top, so the final loan fails the test it is labelled as bound by.
- **Example:** Airport Flex Park, $300,000 lender-funded capex.
  - Minimum debt yield 9.5%: loan $5,165,015, debt yield 8.95%, binding test shown as "Debt Yield". With capex paid by equity: $4,865,015 and 9.50%.
  - Maximum loan-to-cost 60%: loan $4,792,800, loan-to-cost shown 64.01% (61.3% on full cost).
- **Confirmed:** yes. No test pins this.
- **Smallest fix:** subtract the capex loan from the DSCR, debt-yield and LTC limits before taking the minimum, and add `capexBudget` to the cost in both LTC lines. LTV on purchase price can stay as it is (Quick Underwrite already warns about it).

### 5. Medium: the year-1 NOI used to size the loan is not the year-1 NOI in the cash flow
- **Where:** `lib/calculations.js:592` (property-level credit loss) against `:755` (per-unit credit loss); `:597-601` (asset management fee on equity left out, noted in a comment); `:932` (debt yield uses the sizing NOI).
- **What is wrong:** with a rent roll, sizing applies the property credit-loss % to all revenue, while the cash flow uses each unit's own %. A DSCR-sized loan then misses the minimum DSCR.
- **Example:** units at 5% credit loss, property field at 1%, minimum DSCR 1.25.
  - Sizing NOI $462,176; cash-flow NOI $443,115; loan sized by DSCR $6,256,196; DSCR shown 1.198.
  - Debt yield shown 7.39%; on the cash-flow NOI it is 7.08%.
  - A 1.5%-of-equity asset management fee alone gives the same kind of gap (DSCR 1.199).
- **Confirmed:** yes.
- **Smallest fix:** use the summed unit credit loss in the sizing block when there is a rent roll. For the fee on equity, iterate the sizing once or twice.

### 6. Medium: a negative or zero year-1 NOI switches the DSCR and debt-yield tests off
- **Where:** `lib/calculations.js:659` (limits of zero or less are dropped).
- **Example:** NOI of -$50,000 with minimum DSCR 1.25 and debt yield 8% switched on: the loan is the full LTV amount, $5,850,000, labelled "LTV". A small positive NOI would give a very small loan.
- **Confirmed:** yes.
- **Smallest fix:** treat an enabled test with NOI at or below zero as a zero limit.

### 7. Medium: a realized sale's IRR jumps because the hold is rounded to whole years
- **Where:** `lib/dispositions.js:160` (`trackRecord`), `lib/dealDocApply.js:91`.
- **Example:** same asset and price, bought 2024-01-15.
  - Sold 2025-07-10 (1.48 years): IRR 158.3%, multiple 2.58x.
  - Sold 2025-07-20 (1.51 years): IRR 63.8%, multiple 2.67x.
  - A 2.58x multiple over 1.48 years is about 90% a year.
- **Confirmed:** yes.
- **Smallest fix:** in `trackRecord`, build dated flows (whole years at year ends, the part year pro rata, proceeds on the sale date) and use `xirr`, as `assetSellHold` does for "sell now".

### 8. Medium: no management fee during the investment period when total commitments are blank
- **Where:** `lib/fundExpenses.js:59` and `:81-82`.
- **What is wrong:** the default fee basis is LP commitments during the investment period. Commitments default to 0 ("not set"), so the fee is 0 until that period ends. The subscription line falls back to planned calls in the same case; the fee does not.
- **Example:** sample fund, 1.5% fee. Commitments $100M: fees $4,130,126 ($356,250 a quarter at the start). Commitments blank: fees $1,280,126, first eight quarters $0.
- **Confirmed:** yes.
- **Smallest fix:** when commitments are 0, use LP invested capital (or planned calls) as the basis and say so on the fee line.

### 9. Medium: Sell/Hold charges a loan extension fee in the year of sale
- **Where:** `lib/sellHold.js:57` (one long run with hold = longest hold + 2) with `lib/calculations.js:518` and `:841`.
- **What is wrong:** the engine skips the extension fee and replacement cap in the sale year, judged by the run's own hold. In the long run every "hold to year n" keeps them in year n.
- **Example:** Airport Flex Park, hold to year 4: year-4 cash flow $396,005 in the long run against $458,005 in the underwriting (a $62,000 extension fee). Route 9: $114,000. Harbor Light: $85,000.
- **Confirmed:** yes. The replacement cap has the same exposure when the flat cost is used (code read, not reproduced: the sample assets use per-year costs).
- **Smallest fix:** in `option(n, …)`, add back year n's `extensionFee` and `capReplacement` from the long run.

### 10. Medium: expected downtime is rounded to whole months at each lease rollover
- **Where:** `lib/calculations.js:398` and `:429`.
- **Example:** one unit, lease ends in month 12.
  - 80% renewal, 2 months downtime: expected 0.4 months vacant, modelled 0.
  - 75% and 2 months: expected 0.5, modelled 1.
  - 50% and 1 month: expected 0.5, modelled 1.
  - 60% and 6 months: expected 2.4, modelled 2.
- **Confirmed:** yes, with `simulateUnit`. The defaults (60%, 2 months) round 0.8 up to 1.
- **Smallest fix:** keep whole vacant months but book the fraction as vacancy loss in the first re-let month.

### 11. Medium: "promote" has two definitions, and they differ when fees are called from LPs
- **Where:** `lib/assetFees.js:28` (the waterfall's carry) against `lib/gpEconomics.js:102-113`, `lib/fundPlan.js:59-63` and `lib/sellHold.js:294-298` (GP distributions less its share of contributed equity).
- **Example:** sample fund with the sub line off and no fund cash reserve, so $4,130,126 of fees are called from LPs only: carry $21,985,629; pro-rata figure $22,596,933. GP Economics with everything realized shows total $21,985,629, realized $22,596,933, projected -$611,305.
- **Confirmed:** yes. With the sample fund's normal terms the two agree.
- **Smallest fix:** use the ledger's `carry` for realized promote in `gpEconomics.js:109`, and `wf.gpCarry` in `fundPlan.gpPromote` and `sellHold.js`.

### 12. Medium: an empty or fractional Hold Period, or a 0 average lease term, breaks the model
- **Where:** `lib/calculations.js:887` (hold); `:583-586` and `:743-746` (lease term).
- **Example:** hold 0 or 4.5 throws "Cannot read properties of undefined (reading 'noi')". Average lease term 0 with no rent roll makes NOI, IRR and exit value NaN.
- **Confirmed:** in node. Unconfirmed in the browser: the Hold Period field (`components/DealInputs.jsx:30-34`, `:1493`) passes 0 when cleared, `app/page.jsx:1267` runs the model with no guard, and I found no error boundary.
- **Smallest fix:** at the top of `underwrite`, use `Math.max(1, Math.round(hold))`, and guard the lease term the way `annualRolloverCosts` already does.

### 13. Low
- **Sell/Hold on a purchase anniversary** (`lib/sellHold.js:31, 51-53`; `lib/dispositions.js:32, 76-77`): years are counted at 365.25 days, so one year after purchase reads 0.9993. A "Hold to year 1" option appears with its sale on the decision date (NPV $2,070 in the example). Confirmed. Fix: count whole years with `addYears`.
- **Last quarter's management fee is not pro-rated** (`lib/fundExpenses.js:92-97`): the last sale is 2030-11-13, the quarter from 2030-10-01 is charged in full ($26,950) and the ledger note says "(prorated)". Confirmed. Fix: use `q.end` in the day count.
- **Monthly payment is Infinity for an interest-only loan entered as 0 amortization and 0 IO years** (`lib/calculations.js:937`); loan constant is NaN for an all-cash deal (`:686`). The Debt screen shows a dash. Confirmed.

## Checked and found sound
- IRR and XIRR solvers, including the no-sign-change cases.
- Amortization with an IO period and floating rates.
- Marginal tiers, catch-up and compounding pref against the hand-worked cases in `tests/node/waterfall.test.cjs`.
- Quarterly spreading of asset cash (sums back to the annual figure).
- NCREIF-style time-weighted return and the PME formulas.
- Later leases and move-outs in the unit simulation.

## Files
- **Read in full (all 24 in scope):** `calculations`, `fundTimeline`, `fundFlows`, `fundTerms`, `distributions`, `fundExpenses`, `fundPlan`, `capitalActivity`, `gpEconomics`, `gpPartners`, `firmEconomics`, `valuations`, `sellHold`, `quickUnderwrite`, `uwActual`, `benchmarks`, `dispositions`, `businessPlan`, `capitalProjects`, `unitMix`, `fundLimits`, `leases`, `leaseApply`, `delinquency`.
- **Also read in full:** `leaseHistory`, `subLine`, `assetFees`, `fundTypes`.
- **Read in part only:** `samplePortfolio.js` (`snapshotDeal`), `fundSummary.js` (`capitalSummary`), `components/FundAnalysis.jsx` (waterfall settings and capital panel), `dealDocApply.js` (closing rows).
- **Not reviewed:** `cashYield.js`, `forwardCurve.js`, `capPricer.js`, `fundDebt.js`, and the screens other than the lines cited.
- **Lighter coverage:** `gpPartners.js` and `firmEconomics.js` were read but only exercised through the existing tests.
