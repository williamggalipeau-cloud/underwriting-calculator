# Lease, documents and performance plan (phases A–M)

One plan for everything from lease documents to fund performance: what has
been built, what is scheduled, and what each phase will do. Each phase is
built on the working branch with the user manual, Node and Playwright tests,
and a pull request; nothing merges without the user. CREparser connectors are
used to validate only, staying within the user's free allowance. Nothing
changes the model without the user clicking to apply it.

## Releases (user, 11/25)

The code is frozen as **version 1.0** (everything through PR #101; tag
`v1.0.0`, GitHub Release "Baywise 1.0"). From here, work is planned by
version:

| Version | Scope | Status |
|---|---|---|
| 1.0 | Everything built through 11/24 (the phases below marked built) | ✅ Released 2026-11-25 |
| 1.1 | Claude reads BOVs, LOIs, PSAs and closing statements into Dispositions (the "Later" item in phase P); market data on the Valuation tab and the Asset Business Plan (the "Later" item in phase U), with flag levels per portfolio; Add sample documents; sample pipeline deals load with Model Fund I | ✅ Released 2026-11-25 (manual §7.56–7.58). Decided 11/25: an LOI updates that buyer's offer and keeps the earlier terms in its history; market check on both Valuation and the Business Plan; flag levels per portfolio (defaults 50 bp, 10%, 2 pts, 1 pt; red at 1.5×), chosen by the user for live data. Patch 1.1.1 (user, 11/25): Setup & Maintenance becomes the last Functions area, its actions on the row it opens; the separate bar is removed. Patch 1.1.2 (user, 11/25): Sample data → Add sample business plans (plans and actuals for the Model Fund I assets; Route 9 At Risk, Harbor Light Off Plan on the Asset Watch List; manual §7.59); Watch List goals compared at the precision shown; Vacant Units on the Dashboard (every vacant unit by asset, with leasing manager, asking rent, plan target, rent comps near its size, best prospect and next step); a Leasing manager field (asset, with a unit override); Sample data → Add sample prospects (a leasing pipeline, unit rent comps and leasing managers for every Model Fund I asset; manual §7.60) |
| 1.2 | Workflow: approvals, reminders and gating (phase V; the five scoping questions) | Next |
| 1.3 | Expanded reporting (the "More external reports" options) | Planned |
| 1.4 | Demo firm; Yardi API connection | Planned |
| 1.5 | Construction Management (user, 11/25): capital project budgets, costs to date and change orders; schedules and milestones; contractor bids and contracts; draw requests and lien waivers; the status of each project underway. Imported from Yardi Construction Manager (extending the phase T job / invoice import) or entered and updated by hand. A new Construction Management button in the Functions row; its landing page lists every project underway, tied to its asset and, where it applies, its unit (decided 11/25; designed with the rest of 1.5). Builds on the existing construction jobs and invoices (lib/construction.js) | Planned |

Release process (user, 11/25):
- **Option A.** Each version is built on its own branch; the live site stays on the current release until the user approves the next, then it goes live in one step.
- **One live version.** Only the current release is on the site. Each release is tagged and kept as a GitHub Release, so reverting means redeploying an earlier tag.
- **Patch releases.** Bug fixes to the live release ship as 1.0.x and are carried into the version in progress.
- **Compatible database changes.** Each version's database changes keep the previous release working.
- **The version number** is in `lib/version.js` and `package.json`, and shows in the app's header and Change log.

## Status

| Phase | Scope | Status |
|---|---|---|
| A | Lease documents: upload, store, open | ✅ Done, live (PR #43) |
| B | Lease abstraction with Claude: prompt, save, viewer | ✅ Done, live (PR #53); sample abstracts PRs #54–#57 |
| C | Review and apply abstracts to the rent roll; rent steps; renewal options; mismatch flags | ✅ Live (PR #69); 24 Node + 18 Playwright checks |
| D | Fund lease views: critical dates, risk flags, exports, Asset Summary; tenant credit documents | ✅ Live (PR #70); 34 Node + 25 Playwright checks |
| E | Documents tab: OM, rent roll, T-12, LOI, PSA, IC memo, closing statements, insurance certificates; fund LPA and PPM (terms and limits, also from New fund) | ✅ Live (PR #71); 45 Node + 22 Playwright checks |
| F | Loan agreement → Debt tab; executed rate cap confirmations → cap schedule | ✅ Live (PR #71); 27 Node + 12 Playwright checks |
| G | Appraisal → Valuations tab | ✅ Live (PR #71); 14 Node + 8 Playwright checks |
| H | Estoppels, CAM reconciliation, billing and rent delinquency (Yardi); LPA/PPM fund picker | ✅ Live (PR #72); 32 Node + 23 Playwright checks |
| I | Asset business plan (revisions, PDF, photos, map, floor plan, demising) and budget vs. plan | ✅ Part 1 live (PR #73); part 2 built 11/23 (photos, map, floor plan, demising / combining, actual NOI to Valuation and Sell/Hold; 43 Node + 22 Playwright checks) |
| J | Underwritten vs. actual performance | ✅ Built 11/23 (pulled forward into window 1): frozen baseline, actual + projected, IRR gap by cause, fund ranking, Excel and PDF; 29 Node + 16 Playwright checks |
| K | Fund plan vs. actual; Sell/Hold hold-period impact on the fund (added 11/23) | ✅ Built 11/23 (window 2): Fund Plan tab before Fund Return (lib/fundPlan.js, components/FundPlan.jsx, lib/fundPlanPdf.js): frozen plan v1 + re-forecasts on the fund record; since-inception plan vs. actual (called, deployed, assets, distributions, DPI; NAV and TVPI actual); projected plan vs. forecast vs. targets; cumulative chart; by quarter; NOI and cash yield by year; attribution by asset and cause; Excel and PDF. Sell/Hold: all-asset hold change, capped-hold note, past-term flags, TVPI, DPI by term end, GP promote. Tests: 39 Node + 22 browser checks; all earlier suites pass; regression identical. Not built: plan NAV (the plan has no marks), leverage plan vs. actual (with phase S) |
| L | Performance reporting (shareable and internal) and internal risk report (concentration by SIC, geography, lender and cap counterparty; LPA limits; TI funding heat map; insurance; delinquency; environmental and climate risk); mock sample-asset images; full Asset Business Plan PDF; Asset Return GP ROE and projected fee revenue (added 11/23) | ✅ Built (finished 11/24): done: Asset Return additions (lib/assetFees.js), full business plan PDF (lib/businessPlanExtras.js), drawn sample photos and plans (lib/sampleMedia.js, public/sample-media, scripts/sample-media/generate.cjs; Sample data → Add drawn photos). Reports tab with the quarterly performance report (lib/quarterlyReport.js, lib/quarterlyReportPdf.js, components/Reports.jsx): shareable and internal, editable letter, issued versions frozen, PDF and Excel. Fund limits (lib/fundLimits.js, components/FundLimits.jsx): LPA / PPM and internal limits, actual vs. limit, near at 90%, pre-acquisition check, in the internal report. Risk report (lib/riskReport.js, lib/riskReportPdf.js, components/RiskReport.jsx): watch list, leasing, tenants, SIC, geography, debt, lenders and cap counterparties with HHI, valuation, execution, environmental and climate; sample risk test data (lib/sampleRiskData.js, Sample data menu). TI funding heat map (lib/tiFunding.js) with made-up TI facilities and a planned re-tenanting (lib/sampleRiskData.js), stress tests, insurance certificates and lease risk flags. TI actions on the heat map (postpone, cut, plan a call; terms.tiScenario) and change vs. last quarter. State map of assets sized by value in the risk report (components/StateTileMap.jsx, 11/23 window 3). Finished 11/24: insurance vs. loan requirements (the loan abstract now reads the lender's insurance terms; lenderInsuranceGaps in lib/dealDocApply.js; in the risk report) and per-asset quarterly investor reports (Report on: portfolio or asset; lib/assetReport.js, lib/assetReportPdf.js, components/AssetReportPanel.jsx) |
| M | Fund impact modeling and a Pipeline tab (Deal Screener and Full Underwrite candidates, pipeline assets, versioned scenarios); pipeline report with top 10 assets; Deal Screener stays as its own tab with Send to Fund Impact (decided 11/23); Deal Screener fund picker with acquisition impact, pipeline assets only (added 11/23) | ✅ Built 11/23 (leftovers done 11/23; marked complete 11/24). Started 11/23 (window 2, extra time): Pipeline tab (lib/pipeline.js, components/Pipeline.jsx; saved in the firm's settings as data.pipeline; CoStar and internal uploads with remembered column maps, update-not-duplicate, stages with probabilities, totals, filters, Screen, Convert to asset, Excel, change log); fictional files in docs/sample-pipeline. Deal Screener pipeline-only with Model in fund (lib/fundImpact.js, components/ScreenerFundImpact.jsx); app opens on Asset Summary. Fund Impact tab (components/FundImpact.jsx): candidates, with vs. without, compare with shares, break-even price, sensitivity, scenarios saved as frozen versions on the fund record (terms.impactScenarios, not a separate table), Add to fund, Send to Fund Impact from the Pipeline, Excel. Pipeline report (lib/pipelineReport.js): by stage, probability-weighted, closings vs. dry powder, combined effect, top 10 with summaries, PDF / Excel, dated versions. Leftovers done 11/23 (window 3): Fund Impact PDF (lib/fundImpactPdf.js), Update pipeline row from the screener (the screener edits the deal itself, so no separate copy), Add to pipeline from an OM |
| N | Fund Summary tab: key dates, key terms, capital raised / deployed / available (added 11/23) | ✅ Built 11/23 (window 3): lib/fundSummary.js, components/FundSummary.jsx, lib/fundSummaryPdf.js: key dates, capital, all key terms (key person / removal entered), legal entities (EIN last 4 only) with an ownership chart and annual-report dates on the critical-dates list, legal document uploads (deal_documents type other, title-tagged by category: no SQL), links, one-page fact sheet, Excel. Tests: 15 Node + 15 browser checks |
| O | Asset and fund setup workflow: New / Edit asset and New / Edit fund buttons; the left inputs panel opens only from them (added 11/23) | ✅ Built 11/23 (window 3): header setup buttons (New asset, Edit asset…, New fund, Edit fund…), asset inputs as a slide-over with Done / Escape (the left panel and its deal tabs are gone; the Asset picker above the tabs remains), tabs at full width. Tests: 14 browser checks; phaseQ / phaseI2 updated to open the slide-over |
| Q | One firm, saved record by record: no workspaces to choose; every change saved within about a second; screens update live from the database (added 11/23; moved ahead of J–O at the user's request) | ✅ Built 11/22 night (PR #80). Database part done with the user (supabase/firm_records.sql; 12 deals, 1 fund, 247 log entries migrated and verified identical; the 11/21 workspace renamed Baywise; two others archived). App: lib/records.js; sign-in opens the firm (no workspace picker, no browser import); each change saved about 1 s later as its own record with a version check; conflicts reload that record with a notice; live updates; one-time import of old-app saves. Tests: 19 Node checks + 13 browser checks; all earlier suites pass, regression identical |
| P | Dispositions group: Assets for Sale, Offers, Track Record, Documents; whole and partial sales; uploads in each tab; Excel and PDF exports (added 11/23) | ✅ Built 11/23 (window 3, extra time). Part 1: lib/dispositions.js, components/Dispositions.jsx; sales stored on each asset (inputs.dispositions; no new table); Assets for Sale (whole / partial, reason, target, stage incl. Withdrawn, BOVs and chosen broker, listing, marketing, contract dates and logged price changes, closing statement → realized sale), Offers (net proceeds after costs and loan payoff, best marked, select one, buyer's earlier offers), Track Record (realized vs. UW and last mark, fund / firm totals), Excel; Home lane. Tests: 24 Node + 18 browser checks. Part 2 built 11/23 (window 3, extra time): lib/dispositionDocs.js (uploads on sales, offers, closed sales; sale / offer / type in the title; new types fall back to "other" until supabase/dispositions_doc_types.sql is applied), Sale Documents tab, lib/dispositionsPdf.js (Assets for Sale, Track Record), saleDistribution (LP / GP split through the fund waterfall), Start sale on Sell/Hold. Tests: +10 Node, +14 browser checks. Later: read BOV / LOI / PSA / closing statement terms in with Claude and apply. SQL to apply: supabase/dispositions_doc_types.sql |
| R | Leasing tab (Asset Management): leasing pipeline and rent comps, with uploads (added 11/23) | ✅ Built 11/23. Part 1 (window 3, extra time): lib/leasing.js, components/Leasing.jsx; stored on each asset (inputs.leasing; no new table); prospects and renewals with stages incl. Lost, net effective rent, rent and downtime vs. the latest plan revision; stage counts; whole-fund view; rent comps by hand or CoStar / internal upload (columns matched and remembered, update-not-duplicate), filters, SF-weighted stats, in-place and market vs. comps, Set market rent from comps; Excel. Tests: 20 Node + 18 browser checks. Part 2 built 11/23 (window 4): lib/leasingDocs.js (uploads on prospects and the comps section, "other" with a [leasing:…] title prefix; no SQL), lib/leasingPdf.js, Home attention (next steps due within 7 days) and lane count. Tests: +5 Node, +4 browser checks |
| S | Fund Debt tab (Portfolio Management): every loan in the fund, maturities, rate exposure, covenant certificates (added 11/23) | ✅ Built 11/23. Part 1 (window 4): lib/fundDebt.js, components/FundDebt.jsx; read-only from each asset's debt inputs and model; summary, loans (rate type, maturity / fully extended, extensions left, DSCR / debt yield / LTV on the latest mark), extension tests at the next maturity (sizing constraints or entered covenants), maturity ladder, rate exposure and caps, lender concentration with HHI, refinance planner (LTV / DSCR / debt-yield sizing), Excel; Home lane link. Tests: 21 Node + 14 browser checks. Part 2 built 11/23 (window 4): covenantCertificate / certificates (quarter end, DSCR / debt yield / LTV with calculations, compliance, signature block), certificates Excel and PDF (lib/fundDebtPdf.js, one page per loan), tab PDF, Home alerts (covenant breach now; extension test failing within 18 months). Tests: +10 Node, +8 browser checks |
| T | Property Management group: Property Taxes, Insurance, Property Condition, Service Contracts; linked to Yardi Construction Manager; TI spend by unit with mock TI actuals (added 11/23) | ✅ Built 11/23. Part 1 (window 4): lib/propertyMgmt.js (sections described as tables; stored on the asset as inputs.propertyMgmt; no new table), components/PropertyMgmt.jsx (four tabs, one asset editable / whole fund read-only, summaries incl. tax vs. plan budget, coming-up dates, Excel), Home attention (tax bills, hearings, renewals, contract notice deadlines within 60 days; immediate repairs first) and lane; Home "Show all". Tests: 19 Node + 16 browser checks. Part 2 built 11/23 (window 4): lib/pmDocs.js (uploads per section, "[pm:section]" title prefix, "other"; no SQL), addToCapitalPlan (new plan revision; budget = cost, timing by urgency; finding keeps planProjectId), lib/pmPdf.js (tab PDF); tests +8 Node, +4 browser checks. Part 3 built 11/23 (window 4): lib/construction.js (job / invoice exports parsed by column name, matched to assets and units, update by job code, TI by unit vs. the plan with amber > 5% / red > 20%, capital jobs linked to findings / contracts by job code, Excel), components/TiSpend.jsx (Property Condition, and the table on Asset Business Plan), lib/sampleConstruction.js + Sample data → Add construction test data. Tests: 17 Node + 12 browser checks. Later: a Yardi API connection (automatic pull) |
| U | Market group: Market Data tab, submarket statistics; stress tests in standard deviations with a simulation (added 11/23) | ✅ Built 11/23. Part 1 (window 4): lib/market.js, components/MarketData.jsx; stored with the firm's comps settings (comps.market) and inputs.submarketId (no new table); submarkets, quarterly statistics with source / date, CoStar / broker upload (columns matched and remembered, update in place), trends with sparklines, asset vs. market (rent, growth, vacancy, exit cap), Excel, Home Market lane; fictional docs/sample-market. Tests: 13 Node + 14 browser checks. Part 2 built 11/23 (window 4): lib/stressSigma.js (volatility from Market Data yearly changes where ≥ 3, else editable defaults; σ per shock and combined (Mahalanobis); Cholesky-correlated, seeded simulation of 2,000 one-year paths through the asset model; "1 year in N"), Stress Testing panel, lib/marketPdf.js. Tests: 20 Node + 7 browser checks. Later: market figures on Valuation / business plan; SOFR history from the NY Fed for the rate volatility | 11/24: Market Data **Upload CSV** button and a CSV template (user).
| V | Automated workflow: approvals and reminders (added 11/23) | ⏳ Version 1.2 (user, 11/25). Scoping started 11/24; five questions asked (what needs approval, approvers, thresholds, reminders, gating) |
| X | Distribution Analysis tab (Portfolio Management, after Fund Return): quarterly distribution planner from asset (Yardi upload or manual) and fund cash, 3 / 6-month reserves, sub line per term sheet, LP / GP split per LPA, yield on contributed capital and NAV, rolling 4-quarter history (added 11/23) | ✅ Built 11/23 (window 2): lib/distributions.js, components/DistributionAnalysis.jsx, lib/distributionPdf.js; mock docs/sample-yardi/cash-balances-2026-09.csv (Southpoint has no balance, Mill Creek overdrawn). Capital activity gains a "Distribution paid" type (history only; doesn't switch the fund to actual calls). Tests: 34 Node + 23 browser checks. Lender reserves and committed TI / capex are entered by hand for now (read from loan terms and the business plan later) |
| Revert | Revert button on change-log entries, restore a deal or fund as of a date, Recently deleted list (added 11/23; workspace buttons removed the same day) | ✅ Built 11/23 (window 3, ahead of Z): lib/revert.js; Revert only while the field still holds the logged value (never overwrites a later edit), logged as a revert (never merged away); Restore as of a date rebuilds one record from the log with a preview (database log when signed in); Recently deleted reads firm_records rows marked deleted and restores them as they were. No SQL. Tests: 26 Node + 13 browser checks, phaseQ +4 |
| Z | Home page: today's attention list, workflow lanes matching the tab headers, fund cards, quick actions (incl. New fund setup), recent activity (added 11/23) | ✅ Built 11/23 (window 3): lib/home.js, components/Home.jsx; the app opens on Home; attention (leases ≤ 90 d from the unit roll, loans ≤ 18 mo, caps ≤ 12 mo, missing last-quarter marks, rent 60+ days late, NOI red vs. budget) each opening its tab on the asset; recent activity (last 10); fund cards with type badge; lanes for Acquisitions, Asset Management, Portfolio Management, Library; 7 quick actions; follows Working on. Later: option deadlines from lease abstracts (Leases tab has them), Dispositions / Property Management / Market lanes when those headers exist, lane order by role. Tests: 17 Node + 17 browser checks |
| Picker | "Working on" fund picker in the header (All funds / each Fund, SMA, JV): filters every tab, remembered per person; also on the Home page (added 11/23) | ✅ Built 11/23 (window 3, ahead of Z): lib/workingOn.js; header Working on dropdown (All funds, each fund / SMA / JV with its type); header figures labelled with the fund; every tab gets the fund's assets and terms; asset list = the fund's assets + pipeline deals screened for it + drafts; Pipeline tab starts filtered to it; remembered in the person's sign-in metadata (browser when signed out); nothing saved to the firm. Edit asset / Edit fund / Documents still list everything. Home page lanes wait for Z. Tests: 13 Node + 20 browser checks |
| Demo | Separate Demo firm for the sample fund and test deals, so the real firm holds only real assets (added 11/23) | ⏳ Version 1.4 (user, 11/25) |
| Comps | Mock comps for each Model Fund I asset: fictional sales comps on Research → Comps and lease (rent) comps for phase R's Leasing tab, near each sample address (added 11/23) | ✅ Built 11/24 (user: "proceed to Mock comps"): lib/sampleComps.js; 6 sales + 6 rent comps per asset, loaded with the sample portfolio and from Sample data → Add sample comps (manual §7.54) |
| External reports | A few more external (LP-facing) reports, to choose: e.g. LP capital account statements, an ILPA-template quarterly report, an annual report with audited figures, property-level investor updates, ESG / GRESB data (added 11/24) | ⏳ Version 1.3 (user, 11/25). Earlier (11/24): only quarterly performance reporting for investors was needed, by portfolio and asset (built, phase L) |
| Y | Benchmarking tab (Portfolio Management): NCREIF, Preqin and Cambridge Associates uploads, plus a public market equivalent; time-weighted returns added (added 11/23) | ✅ Built 11/24 (manual §7.50); feeds the quarterly report since 11/24: Benchmarks section, PDF page and Excel rows, internal always, shareable when ticked (licensing) |
| AcqDocs | Acquisition Documents tab (Acquisitions): documents by deal stage (screening, contract, approval, financing, closing) agreed with the user 11/24; current leases and broker listing agreement in screening; loan, rate cap and insurance read-only; per-deal checklist (added 11/24) | ✅ Built 11/24 (manual §7.51): lib/acquisitionDocs.js, components/AcquisitionDocs.jsx, supabase/acquisition_doc_types.sql (run by the user 11/24; uploads fall back to Other with an [acq] title before it). Also 11/24: Sale Documents renamed Disposition Documents; GP Economics moved last in Portfolio Management |
| Portfolios | Joint ventures and separate accounts set up like funds with their own terms from the JVA / SMA; consolidated GP Economics by type; navigation renames (Finance, Research, Comps, Portfolio …, Select Portfolio, Dashboard) (added 11/24) | ✅ Built 11/24 (manual §7.52): JVA / SMA doc types (supabase/portfolio_doc_types.sql, run by the user 11/24), acquisition and disposition fees (GP income, net of investor returns), SMA incentive fee waterfall, consolidated GP Economics, Reports portfolio dropdown, Deal Screener pipeline-only picker, sample pipeline deals |
| W | GP Economics tab (Portfolio Management, after Fund Return): the firm's fees, promote and co-invest returns in one page and report (added 11/23) | ✅ Built 11/24 (manual §7.49). 11/24: discount rate and fee present value removed (user: "remove discount rate from GP economics"); Revenue Yield (fee income ÷ committed capital, LP + GP or LP only from the LPA / JVA / SMA or the user; per year, to date; mockup approved); fee income kept apart from capital gains (promote and co-invest profit, counted in the year each asset sells; By year shows them beside fee income) |
| Save | Save bar (Save changes, Saved, conflict and error states), prompt before leaving tabs / Home / portfolio with unsaved changes, header save label removed; autosave kept as a safety net (added 11/24) | ✅ Built 11/24, merged (PR #98) |
| Library | Firm-wide Document Library (Library → Documents): every portfolio- and asset-level document and lease, grouped by portfolio, filters and counts, upload by type (portfolio or asset), Workflow tab column last; Documents panels on Portfolio Debt, Valuation, Leases, Insurance, Portfolio Summary and Asset Summary (added 11/24) | ✅ Built 11/24 (manual §7.53; lib/docLibrary.js, components/Documents.jsx, components/WorkflowDocs.jsx) |
| Sponsor | Finance area split into **GP Economics** (the capital partner: returns on invested capital, its promote share, fund-level fee) and **Sponsor Economics** (the operator: property-level fees and its promote share), with a combined view when they are the same company (added 11/24) | ✅ Built 11/24 (user: "Work on this now"; mockup approved with: outsourced PM / CM fees as nobody's revenue; parties, fees and promote from documents only for the sponsor and fee payees; multiple GP parties with capital and promote shares entered by hand; GP Economics shows the total then splits by party). Manual §7.55 |
| UI | Baywise name, grouped tab bar, tab renames, fund NAV to Fund Return, firm-wide header strip , fund type tag, Asset Return target warnings, SOFR panel on Debt (decided 11/23; see "App name and layout") | ✅ Built 11/23 |

**Built outside the phases on 11/22** (live): Valuations quarter-over-quarter
value change with exit cap and a PDF of valuation adjustments and their
effect on returns (PR #65); the rate cap moved from Quick Underwrite to the
Debt tab with a cap provider per cap (PR #66); Quick Underwrite renamed
**Deal Screener**.

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
- Validated sample abstracts in `docs/sample-leases/abstracts/`: all 12,
  attached to their leases in the app (the last nine and Lakeshore at the
  start of phase C).

## Phase C: review and apply (built 11/22)

**Built**: all 12 sample abstracts attached (Lakeshore abstracted with its
amendment, validated, SIC 7538); `lib/leaseApply.js`; Apply to rent roll
panel with before → after effect; rent steps and renewal options in
`simulateUnit`; mismatch flags on lease cards and Unit Roll rows; each
applied field logged with its source. Tested: 24 Node checks (engine steps,
abatement, options exercised / not exercised / exhausted, field mapping on
the samples, apply and flags), the 12 sample deals' results unchanged, and
18 Playwright checks on a workspace copy (Airport Flex as a new unit,
Route 9 existing unit, change log, database save).

Scope as planned:

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

## Phase D: fund lease views (built 11/22)

**Built**: Critical dates and Risk flags views (asset / fund, filters,
Excel), the PDF abstraction report, the Asset Summary column and Details
line, and Tenant credit (`supabase/tenant_credit.sql`: owners-and-editors
table and storage folder; figures with checks, Claude read-in, flags,
statements-due dates, apply rating to the unit) with fictional sample
credit documents in `docs/sample-deal-docs/tenant-credit/`. Reminders:
proposal only (a weekly Claude scheduled task with a phone notification),
not set up. Tested: 34 Node checks (all 12 sample abstracts, the credit
samples' expected flags, a statements clause), 22 Playwright checks as an
owner and 3 as a viewer (credit hidden and never requested).

Scope as planned:

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

### Phase E: acquisition documents (OM, rent roll, T-12, LOI, PSA, IC memo) — built 11/23

**Built**: the shared foundation (`supabase/deal_documents.sql`:
`deal_documents`, `save_deal_abstract`, the `deal-docs` bucket, audit log;
fund documents without an asset), the Documents tab (upload, Review with
Claude, Save abstract, viewer with quotes and local checks, Apply with
field-by-field ticks and a mismatch badge), every type below, document
deadlines in Critical dates, IC approved vs current (Documents and Asset
Summary), the IC conditions checklist, an LPA / PPM panel in New fund /
Edit all terms, the engine's realized sale, and fictional samples in
`docs/sample-deal-docs/deals/`. Not yet: the Portfolio Return roll-up of
approved vs current (the fund view of the Documents tab lists each asset's
instead); premiums compared with insurance expense; showing what changed
in an amended LPA beyond the field comparison. Tested: 45 Node checks
(every sample abstract against its PDF text, each type's mapping, rent
roll merge / replace, insurance gaps, IC variance, realized sale in the
engine, limits, deadlines, prompts) and 22 Playwright checks.

Scope as planned:

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

### Phase F: loan agreement to the Debt tab — built 11/23

**Built**: loan agreement and rate cap confirmation types on the Documents
tab (no database change: the table already allowed them); loan terms and
covenants applied to the Debt inputs, the actual loan amount in the engine,
the Debt tab's loan panel with covenant tests by year; executed caps in the
cash flows and the rate cap schedule ("executed", provider), checked
against the loan's cap requirement (strike, notional, rating, term,
maturity); upload of confirmations from the Debt tab; maturity, extension
notice, cap expiry and replacement deadlines in critical dates; fictional
loan agreements and cap confirmations for Airport Flex Park (clean) and
Route 9 Small Bay (BBB+ provider and short notional, flagged). Not yet:
loan insurance covenants in the insurance check; the index floor in the
engine (stored for reference); amortizing cap notionals. Tested: 27 Node
and 12 Playwright checks (all earlier suites still pass).

Scope as planned:

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

### Phase G: appraisal to the Valuations tab — built 11/23

**Built**: the appraisal type (`appraisal_validate`, never `appraisal_show`);
Apply sets the quarter's mark (value, source appraisal, appraiser, cap
rate, note and document link, with a PDF page link on the Valuations tab),
warns inside the cost hold, shows which mark it replaces, and compares NOI
and cap rate with the underwriting and the value with the price. Fictional
appraisals: Airport Flex Park Q3 2026 ($7,650,000, 6.25%) and Route 9 Small
Bay Q2 2026 (inside the cost hold). No database change. Tested: 14 Node and
8 Playwright checks; earlier suites still pass.

Scope as planned:

- Appraisal abstract (`appraisal_validate` / `appraisal_show`): value, effective
  date, cap rate, NOI, approaches, appraiser.
- Apply it to the quarter's mark as source "appraisal", with appraiser, cap rate
  and a link to the PDF page. It warns when the quarter is inside the 6-month
  cost hold, where the value isn't used.
- Compares the appraisal's NOI and cap rate with the underwriting.

### Phase H: estoppels, CAM reconciliation, billing and rent delinquency

**Built 11/23.** Estoppel, CAM reconciliation and billing are document types on
the Documents tab with a **Check** panel (nothing to apply): the estoppel is
compared row by row with the lease abstract and the rent roll unit (expiration,
commencement, monthly rent on the estoppel date from the rent schedule,
deposit, renewal options, amendments, tenant and landlord defaults, prepaid
rent), and a difference shows as **⚠ Estoppel differs** on the lease card and
**⚠ estoppel** on the unit in the Unit Roll. CAM: recoverable = lease share ×
(expenses − management fee above the lease's cap) − base year amount, vs billed,
flagging a wrong share or a fee over the cap. Billing: billed base rent vs the
lease's rent for that month. Rent delinquency: **Upload aged report** (Yardi
aged receivables, CSV or Excel) on the Unit Roll tab, one per month-end, with
property and tenant codes mapped to assets and units (kept for later months);
asset and fund totals by bucket, % of monthly rent, trend, tenants with default
and cure terms from the lease and deposit cover, a red **$ late** badge on the
unit, a fund card on Portfolio Return, and collections from a tenant ledger vs
each asset's credit-loss assumption. Stored on the fund
(`funds[name].delinquency`). Also: the LPA and PPM upload has an **Assign to
fund** picker, and each LPA/PPM card can be moved to another fund (logged).
Samples: `docs/sample-yardi/` (three month-ends, ledger, income statement for
phase I) and the Desert Aero estoppel, Lakeshore 2025 CAM reconciliation and
Riverside billing in `docs/sample-deal-docs/deals/`.

**Follow-ups (user, 11/23; to scope with the user, not started):**
- *Workflow and reporting for H need improving.* Today an estoppel, CAM or
  billing issue shows as a badge on its document card (added in phase I),
  in the Check panel, and for estoppels on the lease card and unit. There is
  no fund-wide list of open issues, no way to mark one resolved, and no report.
- *Linking leases to tenants.* Leases link to rent roll units with **Edit
  tenant / units** or **Apply to rent roll**. The user found this hard to use.
  Idea on hold: suggest the unit whose tenant name matches ("Link to unit 104
  (Desert Aero Parts)?") and put a unit picker on the card.

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

**Part 1 built 11/23.** New **Asset Business Plan** tab: revision 1 seeded from the
IC memo and closing model with the budget locked; edits and model changes
saved as new revisions (never overwriting), compared side by side; leasing
plan by unit, capital plan (spent vs budget), operating / financing / exit,
milestones (late flagged; open ones on Leases → Critical dates), KPIs vs
target, risks and recommendation. Actuals imported from a monthly income
statement for the whole fund; budget vs plan vs actual by month, quarter,
year to date and since closing, in $ and $/SF, amber / red flags with a
comment per variance; PDF per revision (with changes since the previous
one) and Excel; fund NOI vs budget card on Portfolio Return.
**Part 2 built 11/23:** asset photos (caption, date, order, cover) in the
private `asset-photos` bucket; a Google Maps location map (keyless embed
from the address, map or satellite, Open in Google Maps; coordinates can be
entered by hand; user chose this 11/23, with the Maps Embed API and a
site-restricted key as a later upgrade); a floor plan (uploaded image with unit boxes drawn by hand,
colored by lease status, or a schematic by SF); demising and combining
vacant units, which update the rent roll and the plan's boxes; actual NOI
(trailing 12 months of the imported actuals) shown as a cap rate on
Valuation and as a tile on Sell/Hold Analysis (display only; the model is
unchanged). Manual §7.31.

**TI spend by unit (user, 11/23; scheduled in phase T).** As the
value-add plan is carried out, record TI dollars actually spent against the
unit they were spent on. Each entry has a date, unit, amount, vendor or
description, and an optional invoice PDF. Three ways in (user, 11/23):
- **Manual:** add or edit a job (unit, category, budget, committed, status)
  and its invoices or payments by hand on the business plan.
- **Upload:** CSV or Excel job summaries and invoice detail, with columns
  matched like the other imports (property and unit mapped once, then kept).
  The format is the mock export below.
- **Yardi Construction Manager, auto-import (future):** when a Yardi
  connection is set up, jobs and invoices are pulled automatically on a
  schedule and matched to assets and units. Manual entries and uploads stay
  editable, and each row shows its source (manual, file, Yardi).

Mock data for Model Fund I (fictional, generic columns, not Yardi templates):
`docs/sample-yardi/construction-jobs-2026-10.csv` (11 jobs: TI by unit and
two capital projects, with budget, revisions, committed, invoiced, paid,
retainage and status) and `construction-invoices-2026-10.csv` (their
invoices), from `scripts/sample-yardi/generate.cjs`; totals in
`expected.json` → `construction`. Cases: Airport Flex unit 001 re-tenant
7.8% over budget; Ridgeway unit 014 34% over (red); jobs complete, in
progress and not started; a roof and a paving project not tied to a unit.

The business plan would show:
- for each unit in the leasing plan, TI spent vs. planned (TI/SF × SF), with
  the remaining balance and an overrun flag;
- the asset total vs. the TI/LC budget and the TI reserve or lender-funded
  TI draws, and spend vs. the budget's TI/LC line in budget vs. actual;
- each entry, logged and shown in the plan PDF and Excel export.
Later this could feed phase L's TI funding coverage heat map.

**A fuller sample plan (user, 11/23; scheduled: images in phase L, TI in phase T).** So
the Asset Business Plan can be seen fully filled in on the test data:
- **Mock TI actuals:** load the mock construction jobs and invoices above into
  Model Fund I when the sample portfolio or test scenario is loaded, so each
  sample asset's leasing plan shows TI spent vs. planned by unit, overruns
  flagged (Airport Flex unit 001 amber, Ridgeway unit 014 red), and the TI/LC
  line in budget vs. actual. **Phase T**, with TI spend by unit.
- **Mock images:** made-up pictures for the sample assets, never real photos
  of real buildings: a few drawn exterior and interior images per asset
  (captions, dates and a cover photo) and a drawn floor plan with the units
  already boxed and coloured by lease status. Shipped with the app as sample
  files (no database upload needed), marked as samples, and loaded with the
  sample portfolio; real assets keep using uploads. **Phase L**, so the
  report's page per asset shows a photo on the test data.

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

**Built 11/23** (manual §7.32). The baseline is frozen on click (Asset Summary
→ Details), stored as `inputs.uwBaseline`; occupancy by year is the model's
except the current year (rent roll today); capital and debt service are from
the model because the income statement import has no such lines.

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

**Built 11/23 (window 2).** See the status table and manual §7.33. Deferred: a planned NAV path and leverage plan vs. actual (with phase S, Fund Debt).

**Also in K (user, 11/23): Sell/Hold hold-period impact.** On Sell/Hold
Analysis, a "change the hold to X years" control per asset and for all
assets at once, with a before / after table for the fund: net LP IRR,
TVPI, DPI, GP promote, and a flag when a sale would fall past the fund's
term or extensions.

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

**Also in L (user, 11/23): Asset Return additions.**
- **GP ROE** at the bottom of the LP / GP waterfall summary: GP profit ÷ GP
  equity invested, i.e. (GP distributions − GP equity) ÷ GP equity (total,
  not annualised; the GP IRR already shows the annual rate).
- **Relabel "GP Promote" to "GP profit"**, sub-line "GP upside above
  capital returned" = GP distributions − GP equity invested; and add a
  **GP promote** row, sub-line "GP upside above its pro-rata share" = GP
  distributions − (GP share of equity × total distributions) (user, 11/23).
  Example: GP 10% of equity ($1.0M), deal distributes $20M, GP receives
  $2.6M → GP profit $1.6M, GP promote $0.6M.
- **Projected fee revenue** section: the firm's fee income from the asset
  over the hold, by year and in total: property management fee (the PM fee,
  % of revenue) and construction management fee (the CM fee, % of price),
  with a total and its present value. The asset management fee is the
  fund's management fee (one fund-level fee, not per-asset fees; user,
  11/23), so it is not repeated per asset here; it is on Fund Return and
  GP Economics. Promote is shown separately below, never in the fee
  revenue total (user, 11/23). Excel export.

**Also in L (user, 11/23): the full Asset Business Plan PDF.** The
business plan's PDF button prints the whole plan in one file: everything it
has today (plan, KPIs, leasing / capital / operating / financing / exit,
milestones, risks, budget, budget vs. actual, changes since the previous
revision) plus the cover photo and a page of captioned photos, the floor
plan with units coloured by lease status (or the schematic), the location
(address, coordinates and a Google Maps link; no map image, since the
keyless map can't be printed), actual NOI, and underwritten vs. actual
(phase J: returns, IRR gap by cause, by-year table).

**Also in L (user, 11/23): mock images for the sample assets** (drawn
exterior / interior photos with captions, dates and a cover, and a drawn
floor plan with units boxed), shipped as sample files and loaded with the
sample portfolio, so each asset's report page shows a photo; see phase I
"A fuller sample plan".

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
  - *Environmental and climate* (added 11/23, user): per asset, Phase I /
    Phase II reports and findings (recognized environmental conditions,
    remediation, no-further-action letters), tenants' hazardous-material
    use from leases and estoppels, FEMA flood zone, wildfire and extreme
    heat exposure; documents uploaded per asset (as on the Leases tab);
    fund roll-up and flags for open items.
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
  - *Debt concentration by lender* (added 11/22, user's request): fund
    debt grouped by lender (the loan's issuer: the deal's Lender field,
    and the lender named in the loan agreement once phase F reads it):
    outstanding balance and % of total fund debt, number of loans and
    assets, weighted rate and spread, maturities and extension dates by
    lender (the refinancing that falls on one lender in one year), any
    recourse or guaranty to each lender, and cross-default or
    cross-collateral links. Limits from the LPA/PPM or set by the user
    (e.g. no lender over 35% of fund debt), with breaches flagged, change
    vs. last quarter, and a concentration index (HHI) across lenders.
  - *Rate cap counterparty exposure* (added 11/22, user's request): every
    cap in force grouped by the institution that wrote it (the Debt tab's
    Provider, and the counterparty from the executed confirmation once
    phase F reads it): notional and % of total capped notional, number of
    caps and assets, strike and expiry, and the **exposure**: the cap's
    current market value (what the fund would lose if that counterparty
    failed), from the cap pricer on today's curve, rising as SOFR nears or
    passes the strike. Shows each counterparty's rating against the loans'
    minimum counterparty rating (from phase F: a downgrade below it usually
    requires replacing the cap), caps expiring in the next 12 months by
    counterparty, and caps with no provider entered. Limits (e.g. no
    counterparty over 50% of capped notional or of total cap value) with
    breaches flagged, and an HHI across counterparties.
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
      sub line terms are used as they are. The same update gives Fund I's
      loans made-up lenders (several assets per lender, one lender over a
      35% limit) and made-up cap providers (one provider writing most caps,
      one asset with none entered), so the debt and cap counterparty
      concentration sections show breaches to test. Added through a one-time,
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

**Also in M (user, 11/23):**
- **Deal Screener: choose the fund** the asset would be held in, and see the
  impact of acquiring it on that fund: projected gross and net IRR and
  multiple before / after, dry powder used, concentration (tenant,
  industry, location), and any LPA limit it would breach.
- **Deal Screener lists pipeline assets only**, never owned assets; owned
  assets appear only in the Asset Management tabs.

Model what adding a new asset would do to a fund before buying it, without
changing the fund.

- **Add a candidate:** pick a fund and add one or more candidate assets:
  from a saved or pipeline deal, from Deal Screener, or from an OM read in
  phase E. Each candidate has its price, closing date, equity and loan,
  business plan and exit, using the same underwriting as any deal. Nothing
  is added to the fund until the user chooses **Add to fund**.
- **Pipeline tab** (added 11/23, user's request; Acquisitions group, before
  Deal Screener and Fund Impact): every deal being watched, one row each:
  - *Fields:* name, address and market, SF, asking price, $/SF, cap rate or
    NOI, broker or source, date added, owner, stage, next step and date,
    target fund, notes, and a link to its OM on the Documents tab.
  - *Stages:* Watching → Screening → LOI → Under contract (PSA) → Closed,
    plus Passed / Lost with a reason.
  - *Adding deals:* entered by hand, or uploaded from **CoStar** exports or
    an **internal spreadsheet** (CSV or Excel). Columns are matched like the
    Sales Comps import, the map is remembered per source, and a blank
    template can be downloaded. A deal can also come from an OM read on the
    Documents tab. Re-uploads update matching deals (by name and address)
    instead of duplicating them.
  - *Actions:* **Screen** (opens it in Deal Screener with its inputs filled),
    **Send to Fund Impact** (adds it as a candidate) and **Convert to asset**
    once closed.
  - *Views:* filter by stage, fund, market or owner; totals by stage (count,
    SF, value); Excel export. The pipeline report's top 10 comes from this
    list. Every change is logged.
- **Pipeline assets in Deal Screener** (added 11/22, user's request): the
  Deal Screener has a **Model in fund** picker listing the fund's pipeline
  assets (acquisition date after today) and any saved deals not yet in a
  fund. Picking one loads its inputs into the screener as a candidate copy,
  so price, NOI, loan, cap or closing date can be changed for the scenario
  without changing the pipeline deal itself (an explicit **Save to deal**
  writes the changes back, logged). The fund impact view then shows the
  fund with vs. without that asset. Because the app already counts
  pipeline assets in fund figures, the comparison lets the user choose the
  base: **owned assets only**, or **owned plus the other pipeline assets**
  (the default), and the candidate is always left out of the "without"
  side. Several pipeline assets can be picked at once to see their
  combined effect and each one's share of it.
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
- **Pipeline report** (added 11/22, user's request): a summary of the
  fund's pipeline, exported as PDF and Excel and saved as dated versions:
  - *Pipeline status* fields on each pipeline deal: stage (screening, LOI,
    PSA signed, in due diligence, closing), probability of closing,
    expected close date, seller and broker, and a short note.
  - *Summary*: number of deals and total price, SF, equity and debt
    needed, by stage and probability-weighted; expected closings by
    quarter against the fund's dry powder and sub line capacity (is there
    enough capital, and when); the combined effect of the whole pipeline on
    fund returns, mix and limits (phase M's fund impact, owned assets as
    the base), and any LPA/PPM limit the pipeline would breach.
  - *Top 10 assets*, ranked by price by default (or by fund IRR impact,
    deal IRR, equity required or expected close; the user chooses): asset,
    market, SF, price and $/SF, going-in and exit cap, deal IRR, equity
    multiple and cash-on-cash, equity required, stage, probability and
    expected close, the change it makes to fund net IRR and multiple, and
    limit flags. A one-paragraph summary for each, with the key risks.
  - The rest of the pipeline listed in a short table after the top 10.
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
- **Deal Screener stays a tab** (11/23; reverses the 11/22 decision to fold it
  into phase M and retire it). The candidate screen still offers two ways
  to add a candidate: **Deal Screener** inputs (price, closing costs, year-1
  NOI and growth, hold, exit cap, loan, SOFR and spread, fees, with the
  forward curve) or **Full Underwrite** (a full rent-roll deal), and a
  screened candidate can later be converted to a full deal. The Deal
  Screener tab itself is not retired and stays first under Acquisitions
  after Pipeline.

## Phase N: Fund Summary (added 11/23, after M)

**Built 11/23 (window 3).** See manual §7.38.

**Also in N (user, 11/23):**
- **All key terms** from the LPA / PPM already in the app: fund type,
  commitments and GP commitment, pref, catch-up and promote tiers,
  management fee and basis, investment period, term and extensions,
  distribution policy, investment limits, the sub line's main terms, and
  key-person / removal clauses where the LPA has them.
- **Legal entities:** the fund, GP, manager and each asset's property-owning
  company: state, formation date, EIN (last 4 digits only), registered
  agent, annual-report due date (on the critical-dates list) and the asset
  it owns; a simple ownership chart drawn from those links (fund → asset
  companies; GP / manager).
- **Uploads:** legal org charts, formation documents, operating agreements,
  good-standing certificates and the like (as on the Leases tab).
- **Exports:** a one-page fund fact sheet (PDF) and Excel.

A new **Fund Summary** tab: one page of key facts about the selected fund.

- **Key dates** (user): launch date, final close date, investment period
  end; suggested: end of term and the outside date with extensions, time
  left in the investment period.
- **Key terms** (user): commitments (LP / GP), management fee and basis,
  preferred return, catch-up, promote tiers, term and extensions,
  subscription line, distribution policy.
- **Capital** (user): raised (commitments), deployed (capital called and
  invested in assets) and available (dry powder); suggested: % called,
  dry powder after reserves, sub line drawn vs capacity.
- Not repeated here (user, 11/23): performance (Valuations, Portfolio
  Return), the portfolio snapshot (Asset Summary) and upcoming dates
  (Leases → Critical dates); the page links to those tabs instead.
- Kept (not shown elsewhere yet): end of term and outside date with
  extensions; % of commitments called; sub line drawn vs capacity.
- **Exports** (user confirmed 11/23): the summary as a one-page PDF and as
  Excel.

## Phase O: asset and fund setup workflow (added 11/23, after N)

**Built 11/23 (window 3).** See manual §7.39.

The left inputs panel is always open today, with a tab per open deal. The
user found this clunky. Instead:

- Four buttons in the header: **New asset**, **Edit asset**, **New fund**,
  **Edit fund**. Edit asset and Edit fund pick from the existing assets and
  funds.
- The asset inputs panel opens only from New asset or Edit asset, as a
  slide-over with **Done**. The result tabs use the full page width
  otherwise. The asset picker above the tabs still chooses which asset the
  tabs show.
- New fund and Edit fund open the fund terms editor (as today from
  Portfolio Return). New fund keeps the LPA/PPM upload.
- Assets are never deleted from this panel (the ✕ on the deal tabs was
  removed in phase H). Taking an asset out of a fund stays on Portfolio Return.
- Tests: open, edit and close the panel; a new asset appears in the picker
  and the fund; nothing opens the panel by itself; earlier suites still pass.

## App name and layout (decided 11/23, built with phase I part 2)

**Name:** **Baywise**, tagline *Industrial Real Estate Management (renamed from "Industrial Real Estate Management", user 11/23)*
(internal use only; checked 11/23 that no real-estate or fund software uses
the name). Shown in the header, the browser tab ("Baywise · Industrial Fund &
Asset Management"), report covers, footers and export titles, the manual and
the README. The repository name and site URL stay as they are.

**Tab bar:** grouped, with a small header over each group:

| Group | Tabs (left to right) | Later additions |
|---|---|---|
| **Acquisitions** | Deal Screener | Pipeline (M) first, Fund Impact (M) last |
| **Dispositions** | (none yet) | Assets for Sale · Offers · Track Record · Documents (P) |
| **Asset Management** | Asset Business Plan · Asset Summary · Unit Roll · Leases · Valuation · Sales Comps · Debt · Cash Flow · Asset Return · Return Sensitivity · Sell/Hold Analysis | Leasing (R), right after Leases |
| **Property Management** | (none yet) | Property Taxes · Insurance · Property Condition · Service Contracts (T) |
| **Portfolio Management** | Fund Return · Stress Testing | Fund Summary (N) first, Fund Plan (K, its own tab) second, Fund Debt (S) after Fund Return |
| **Market** | (none yet) | Market Data (U) |
| **Library** | Documents | Reports (L) |

Group order (user, 11/23): Acquisitions · Dispositions · Asset Management ·
Property Management · Portfolio Management · Market · Library. A header
shows only once its group has tabs. Sales Comps stays in Asset Management;
rent comps live on the Leasing tab. (11/24: Sales Comps moved to
Acquisitions → Research, see "Research tab" below.) The live SOFR panel moves from the top of
the page to the top of the Debt tab (user, 11/23; built with phase I part 2).
Tab names keep "Fund" (Fund Return, Fund Summary, Fund Plan,
Fund Impact); only the group header says Portfolio Management.

**Fund type tag** (user, 11/23; a label only, no change to any
calculation): each fund is tagged **Fund**, **Separate Account** or **Joint
Venture**. The tag is chosen in New fund and editable in the fund's terms
(`funds[name].type`), and existing funds default to Fund. It shows as a
small badge next to the fund's name in the fund pickers, Asset Summary, Fund
Return, Valuation and report covers. Fund lists can be filtered by it. The
header strip shows consolidated figures only, with no split by type (user,
11/23).

**Renames:** Sensitivity → Return Sensitivity; Sell / Hold → Sell/Hold
Analysis; Valuations → Valuation; Portfolio Return → Fund Return; Return
Stress Testing → Stress Testing (everywhere the user sees them).

**Fund figures move to Fund Return:** fund NAV by quarter, gross and net LP
interim returns, and the fund totals of quarter-over-quarter value change.
Asset marks, the appraisal schedule, asset NAV and interim returns, and
mark editing stay on Valuation; its PDF stays there, linked from Fund Return.

**Deal Screener is not retired** (reverses the 11/22 phase M decision): it
stays a standalone quick screen in Acquisitions with **Send to Fund
Impact**; Fund Impact can also add quick-screen candidates itself.

**Header strip:** the six per-asset chips (IRR, multiple, CoC, cap rate,
DSCR, equity) are removed; their red warnings move to Asset Return (IRR <
14%, multiple < 2.0x, year-1 CoC < 7%, DSCR < 1.25x, with the threshold on
hover). In their place, firm-wide figures, the same on every tab, each with
its definition on hover:

| Figure | Definition |
|---|---|
| **AUM** | Sum of each owned asset's latest fair value (Valuation mark on or before today); purchase price while in the 6-month cost hold or with no mark |
| **Square feet** | Total SF of owned assets |
| **Assets** | Owned assets, "across N funds" |
| **Tenants** | Occupied units on the rent rolls, each tenant counted once per asset |
| **Occupancy** | Leased SF ÷ total SF |

Scope: every fund in the workspace, owned assets only (acquired by today;
not sold; no pipeline, Deal Screener or unassigned deals). No committed
capital figure.

## Phase P: Dispositions (added 11/23, after O)

A **Dispositions** group, right after Acquisitions, with four tabs. It covers
whole and partial sales (selected units or buildings), and uses the work
already built: Sell/Hold Analysis (the decision to sell), Sales Comps,
valuation marks, the disposition closing statement (realized price and
proceeds in the model) and the fund waterfall.

- **Assets for Sale:** every sale in progress, one row each.
  - *What's sold:* the whole asset, or chosen units or buildings with
    their SF and rent roll. For a partial sale, the rest of the asset is
    re-modeled without them.
  - *Why and target:* reason (business plan complete, hold reached, fund
    term, opportunistic), target price, cap and $/SF, and target close date.
    A sale can be started from Sell/Hold Analysis.
  - *Stage:* Preparing → Marketing → Offers → Under contract → Closed, plus
    Withdrawn with a reason.
  - *Broker:* BOVs side by side (price, cap, fee), the broker chosen, and
    the listing agreement (fee, term, exclusions).
  - *Marketing:* CAs signed, tours, and the call-for-offers date.
  - *Under contract:* PSA date, deposits and hard dates, and due diligence
    and closing deadlines (also on Critical dates). Price changes and
    credits are logged.
  - *Closing:* the closing statement's price, costs, loan payoff and net
    proceeds, with the distribution to LPs and GP through the fund
    waterfall.
  - *Documents:* an upload area on each sale, as on the Leases tab: BOVs,
    listing agreement, offering memo, marketing materials, PSA and
    amendments, estoppels and the closing statement. Each can be reviewed
    with Claude, checked and applied.
  - *Exports:* Excel and PDF of every active sale (stage, target, broker,
    key dates, and each sale's offers side by side with net proceeds), for
    one sale or all.
- **Offers:** every offer received, across all sales.
  - Buyer, buyer type and broker; date and round (initial, best and final);
    price, $/SF and cap; deposit; due diligence and closing days; financing
    contingency; notes.
  - Net proceeds after costs and loan payoff for each offer, compared side
    by side per sale; one offer can be marked selected.
  - A buyer's earlier offers on other assets show with them.
  - Documents: an upload area on each offer for its LOI or offer letter.
    Its terms can be read in to fill the offer.
- **Track Record:** every closed sale, with fund and firm totals.
  - Purchase vs. sale price and date, hold period, realized IRR, multiple
    and profit, each against the acquisition underwriting and the last
    valuation mark. For partial sales, the figures cover the part sold.
  - Documents: an upload area on each closed sale for its final closing
    statement, post-closing true-ups and distribution notice.
  - Exports: Excel and PDF, by fund and firm-wide.
- **Documents:** every disposition document across all sales, filterable by
  asset, sale and type. It is the same store as Library → Documents (each
  file kept once).

Needs new document types (BOV, listing agreement, offer letter, post-closing
true-up, distribution notice) added to the `deal_documents` check
constraint. Prepare that SQL and have the user apply it before the phase P
build starts, so the overnight run needs no approvals.

## Phase Q: workspace storage (added 11/23, after O; attended)

Today the whole workspace (deals, funds, valuations, comps, the change log,
business plans, actuals) is saved as one JSON record. As data grows
(photos, actuals, pipeline, offers) and more people edit, this gets slower
and two people saving at once can overwrite each other. This phase:
- moves deals, funds, valuations and the change log into their own tables
  (`deals`, `funds`, `valuations`, `audit_log` already exists), each row
  saved on its own, with the same workspace-member access rules;
- saves per row with a version check, so concurrent edits to different
  assets never clash, and an edit to the same asset asks the second person
  to reload instead of overwriting;
- loads only what a tab needs where that helps;
- keeps the app's behaviour and numbers identical; the regression check
  and every test suite must pass unchanged.
Run with the user present, at a time they choose, not overnight. It needs
several database changes, and it migrates the live workspace:
1. back up the workspace record;
2. migrate;
3. compare every deal's inputs and results before and after;
4. keep the old record as a fallback until the user is satisfied.

## Phase R: Leasing tab (added 11/23)

One **Leasing** tab in Asset Management, right after Leases (one asset,
with a whole-fund view):
Two sections (user, 11/23): **Leasing Pipeline** (leasing prospects, not the
deal Pipeline of phase M) and **Rent Comps**.
- **Leasing Pipeline:** prospects by unit, with source and broker. Stages: Inquiry →
  Tour → Proposal → LOI → Lease out → Signed, plus Lost with a reason. It
  also covers renewal negotiations, lease approval memos and broker
  reports, and compares downtime and achieved rent with the business plan's
  leasing targets.
- **Rent Comps:** lease comps entered by hand or uploaded (CoStar or an
  internal spreadsheet, columns matched like Sales Comps), with filters,
  asking and achieved rent vs. the comps, and a way to set a unit's market
  rent from them.
- **Uploads:** each prospect or deal (proposals, LOIs, lease drafts,
  approval memos, broker reports) and the rent comps section.
- **Exports:** Excel and PDF.

## Phase S: Fund Debt tab (added 11/23)

A **Fund Debt** tab in Portfolio Management, after Fund Return. The Debt tab
in Asset Management stays for one asset's loan. Fund Debt shows every loan
in the fund:
- a maturity ladder;
- extension tests and a refinance planner;
- total rate exposure (floating, capped, fixed) and cap expiries;
- lender concentration;
- quarterly **covenant compliance certificates** for lenders (Excel and
  PDF).

## Phase T: Property Management group (added 11/23)

**Also in T (user, 11/23): TI spend by unit and mock TI actuals**, built
together with the Yardi Construction Manager link: TI jobs and invoices by
unit (manual, CSV / Excel upload, Yardi later), spent vs. planned on the
business plan's leasing plan with overrun flags, and the mock construction
files loaded into Model Fund I; see phase I "TI spend by unit" and "A
fuller sample plan".

A **Property Management** header after Asset Management, with four tabs.
Each tab shows one asset, with a whole-fund view, uploads in each section
(as on the Leases tab) and an Excel export:
- **Property Taxes:** parcels, assessed values, bills and due dates (on
  Critical dates), appeals (filed, hearing, outcome, savings), tax vs.
  budget.
- **Insurance:** policies by type, carrier, limits, premium and renewal date
  (on Critical dates), and a claims log (date, cause, amount, status,
  recovery). Builds on the insurance certificates already on Documents.
- **Property Condition:** PCA, Phase I/II and zoning reports as document
  types. Their findings become items with cost, urgency and status, which
  can be added to the business plan's capital plan.
- **Service Contracts:** vendor contracts (landscaping, HVAC, roofing…),
  with term, cost and renewal date.
- **Yardi Construction Manager:** condition projects and service contracts
  link to their jobs, contracts and invoices. For now this works by
  CSV/Excel upload (the format of `docs/sample-yardi/construction-*.csv`)
  or by hand; once a Yardi connection exists, it is pulled automatically.
  This is the same link as the planned TI spend by unit.

## Phase U: Market group (added 11/23)

**Also with U (user, 11/23): stress tests in standard deviations.** On
Stress Testing, each shock is labelled in standard deviations from the base
case (e.g. "+150 bp exit cap = 1.8σ"), using each factor's historical
volatility (SOFR from the NY Fed history the app already reads; cap rates,
rent growth and vacancy from the Market Data history; editable defaults
until then). A simulation (thousands of random paths, with factors moving
together as they have historically) shows where the stressed case falls in
the range of outcomes, e.g. "this outcome or worse ≈ 1 year in 20".

A **Market** header before Library, with a **Market Data** tab:
- **Submarket statistics** by quarter: inventory, vacancy and
  availability, net absorption, asking rent (small-bay and overall),
  deliveries and under construction, sales volume and cap rates, with
  trend charts.
- **Sources:** CoStar or broker report uploads (CSV or Excel, columns
  matched), or entered by hand. Each figure keeps its source and date.
- **Links:** each asset is tagged to its submarket, so underwriting,
  Valuation and the business plan can show the asset's assumptions next to
  the market's (e.g. rent growth vs. the asking-rent trend, exit cap vs.
  market cap rates).
- **Exports:** Excel and PDF market summaries.
Sales Comps stays in Asset Management, and the live SOFR panel is on the
Debt tab.

## Phase X: Distribution Analysis (added 11/23; built right after K, before L)

**Built 11/23 (window 2).** See the status table and manual §7.34.

A **Distribution Analysis** tab (named by the user 11/23) in Portfolio Management, after Fund Return: a model
for each quarter's fund distribution. Decided with the user 11/23:
- **Distributable cash** for a fund and quarter:
  - cash at each asset (operating accounts), **uploaded from Yardi** (cash or
    bank balance report, mapped once like the other Yardi imports) **or
    entered by hand**; when an asset has no balance for the quarter, the
    **model's projected cash is used as a fallback** (user, 11/23), clearly
    labelled "projected, no balance entered", and the total shows how much
    of it is projected vs. actual;
  - less lender-required reserves (loan terms) and committed TI / capex not
    yet paid (business plan);
  - less an asset working-capital minimum of **3 months of projected
    operating expenses** (from the asset's budget / model);
  - plus fund cash, less a fund minimum of **6 months of projected fund
    expenses** (management fee and sub line costs; matches the existing
    2-quarter fund cash reserve);
  - less any sub line repayment required by the **sub line term sheet**
    (e.g. clean-down or repay-before-distribution terms; entered from the
    term sheet or read from it like the LPA).
- **Choose the distribution:** an amount or a % of distributable cash. The
  LP / GP split follows the **LPA terms** (the fund's waterfall and income
  treatment, already read from the LPA). Shows what stays in reserve.
- **Projected distribution yield:** annualized distribution ÷ LP contributed
  (called) capital, and the same on **NAV** (Fund Return's latest NAV).
- **History:** the last 4 quarters of actual distributions (capital
  activity) with each quarter's yield and the trailing-12-month yield,
  next to the proposed quarter.
- Save a proposal; when paid, record it as a distribution in capital
  activity. No approval step now (that comes with phase V's workflow).
  PDF and Excel export.

## Phase Y: Benchmarking (added 11/23, after L)

A **Benchmarking** tab in Portfolio Management: the fund's and each asset's
returns against outside benchmarks. The benchmark data is licensed, so it is
uploaded each quarter from the user's subscriptions (CSV / Excel exports,
columns mapped once), never fetched by the app; each figure shows its source
and "licensed data" (check each license before using benchmark figures in
LP reports).
- **NCREIF** (NPI, NPI Industrial, ODCE): property-level, unlevered,
  quarterly time-weighted returns (income and appreciation). Compared with
  each asset's and the fund's unlevered quarterly time-weighted return, which
  the app adds (it uses IRR today) from NOI, capex and the quarterly marks.
- **Preqin**: private real estate funds by vintage year and strategy
  (closed-end, value-add / industrial): net IRR, TVPI and DPI quartiles. The
  fund's net figures shown with its quartile.
- **Cambridge Associates**: real estate fund benchmark statistics by vintage
  year (IRR, multiples) and its quarterly index; same fund-level comparison
  as Preqin, as a second source.
- **Public market equivalent (PME)** (user, 11/23): the fund's LP cash flows
  invested in public industrial REITs instead, as a Kaplan-Schoar ratio and
  an index-equivalent IRR, against:
  - **main: FTSE Nareit Industrial index**, total return (monthly returns
    Nareit publishes free);
  - **second line: small-bay peer basket**, EastGroup, Rexford, Terreno and
    STAG, equally weighted, total return (monthly returns uploaded);
  - optional: FTSE Nareit All Equity REITs and the S&P 500.
  Note on the tab: listed REITs carry less leverage (about 25–35%) than a
  value-add fund (about 60%), so part of any gap is leverage.
- Views: since inception and trailing 1 / 3 / 5 years; charts; Excel and
  PDF; feeds phase L's reports (internal by default because of licensing).

**Built 11/24** (`lib/benchmarks.js`, `components/Benchmarking.jsx`,
`lib/benchmarkPdf.js`; the tab sits after Stress Testing):
- Uploads (quarterly index, vintage quartiles, monthly returns) with the
  columns found shown before import; kept in `comps.benchmarks` with source,
  file, who and when; one summary line per benchmark in the change log.
- Unlevered NCREIF-style TWR for each asset and the fund from the
  quarterly values, NOI and capex; chain-linked since inception and trailing
  1/3/5 years against NPI, NPI Industrial and ODCE; growth-of-100 chart;
  assets vs. NPI Industrial.
- Net IRR / TVPI / DPI quartiles for the vintage (year of first
  acquisition), with a strategy filter.
- PME: KS-PME and fund IRR vs. index-equivalent (Long-Nickels) IRR, since
  inception and trailing (NAV at the window start as the opening flow),
  against Nareit Industrial, the equal-weight peer basket, All Equity REITs
  and the S&P 500. The LP flows are the same as the quarterly report's net
  IRR (lib/valuations now keeps the last quarter's dated LP flows).
- Fictional sample files in `docs/sample-benchmarks/`. Tests:
  `tests/node/phaseY.test.cjs`, `tests/e2e/phaseY.e2e.cjs`.
- **Not yet:** feeding the quarterly report (internal version) with the
  benchmark comparison.

## Revert from the change log (added 11/23; with the backups item, after Z)

Revision control the user can use (user, 11/23: "everything saves to the
database with revision control and auditing; what more do I need?"):
- A **Revert** button on each change-log entry puts that field back to its
  earlier value (saved and logged as a revert, by whom and when).
- **Restore a deal or fund as of a date:** rebuild one record from the change
  log (and the database's earlier record versions), preview the differences,
  then apply; nothing else is touched.
- Deleted deals and funds (kept in the database, marked deleted) can be
  brought back from a "Recently deleted" list.
Done 11/23 ahead of this: the workspace buttons were removed: Reset is gone,
Export is **Download backup**, Import is owner-only **Restore from backup**
with an automatic backup first.

## Phase Z: Home page (added 11/23, after O)

**Reworked 11/24 (user) into the Operational Dashboard (USER_MANUAL §7.42):**
Actions Needed (urgent: overdue, due within 30 days or an issue now; Done
tracking), Upcoming Events (a rolling year back and ahead: leases and lease
abstract dates, debt, appraisals, property management, construction, plan
milestones, purchase and sale contract dates, fund dates), and the Asset
Watch List (plan performance only: NOI or IRR under plan, At Risk over 10%
under, Off Plan up to 10%). Both lists show Asset name, Due date, Action
type, Owner (asset manager or portfolio manager) and Status (Past Due, Due
now, Upcoming, Completed). Home moved to the header and saves edits before
leaving; Functions became one button per area, showing that area's tabs;
Setup & Maintenance sits under Functions (from 1.1.1, as the last Functions area). The Workflows lanes, fund cards and
recent activity below were removed. The original 11/23 plan follows.

A **Home** page the app opens on, organised by workflow (user, 11/23):
- **Today:** the firm-wide figures, and an attention list (lease
  expirations and option deadlines in 90 days, overdue appraisals, loan
  maturities and covenant tests coming due, rent 60+ days late, rate caps
  expiring, budget lines in the red), each opening the tab that handles it.
- **Workflow lanes, one per tab header**, in the tab bar's order, each with
  a few live numbers and links to its tabs (a lane appears once its header
  has tabs):
  - **Acquisitions:** pipeline by stage, deals in screening, dry powder.
  - **Dispositions:** assets for sale, offers received, sell / hold flags.
  - **Asset Management:** occupancy, leases expiring this year, NOI vs.
    budget, open capex / TI, appraisals due.
  - **Property Management:** tax and insurance due dates, open condition
    items, service contracts renewing.
  - **Portfolio Management:** NAV and net IRR vs. target, loans maturing in
    18 months and covenant headroom, sub line used, distributable cash and
    last distribution yield, next report due.
  - **Market:** latest submarket vacancy and rent for the firm's markets.
  - **Library:** recently added documents and reports.
- **Fund cards:** one per fund / Separate Account / JV with its type badge,
  NAV, net IRR vs. target, % called, dry powder and next key date.
- **Quick actions:** New deal, **New fund setup**, Upload rent roll, Upload
  Yardi actuals, Import marks, Record capital activity, New report.
- **Recent activity:** the last 10 changes from the change log.
- Later: lane order by role; "My approvals" once phase V exists.

## Fund picker: "Working on" (added 11/23, with Z)

User, 11/23: "in the homepage can we add a drop down to load whatever
portfolio you want to work on?" The data is already all loaded (one firm,
saved record by record), so this is a **filter**, not a load:
- A **Working on** dropdown in the header: All funds, then each fund, SMA
  and JV with its type badge.
- Every tab follows it: the deal list, Fund Return, Valuation, Asset
  Summary, critical dates, the firm strip (which then shows that fund's
  figures, labelled), and the Home page's lanes and fund cards.
- Remembered per person (on their sign-in, not the browser), so each person
  reopens on the portfolio they last worked on.
- Pipeline deals with no fund show under All funds and under the fund they
  are being screened for (phase M).

## Quarterly report summary (added 11/24, built 11/24)

User, 11/24: "Watch lists, change, and reports should be summarized on top
of every report" (done first for the risk report), then "Yes to the
quarterly report as well."

- Three cards above the quarterly report: **watch list** (from the risk
  report; internal, so it appears in the internal PDF and Excel only),
  **change vs. last quarter** (LP NAV, net LP IRR, TVPI, DPI, % called,
  occupancy, LTV, assets) and **issued reports** for the quarter.
- The same summary heads the PDF's first page and the Excel; an issued
  version freezes its summary (`issueReport(..., { summary })`).
- `quarterSummary` in `lib/quarterlyReport.js`; tests
  `tests/node/quarterSummary.test.cjs` and `tests/e2e/phaseL.e2e.cjs`. Manual §7.32b.

## Research tab (added 11/24, built 11/24)

User, 11/24: "Create a new tab under acquisitions called Research. Move
Comps under that section. Add a new section called Third-Party. Allow the
team to be able to upload or link, and summarize any third-party research
that was used. All of this should be tied to the asset, not a fund."

- **Tab:** Acquisitions → Research, after Fund Impact, with the Asset
  dropdown. Two sections: **Comps** and **Third-Party**. Sales Comps leaves
  Asset Management.
- **Comps per asset** (`inputs.salesComps`): an asset with none starts from
  the firm comps list (shown with a note); its first edit saves a copy to
  the asset. The firm list and the firm market data are unchanged.
- **Third-Party** (`inputs.research`): type, title, provider, date, link
  (http/https only), PDF (deal_documents, type "other", title
  "[research:<id>] <file>"; no new database type), assumptions supported,
  key figures and summary. Summary cards (count, assumptions with and
  without support), this asset or all assets in view, Excel and PDF.
- **Tests:** `tests/node/research.test.cjs`, `tests/e2e/research.e2e.cjs`;
  layout order updated. Manual §7.48.

## More external reports (added 11/24, future release)

User, 11/24: "For a future release let's consider adding in a few more
external reports." The Reports tab has one external report today (the
shareable Quarterly report, phase L) next to the internal Risk report.
Candidates to choose from (decide which before planning):
- **LP capital account statements:** per investor, by quarter (commitment,
  contributions, distributions, fees, allocated income and NAV). This needs
  investor-level records, which don't exist yet.
- **ILPA-template quarterly report:** fees, expenses and carried interest in
  the ILPA reporting template layout.
- **Annual report:** the year in review with the audited financial
  statements attached (uploaded) and the valuation policy.
- **Property-level investor updates:** one page per asset (photos, leasing,
  business plan progress), for LPs or JV partners.
- **ESG / GRESB data:** energy, water, certifications and climate risk by
  asset, using the environmental and climate fields already on the risk
  report.
- Each would follow the Quarterly report's pattern: a view, PDF and Excel,
  issued versions frozen with who issued them and when, never showing
  internal-only data.

## Mock comps for the sample assets (added 11/23, future release)

User, 11/23: "add mock comps for each asset in Fund I in a future release."
- **Sales comps:** 5–8 fictional sales per sample asset (same metro and
  property type, sized near the asset, dated over the last 24 months) with
  price, $/SF, cap rate, buyer / seller, so the Sales Comps tab, the
  Valuation tab's comp support and the reports show what a full set looks
  like.
- **Lease (rent) comps:** fictional recent leases near each asset (size,
  $/SF, term, TI, free rent) for the Leasing tab (phase R) and mark to
  market.
- Fictional names and addresses only; loaded with the sample portfolio and
  from the Sample data menu (edits kept), like the drawn photos.

## Demo firm (added 11/23, after the fund picker)

Keep sample data out of the real firm:
- A separate **Demo** firm holding Model Fund I and the test deals, opened
  from the firm switcher by anyone with access; the real firm then holds only
  real assets.
- The **Sample data** menu (owners only, built 11/23) moves into the Demo
  firm; the real firm loses it.
- Tests and demos run against Demo; nothing in Demo touches real records.

## Phase W: GP Economics (added 11/23, after L)

A **GP Economics** tab in Portfolio Management, right after Fund Return: what
the firm makes, in one place. Projected, with actuals where the app has them.
- **Fee revenue by year:** the **asset management fee**, which is the fund's
  management fee (one fund-level fee, e.g. 1.5%; there are no separate
  per-asset AM fees; user, 11/23), plus property management and construction
  management fees from each asset. Total and present value.
- **Promote**, by fund and by asset, projected and realized (sold assets);
  kept separate from fee revenue, never in its total (user, 11/23). Uses
  phase L's definitions: GP promote = GP distributions − GP share of equity
  × total distributions.
- **GP co-invest:** equity in, GP profit, GP ROE, GP IRR and multiple.
- **Totals:** total GP income by year and life of fund (fees, promote,
  co-invest profit shown side by side, with each as a share of the total).
- **Views:** firm-wide across all funds, then by fund and by asset, with the
  fund-type filter.
- **Report:** internal PDF and Excel.
Builds on phase L's Asset Return additions (GP ROE, GP profit / promote,
projected fee revenue), which roll up here.

**Built 11/24** (`lib/gpEconomics.js`, `components/GpEconomics.jsx`,
`lib/gpEconomicsPdf.js`): the fund fee comes from the fund expense engine
(the same quarterly charges as Fund Return), promote and co-invest from the
fund waterfall's distribution rows by year; co-invest profit = GP profit −
promote, so the three parts never double count. Asset promote is the fund's
promote allocated by share of gross profit (the waterfall is fund-level).
Tests: `tests/node/phaseW.test.cjs` (promote matches Fund Return's,
by-year sums, shares add to 100%), `tests/e2e/phaseW.e2e.cjs`.

## Phase V: automated workflow (added 11/23; later, to be scoped)

Approvals (sign-offs for leases, capex over a threshold, budgets and sales)
and reminders before critical dates. On hold until the user scopes it.

## Bundles for phases Q–U (user, 11/23: "no rush; bundle so I don't get crushed on cost")

Each bundle fits one 5-hour usage window. Nothing runs on its own after the
I → O windows. Bundle 1 starts when the user picks a time to be present.
After that, each bundle starts only when the user says "next bundle", so
they set the pace. A bundle that runs over is finished at the start of the
next one, never in an extra window of its own.

| Bundle | Phases | Notes |
|---|---|---|
| 1 (attended) | Q Workspace storage | The user present (confirmed 11/23) for the database changes and the live-data check; first, so later phases are built on it. The user picks the time |
| 2 | P Dispositions | The largest: four tabs, uploads, exports. Its document-type SQL is prepared ahead and applied in bundle 1 |
| 3 | R Leasing + S Fund Debt | Two single tabs |
| 4 | T Property Management | Four tabs and the Yardi Construction Manager uploads |
| 5 | U Market Data | One tab, with room to catch up |
| — | V Automated workflow | Not scheduled until scoped |

## Build rules: tests in the repository (user, 11/23)

From tonight's build on, every phase commits its tests:
- **Location:** Node checks and Playwright browser tests live in `tests/`
  (e.g. `tests/node/phaseH.test.cjs`, `tests/e2e/phaseH.spec.cjs`). They
  are run by `npm test`, `npm run test:e2e` and `npm run test:regression`.
- **CI:** a GitHub Actions workflow (`.github/workflows/tests.yml`) runs
  them on every pull request and push to main. It builds the site, serves
  `out/` and runs Playwright with mocked database routes, so it needs no
  secrets. A red ✗ on a PR means a test failed.
- **Fixtures:** test data comes only from the fictional sample portfolio
  and sample documents, never from a copy of the user's workspace. Earlier
  phases' tests (C–I) are moved in first, with any workspace-copy fixture
  rebuilt from `buildSampleDeals`.
- **Each phase** adds its tests in its own PR, and a PR isn't ready until CI
  is green.

## Save bar and leave prompt (user, 11/24; built)

User: "A save button should appear every time a user makes a change. If
they attempt to leave without saving their changes, it should prompt them.
… remove the header button." Autosave stays as a safety net (user's choice).
Built in `app/page.jsx`: a bottom save bar (Unsaved changes / Save changes,
✓ Saved, conflict and error states); switching tab, Home or portfolio asks
first; the header save label is removed and **Database and people…** moved
to ⋯ More. Tests: phaseZ, phaseQ.

## Firm-wide Document Library (user, 11/24; built)

Library → Documents lists every fund- and asset-level document firm-wide,
with upload. Each document type attaches to a fund or an asset; documents
are viewable and uploadable in each related workflow tab. Leases included,
photos excluded. Mockup approved 11/24 with: workflow-tab panels as recommended (Portfolio Debt, Valuation, Leases, Insurance, Portfolio Summary, Asset Summary), grouped by portfolio by default, the Workflow tab column moved last.

## Sponsor Economics (user, 11/24; parked, to be scoped)

User: "Under the finance functions, we should consider two tabs: one for GP
Economics, and one for Sponsor Economics. In CRE, the GP is sometimes just a
source of capital. The operator manages the assets and earns fees. The GP
makes money on gains from invested capital. The sponsor, also called an
operator, makes money off of fees. If the GP and sponsor are not the same
company, they often split the promote."
- **GP (capital partner):** returns on invested capital (co-invest profit,
  its promote / carry share; a fund-level management fee when it runs a
  fund). Mostly capital gains.
- **Sponsor / operator:** property-level fees (PM, CM, acquisition,
  disposition, leasing, development) and its promote share. Mostly fee income.
- Different companies: the promote is split (a fixed share, or the operator's
  own promoted interest at the JV level; fund carry on top = "double
  promote"). Same company: the two tabs add up to today's GP Economics, so a
  combined view stays.
- To decide: who the sponsor is per portfolio (the firm or a named outside
  operator, e.g. from the JVA); which fees go to which party (the asset
  management fee is the grey area); how the promote is split (share vs.
  tiers per layer); each party's co-invest; whether the firm is the GP, the
  sponsor or both; Revenue Yield likely moves to Sponsor Economics, with a
  capital-gains measure (e.g. GP ROE / multiple) on GP Economics.
- **Answers (user, 11/24):**
  1. **Sponsor per portfolio:** defined for each portfolio. If the sponsor is
     the firm itself, all fees accrue to the firm.
  2. **Parties and fees at setup:** portfolio setup defines the parties and
     which fees belong to whom. The asset management fee generally goes to
     the sponsor.
  3. **External GP and promote split:** defined per portfolio or per asset:
     whether there is an external GP, and the promote split between the GP
     and the sponsor.
  4. **Co-invest by party:** defined at setup; usually the sponsor has none.
  5. **The firm's role:** not fixed. Some firms are operators (sponsors),
     some are not, so the firm can be the GP, the sponsor, or both.
  6. **Measures:** Revenue Yield moves to Sponsor Economics (fees). GP
     Economics shows the GP's return on invested capital and its share of
     the promote.
- Built 11/24. Further answers: outsourced property / construction
  management is an expense of the asset but nobody's revenue; the promote
  split may be in a side agreement, so the GP parties, their capital shares
  and the promote split are entered by hand at setup; several GP parties can
  exist, each with its share of GP capital and of the promote; GP Economics
  shows total GP economics, then splits it by party.

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
24. **Deal Screener stays a tab** (11/23, reversing 11/22): Deal Screener
    is one of the two ways to add a candidate (with Full Underwrite), and
    the Deal Screener tab is not retired.
25. **Debt concentration by lender and rate cap counterparty exposure**
    (added 11/22) in phase L's risk report: fund debt and capped notional
    and cap market value grouped by lender and by cap counterparty, with
    maturities, ratings vs. loan requirements, limits, breaches and HHI.
26. **Pipeline assets in Deal Screener** (added 11/22): a Model in fund
    picker loads a pipeline asset (or unassigned saved deal) as a candidate
    copy for phase M's fund impact view, with a choice of base (owned only,
    or owned plus other pipeline); edits stay in the scenario unless saved
    back to the deal.
27. **Pipeline report** (added 11/22) in phase M: pipeline status fields
    per deal; a summary by stage with capital needs vs. dry powder and the
    pipeline's fund impact; the top 10 assets (ranked by price by default,
    user-selectable) with deal returns and fund impact; PDF and Excel,
    saved as dated versions.

