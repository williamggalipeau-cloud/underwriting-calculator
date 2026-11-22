# Lease, documents and performance plan (phases A–L)

One plan for everything from lease documents to fund performance: what has
been built, what is scheduled, and what each phase will do. Each phase is
built on the working branch with the user manual, Node and Playwright tests,
and a pull request; nothing merges without the user. CREparser connectors are
used to validate only, staying within the user's free allowance. Nothing
changes the model without the user clicking to apply it.

## Status

| Phase | Scope | Status |
|---|---|---|
| A | Lease documents: upload, store, open | ✅ Done, live (PR #43) |
| B | Lease abstraction with Claude: prompt, save, viewer | ✅ Done, live (PR #53); sample abstracts PRs #54–#57 |
| C | Review and apply abstracts to the rent roll; rent steps; renewal options; mismatch flags | ⏰ Scheduled 11/22 5:30am PT |
| D | Fund lease views: critical dates, risk flags, exports, Asset Summary; tenant credit documents | ⏰ Scheduled 11/22 10:30am PT |
| E | Documents tab: OM, rent roll, T-12, LOI, PSA, IC memo, closing statements | ⛓ Starts when D is complete |
| F | Loan agreement → Debt tab | ⛓ Starts when E is complete |
| G | Appraisal → Valuations tab | ⛓ Starts when F is complete |
| H | Estoppels, CAM reconciliation and billing | ⛓ Starts when G is complete |
| I | Asset budget vs. plan | ⛓ Starts when H is complete |
| J | Underwritten vs. actual performance | ⛓ Starts when I is complete |
| K | Fund plan vs. actual | ⛓ Starts when J is complete |
| L | Performance reporting (shareable and internal) and internal risk reports | ⛓ Starts when K is complete |

Each finished phase is marked here (and in the user manual's §13 Roadmap)
with what was built and how it was tested; the user gets a progress note in the Claude session after each one.

## Phase A: lease documents (done)

- **Leases tab**: add a lease per asset with tenant, the
  rent roll unit(s) it covers, and its PDFs in order (base lease, then
  amendments; drag to reorder; each marked Lease, Amendment or Other).
- Stored privately in Supabase: the `lease_documents` table and a private
  `leases` storage bucket. Workspace members read; owners and editors write;
  every change goes to `audit_log`. Documents open through one-hour links.
- Lease cards list their documents, with + Add documents, Edit tenant /
  units and Delete lease.
- **This asset / Whole fund** views; asset locations (street address, city,
  state, ZIP) for each Model Fund I asset.
- 14 fictional sample leases (12 assets, three with a first amendment) in
  `docs/sample-leases/` for testing.

## Phase B: lease abstraction (done)

- **Abstract with Claude** makes a prompt for a Claude session with the
  CREparser Lease Abstraction connector: one-hour document links, the
  Model Fund I light-industrial template (67 fields incl. tenant business and
  SIC code), rent schedule, critical dates and risk flags. The session
  validates (never opens the connector viewer, which would use a free
  document) and saves through `save_lease_abstract` (status "abstracted").
- **Save abstract** (paste) and **View abstract**: key terms by group, rent
  schedule, critical dates and risk flags, each with clause, quote, status
  and a link to the PDF page; amended terms show their earlier value.
- Validated sample abstracts in `docs/sample-leases/abstracts/`: 11 of 12
  (all but Lakeshore). Attached in the app so far: Airport Flex and Harbor
  Light; the rest are attached at the start of phase C.

## Phase C: review and apply (scheduled 11/22 5:30am PT)

- First: attach the nine remaining sample abstracts to the uploaded leases
  and abstract Lakeshore (lease + amendment).
- **Apply to rent roll**: side-by-side comparison of the rent roll unit(s)
  and the abstract (tenant, SF, dates, rent, escalation, lease type,
  deposit, guarantor, options, rights, rent schedule); tick fields and
  apply, replacing a unit or creating a new one prefilled from the abstract.
  Vacancy, occupancy, WALT and mark to market update immediately; every
  change is logged as from the abstract; the lease is marked "applied".
- **Rent steps** from the abstract's rent schedule drive the cash flow while
  the lease runs (rent-roll NOI deals).
- **Renewal options** drive renewals: a tenant renews on its option when the
  option rent is at or below market, with no downtime; otherwise the usual
  renewal probability and re-leasing apply.
- **Mismatch flags** on the Unit Roll and Leases tab where the rent roll
  differs from the lease.
- The sample leases' tenants are not on the generated rent rolls; the user
  applies them after reviewing C.

## Phase D: fund lease views (scheduled 11/22 10:30am PT)

- **Critical dates**: every deadline from the abstracts (expirations,
  renewal and termination notices, option and allowance deadlines,
  SNDA/estoppel periods), with the action required; amber within 90 days,
  red when past; filter by asset and type.
- **Risk flags**: every flagged clause with its clause and quote; filter by
  type and asset.
- **Exports**: Excel for each view; a printable lease abstraction report per
  asset or for the whole fund.
- **Asset Summary**: "Leases abstracted" column and a leases section in each
  asset's Details (WALT, next critical date, risk-flag count).
- Reminders before notice dates: proposal only; nothing that sends messages
  without the user's go-ahead.
- **Tenant credit documents** (added 11/22): on each lease, a *Tenant
  credit* section for credit reports (e.g. D&B, Experian, a rating agency or
  bank reference) and tenant (and guarantor) financial statements (balance
  sheet, income statement, tax returns, audited or not), each with its
  type, source, period or report date and who uploaded it. Stored in the
  same private bucket as the lease, but **owners and editors only** (viewers
  can't open them, since they're confidential). Key figures entered by hand
  or read by Claude from the PDF and checked locally (credit score or
  rating, revenue, net income, EBITDA, current ratio, debt to equity, rent
  as % of revenue). The latest rating fills the unit's Credit rating on the
  Unit Roll when applied. Flags: statements older than 12 months, a lease
  clause requiring periodic statements (from the abstract) with its next
  due date added to critical dates, and a falling score or rising leverage.
  Feeds the tenant section of phase L's risk report.

## Phases E–H: deal documents

Uses the CREparser **Deal Review** connector the same way the Leases tab uses
the Lease Abstraction connector: the app makes the prompt, the session
abstracts and validates, the result is saved to the database, and the user
reviews and applies it field by field.

### Shared foundation (built in phase E, used by F–H)

- **Database:** a `deal_documents` table and a private `deal-docs` storage bucket,
  set up like `lease_documents`: workspace members read, owners and editors
  write, every change goes to `audit_log`. Columns: `doc_type` (om, rent_roll,
  t12, loi, psa, ic_memo, closing_acq, closing_disp, loan, appraisal, estoppel,
  cam, billing, other), `deal_id`,
  `files` (in order), `status` (uploaded, abstracted, applied), `abstract`,
  `applied_fields`, and who and when for each step.
  `save_deal_abstract(doc, abstract)` mirrors `save_lease_abstract`. Leases stay
  in `lease_documents`.
- **Documents tab** (after Leases), with This asset / Whole fund views. It holds
  uploads, a **Review with Claude** button that makes a prompt per document type
  naming the Deal Review tools to use, **Save abstract**, a viewer that shows
  each value with its quote, page link and status, and **Apply**.
- **Apply:** a side-by-side comparison of app value and document value per
  field. You tick the fields to accept, every change is logged as "from
  <document>", and the mismatch badge stays on fields you chose not to take.
- **Critical dates:** every dated deadline from every document flows into
  phase D's fund-wide critical dates.

### Phase E: acquisition documents (OM, rent roll, T-12, LOI, PSA, IC memo)

| Document | Connector tools | Applies to |
|---|---|---|
| Offering memo | `om_validate` / `om_show` | **New deal from OM**: name, address, SF, units, year built, asking price, in-place NOI, cap rate, occupancy, each with its source |
| Rent roll | `rentroll_validate` / `rentroll_show` | **Unit Roll**: preview new, changed and removed units, then replace or merge; SIC suggested from each business; lease dates, options and recoveries carried over |
| T-12 | `t12_validate` / `t12_show` | **T-12 vs underwriting**: income and each expense line in $ and $/SF beside the deal inputs, variances flagged; apply chosen lines (taxes, insurance, utilities, repairs, management, other income) |
| LOI | `loi_validate` / `loi_show` | **Deal terms**: price vs underwritten price, deposit, due diligence and closing periods, financing contingency; dates to critical dates |
| PSA | `cre_read_document` + `cre_search_text` (no PSA validator) | **Deal terms and critical dates**: price, deposits and when each goes hard, due diligence expiry, closing and extension notices, title and survey objection dates, estoppel and SNDA delivery, reps and warranties survival and cap, assignment, default remedies. The app's own PSA template is checked locally (every quote must be in the PDF) and shown as "not connector-validated" |
| Final IC memo | `cre_read_document` + `cre_search_text` (no IC memo validator; uses no free documents) | **As-approved baseline**: approval date and approvers, approved price and total cost, sources and uses, debt terms, business plan (capex, lease-up), projected IRR, multiple, cash-on-cash, hold, going-in and exit cap, key risks, and conditions of approval. Checked locally and shown as "not connector-validated" |
| Closing statement, acquisition (settlement statement / ALTA) | `cre_read_document` + `cre_search_text` (no validator; uses no free documents) | **Actual cost basis**: contract price, credits and prorations (rent, taxes, CAM, security deposits transferred, TI/LC and repair credits), closing costs by type (title, escrow, transfer tax, legal, lender fees), loan proceeds, and equity actually funded; closing date. Replaces the underwritten price/closing costs as the asset's actual basis (shown side by side, applied by choice). Checked locally, "not connector-validated" |
| Closing statement, disposition | same | **Realized sale**: sale price, credits and prorations, selling costs (commission, transfer tax, legal), loan payoff and prepayment, and net proceeds to equity; closing date. Marks the asset sold, records the actual exit in the cash flows, and fixes realized IRR and multiple (Portfolio Return, Sell / Hold). Checked locally, "not connector-validated" |

**IC memo in the app:**
- **Approved vs current:** for each asset, the IC-approved figures beside the
  current model (price, total cost, loan, equity, year-1 NOI, exit cap, IRR,
  multiple, cash-on-cash, hold), with variances. Shown in the asset's Details
  panel in the Asset Summary and as a fund-level roll-up on Portfolio Return.
  It is a reference snapshot: applying it does not change the model.
- **Conditions of approval:** a checklist per asset (e.g. "Phase I clean",
  "lender term sheet at 65% LTV or better"), each ticked off with who and when
  in the change log, and open items shown on the Documents tab.
- **Dates:** the approval date and any condition deadlines go to critical dates.

### Phase F: loan agreement to the Debt tab

- Loan abstract (`loan_validate_abstract` / `loan_show_abstract`) compared with
  the Debt tab inputs: loan amount, index, spread and floor, term and extensions
  (conditions and fees), IO period and amortization, rate cap (strike, term,
  replacement), prepayment, reserves and holdbacks, covenants (DSCR, debt yield,
  LTV) with test dates and cure terms.
- Apply chosen fields, flag mismatches, and set the covenant tests to the loan's
  actual levels.
- Critical dates: maturity, extension notice windows, cap expiry, covenant test
  dates, reporting deadlines.

### Phase G: appraisal to the Valuations tab

- Appraisal abstract (`appraisal_validate` / `appraisal_show`): value, effective
  date, cap rate, NOI, approaches, appraiser.
- Apply it to the quarter's mark as source "appraisal", with appraiser, cap rate
  and a link to the PDF page. It warns when the quarter is inside the 6-month
  cost hold, where the value isn't used.
- Compares the appraisal's NOI and cap rate with the underwriting.

### Phase H: estoppels, CAM reconciliation and billing

- **Estoppel** (`estoppel_validate` / `estoppel_show`) compared with the lease
  abstract and the rent roll unit: rent, dates, deposit, options, defaults,
  amendments. Differences show as mismatch flags on the lease and the unit.
- **CAM reconciliation / billing** (`cam_validate`, `billing_validate`): billed
  share and amounts checked against each lease's terms (pro rata share, expense
  caps, management fee cap, base year, exclusions), showing recoverable vs
  billed and any under- or over-recovery.

## Phases I–K: performance tracking (after H)

Decided 11/22: three new phases, run in order after phase H
(E → F → G → H → I → J → K). They need phase E's IC memo and closing
statements for their baselines; J uses I's actuals and K rolls up I and J.
Scheduled (11/22): each starts as soon as the previous phase is complete,
following H.

### Phase I: asset budget vs. plan (added 11/22)

At closing, each asset gets a budget for its whole life (the "plan"). The
current budget and actual results are then tracked against it.

- **Lock the plan at closing:** snapshot the closing underwriting as the
  asset's plan, by year and month: rental income, recoveries, other income,
  vacancy and credit loss, each operating expense line, NOI, capex, TI/LC,
  debt service and cash flow. Leasing assumptions are included per unit
  (downtime, new rent, renewals). The IC-approved figures (phase E) can seed
  it. The plan never changes after it is locked; a re-forecast is saved as a
  new version (e.g. "2027 budget", "Q2 reforecast").
- **Actuals:** monthly or quarterly actuals by line, entered by hand or
  imported from Excel/CSV (a T-12 or GL export; the phase E T-12 reader can
  help map lines).
- **Reports:** plan vs. current budget vs. actual, by line for the month,
  quarter, year to date and since closing, in $ and $/SF with variances and
  %. Amber/red flags over a threshold, with a comment per variance.
  Leasing vs. plan (units leased, rents achieved, downtime vs. plan) and
  capex spent vs. plan.
- **Roll-up:** whole-fund view on Portfolio Return; feeds the Valuations
  tab (NOI used in marks) and Sell / Hold (current vs. plan returns).
- **Exports:** Excel and a printable asset-management report.
- Every change logged; owners/editors edit, viewers read.

### Phase J: underwritten vs. actual performance (added 11/22)

Builds on phase I. Phase I tracks the operating budget line by line; this
tracks the deal against what was underwritten to buy it.

- **Underwritten baseline:** the acquisition underwriting (IC-approved
  where there is an IC memo, else the model as of closing), frozen per asset:
  price and total cost, loan terms, year-by-year NOI, occupancy and leasing,
  capex, cash flow, exit cap and value, and returns (levered and unlevered
  IRR, equity multiple, cash-on-cash by year, DSCR and debt yield).
- **Actual and projected:** actual results to date (from phase I's actuals,
  the rent roll and the Debt tab) joined to the current model for the
  remaining hold, giving "actual + projected" returns, with the latest
  valuation mark from the Valuations tab for value to date.
- **Comparison:** underwritten vs. actual by year (NOI, occupancy, rent per
  SF, capex, cash flow, cash-on-cash, DSCR) and for returns (IRR, multiple,
  value, exit cap), with variances.
- **Attribution:** splits the gap in returns into its causes: rent and
  leasing, expenses, capex, financing (rate, proceeds), timing, and exit cap
  or value.
- **Views:** per asset (Asset Summary Details) and whole fund (Portfolio
  Return), with a table of assets ranked by return shortfall or outperformance.
  Excel export and the printable asset-management report.

### Phase K: fund-level plan vs. actual (added 11/22)

The fund's own plan (from the fund model at launch or final close) tracked
against what the fund actually does, using phases I and J for each asset.

- **Fund plan, frozen:** commitments and capital call schedule, deployment
  pace (assets and equity by quarter), target asset count and mix, leverage,
  fund NOI and cash yield by year, distributions, fees and expenses, exits
  and timing, and target net and gross returns (IRR, TVPI, DPI, RVPI,
  multiple), plus the GP promote / waterfall. Re-forecasts are saved as new
  versions; the original stays.
- **Actuals:** capital called and distributed to date, assets acquired
  (when, price, equity), fees and fund expenses, the latest marks
  (Valuations tab), and each asset's actual + projected cash flows (phase J).
- **Comparison:** plan vs. actual by quarter and since inception: capital
  deployed vs. plan, called vs. plan, distributions and DPI, NAV, fund NOI
  and yield, leverage, and projected net/gross IRR and multiple vs. target,
  with the GP promote under each.
- **Attribution:** the gap to target returns split by asset (which assets
  are adding or costing return) and by cause (deployment pace and timing,
  pricing, operations, financing, exits, fees).
- **Views:** a fund dashboard on Portfolio Return (or a new Fund Plan tab),
  charts of plan vs. actual over time, Excel export and a printable
  quarterly fund report suitable for LP updates.

## Phase L: performance and risk reporting (added 11/22, revised 11/22)

Investor administration (investor records, commitments, capital accounts,
call and distribution notices, statements and the investor portal) stays in
the user's CRM and investor portal (Juniper); the app does not duplicate it.
Phase L produces reports from the app's own figures, built on phases D and
I–K.

- **Quarterly performance report**, in two versions from the same figures:
  - *Shareable*: suitable to post to the investor portal or send to
    investors: fund summary, net and gross returns (IRR, TVPI, DPI, multiple)
    since inception and for the quarter, NAV and its movement, capital
    called and distributed, portfolio table, one page per asset (photo or
    map, business plan status, occupancy, leasing, NOI vs. plan, valuation),
    plan vs. actual from phase K, debt summary, and an editable letter
    drafted for the user.
  - *Internal*: the same plus underwritten vs. actual by asset (phase J),
    budget variances with comments (phase I) and notes the user marks
    internal.
  - PDF and Excel; each report saved as an issued version (who, when),
    figures frozen once issued. The app never sends anything; the user
    uploads to Juniper.
- **Risk report (internal only)**, watermarked "Internal — not for
  distribution", never included in the shareable report:
  - *Leasing*: lease expirations by year (% of SF and rent) by asset and
    fund, near-term rollover, renewal and termination options, mark to
    market, vacancy and downtime vs. plan.
  - *Tenants*: largest tenants by rent and SF, concentration by industry
    (SIC), credit notes, personal guaranties, defaults and arrears.
  - *Lease risk flags* (phase D): relocation, termination rights, uncapped
    expenses, environmental duties, exclusives.
  - *Debt*: maturities and extension dates, covenant cushions (DSCR, debt
    yield, LTV) vs. tests, floating-rate exposure and rate cap expiries,
    refinance risk at current rates.
  - *Geographic concentration* (added 11/22): exposure by state, metro
    area (MSA), city and submarket, as % of fund value (NAV), equity, NOI,
    rent, SF and asset count, using each asset's address (Phase A asset
    locations; ZIP mapped to its MSA). User-set limits (e.g. no more than
    30% of NAV in one state or 25% in one metro) with breaches flagged,
    change vs. last quarter, and a map of the assets sized by value. Also
    shows lease rollover and debt maturities by state and metro, so
    clusters of risk in one market stand out.
  - *Valuation and market*: marks vs. cost and underwriting, cap rate
    sensitivity.
  - *Execution*: budget and capex variances (phase I), assets behind
    underwriting (phase J), fund plan gaps (phase K).
  - *Stress tests*: fund and asset results under rent, vacancy, exit cap
    and interest rate shocks, with covenant breaches flagged.
  - *Watch list*: assets ranked by risk score with the reasons, and a
    comment per item.
  - Shown on a Reports tab (owners and editors; viewers do not see the
    risk report), with PDF and Excel, saved as issued versions.

## Order and review

A → B → C → D → E → F → G → H → I → J → K → L. Each phase starts as soon as the
previous one is complete (no review in between), is built on the working
branch with the manual and Node + Playwright tests, and goes into one open
pull request; nothing is merged without the user. If a session ends before
L, the work is pushed and resumes about 15 minutes later at the next phase.

## Decisions (all made 11/22)

1. **Documents tab:** separate from the Leases tab.
2. **PSA:** abstracts checked locally and labelled "not connector-validated"
   (no connector validator). The same applies to the IC memo and closing
   statements.
3. **Scheduling:** first "E after the user reviews C and D"; changed the same
   night to E starting when D is complete, then extended to every phase:
   each of E–K starts as soon as the previous one is complete.
4. **CREparser allowance:** stay within the free allowance. One account
   covers Lease Abstraction and Deal Review (Free plan, 3 documents left on
   11/22). A document counts only when its abstract is shown in the
   connector's viewer; validating does not. Prompts validate and save
   without opening the viewer; the app's own viewer is used instead.
5. **IC memo** in phase E: as-approved baseline, approved-vs-current
   variances and a conditions checklist.
6. **Closing statements** in phase E: acquisition (actual basis) and
   disposition (realized sale), the baselines for phases I–K.
7. **Rent steps and renewal options drive the cash flow** (phase C).
8. **Sample lease tenants** reach the rent rolls through phase C's apply
   step, done by the user, not by editing the sample rent rolls.
9. **Phases I–K** (budget vs. plan, underwritten vs. actual, fund plan vs.
   actual) are their own phases after H.
10. **Phase L, performance and risk reporting** (added 11/22, revised the
    same night): investor administration stays in Juniper (CRM and investor
    portal); L builds a quarterly performance report (shareable and internal
    versions) and an internal-only risk report. The app never sends
    anything.
11. **Tenant credit documents** (added 11/22) in phase D: credit reports and
    tenant/guarantor financial statements on each lease, owners and editors
    only, with key figures, staleness and delivery-due flags, feeding the
    Unit Roll credit rating and the phase L risk report.
12. **Geographic concentration** (added 11/22) in phase L's risk report:
    by state, metro, city and submarket, with user-set limits and a map.
