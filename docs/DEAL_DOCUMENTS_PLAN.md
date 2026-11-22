# Deal documents and performance plan (phases E–K)

Plan only, nothing coded yet. Builds on lease abstraction phases A–D (review and
apply field by field, mismatch flags, critical dates, whole-fund views). Uses the
CREparser **Deal Review** connector in a Claude session, the same way the Leases
tab uses the Lease Abstraction connector: the app makes the prompt, the session
abstracts and validates, the result is saved to the database, and the user
reviews and applies it field by field. Nothing changes the model without a click.

## Shared foundation (built in phase E, used by F–H)

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

## Phase E: acquisition documents (OM, rent roll, T-12, LOI, PSA, IC memo)

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

## Phase F: loan agreement to the Debt tab

- Loan abstract (`loan_validate_abstract` / `loan_show_abstract`) compared with
  the Debt tab inputs: loan amount, index, spread and floor, term and extensions
  (conditions and fees), IO period and amortization, rate cap (strike, term,
  replacement), prepayment, reserves and holdbacks, covenants (DSCR, debt yield,
  LTV) with test dates and cure terms.
- Apply chosen fields, flag mismatches, and set the covenant tests to the loan's
  actual levels.
- Critical dates: maturity, extension notice windows, cap expiry, covenant test
  dates, reporting deadlines.

## Phase G: appraisal to the Valuations tab

- Appraisal abstract (`appraisal_validate` / `appraisal_show`): value, effective
  date, cap rate, NOI, approaches, appraiser.
- Apply it to the quarter's mark as source "appraisal", with appraiser, cap rate
  and a link to the PDF page. It warns when the quarter is inside the 6-month
  cost hold, where the value isn't used.
- Compares the appraisal's NOI and cap rate with the underwriting.

## Phase H: estoppels, CAM reconciliation and billing

- **Estoppel** (`estoppel_validate` / `estoppel_show`) compared with the lease
  abstract and the rent roll unit: rent, dates, deposit, options, defaults,
  amendments. Differences show as mismatch flags on the lease and the unit.
- **CAM reconciliation / billing** (`cam_validate`, `billing_validate`): billed
  share and amounts checked against each lease's terms (pro rata share, expense
  caps, management fee cap, base year, exclusions), showing recoverable vs
  billed and any under- or over-recovery.

## Order and review

E, then F, G, H, then I, J, K, each on the working branch, each with the manual, Node and
Playwright tests, and a PR left for review before merging. E depends on C's
apply and mismatch features and D's critical dates, so it starts as soon as D
is complete.

## Open decisions

6. **Closing statements** (added 11/22 at the user's request): acquisition
   and disposition closing statements per asset, in phase E. They set the
   actual basis and realized proceeds that the backlog's plan-vs-actual and
   underwritten-vs-actual tracking (phases I–K) compares against.


5. **IC memo** (added 11/22 at the user's request): as-approved baseline,
   approved-vs-current variances and a conditions checklist, in phase E.

1. ~~Separate Documents tab or combined with Leases~~ **Decided (11/22):
   a separate Documents tab.**
2. ~~PSA abstracts without connector validation~~ **Decided (11/22):
   acceptable, checked locally and labelled "not connector-validated".**
3. ~~When to start E~~ **Decided (11/22): after the user reviews C and D**,
   then changed the same night: **E starts automatically when D is complete**
   (same 10:30am PT session), with its PR left open for review.
4. ~~Deal Review quota~~ **Decided (11/22): stay within the free allowance.**
   One CREparser account and allowance covers both Lease Abstraction and Deal
   Review (Free plan, 3 documents left on 11/22). A document counts only when
   its first abstract is *shown* in the connector's viewer; validating does not
   count. So the app's prompts ask the session to validate and save without
   opening the viewer, and the app's own viewer is used instead. Phase E–H
   testing uses validation only; no viewer opens unless the user asks.

## Phases I–K: performance tracking (after H)

Decided 11/22: three new phases, run in order after phase H
(E → F → G → H → I → J → K). They need phase E's IC memo and closing
statements for their baselines; J uses I's actuals and K rolls up I and J.
Not scheduled; each starts when the user says so.

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
