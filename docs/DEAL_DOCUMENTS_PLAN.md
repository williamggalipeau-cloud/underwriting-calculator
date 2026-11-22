# Lease, documents and performance plan (phases A–M)

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
| H | Estoppels, CAM reconciliation, billing and rent delinquency (Yardi) | ⛓ Starts when G is complete |
| I | Asset business plan (revisions, PDF) and budget vs. plan | ⛓ Starts when H is complete |
| J | Underwritten vs. actual performance | ⛓ Starts when I is complete |
| K | Fund plan vs. actual | ⛓ Starts when J is complete |
| L | Performance reporting (shareable and internal) and internal risk reports | ⛓ Starts when K is complete |
| M | Fund impact modeling: add a candidate asset and see the fund-level effect | ⛓ Starts when L is complete |

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
  t12, loi, psa, ic_memo, closing_acq, closing_disp, lpa, ppm, insurance_cert,
  loan,
  appraisal, estoppel, cam, billing, other); `deal_id` is empty for fund-level
  documents (LPA, PPM), `deal_id`,
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
| Fund LPA and PPM (fund-level, not per asset; also uploadable from **New fund**) | `cre_read_document` + `cre_search_text` (no validator; uses no free documents) | **Fund investment limits**: each restriction with its clause and quote: single-asset and single-tenant limits, geography (state, metro, region), property type and non-core/development, leverage (fund and per-asset LTV, total borrowing), investment period and hold limits, other caps. Reviewed and applied one by one to become the fund's limits (phase L checks actual vs. limit). Also reads the **fund terms** for the New fund / Edit fund terms window: commitments, GP commitment, management fee and basis, preferred return, catch-up, promote tiers, investment period, term and extensions, subscription line, distribution policy; shown beside the form and applied field by field. Checked locally, "not connector-validated" |
| Insurance certificates (asset level; ACORD 25/28 or carrier certificates) | `cre_read_document` + `cre_search_text` (no validator; uses no free documents) | **Insurance on file**: for the owner's policies on each asset (property / all-risk, general liability, umbrella, flood, earthquake, wind, builder's risk, loss of rents) and each tenant's certificate (linked to its lease): insurer and rating, policy number, coverage type, limits and deductibles, effective and expiry dates, named and additional insureds, mortgagee / loss payee, waiver of subrogation. Checked against the tenant's lease requirements (phase B abstract) and, once phase F is built, the loan's insurance covenants; gaps and missing certificates flagged. Expiry dates go to critical dates (amber 60 days before, red when lapsed). Premiums can be compared with the asset's insurance expense. Checked locally, "not connector-validated" |
| Closing statement, acquisition (settlement statement / ALTA) | `cre_read_document` + `cre_search_text` (no validator; uses no free documents) | **Actual cost basis**: contract price, credits and prorations (rent, taxes, CAM, security deposits transferred, TI/LC and repair credits), closing costs by type (title, escrow, transfer tax, legal, lender fees), loan proceeds, and equity actually funded; closing date. Replaces the underwritten price/closing costs as the asset's actual basis (shown side by side, applied by choice). Checked locally, "not connector-validated" |
| Closing statement, disposition | same | **Realized sale**: sale price, credits and prorations, selling costs (commission, transfer tax, legal), loan payoff and prepayment, and net proceeds to equity; closing date. Marks the asset sold, records the actual exit in the cash flows, and fixes realized IRR and multiple (Portfolio Return, Sell / Hold). Checked locally, "not connector-validated" |

**LPA and PPM in New fund:** the New fund window (Fund Analysis) gets an
*Upload LPA / PPM* step. The files are stored with the fund; Claude reads
them (Review with Claude, as on the Documents tab), and the window shows each
term and limit with its clause and quote beside the form, to accept one by
one before the fund is created. Edit fund terms offers the same for an
existing fund (e.g. Model Fund I) or an amended LPA, showing what changed.

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
- **Rate cap confirmations** (added 11/22, user's request): upload the
  executed cap confirmation (the trade confirmation under the ISDA, with
  the counterparty) for each cap, the initial cap and each renewal, on the
  Debt tab's rate cap schedule (also listed on the Documents tab). Read with
  `cre_read_document` + `cre_search_text` (no connector validator; checked
  locally, "not connector-validated"; uses no free documents): counterparty
  (the institution that wrote the cap) and its rating, trade date,
  effective and termination dates, notional (and any amortizing schedule),
  index (e.g. 1-month Term SOFR or 30-day average SOFR), strike, premium
  and payment date, reset and payment dates, day count, calculation agent,
  and any assignment to the lender. Shown beside the schedule row and
  applied field by field: once applied, that cap row uses the executed
  terms (provider, strike, dates, notional, premium) instead of the modeled
  ones, marked "executed", with a link to the PDF page; renewals not yet
  bought stay modeled. Checks: strike, notional and term against the loan
  agreement's cap requirement (e.g. strike at or below the required level,
  notional at least the loan balance, term to maturity or the next
  extension), and the cap provider's rating against the loan's minimum
  counterparty rating; mismatches flagged. The cap's expiry and the
  replacement deadline go to critical dates. Made-up sample confirmations
  for Fund I's caps are added to the test documents.

### Phase G: appraisal to the Valuations tab

- Appraisal abstract (`appraisal_validate` / `appraisal_show`): value, effective
  date, cap rate, NOI, approaches, appraiser.
- Apply it to the quarter's mark as source "appraisal", with appraiser, cap rate
  and a link to the PDF page. It warns when the quarter is inside the 6-month
  cost hold, where the value isn't used.
- Compares the appraisal's NOI and cap rate with the underwriting.

### Phase H: estoppels, CAM reconciliation, billing and rent delinquency

- **Estoppel** (`estoppel_validate` / `estoppel_show`) compared with the lease
  abstract and the rent roll unit: rent, dates, deposit, options, defaults,
  amendments. Differences show as mismatch flags on the lease and the unit.
- **CAM reconciliation / billing** (`cam_validate`, `billing_validate`): billed
  share and amounts checked against each lease's terms (pro rata share, expense
  caps, management fee cap, base year, exclusions), showing recoverable vs
  billed and any under- or over-recovery.
- **Rent delinquency from Yardi** (added 11/22): the user's property
  accounting is in Yardi Voyager. Monthly upload of Yardi's aged
  delinquency (aged receivables) report as Excel or CSV; a one-time map of
  Yardi property and tenant codes to the app's assets and units, and of
  its columns, so real exports load the same way as the test files.
  - Arrears by tenant and charge type (rent, CAM, taxes, insurance, other)
    in aging buckets (user's choice, 11/22): current, 1–30, 31–60,
    61–90, 91–180 and over 180 days, with prepayments and credits. Each
    bucket shown in $ and as % of monthly rent, by tenant, asset and fund.
  - **Fund total** (user asked 11/22): a fund-level delinquency summary with
    the total $ owed across all assets, the total in each aging bucket, the
    total as % of the fund's monthly rent, the number of tenants
    delinquent, total net of security deposits held, and change vs. last
    month, with a click-through to each asset and tenant. Shown on the
    Unit Roll's Whole fund view and on Portfolio Return, and in the phase L
    reports (fund total in the internal performance report; the detail in
    the risk report).
  - A delinquency badge on each unit in the Unit Roll; delinquency as a %
    of monthly rent per asset and for the fund, and the month-to-month
    trend.
  - From the lease abstract: the default and cure terms (when the tenant can
    be put in default), and how much of the arrears the security deposit
    and any guarantor cover. A notes field per tenant for collection
    actions.
  - Actual collections compared with each asset's credit-loss assumption.
  - Feeds the tenant section of phase L's risk report. A direct Yardi
    connection (which needs Yardi's licensed interface) is not planned;
    the same export approach supplies phase I's monthly actuals from
    Yardi's income statement / GL.
- **Mock Yardi test data** (added 11/22): `docs/sample-yardi/` holds
  fictional exports in the layout of Yardi Voyager reports (generic
  columns, not a copy of Yardi's templates), marked as samples, for Model
  Fund I's assets with made-up property codes (e.g. mf1-02) and tenant
  codes (e.g. t0000102): an aged delinquency report for three consecutive
  months, a tenant ledger (charges, payments, credits) for a few tenants,
  and a monthly income statement per asset for phase I. Scenarios: most
  tenants current; a few 30 and 60 days late; one 91–180 days late and in
  default; one over 180 days (written off or in legal); a partial payment; a prepaid tenant with a credit balance; one
  tenant with disputed CAM charges; and one that catches up after a late
  month. Totals tie to the sample rent rolls.

## Phases I–K: performance tracking (after H)

Decided 11/22: three new phases, run in order after phase H
(E → F → G → H → I → J → K). They need phase E's IC memo and closing
statements for their baselines; J uses I's actuals and K rolls up I and J.
Scheduled (11/22): each starts as soon as the previous phase is complete,
following H.

### Phase I: asset business plan and budget vs. plan (added 11/22)

At closing, each asset gets a business plan for its whole hold, with a
budget (the financial side of the plan). The plan, the current budget and
actual results are then tracked against each other.

- **Business plan** (added 11/22, user's request), one per asset, seeded
  from the IC memo and closing underwriting:
  - *Thesis and strategy*: why the asset was bought (core-plus, value-add,
    lease-up, repositioning) and what must happen for it to work.
  - *Leasing plan*, unit by unit: renew or re-tenant, target rent vs.
    market, downtime, concessions, TI/LC, target tenant mix (from the Unit
    Roll and lease abstracts).
  - *Capital plan*: capex projects with scope, budget, timing and expected
    return (roof, HVAC, paving, docks, unit splits, ESG).
  - *Operating plan*: expense targets, recovery improvements, property
    management, tax appeals and insurance.
  - *Demising and combining units* (added 11/22, user's request): a plan
    item that splits a unit into smaller units (or combines units), entered
    once and reflected in both sections:
    - Capital plan: the demising project with its scope and cost
      (demising walls, separate HVAC, electrical and metering, doors, docks
      or grade-level doors, restrooms, fire and life safety, permits, soft
      costs, contingency), timing and the unit's downtime during the work.
    - Leasing and operating plan: the new units with their SF (and any
      area lost to corridors or walls), market rent per SF (small bays
      often lease higher), downtime, concessions and TI/LC for each, and
      lease-up dates; recalculated pro rata shares and recoveries; the
      operating effects (more meters, separately metered utilities passed
      to tenants, added management and leasing cost per unit, repairs).
    - Returns: the project's cost, added NOI, yield on cost and payback,
      and the effect on the asset's IRR and multiple.
    - In the model: the cash flow runs the original unit until the work
      starts, then downtime, then the new units from their lease-up dates.
      Until the work is done the new units are *planned* (shown that way on
      the Unit Roll and floor plan); once done, the user marks the split
      complete and the rent roll gets the new units (a new plan revision).
  - *Financing plan*: current loan, rate cap, covenants, refinance or recap
    (from the Debt tab and phase F).
  - *Exit plan*: target hold, exit timing and cap rate, sale or refinance
    triggers (from Sell / Hold).
  - *Milestones*: dated milestones with an owner and status (e.g. "lease
    Units 4 and 7 by Q3 2027", "roof by Q2"); due dates go to critical
    dates and late ones are flagged.
  - *KPIs*: NOI, occupancy, rent per SF, WALT, capex vs. budget and returns
    vs. underwriting, each with its target.
  - *Risks and mitigants*, and a hold / sell / refinance recommendation at
    each annual review.
- **Photos, map and floor plan** (added 11/22, user's request):
  - *Asset photos*: upload photos per asset (exterior, aerial, docks,
    interior, capex before/after), each with a caption, date and order;
    one marked as the cover photo. Stored in the private storage bucket;
    owners and editors upload, viewers see them.
  - *Location map*: a map of the asset from its address (Phase A asset
    locations, geocoded once and saved), with a pin, the street map around
    it, and optionally the fund's other assets nearby. Uses an open map
    source with its attribution; the map is saved as an image with each
    plan revision so the PDF does not depend on a live map.
  - *Floor plan*: upload the building's floor or site plan (image or PDF),
    then mark each unit on it (draw a box or outline and pick the unit);
    the app labels every unit with its number, size (SF), tenant and lease
    expiry, and colours it by status (leased, vacant, expiring within 12
    months, under renovation). Where no plan is uploaded, the app draws a
    simple schematic of the units sized by SF from the rent roll. Updates
    as the rent roll changes (a new plan revision).
  - Included in the business plan screen and its PDF (cover photo, photo
    page, map, floor plan with the unit table), and reused for the asset
    pages of phase L's performance report.
- **Revisions:** the plan at closing is **revision 1** and is never
  overwritten. While the asset is held, any change to the asset that
  affects the plan creates a **new revision** rather than editing the last
  one: a plan edit, an applied lease (phase C), a capex or budget change,
  a new or changed loan, a changed exit or hold, or the annual review. Each
  revision records who, when, what changed (a list of changes from the
  previous revision) and an optional note. Edits made in one sitting are
  saved together as one revision. Every revision stays readable and
  revisions can be compared side by side; the current revision is the one
  shown in the app and used for budget vs. plan, with revision 1 kept as
  the original baseline.
- **PDF export** (user's request): the business plan for any revision as a
  PDF: cover (asset, fund, revision number and date, author), summary,
  each section above, the budget, milestones and KPIs vs. target, and a
  "changes since the previous revision" page. Exported PDFs always match
  their revision. Excel export of the budget and milestones.

- **Lock the budget at closing:** snapshot the closing underwriting as the
  asset's budget, by year and month: rental income, recoveries, other income,
  vacancy and credit loss, each operating expense line, NOI, capex, TI/LC,
  debt service and cash flow. Leasing assumptions are included per unit
  (downtime, new rent, renewals). The IC-approved figures (phase E) can seed
  it. The locked budget never changes; a re-forecast is saved as a new
  version (e.g. "2027 budget", "Q2 reforecast") and is part of a new plan
  revision.
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
- **Fund limits, actual vs. limit** (added 11/22): the investment limits
  applied from the fund's LPA / operating agreement and PPM (phase E), plus
  any internal limits the user adds, each shown with its source (document,
  clause and quote), the actual figure, headroom and status (within, near
  at 90% of the limit, breached). Covers every limit the documents set:
  geography, industry, single asset and tenant, property type, leverage,
  investment period and others. A **pre-acquisition check** shows whether a
  deal in the pipeline would breach a limit if bought. Included in the risk
  report and summarised in the internal performance report.
- **Risk report (internal only)**, watermarked "Internal — not for
  distribution", never included in the shareable report:
  - *Leasing*: lease expirations by year (% of SF and rent) by asset and
    fund, near-term rollover, renewal and termination options, mark to
    market, vacancy and downtime vs. plan.
  - *Tenants*: largest tenants by rent and SF, credit (ratings, scores and
    financials from phase D), personal guaranties, defaults and arrears.
  - *Industry (SIC) concentration*, at **both levels**: for each asset
    (share of the asset's rent and SF by SIC code and 2-digit industry
    group, building on the Unit Roll's industry mix) and for the fund
    (rolled up across all assets, weighted by rent, SF and NOI). Limits at each
    level (from the LPA/PPM or set by the user) (e.g. no industry above 40% of an asset's rent or
    20% of fund rent), breaches flagged, and change vs. last quarter.
  - *Lease risk flags* (phase D): relocation, termination rights, uncapped
    expenses, environmental duties, exclusives.
  - *Insurance* (added 11/22): expired or expiring certificates, missing
    tenant certificates, and coverage below lease or loan requirements.
  - *Debt*: maturities and extension dates, covenant cushions (DSCR, debt
    yield, LTV) vs. tests, floating-rate exposure and rate cap expiries,
    refinance risk at current rates.
  - *Geographic concentration* (added 11/22), at the **fund level** (each
    asset sits in one place, so it is a fund measure): exposure by state, metro
    area (MSA), city and submarket, as % of fund value (NAV), equity, NOI,
    rent, SF and asset count, using each asset's address (Phase A asset
    locations; ZIP mapped to its MSA). Limits from the LPA/PPM, or set by
    the user (e.g. no more than 30% of NAV in one state or 25% in one metro) with breaches flagged,
    change vs. last quarter, and a map of the assets sized by value. Also
    shows lease rollover and debt maturities by state and metro, so
    clusters of risk in one market stand out.
  - *Valuation and market*: marks vs. cost and underwriting, cap rate
    sensitivity.
  - *TI funding coverage* (added 11/22, user's request): whether each asset
    can fund its coming TI/LC, quarter by quarter, and from what:
    - *Need*: TI and leasing commissions due each quarter for the next 8
      quarters (from the leasing plan, applied leases and the rent roll).
    - *1. Loan TI facility*: the facility left (the model's TI reserve /
      lender holdback today; the loan's actual draw conditions once phase F
      reads the loan agreement) and whether the asset passes the draw test
      that quarter (e.g. DSCR at or above the minimum, plus debt yield or
      occupancy where the loan requires them), with the headroom: how far
      NOI could fall before draws stop.
    - *2. Asset cash flow*: cash left after debt service and required
      reserves.
    - *3. Fund subscription line*: available only while the line is active
      (within its term) and has capacity (size less drawn), within its
      maximum days outstanding, shared across all assets that quarter.
    - *4. Capital call*: whatever is left.
    - **Heat map**: assets down the side, quarters across, each cell
      coloured by how its TI is covered: green (facility, test passed),
      light green (asset cash flow), amber (needs the sub line), red (needs
      a capital call, or the draw test fails), grey (no TI due). Hovering
      shows the need, each source and the shortfall. A fund total row shows
      the capital call needed per quarter.
    - **Test data for Model Fund I** (user's request, 11/22): Fund I's
      sample loans don't have TI facilities yet (the TI reserve is off on
      every deal), so phase L adds made-up ones, like the earlier SIC and
      loan-sizing test data: each asset gets a TI/LC facility on its loan
      (a $/SF holdback, some larger and some none), a draw test (DSCR
      minimum 1.10x–1.25x, a few with a debt yield test), and quarterly TI/LC
      needs from its expiring leases. The mix is set so the heat map shows
      every colour: most assets covered by their facility; two covered by
      their own cash flow; two that need the sub line; one that fails its
      draw test in a later quarter; and one quarter where the sub line is
      full or has expired and a capital call is needed. Fund I's existing
      sub line terms are used as they are. Added through a one-time,
      logged workspace update to the Model Fund I sample data (flag
      "tiFacility-v1"), and as Node test fixtures.
    - **Actions** (modeling only, saved as a phase M-style scenario, never
      changing actual data): postpone a TI to a later quarter, cut a TI or
      LC budget line, or plan a capital call; the heat map updates to show
      the effect, and the chosen actions can be carried into the business
      plan (a new revision) by the user.
  - *Execution*: budget and capex variances (phase I), assets behind
    underwriting (phase J), fund plan gaps (phase K).
  - *Stress tests*: fund and asset results under rent, vacancy, exit cap
    and interest rate shocks, with covenant breaches flagged.
  - *Watch list*: assets ranked by risk score with the reasons, and a
    comment per item.
  - Shown on a Reports tab (owners and editors; viewers do not see the
    risk report), with PDF and Excel, saved as issued versions.

## Phase M: fund impact modeling (added 11/22)

Model what adding a new asset would do to a fund before buying it, without
changing the fund.

- **Add a candidate:** pick a fund and add one or more candidate assets:
  from a saved or pipeline deal, from Deal Screener, or from an OM read in
  phase E. Each candidate has its price, closing date, equity and loan,
  business plan and exit, using the same underwriting as any deal. Nothing
  is added to the fund until the user chooses **Add to fund**.
- **Fund with vs. without:** side by side for the fund as it is, the fund
  with the candidate(s), and the difference:
  - Returns: net and gross IRR, TVPI, DPI, equity multiple, cash-on-cash by
    year, GP promote and LP net (through the fund waterfall).
  - Capital: equity required, capital calls by quarter, dry powder left,
    deployment pace vs. the fund plan (phase K), subscription line use.
  - Income and value: fund NOI and cash yield by year, NAV, leverage (fund
    LTV, DSCR, debt yield), debt maturities.
  - Portfolio mix: industry (SIC), geographic and tenant concentration, WALT
    and lease rollover, all before and after.
  - Limits: every fund limit from the LPA/PPM and internal limits (phase L),
    actual before and after, with any breach the candidate would cause.
- **Compare candidates:** several candidates against each other and in
  combination, ranked by their effect on fund net IRR and multiple.
- **Break-even pricing:** the highest price at which the candidate still
  meets a target (e.g. fund net IRR stays at or above the fund plan, or no
  limit is breached).
- **Sensitivity:** fund IRR impact across the candidate's price, exit cap
  and rent growth, and its timing (closing quarter).
- **Modeling only (user confirmed 11/22):** scenarios never change actual
  data: deals, fund terms, rent rolls, valuations, actuals and reports stay
  as they are. Scenarios are stored separately (their own table), work on a
  copy of the fund, and are labelled "Scenario — not actual" on screen and
  in every export. Adding a candidate to the fund for real is a separate,
  deliberate step (Add to fund, which creates a normal deal and is logged),
  never a side effect of saving a scenario.
- **Named, saved, versioned:** each scenario has a name (e.g. "Q1 2027:
  Reno + Boise"), the fund, the candidates and their inputs, who saved it
  and when. A saved version is **frozen**: its inputs, results and reports
  are never overwritten. Any change saves a **new version** (v1, v2, …) with
  an optional note on what changed; earlier versions stay readable, can be
  compared side by side, and can be copied as the start of a new scenario.
  Results are stored with the version, so they don't shift later when the
  fund's actuals change; a "re-run on today's fund" creates a new version.
- **Reports for each scenario version:** Excel (inputs, fund with vs.
  without by year, returns, capital, mix, limits, sensitivity, break-even)
  and PDF (a summary page for the IC memo plus the detail pages), both
  stamped with the scenario name, version, date, author and "Scenario — not
  actual". An exported report always matches its version.
- Reuses phase L's pre-acquisition limit check.
- **Deal Screener folds into phase M** (decided 11/22, user's request; the
  Quick Underwrite tab was renamed Deal Screener the same night): the
  candidate screen gets two ways to add a candidate: **Deal Screener** (the
  same few inputs as today's Deal Screener tab: price,
  closing costs, year-1 NOI and growth, hold, exit cap, loan, SOFR and
  spread, fees, with the forward curve; the rate cap is set as on the Debt
  tab) or **Full Underwrite** (a full rent-roll deal). A Deal Screener
  candidate can later be converted to a Full Underwrite deal (its inputs carried over, as linking does today). Once
  this works, the separate **Deal Screener tab is retired**: existing
  deals keep their quick settings, linked deals are converted to full deals
  with the same inputs (results unchanged, checked by a test), and the
  forward curve controls move to the Debt tab next to the rate cap. Nothing
  is retired until the candidate screen covers everything the tab does.

## Order and review

A → B → C → D → E → F → G → H → I → J → K → L → M. Each phase starts as soon as the
previous one is complete (no review in between), is built on the working
branch with the manual and Node + Playwright tests, and goes into one open
pull request; nothing is merged without the user. If a session ends before
M, the work is pushed and resumes about 15 minutes later at the next phase.

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
    fund level, by state, metro, city and submarket, with user-set limits
    and a map.
13. **Industry (SIC) concentration** (added 11/22) in phase L's risk
    report: at the asset and the fund level, each with its own limits.
14. **Fund limits from the LPA and PPM** (added 11/22): uploaded as
    fund-level documents in phase E (from New fund, Edit fund terms or the
    Documents tab; the same read also fills the fund terms), each restriction reviewed and applied;
    phase L shows actual vs. limit, headroom and breaches, and checks
    pipeline deals before purchase. Reading these is legal interpretation, so
    every limit shows its clause and quote and is applied only by the user.
15. **Made-up sample documents for test data** (user confirmed 11/22): each
    phase adds fictional sample documents in `docs/sample-deal-docs/`,
    like `docs/sample-leases/`: every page marked "SAMPLE – FICTIONAL – FOR
    TESTING ONLY", invented parties and addresses, and figures consistent
    with Model Fund I's assets (prices, loans, NOI, dates) so they apply
    cleanly. The set: a fund LPA and PPM for Model Fund I; per asset where
    useful an OM, rent roll, T-12, LOI, PSA, IC memo, acquisition closing
    statement, loan agreement, appraisal, estoppels and a CAM
    reconciliation; a disposition closing statement for one test sale; and
    tenant credit reports and financial statements for the sample tenants.
    A README lists each file with its asset and what it tests, and the
    validated abstracts are saved beside them, as with the sample leases.
16. **Insurance certificates** (added 11/22) in phase E: asset-level
    document type covering the owner's policies and each tenant's
    certificate, checked against lease (and loan) requirements, with expiry
    dates in critical dates and gaps in the phase L risk report.
17. **Rent delinquency** (added 11/22) in phase H: imported monthly from
    Yardi's aged delinquency report (no direct Yardi connection), with mock
    Yardi exports in `docs/sample-yardi/` for testing. Yardi income
    statements also supply phase I's actuals.
18. **Phase M, fund impact modeling** (added 11/22): after L; add candidate
    assets to a fund as a what-if and see the fund-level effect on returns,
    capital, income, mix and limits, with break-even pricing. Modeling
    only: it never overwrites actual data. Scenarios are named and saved;
    a saved version is frozen and any change makes a new version; each
    version exports to Excel and PDF.
19. **Asset business plan** (added 11/22) in phase I: thesis, leasing,
    capital, operating, financing and exit plans, milestones, KPIs and risks
    per asset; revision 1 at closing, and any change to the asset while held
    creates a new revision (never overwritten); each revision exports to
    PDF.
20. **Photos, map and floor plan** (added 11/22) in phase I: uploaded asset
    photos, a location map from the address, and a floor plan with each
    unit marked (number, SF, tenant, expiry, status), all in the business
    plan and its PDF, and in the phase L asset pages.
21. **Demising and combining units** (added 11/22) in phase I: a plan item
    that splits or combines units, with its capex, downtime, new units'
    rents and lease-up, operating effects and yield on cost, modelled in
    the cash flow as planned units until the user marks it complete.
22. **TI funding coverage** (added 11/22) in phase L's risk report: per asset
    and quarter, TI/LC need vs. the loan's TI facility (and its draw test),
    asset cash flow, the fund sub line (while active and with capacity) and
    capital calls, shown as a heat map, with what-if actions (postpone TI,
    cut TI, capital call) that don't change actual data.
23. **Rate cap confirmations** (added 11/22) in phase F: the executed cap
    confirmation for each cap is uploaded on the Debt tab, read for
    counterparty, dates, notional, index, strike and premium, and applied to
    that cap's row (executed terms replace modeled ones); checked against
    the loan's cap requirement; expiry to critical dates.
24. **Deal Screener folds into phase M** (decided 11/22; Quick Underwrite
    renamed Deal Screener): Deal Screener becomes one of the two ways to add a
    candidate (with Full Underwrite, a full rent-roll deal), and the separate tab is retired once the candidate
    screen covers it; linked deals become full deals with unchanged results,
    and the forward curve controls move to the Debt tab.

