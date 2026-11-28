# Manual check: docs/USER_MANUAL.md (1.1.30) against the code

Checked 11/28/2026 against the repository as it is now. Read-only: nothing was edited, committed or built. I ran existing Node test files and a throw-away copy of `lib/` (in the scratchpad) to reproduce the worked example. Figures quoted are test copy (sample data).

Manual line numbers are for `docs/USER_MANUAL.md`. Code references are `file:line`.

Ranking: High = a stated step or calculation is wrong, or a named thing cannot be found. Medium = a screen, button, field or table is out of date. Low = wording, counts, links.

---

## HIGH

**H1. §9 item 6 says the waterfall tier is chosen once from the overall IRR. The default is marginal tiers.**
- Manual L4620-4621: "Waterfall tier is chosen once from the overall IRR, not as a running IRR hurdle." The same manual says the opposite at L1063: "Tiers (1.1.12): marginal by default."
- Code: `lib/fundTimeline.js:264` `const marginal = cfg.tierMethod !== "cliff"`; default `tierMethod: "marginal"` at `lib/fundTerms.js:25`. Cliff (one tier from the whole IRR) is only the opt-in "Promote tier method".
- Corrected: "Promote tiers are marginal by default: each split applies only to the dollars between one LP IRR hurdle and the next. A fund can be set to Cliff (one tier, chosen from the whole project's IRR) in its terms."

**H2. §8 worked example is described as "the Underwriter defaults" but includes a 1.5% asset management fee. The default is 0%.**
- Manual L4564 and L4572: "AM 1.5% of equity". Table rows L4583 (AM fee 59,113 a year), L4590 (net cash flow −48,340 / 142,063 / 307,445 / 29,272,366), L4594 ("Levered IRR ≈ 66%; equity multiple ≈ 7.5×").
- Code: `lib/quickUnderwrite.js:59` `amFeePct: 0` ("Model Fund I charges its fee at the fund level"). The data dictionary at manual L4818 even says default 0, so the manual contradicts itself.
- I ran `quickUnderwrite` on the defaults. Year-1 net cash flow is +10,773 (not −48,340), IRR 66.9%, multiple 7.59×. With `amFeePct: 1.5` it reproduces the manual to the dollar (−48,340 / 142,063 / 307,445 / 29,272,366; IRR 66.04%; 7.53×). Every other row in the table (SOFR 3.95/4.45/4.37/4.29, rates, NOI, debt service, caps, extension fee, sale, equity 3,940,836) matches the defaults.
- Corrected: "The inputs are the Underwriter defaults, except the asset management fee, which is set to 1.5% of equity (the default is 0% because Model Fund I charges its fee at the fund level)." Or remove the AM row and restate the results (year 1 net +10,773; IRR ≈ 67%; multiple ≈ 7.6×).

**H3. §2 describes a left panel with deal tabs and a "+" that no longer exists.**
- Manual L300-306: "The left panel holds the deals (tabs across the top of the panel) and the full-model inputs… Click a tab to switch assets; + sets up a new asset. The tabs have no ✕… Phase O replaces this with New / Edit asset and New / Edit fund buttons." Also L401-404 ("Edits to the same fields in the left panel…") and L384-386 ("the same as clicking its tab in the left panel").
- Code: asset inputs open only as a slide-over titled "Asset inputs" with a Done button (`app/page.jsx:2180-2190`), started from **New asset** / **Edit asset…** in Setup & Maintenance (`app/page.jsx:1931-1940`). The manual's own §7.39 (L2901-2914) says this. Phase O is long built.
- Corrected: "Asset inputs open in a panel on the right (Done, Escape or a click outside closes it). Open it with New asset or Edit asset… in Functions → Setup & Maintenance. The Asset dropdown above the single-asset tabs switches the asset."

**H4. The Sample data menu is in the wrong place and holds 14 actions, not three.**
- Manual L421-433: "The Sample data ▾ menu (left, under the header; owners only, 11/23) holds three actions…". L3001: "the owner-only Sample data menu [is] under ⋯ More". L259 also says Sample data → Load Model Fund I.
- Code: the button is labelled "Sample data (test) ▾" and sits in the Setup & Maintenance row (`app/page.jsx:2273-2284`). It lists 14 items (`app/page.jsx:2292-2305`): Load Model Fund I, Add drawn photos, Add risk test data, Add sample documents, business plans, prospects, marks and market data, GP partners, tenant credit and aged rent, comps, pipeline deals, Add construction test data, Load test scenario, Clear test data. ⋯ More holds only Database and people…, Download backup and Restore from backup (`app/page.jsx:2112-2118`). The manual's own 1.1.11 note (L5946) says it moved to Setup & Maintenance.
- Corrected: "Sample data (test) ▾ is in Functions → Setup & Maintenance (owners only) and lists the sample-data actions (§7.58-7.60). Download backup and Restore from backup are under ⋯ More."

**H5. Where the firm's data lives, and the SQL that reads it, is described for the old workspace format.**
- Manual §11.0 (L4719-4751) and the "Stored at (`workspaces.data`)" column of every table in §11.1-11.11; the SQL examples at L4741-4748 (`from workspaces where name = 'Model Fund I'`), L5513-5533, and L5535-5543 (restore from `workspace_versions`); §12.7 L5552-5554 ("each save stores a full copy in `workspace_versions`").
- Code: since phase Q the firm is saved record by record in `firm_records` (`kind`/`key`/`data`, `supabase/firm_records.sql:32`; `lib/records.js:25-32`). `save_records` does not write `workspaces.data` or `workspace_versions` (`firm_records.sql:96,111`). Record history is `firm_record_versions` (`supabase/firm_record_versions.sql:27`). The manual's own §12 intro (L5314-5353) says `workspaces.data` was left as an old fallback and the workspace was renamed Baywise.
- Effect: the example queries return nothing, or an old frozen copy. The "restore an earlier version" steps at L5535-5543 restore an old copy, not the current firm.
- Corrected: describe the storage as `firm_records` rows (deal, saved_deal, fund, valuation, settings, local_log), give examples against `firm_records` (for example `select data ->> 'exitCapRatePct' from firm_records where kind='deal'`), and point history and restore at `firm_record_versions` (§12.7).

**H6. §12.2 "One-time setup" lists only 2 of the 12 SQL files.**
- Manual L266-272 and L5368-5379: run `setup.sql`, then `leases.sql` ("Both are already applied").
- Files in `supabase/`: `setup.sql`, `leases.sql`, `tenant_credit.sql`, `deal_documents.sql`, `asset_photos.sql`, `firm_records.sql`, `firm_record_versions.sql`, `acquisition_doc_types.sql`, `dispositions_doc_types.sql`, `portfolio_doc_types.sql`, `release_1_1_15.sql`, `deal_documents_fund_audit.sql`. The app cannot save without `firm_records.sql`.
- Mentioned elsewhere in the manual only in passing: tenant_credit.sql (L5239), deal_documents.sql (L507, L5264), firm_records.sql (L5314), firm_record_versions.sql (L5555), release_1_1_15.sql (L5894), the three doc-type scripts (L3111, L3677, L3755). Never mentioned anywhere: `asset_photos.sql` and `deal_documents_fund_audit.sql`.
- Corrected: replace L5368-5379 and L266-272 with a numbered list of all 12 files in run order (use each file's header comment: for example release_1_1_15.sql says it needs setup, leases, deal_documents and firm_records first), each marked "run once, safe to run again". Also fix §6 L720 ("supabase/setup.sql Database setup") and §11.13 L5141 ("Created by `supabase/setup.sql`").

**H7. §12.3, §12.9 and the sign-in help name database buttons that do not exist.**
- Manual: L194 ("click **Refresh** under **Your workspaces**"); L5412-5418 table rows "☁ Database → Save to database", "Open a workspace", "Delete (owners)"; L5593-5597 ("☁ Database → Your workspaces → Model Fund I → Open"; "Moved from browser"); L149-153 role table "Can delete the workspace".
- Code: the Database panel has only Change password, Sign out, "Saving to <name> (you're <role>)" with **Save now**, People with access (**Add person**, **Remove**, **Cancel**) (`components/CloudPanel.jsx:165-260`). No "Save to database", "Your workspaces", "Refresh" or workspace delete exists (`lib/cloud.js:127` `deleteWorkspace` is defined but never used).
- Also L5416 "the app… creates one if you have none" contradicts L142 ("Nothing is created for you") and `CloudPanel.jsx:212` ("You don't have access to the firm's data yet. Ask an owner…").
- Corrected: delete the three rows and §12.9's "To start using it" paragraph; say "Sign in. If an owner has added your email, the firm opens. If not, the Database panel says you don't have access yet."

**H8. §3 (Supabase row) does not match the session record on live-database changes.**
- Manual L507: reading "since 11/25"; writes "only when the user asks"; "New tables, types and policies stay in `supabase/*.sql` for the user to run" except one 11/27 change.
- Session record (`~/.claude/projects/-home-user-underwriting-calculator/35575dbe-….jsonl`, `tool_use` entries): `mcp__Supabase__apply_migration` was called 7 times on 11/22 (`lease_documents_phase_a`, `lease_abstract_phase_b`, `tenant_credit_documents` five times). `execute_sql` ran DDL: `deal_documents` table and its audit function (11/22 23:30-11/23 00:43 UTC), the `asset-photos` storage bucket (11/23 02:45), `workspaces` columns plus the `firm_records` table (11/23 04:07). `execute_sql` also wrote data: test inserts into `lease_documents` (11/22), sample business plans, prospects and pipeline deals into `firm_records` (11/25 05:25-05:54), and a `delete from lease_documents` of 3 orphaned test leases (11/25 05:57, audit-stamped "Claude (on request)"). The last write is the documented 11/27 policy change.
- The tool list in §3 is otherwise right: every `mcp__*` tool, skill and agent in the record is in the tables, and nothing in the tables is missing from the record (GitHub 12 tools, Claude Code Remote 14, Supabase 5, Vercel 6, OloLand 2, CREparser Lease Abstraction 9, Deal Review 1, FactIQ 1; skills 5; agents web-fetch 1, general-purpose 11, fork 2, Explore 1).
- Corrected: add to the Supabase row: "On 11/22-11/23, at your request, Claude created the lease, tenant credit and document tables, the photo bucket and the firm records table directly (`apply_migration`, `execute_sql`); on 11/25 it added sample data to the firm's records and deleted three leases left on removed test assets. Since then, the one change is 11/27."
- (I cannot tell from the record which of these were at the user's request; the owner should confirm before the text says so.)

---

## MEDIUM

**M1. Names the screen no longer has (group).**
- "Dashboard" for the screen the app calls **Home** (`components/Home.jsx:114` `<h2>Home</h2>`; 1.1.11 note at manual L5944: "The landing page is called Home"). Manual lines: 307, 1783, 2826, 2962 (§7.42 heading), 2981, 3126, 3267, 3737, 3952, 4032, 4166, 4513, and in release notes/history 5630, 5639, 5662, 5686, 5689, 5729, 5762-5763, 5976, 6007, 6011, 6026, 6045, 6085. Note the app itself still says "Dashboard" in a few strings (`app/page.jsx:2040` button title, `components/FundTermsEditor.jsx:680`, `components/PropertyMgmt.jsx:161,188`, `components/Home.jsx:109`). Decide one word and fix both.
- "Deal Screener" / "Screener" for the **Underwriter** tab (`lib/tabs.js:12`): L2799-2802 (Pipeline "Screen"/"Open in Screener" button text is right, `components/Pipeline.jsx:222`, but "in Deal Screener" is not), 2825, 2829, 2841, 3057, 3665 (acquisition-document status "Deal Screener"; the code says "Underwriter", `lib/acquisitionDocs.js:67`), 4020, 4088 (heading), 4107, 4110. Release notes before 1.1.25 may keep the old name (L5744 says so); the §7 and §2 sections should not.
- "Unit Roll" for **Rent Roll** (`lib/tabs.js:27`): L355 (table row title), 384, 621, 791, 1829, 2150, 2205, 2210, 2394, 4921, 4948.
- "Research" for **Comps** (`lib/tabs.js:14`): L359 (row "Research (Acquisitions)"), 669, 3486 ("Acquisitions → Research"), 3488, 3494, 6091. ("Research → Market Data" at L3960 is right: Research is the area.)
- "Fund Plan" tab: no such tab; it is **Plan vs. actual** on Portfolio Summary (`components/FundSummary.jsx:179`; `lib/tabs.js` has no fundplan). L371 (row "**Fund Plan**"), L2878 ("Elsewhere links to… Fund Plan": the actual links are Portfolio Return, Valuation and NAV, Asset Summary, Leases → Critical dates, Reports, `components/FundSummary.jsx:184`), L2926, L3383-3385 (§7.33 "The Fund Plan tab (Portfolio Management, before Portfolio Return)").
- "Market" area (L2991, L3329 "A Market group sits before Library"): the area is **Research** (`lib/tabs.js:58`). L2991 also omits **Finance** from the area list.
- "New fund" / "Edit fund": the buttons are **New Portfolio Setup** and **Edit Portfolio…** (`app/page.jsx:1932-1934`). L335 ("chosen in **New fund** and editable in the fund's terms") also contradicts §7.52 L3694 ("The type comes first and is then fixed"). L575 ("Portfolio Return → New fund → Download template"; the template link is now in New Portfolio Setup, `components/FundTermsEditor.jsx:267`), L2332, L6075, L6138.
- "All funds" in the portfolio picker (L2919, L2932): the option reads **All portfolios** (`lib/workingOn.js:11`).

**M2. §2 Functions table and tab rows are incomplete or in the wrong group.**
- L313 Asset Management list omits **Tenant Credit** (between Leases and Active Leasing, `lib/tabs.js:29`).
- L364 **Sell/Hold Analysis** is described in the Asset Management table; it is a Dispositions tab (`lib/tabs.js:19`). L359 "Research (Acquisitions)" is in the Asset Management table too.
- Tabs with no row in any §2 table (they are described only in §7): Pipeline (7.35), Portfolio Impact (7.37), Acquisition Documents (7.51), Disposition Candidates, Assets for Sale, Offers, Track Record, Disposition Documents (7.43), Active Leasing (7.44), Property Taxes, Insurance, Property Condition, Service Contracts (7.46), Portfolio Debt (7.45), Benchmarking (7.50), GP Economics, Sponsor Economics (7.49, 7.55), Firm Economics (7.63), GP Partners (7.64), Market Data (7.47), Reports (7.32b-d). Every tab in `lib/tabs.js` does have a §7 section; none is missing entirely.
- L384-390 "Asset dropdown": lists 7 tabs. The dropdown is on 16 (`lib/tabs.js:71`): Underwriter, Rent Roll, Leases, Tenant Credit, Active Leasing, Property Taxes, Insurance, Property Condition, Service Contracts, Asset Business Plan, Debt, Cash Flow, Asset Return, Return Sensitivity, Comps and Sell/Hold Analysis.
- §7.37 L2846 "last under Acquisitions": Portfolio Impact is third (`lib/tabs.js:13-17`). §7.44 L3123 "Leasing tab (right after Leases)": Tenant Credit sits between. §7.34 L3431 "after Portfolio Return": Portfolio Debt sits between.

**M3. Home page "lanes" no longer exist.**
- Manual L3099 ("Home has a **Dispositions** lane"), L3181 ("the Asset Management lane counts active prospects"), L3287 ("The Property Management lane shows the annual premium…"), L3359 ("the Market lane shows…").
- Code: Home shows only Actions Needed, Upcoming Events and Asset Watch List (`components/Home.jsx:120,155,194`). Counts are badges on the Functions area buttons (`app/page.jsx:2242`, `lib/tabs.js:68`). `lanes()` in `lib/home.js:345` is not called by any screen.
- Corrected: "On Home, … appears in Actions Needed / Upcoming Events" and "the Dispositions area button shows a count of sales in progress and offers".

**M4. Save timing: three different numbers.**
- Manual L1612 "(about 0.4 seconds after an edit)"; L4633, L4725, L5414 "about 20 seconds". Code: firm records save 2 minutes after the last change (`app/page.jsx:128` `RECORD_SAVE_SECONDS = … 120`, used at `app/page.jsx:715`); 20 s (`DB_SAVE_SECONDS`, `app/page.jsx:134`) applies only to the old whole-workspace mode. Manual L211, L236 and L5309 are correct.
- Corrected: "Changes save 2 minutes after your last edit (Save changes saves at once)."

**M5. Change log "Who" and "no logins".**
- L1619 "The name entered under Change Log → Your name… ("Unknown user" if blank)" and L1657 "Names aren't verified. The app has no logins." The name box appears only when signed out; signed in, the signed-in email is used (`components/ChangeLog.jsx:100-112,139`). The manual's own L176-178 says entries use the email. Also L1620 area list is incomplete: the code also writes Fund, Pipeline, GP Partners, Benchmarks and Actions Needed (`lib/audit.js:156,204,215,225,238`). L1557-1558 "Export / Import workspace": the buttons are Download backup / Restore from backup.

**M6. Underwriter construction management fee: formula omits the "spend" basis.**
- Manual L821 `CM fee (yearly) = CM % × purchase price (asset value, every year)`; L4612 (§9 item 3) "The CM fee is 1.5% of purchase price every year of the hold".
- Code: `lib/quickUnderwrite.js:218` `cmFeeBasis === "spend" ? (y === 1 ? capex : 0) : purchasePrice`; the Underwriter has a basis dropdown (`components/QuickUnderwrite.jsx:385-388`). Model Fund I and the two sample portfolios use "spend" (manual L1272, L4850).
- Corrected: "CM fee = CM % × purchase price each year (basis 'value', the default) or × the capital budget in year 1 (basis 'spend')." §9 item 4 (AM fee) should also say the default is 0 and Model Fund I charges its fee at the fund level.

**M7. §7.28 and §2 say only four document types have a connector validator.**
- Manual L2310-2316 ("OM, rent roll, T-12 and LOI can be validated… The other types have no validator") and L380 ("validators for OM, rent roll, T-12 and LOI"). The manual itself later names `loan_validate_abstract` (L2334) and `appraisal_validate` (L2366).
- Code: nine types have a validator: om, rent_roll, t12, loi, loan, appraisal, estoppel, cam, billing (`lib/dealDocTypes.js:13-30`; used at `:256,:276`, `components/Documents.jsx:104`).
- Corrected: "OM, rent roll, T-12, LOI, loan agreement, appraisal, estoppel, CAM reconciliation and billing can be validated by the connector; the rest are checked locally."

**M8. §7.24 sample abstracts and Pilot describe leases that were replaced in 1.1.13.**
- Manual L2110-2153: "Validated abstracts of eleven sample leases… validated by the connector… All 12 are validated… attached to their leases in the Model Fund I workspace (11/22)"; tenants Desert Aero Parts, Cascade Cabinet Works, Portside Marine Electric, Lone Star HVAC Supply, Bayou Fabrication Studio, Snohomish Brewing Equipment, Sunrise Solar Installers, Granite State Signs & Graphics; the Pilot file `docs/sample-leases/abstracts/07-mill-creek-snohomish-brewing.json` (67 fields, 12 rent periods, 10 critical dates, 6 risk flags, draft b8158a5a…).
- Repo: the tenants are Blue Mesa Fulfillment, Sierra Coffee Roasters, Copper Canyon Tile & Stone, Riverbend Flooring, Prairie Glass & Glazing, Harbor Precision Machining, Desert Sky Print Shop, Granite Courier, Bayline Auto Parts (`docs/sample-leases/README.md`). The Pilot file is `07-mill-creek-business-park-harbor-precision-machining.json` with 5 rent periods, 3 critical dates, 3 risks, and no `app.draft_id`. The README says the nine fund leases' abstracts are sample abstracts "not validated by the CREparser connector". There are 12 abstract files; the manual says "eleven" and then "All 12". L2144 "attached… nothing was applied to the live workspace" is history, not current.
- The manual contradicts itself on the Airport Flex tenant (L2124 Desert Aero Parts; L1262 Blue Mesa Fulfillment).
- Corrected: rewrite the table from `docs/sample-leases/abstracts/*.json` and say the abstracts are sample (not connector-validated) except where a later validation is recorded.

**M9. Sponsor / outside sponsor text contradicts the 1.1.10 change.**
- Manual L3868-3869 ("Sponsor / operator: this firm or an outside operator (named), and its co-invest (% of equity…)") and L3916-3917 ("**Show portfolios with an outside sponsor** lists the others greyed"). The banner at L3859 says both are gone.
- Code: sponsor is always this firm (`components/FundTermsEditor.jsx:414-417` "always this firm (1.1.10)"); only GP Economics has the outside-party toggle (`components/GpEconomics.jsx:101-102`). Manual L3899 ("Existing portfolios read as this firm being the sponsor…") is fine.

**M10. Roadmap table (§13) is out of step with the "What's in" notes.**
- L5630 (row 1.1) ends "planned patches **1.1.22** and **1.1.23** (row below)". There is no such row, and no rows for 1.1.22-1.1.28, which the notes (L5719-5810) say shipped. The row also stops adding "(tag v1.1.x)" after 1.1.12 although every tag exists on the remote (v1.0.0 … v1.1.30).
- L5631 (1.1.29) "✅ Released 2026-11-28 (tag `v1.1.29`)" but L5632 (1.1.30) says only "Live". L5634 row "1.1.x … Done with 1.1.28" no longer matches 1.1.29 and 1.1.30.
- Corrected: add one row per shipped patch (or one row "1.1.22-1.1.28, released 11/27-11/28") with status "Released (tag …)" and fix the "row below" text.

**M11. Data dictionary and table lists are incomplete ("every field the app stores").**
- §11.7 (L5010-5046) omits fund fields the code saves and uses: `tierMethod` (`lib/fundTerms.js:25`; the manual's own §7.10 L1069 names it), `acqFeePct`, `dispFeePct`, `revenueYieldBasis`/`revenueYieldBasisSource`, `sponsorWho`, `gpParties`, `feeToMgmt`/`feeToPm`/`feeToCm`/`feeToAcq`/`feeToDisp`, `pmThirdParty`, `cmThirdParty`, `promoteGpPctByAsset`, `sponsorCommitPct`, `partnerName`, `clientName`, `incentiveFeePct`, `incentiveHurdlePct`, `portfolioManager`, `riskThresholds` (all in `lib/fundTerms.js:8-70`, `lib/samplePortfolio.js:96`).
- §11.8 L5054 `type` lists call / draw / repay / expense; the code also has `distribution` ("Distribution paid", `lib/capitalActivity.js:22`). §7.12 L1134-1138 table likewise lists three types.
- §11.13 `deal_documents.doc_type` (L5272) lists 18 types; the check constraint now allows 38 (`supabase/portfolio_doc_types.sql`), and the table has `sale_id` and `offer_id` columns (`dispositions_doc_types.sql:18-19`) that §11.13 omits. §11.13 and §12.4 do not list `firm_records` or `firm_record_versions`, nor the `deal-docs` and `asset-photos` storage buckets (§12.4 L5434-5444 shows only `leases`). §12.5 function table (L5480-5489) omits `save_records`, `save_deal_abstract`.
- §11.5 L4921-4947: "The template's header is listed first" is not true. The real template headers are those in `lib/leases.js:240-275` (for example "Rent $/SF", "Lease type", "Months remaining", "New term (months)", "Renewal %", "TI new $/SF"). The names the manual lists (`rent`, `lease_type`, `months_remaining`, `ti_new`, `retax`…) are accepted aliases, not the header.

**M12. §6 File structure lists about half the files.**
- Components: 40 of ~75 are not listed (Home, Pipeline, Dispositions, FundSummary, PropertyMgmt, RiskReport, Reports, MarketData, GpEconomics, FirmEconomics, GpPartners, Leasing, DistributionAnalysis, Benchmarking …). `lib/`: about 95 of ~130 files not listed (including `tabs.js`, `defaultInputs.js`, `home.js`, `pipeline.js`, `dispositions.js`, `fundSummary.js`, `portfolioSetup.js`). Neither `tests/`, `scripts/` nor `supabase/*.sql` (only `setup.sql`, L720) is shown. L725 says `next.config.js` is "basePath /underwriting-calculator"; on Vercel it is the root (`next.config.js:10`, and §10 L4672 says so).

**M13. Smaller stale statements in §7.**
- §7.36 L2823-2825: "A row of **Pipeline deals** at the top switches between them… the tab says so and points to the Asset Management tabs instead of showing the screener." Since 1.1.6 it is a **Pipeline Deal** dropdown (§7.61), and with an owned asset selected the tab lists active pipeline deals to pick (`components/ScreenerFundImpact.jsx:23-60`).
- §7.13 L1401: "It holds your deal plus nine illustrative assets": the opening deal was removed (L433-436).
- §7.13 L1385-1387: the `SAMPLE_DATA_VERSION` history stops at "10 in 1.1.23"; the code is 15 (`lib/samplePortfolio.js:76`) and the same section lists versions 11-15 above it.
- §7.13 L1343 (version 9) "There is no distribution proposal" vs L1280 (1.1.27: "Distribution Analysis now has a sample proposal"). Say "until 1.1.27".
- §7.19 contains the 1.1.27/1.1.28 sample-portfolio material (L1696-1754) that the release notes cite as "§7.13" (L5696, L5709, L5721). Heading order is also off: 7.32 comes before 7.31 (L2468, L2504), and 7.33/7.34 sit after 7.47 (L3383, L3429).
- §7.42 L2991 list of function areas (see M1) and L2996 are otherwise right (Setup & Maintenance actions match `app/page.jsx:1931-1941`).
- L5412 table "Editing, then a save (about 20 seconds…)": see M4.

---

## LOW

- **Wrong number in a test count.** L1221: "`tests/node/sampleTieOut.test.cjs` (111 checks)". It now runs 126 checks. The patch notes' counts all match when I ran them: ventures1126 59, leasetoday1125 31, leasehist1124 36, docs1123 83, pmfee1119 22.
- **Version date.** Manual L5 "1.1.30 (2026-11-28)"; the app's Change log shows "released 2026-11-27" (`lib/version.js:5`, shown at `app/page.jsx:2789`). One of them is wrong.
- **Missing path.** L2295 `docs/sample-deal-docs/tenant-credit/` does not exist (the folder is `tenant-screening/`); L2114 file name (see M8).
- **GP promote formula (L362, L3532, L3399).** The manual says GP promote = "GP distributions − the GP's share of equity × all distributions". The code now reports the waterfall's carry directly and only falls back to that formula for old results (`lib/assetFees.js:28` `wf.gpCarry`). The two agree unless some income is held back. The 11/28 findings file (`docs/review-1.1.30/FINDINGS.md` B9) notes the formulas differ for the joint venture.
- **"Commitments used" (L1170)** shows `called + sub line + future needs`; the code also adds untagged past purchases (`lib/capitalActivity.js:70`).
- **Vol shift (L926-927).** Manual: "σ = term structure × (1 + 4.5% per point…) plus any vol shift". The code adds the shift to the term-structure vol before applying the smile multiplier (`lib/capPricer.js:131`): `(volAt + shift) × (1 + smile × otm)`.
- **Button names.** L619 "**Fetch CME** button" → "Fetch CME SOFR futures" (`components/QuickUnderwrite.jsx:246`). L2999 etc. fine.
- **"Only automatic outside calls" (L87)** is not strictly true: the app also calls Supabase, Vercel Analytics / Speed Insights and the Google Maps embed. Say "the only automatic calls for market data are…".
- **Plugins (L583-585)** names OloLand DD, CREparser Leases and dataviz; the skills table (L532) also uses ui-design-review.
- **§3 L562 "OloLand (`run_cre_debt_sizing`, `run_cre_stress_test`)":** the record shows only `run_cre_debt_sizing` was called; `run_cre_stress_test` was not. It sits under "Useful next to the app", so it is not claimed as used, but say "available".
- **Jargon (Working rules: plain English).** "workspace" appears on 159 lines (for example L37, 79, 115, 147-166, 193-194, 5414-5597, and several release notes); the app's own screens still say "workspace" in a few places (`components/ChangeLog.jsx:120`). "phase A-Z" letters appear in §7 headings 7.32a-d, 7.35-7.47, 7.49, 7.50 and in §13's phase table; internal ids (`sample-deal-1` … `sample-deal-9`, L4779) and "(phase Q, 11/22)" at L139 and L2823 are in user-facing text.
- **L2822** "Underwriter is for pipeline deals only (11/23)… deals with no fund, or bought after today" is right; L2846 etc. see M2.
- **Internal links:** every `#anchor` and `§n.n` reference resolves (checked by script); no dead links. Only the missing file paths above.
- **§12.8 / L5568** "The database isn't set up yet → run `supabase/setup.sql`" is incomplete for the same reason as H6.

---

## What I verified and found correct (so you need not recheck)

- Tab list: every tab label and area in `lib/tabs.js` matches the manual's L309-318 table except Tenant Credit missing from L313.
- §3 tool, skill and agent lists match the session record exactly (counts above).
- §7.1 rent-roll NOI lines; unit roll rules (downtime = `round((1 − renewal) × downtime)`, TI/LC at rollover or at re-let, credit loss on net revenue); §7.2 loan, equity, extension-fee years, warnings; §7.3 `toMainInputs`; §7.4 SOFR by year and `anchorCurveToLive`; §7.5 cap schedule, reset strike rounding, caplet formula and vol range (122-148 bp); §7.6 loan sizing (smallest of LTV, DSCR, LTC, debt yield, then plus capex), TI reserve 1.10×, covenant formulas; §7.7 IRR bisection (−99.99% to 1,000%), cash-on-cash, NPV at 8%, unlevered and peak equity; §7.9-§7.11 fund dates, quarterly reserve, 9% compounding pref, catch-up, marginal tiers 12%/18% with 80/20, 70/30, 60/40, sub line (80%, 365 days, +1.75%, 0.25%, Actual/360); §7.15 six-month cost hold and 60-day appraisal due; §7.18 stress shocks; §7.20 management fee basis ($95M × 1.5% ÷ 4 = $356,250); §7.22 hurdle NPV from final close; §7.23 refinance defaults; §7.34 3-month and 6-month minimums; §7.35 stage probabilities; §7.65 break-even flags (10 and 5 points); §7.66 expected lives (20 and 15 years); §7.67 project types, uses, mix arithmetic (62.1%, 10.3%, 23.8%) and status rules; risk-report thresholds (§7.32d) and `SAMPLE_DATA_VERSION` 15.
- §8 table rows other than the AM fee; §11.3 and §11.4 defaults (Underwriter and full-model inputs); §5 Pensford snapshot (121 resets, 11/20/2026) and NY Fed endpoints; §4 package versions.
- Quoted button and column labels: of about 1,030 bold phrases in §2 and §7, the ones that are screen labels were found in the code except those listed above (New fund, Sample data ▾, Save to database, Your workspaces, Show portfolios with an outside sponsor).

---

## Coverage

- **Read fully:** all of `docs/USER_MANUAL.md`, L1-6195 (§1-§13, including every "What's in" note and the phase table).
- **Checked against code in depth:** §1-§2 (header, sign-in, saving, tab tables, Sample data), §3, §4, §5, §6, §7.1-§7.23, §7.34-§7.38, §7.40-§7.47, §7.52, §7.55, §7.61, §7.62, §7.64-§7.67, §8, §10, §11.3-§11.8, §11.13, §12, §13 (against tags, version file and the test files).
- **Skimmed (compared by label and file presence only, not line by line against the logic):** §7.24-§7.29 (lease and document abstract details), §7.30-§7.32d (business plan, underwritten vs actual, reports, risk report beyond thresholds), §7.39, §7.48-§7.51, §7.53-§7.60, §7.63, §11.9-§11.12, §12.5 policy detail.
- **Not done:** I did not open the app in a browser, so screen layout, button order inside panels and conditional text (viewer vs owner) are unchecked. I did not re-derive the sample-data figures quoted as "test copy" (for example $569,960, $45,967,456, +1.6%, −44.7%) or the 1.1.x release-note figures. I did not read `docs/DEAL_DOCUMENTS_PLAN.md`. I did not read the second half of the 1.1.30 end-to-end review (it is not written yet); `docs/review-1.1.30/FINDINGS.md` lists code-side disagreements (B1-B24) that also affect manual wording (LTV, WALT, promote, occupancy definitions differ by screen).
