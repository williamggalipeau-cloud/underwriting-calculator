# Baywise 1.1.30: design and user-flow review

Read-only review. Nothing in the repo was changed, no build was run, no live data was touched.

**How it was checked.** The existing build in `out/` was served locally and walked in Chromium with the browser tests' mocked sign-in and saved data (test copy, fictional): the automatic sample load, then Setup & Maintenance → Sample data → Load Model Fund I, giving Model Fund I (9 assets with plans, plus 3 saved), the sample joint venture (3), the sample separate account (1) and 5 pipeline deals. Every one of the 39 tabs plus Home was opened at 1440x900 and at 390x844, with "today" fixed at 11/27/2026. Also walked: signed out, signed in with no access, an empty firm, the Underwriter on a pipeline deal, Asset inputs, the Rent Roll mix, New Portfolio Setup (Fund), New asset, the Risk report.

**Screenshots** are all in `/tmp/claude-0/-home-user-underwriting-calculator/35575dbe-b549-510c-b85a-27c9d8d4e33d/scratchpad/design/`. Names below are files in that folder: `d-<tab>.png` desktop, `m-<tab>.png` phone, `t-m-<tab>.png` the phone page cut into side-by-side columns so it can be read, `j…` the journeys. Each finding was seen in the named screenshot or measured in the browser.

**Console.** No page errors and no warnings on any tab at either width. The only failures were two Vercel analytics scripts (`/_vercel/insights/script.js`, `/_vercel/speed-insights/script.js`), which is expected when the build is served locally.

---

## Part 1: Findings, most serious first

### High

**1. Phone: 11 screens are wider than the screen, so content is cut off.** (390 wide)
The whole page slides sideways and tables, charts and the report letter run off the right edge. Measured page widths: Reports 683, Benchmarking 683, Disposition Documents 615, Property Condition 596, Stress Testing 584, Portfolio Return 521, Track Record 484, GP Partners 481, Acquisition Documents 445, Distribution Analysis 397, Underwriter 393.
Screenshots: `t-m-reports.png`, `t-m-benchmark.png`.
Smallest fix: wrap each offending table in the same `overflow-x-auto` box the other tables use and let the wide selects shrink (`min-w-0`, drop `min-w-[22rem]` on the Pipeline Deal picker). Files: `components/Reports.jsx` (letter and asset table), `components/Benchmarking.jsx` (tables and the chart figure), `components/Dispositions.jsx`, `components/PropertyMgmt.jsx` (construction jobs table), `components/StressTest.jsx` (slider rows), `components/FundAnalysis.jsx` (Returns tables), `components/GpPartners.jsx`, `components/AcquisitionDocs.jsx`, `components/PipelineDealPicker.jsx`.

**2. Phone Home: you cannot read what the action is.** (390 wide)
In Actions Needed and Upcoming Events the column that says what to do is pushed off the right edge; what shows is a strip one letter wide, and each row is stretched to 150px or more. Upcoming Events lists all 160 rows, so the page is 16,900px long.
Screenshot: `t-m-home.png`.
Smallest fix: on phones show each action as a stacked card (asset, what to do, date and owner, link), and cap Upcoming Events at 5 with "Show all" like Actions Needed already does. File: `components/Home.jsx`. A mockup of the stacked layout is in `mockup-home-phone.png`.

**3. Phone: the Asset inputs panel is wider than the screen.** (390 wide)
The panel measures 454px on a 390px screen. The Done button and the right edge of every field are cut off. On desktop the same panel cuts off the ZIP field.
Screenshots: `jm-uw-inputs.png`, `jd-uw-inputs.png`.
Smallest fix: `max-w-full` / `w-screen` on the drawer at phone width, and let the City / State / ZIP row wrap. File: `components/DealInputs.jsx`.

**4. With "All portfolios" chosen, the portfolio screens quietly show one portfolio, and not the same one.** (both widths)
The header still reads "All portfolios · AUM $321.6M · 15 assets", but Asset Summary, Valuation, Portfolio Summary, Portfolio Return, Distribution Analysis and Reports open on Sample Industrial Venture I, while Benchmarking and Portfolio Debt open on Model Fund I. Each has its own second portfolio picker. A principal can read a joint venture's NAV as the firm's. Once a portfolio is picked in the header, every tab follows it and the second pickers disappear, which is the right behaviour.
Screenshots: `d-fundsummary.png`, `d-valuations.png`, `t-m-benchmark.png`.
Smallest fix: one rule for all of them. Either show a true all-portfolios roll-up, or show "Choose a portfolio" with the picker and no figures. At the least make every tab default to the same portfolio. Files: `app/page.jsx` (the default), `components/FundSummary.jsx`, `Benchmarking.jsx`, `FundDebt.jsx`.

**5. Dollar amounts are typed and shown without commas.** (both widths)
Purchase price shows as `52500000`, NOI as `3200000`, an insurance limit as `7800000`, cash at quarter end as `668496`. One digit too many or too few is invisible. Read-only figures next to them are formatted ($52,500,000).
Screens: Underwriter, Asset inputs, Insurance, Active Leasing, Rent comps, Distribution Analysis. Screenshots: `jd-uw-deal.png`, `d-insurance.png`, `d-distributions.png`.
Smallest fix: one shared money input that shows commas when the field is not being edited. Start in `components/QuickUnderwrite.jsx` and `components/DealInputs.jsx`.

**6. An empty firm is told it cannot be opened, and is shown the sample fund instead.** (both widths)
With a firm that has no assets yet, the banner reads "View only. Couldn't open your workspace: That database workspace has no deals yet." and the header shows Model Fund I's $90.8M as if it were the firm's. There is nothing to click to start. The words "workspace" and "database workspace" are also the wording the project rules ask to avoid.
Caveat: this is my mocked empty data set; I did not walk the real "create a firm" path.
Screenshot: `j-d-empty-Underwriter.png`, `j-d-empty-home.png`.
Smallest fix: treat a firm with no assets as a valid, editable firm and show a first-run panel ("Add your first asset", "New Portfolio Setup", "Load the sample fund"). Reword to "your firm's data". File: `app/page.jsx` (lines 796, 809 and 2224).

### Medium

**7. Signed out, the app shows the sample fund with nothing saying it is sample data.** (both widths)
First visit: a full dashboard with AUM $90.8M, 9 assets, named asset managers and overdue actions. The yellow bar says "View only. Sign in…", but nowhere says these are fictional figures.
Screenshot: `j-d-signin.png`, `j-m-signin.png`.
Smallest fix: add "Sample data (fictional)" to the banner and next to the header figures. File: `app/page.jsx`.

**8. Portfolio Return is 14,840px long on desktop and 27,719px on the phone, and opens on rent delinquency.** (both widths)
The first screen is three rent-delinquency cards (one per portfolio, even with one portfolio in view); NAV and IRR come after. Twelve sections sit on one page; the "On this page" chips help but the page is still the longest in the app.
Screenshot: `d-fund.png`, `t-m-fund.png`.
Smallest fix: put the NAV and interim-return cards first, move rent delinquency below them, and keep each section closed until opened. File: `components/FundAnalysis.jsx`.

**9. Underwriter: the result is a screen and a half below the inputs.** (1440 wide)
After picking a deal, the page runs: next-step bar, portfolio impact bar, about 20 inputs, the SOFR curve, and only then IRR, multiple, profit. Change the price and you must scroll to see what it did. The note "Independent of the rent-roll inputs on the left" refers to a panel that is not on screen.
Screenshot: `jd-uw-deal.png`.
Smallest fix: move the eight result tiles above the inputs (or pin them), and drop "on the left". File: `components/QuickUnderwrite.jsx`.

**10. New Portfolio Setup has four traps.** (1440 wide)
"Add the current deal (Airport Flex Park) to this fund" is ticked by default, though that asset already belongs to Model Fund I. "Fund name is required." shows in yellow before anything is typed and stays through every step, while Next still moves on. The Review step marks untouched defaults (0% fees, 80% subscription line) as "Entered". The Parties step shows "always this firm (1.1.10)", a version number.
Screenshots: `j6-nps-fund-1.png`, `j6-nps-step-investor.png`, `j6-nps-step-review.png`.
Smallest fix: untick the box by default, show the name error only after Next is pressed and keep the user on step 1, label defaults "Default", delete "(1.1.10)". File: `components/FundTermsEditor.jsx` (line 416 for the version text).

**11. Wide tables are cut at the right edge with no sign that there is more.** (1440 wide)
Pipeline: the last column reads "Open in S…" and "Send to P…"; it is the column that moves a deal forward. Asset Summary's table is 3,028px wide in a 1,340px box, Rent Roll 2,708px, Active Leasing 1,768px (cut at "Downtime vs. pl…"), Rent comps cut at "Net effective". Rent Roll's footer reads "$878k cor".
Screenshots: `d-pipeline.png` (v1 folder has the two-deal version), `d-assets.png`, `d-leasing.png`.
Smallest fix: keep the action column fixed at the right in Pipeline, add a fade or "more →" cue on scrollable tables, and offer a column chooser on Asset Summary. Files: `components/Pipeline.jsx`, `AssetSummary.jsx`, `UnitRoll.jsx`, `Leasing.jsx`.

**12. The same screen has different names in different places.** (both widths)
- Tab "Rent Roll" opens "Unit Lease Roll"; "Asset Return" opens "Returns Analysis"; "Return Sensitivity" opens "Sensitivity"; "Cash Flow" opens "Cash Flow Analysis"; "Documents" opens "Document Library".
- Pipeline's button says "Open in Screener"; the tab is "Underwriter".
- Insurance says "This is on the Dashboard as an action"; the screen is "Home". The manual says Dashboard 27 times.
- Portfolio Summary says office limits are "checked on Portfolio Limits". There is no such screen: it is the "Fund limits" card inside Library → Reports.
- Tabs say "Portfolio"; headings say "Fund NAV", "Fund total", "Whole fund", "Fund type: Joint Venture", "the fund owned 2 assets" (in a joint venture's letter).
Screenshots: `jd-rr-scrolled-right.png`, `d-returns.png`, `d-pipeline.png`, `d-insurance.png`, `d-fundsummary.png`, `j3-reports.png`.
Smallest fix: make each page title the tab label; rename the button "Open in Underwriter"; "Dashboard" → "Home"; link "Portfolio Limits" to Reports and use one name. Files: `components/UnitRoll.jsx`, `ReturnsAnalysis.jsx`, `SensitivityTables.jsx`, `CashFlowAnalysis.jsx`, `Pipeline.jsx` (line 222), `PropertyMgmt.jsx`, `FundSummary.jsx`, `docs/USER_MANUAL.md`.

**13. Dates are written five ways.** (both widths)
`2/28/2026` (Home), `1/30/26` (Asset Summary), `2026-03-31` (inside Home's action text and the business plan's Lease end column), `01/21/2027` (date boxes), and quarters as `2026 Q3`, `2026-Q3` (Reports, Benchmarks), `Q3 2026` (Benchmarking) and `2026-10` (NOI vs budget). One Home row holds two of them: "5/15/2026 … quarter ended 2026-03-31".
Screenshots: `d-home.png`, `d-assets.png`, `d-plan.png`, `j3-reports.png`.
Smallest fix: one date helper and one quarter helper used everywhere (suggest `Feb 28, 2026` in text, `2/28/2026` in tight tables, `Q3 2026`).

**14. Numbers are written several ways.** (both widths)
Negatives: `−$160,000`, `($33,461)`, `$-13,248`, `$-3.33M`, `-$0`, `-28.1%`, `−45.8%`. Percent and units: `91.6 %`, `33.65 %`, `18.57 $/SF` beside `$18.27`. Scale: `$4,040` and `$1.01M` in one column (Reserves, Portfolio Return); `$129,524,347` on Underwriter and `$13.36M` on Asset Return; `1050 d`, `272 d ago`.
Screenshots: `d-plan.png`, `d-fund.png`, `d-valuations.png`, `jd-uw-deal.png`.
Smallest fix: one money, one percent and one negative format (suggest parentheses for negative dollars, a minus sign for percentages, no space before %).

**15. Leaving a page with unsaved changes opens a plain browser box.** (both widths)
"You have unsaved changes. Save them before you leave this page? OK saves and continues. Cancel stays here." OK meaning save and Cancel meaning stay has to be explained in the text. The sample load uses the same kind of box for a long warning and for its result.
Seen as browser dialogs during the Rent Roll and sample-load walks.
Smallest fix: an in-app dialog with three labelled buttons: Save and continue, Discard, Stay. File: `app/page.jsx`.

**16. "New asset" makes an asset before you have typed anything.** (1440 wide)
One click creates "New Deal" with 60,000 SF, $9,000,000 and 20 units, opens the inputs panel and raises "Unsaved changes". The button says asset, the record says deal, and the made-up figures look real.
Screenshot: `j3-newasset.png`.
Smallest fix: open an empty form with Create / Cancel and no default price or size. Files: `app/page.jsx`, `components/DealInputs.jsx`.

**17. Asset inputs is 167 fields in one 416px-wide strip.** (1440 wide)
Property, building (about 30 industrial fields), site, NOI, capital projects, closing costs and more, in a single scroll with no way to jump. On a pipeline deal the top note says fields edited here are "overwritten by the next Underwriter edit", but the fields stay editable.
Screenshots: `jd-uw-inputs.png`, `jd-uw-inputs-capital.png`.
Smallest fix: a section index at the top of the panel (Property, Building, Site, Income, Capital, Closing costs), and lock the fields the Underwriter owns. File: `components/DealInputs.jsx`.

**18. Rent Roll: a table row is drawn over the top bar when you scroll.** (1440 wide)
With the page scrolled, the fixed first column of the unit table ("▸ 012") sits on top of the Baywise logo and half-covers Home and User manual.
Screenshot: `jd-rr-mix.png`.
Smallest fix: give the top bar a higher stacking order than the table's fixed column. Files: `app/page.jsx`, `components/UnitRoll.jsx`.

**19. Phone: the first screen is all header.** (390 wide)
Logo, Home, User manual, Change log, portfolio picker, five figure chips and the Menu bar take about 400px; with a tab open and its asset picker, the page content starts near 780px of an 844px screen.
Screenshots: `jm-after-tab.png`, `t-m-units.png`.
Smallest fix: on phones collapse the five chips and the manual / change log buttons into the ⋯ menu and close the menu's tab list after a choice. File: `app/page.jsx`. See `mockup-home-phone.png`.

**20. Home is a very long list.** (1440 wide)
133 actions and 160 upcoming events; the page is 8,394px. "Due now" is used for items due in up to 19 days, and "Past Due" is red while "Due now" is black, the heaviest colour on the page. The Risk report has the same problem: 24 near-identical rows, one per vacant unit ("Vacancy: unit 055 vacant 1050 days").
Screenshots: `d-home.png`, `j4-riskreport.png`.
Smallest fix: group by asset or by type with counts, add filters (owner, type), and group vacant units into one row per asset. Files: `components/Home.jsx`, `components/RiskReport.jsx`.

**21. Words a finance person would not know.** (both widths)
"18 open · 3 saved" beside every asset picker; "mark" ("7 assets without a 2026-09-30 mark", "Import marks"); "KRI", "HHI", "same-store"; "phase V" (Distribution Analysis: "comes with automated workflow, phase V"); "no 2026 row" (Benchmarking); "Read in" as a column; "Psa" and "Loi" in the Underwriter's deal cards; "(Yardi)" in headings.
Screenshots: `d-units.png`, `d-valuations.png`, `d-distributions.png`, `t-m-benchmark.png`, `v1/d-quick.png`.
Smallest fix: "18 assets"; "valuation" for mark; spell out KRI once ("risk measures"); drop "phase V"; "no 2026 peer data"; "PSA", "LOI".

**22. Buttons for the same action are worded differently.** (both widths)
Export: "Excel", "Export to Excel", "Download Excel", "Export comps", "Export terms (Excel)", "PDF", "Export PDF", "PDF (draft)", "Fact sheet (PDF)". Add: "+ Add", "Add deal", "+ Add unit", "+ Comp", "Add comp", "+ Prospect", "+ Partner", "Add entity", "Add". Their place moves too: top right on most tabs, under the title on Asset Summary and Valuation, in a strip at the bottom on Pipeline.
Smallest fix: "Excel" and "PDF" top right on every screen; "Add <thing>" for every add.

**23. The User manual button opens a file on GitHub.** (both widths)
It links to `github.com/…/docs/USER_MANUAL.md` in a new tab: a 6,195-line developer-style page, and staff without access to that repository will not get in (not tested here).
Smallest fix: ship a short in-app help page (or a PDF in the build) for staff and keep the GitHub link for the owner. File: `app/page.jsx`.

### Low

**24. Small and faint text.** 10px text appears on 500+ elements across 12 screens and 9px on Sell/Hold, Portfolio Return and Asset Return. Red negatives (`#fb2c36` on white, 3.8:1) and orange figures (`#ff6900`, 2.9:1; `#f54a00`, 3.6:1) in the cash flow tables are below the 4.5:1 reading standard; the "×" delete buttons are `#d1d5dc` on white (1.5:1) and close to invisible. Screenshots: `d-returns.png`, `d-insurance.png`.

**25. Accessibility basics.** 13 inputs with no label on Stress Testing, 3 on Debt, 2 on Return Sensitivity, 1 each on Asset Summary, Valuation, Asset Return, Portfolio Summary, Comps. Table headers carry no scope (20 of 20 on Home). Keyboard focus is the browser's thin 1px ring, hard to see on the dark buttons (`j3-focus-9.png`). On the phone, 331 of 349 controls on Home, 119 of 268 on Documents and 96 of 145 on Rent Roll are under 28px high (the 40px rule in `app/globals.css` skips everything inside tables).

**26. Asset Return.** A second asset dropdown at the top right repeats the Asset picker above it. The seven figure cards are tinted green, red, blue and grey with no legend (Year 1 cash-on-cash 2.0% is red, with no stated threshold), and five cards in a two-column grid leave a hole. Labels are in Title Case here ("Adjusted Cap Rate", "Avg. Annual TI + LC") and sentence case elsewhere. Screenshot: `d-returns.png`.

**27. Tab badges with no explanation.** "Rent Roll 12" and "Portfolio Return 16" have no tooltip (Pipeline, Assets for Sale and Offers do). File: `lib/tabs.js` (`TAB_COUNT_TITLES`).

**28. Save feedback floats over content.** The "Saved" pill and the "Unsaved changes · Save changes" bar sit over the bottom-right of the page, on top of the Details buttons on Home. Screenshots: `00-after-sync.png`, `j3-newasset.png`.

**29. Smaller things seen.**
- Sample data (test) menu opens off the left edge of the screen and is cut off (`01-sample-menu.png`).
- Floor plan unit numbers are stretched sideways (`v1/d-plan.png`).
- Assets for Sale rows give no sign they can be opened, and its subtitle starts lower-case (`j4-forsale.png`).
- Portfolio Summary has one editable date box ("Launch", empty) inside a read-only list (`d-fundsummary.png`).
- Active Leasing rows have large empty gaps and cut-off text in narrow boxes ("Sample Commerci", "Desert Sky Fitness St") (`d-leasing.png`).
- Rent Roll shows two unit tables one after the other with a note explaining which is which (`jd-rr-scrolled-right.png`).
- Reports letter says "-$0 of distributions" (`j3-reports.png`).

**30. Sample figures that make the screens hard to judge (for the data reviewers).** Underwriter on the sample pipeline deal: 35% NOI growth, 4% exit cap, IRR 68.1%. Benchmarking for Model Fund I: net IRR −98.2%. Portfolio Summary for the joint venture: "Called $0.00M (0.0%)" beside "Deployed in assets $64.30M". Asset Summary for Model Fund I: going-in cap 11.64%, pooled IRR 49.6%. I did not check these against the tie-out test.

---

## What works well

- Home leads with what needs doing, by asset, with an owner and a link straight to the right tab.
- The eight function areas are sensibly named and grouped; once a portfolio is chosen in the header every tab follows it.
- Empty states inside a signed-in firm are helpful ("No business plan yet… Create business plan", "No unit lease roll defined").
- New Portfolio Setup's first step (Fund / Joint Venture / Separate Account) and its Review step are clear; Sponsor Economics and Distribution Analysis are the cleanest screens.
- Inputs are labelled almost everywhere, there is one h1 and one h2 per screen, and no console errors anywhere.

## Screens and paths not reached

- Real sign-in (email link or password) and the Database / People with access panel (the ⋯ menu did not open from my script).
- Viewer and editor roles (everything was walked as an owner).
- Document upload, "Review with Claude", lease abstracts, the PDF and Excel exports themselves.
- Starting a sale, selecting an offer, closing a sale; Convert to asset from the Pipeline; Edit Portfolio on an existing portfolio; Record capital activity; New report.
- The Change log was opened but not reviewed. Comps, Market Data, Property Taxes, Service Contracts, Stress Testing results, Firm Economics, GP Economics and GP Partners were opened and measured but not walked in depth.
- Tablet widths, real iPhone Safari, dark mode, screen reader.

---

## Part 2: Improvement suggestions

### Overall look

It reads as a capable internal tool, not yet as a finished product for an investment firm. What it has: clean white cards, restrained blue, sensible grouping. What holds it back:

1. **It is set in Arial.** Geist is loaded and preloaded, but `app/globals.css` sets `body { font-family: Arial, Helvetica, sans-serif }`, so every screen renders in Arial (measured on all 39 tabs).
2. **Text is small and all the same weight.** 12px is the body size, 10px and 11px carry most labels, page titles are only 18px. Nothing on a page is clearly the headline figure.
3. **The top of every page is four stacked bars** (logo row, figure chips, Functions, tab row) before any content: about 230px on desktop, 400 to 780px on the phone.
4. **Colour is used a lot and means little** (below).
5. **Every screen is a long scroll of boxed tables**, with explanatory paragraphs in grey small print doing the job that layout should do.
6. **Raw inputs** (`52500000`) and browser pop-ups undercut the polish of the read-only parts.

### Colour

**In use now (measured in the browser):**
- Text: `#101828` (main), `#171717`, `#364153`, `#4a5565`, `#6a7282` (grey labels, the most-used colour after black).
- Blue: `#155dfc` buttons, `#1447e6` links, `#eff6ff` and `#dbeafe` tints, plus a black `#101828` used for the open area button and the "Due now" chip.
- Status and tags: green `#d0fae5`; amber `#fffbeb` with `#973c00`; red `#fb2c36` and `#fef2f2`; orange `#ff6900`, `#f54a00`, `#fff7ed`; violet `#5d0ec0` on `#f5f3ff`; indigo `#372aac` on `#eef2ff`; cyan `#007595` on `#ecfeff`; sky `#f0f9ff`.
- In the code: 17 Tailwind hue families; `text-gray-500` alone 1,200 times; five border greys and blues.

**Where it goes wrong:**
- Home's action-type chips use six hues (Loan, Lender report, Milestone and Covenant violet; Leasing indigo; Lease amber; Construction orange; Purchase and Rate cap sky; Appraisal and Contract grey). The hue tells you nothing, and amber "Lease" collides with amber meaning warning.
- "Past Due" is red, "Due now" is solid black, "Upcoming" is grey: the middle state is the loudest.
- Asset Return tints whole cards green, red and blue with no rule shown.
- Three blues do the same job (`#155dfc`, `#1447e6`, blue-50 "soft" buttons such as Upload and User manual), and portfolio-type badges add blue, amber and violet again.
- Negatives are red in some tables, orange in others, plain black in others.

**Proposed palette (contrast checked against its background):**

| Role | Hex | Contrast |
|---|---|---|
| Brand / top bar (navy) | `#0F2A43` | white on it 14.7:1 |
| Primary action and links | `#1D4ED8` | 6.7:1 on white; white on it 6.7:1 |
| Primary tint (selected, info) | `#EEF4FF` | primary on it 6.1:1 |
| Positive | `#0F7B4F` on `#E8F5EE` | 5.3:1 on white, 4.7:1 on tint |
| Negative | `#B42318` on `#FEECEB` | 6.6:1 on white, 5.8:1 on tint |
| Warning | `#B54708` on `#FFF4E5` | 5.4:1 on white, 5.0:1 on tint |
| Page background | `#F6F7F9` | |
| Card | `#FFFFFF` | |
| Table header / subtle fill | `#F2F4F7` | |
| Border / strong border | `#E4E7EC` / `#D0D5DD` | |
| Text 1 (figures, names) | `#101828` | 17.8:1 |
| Text 2 (labels) | `#475467` | 7.7:1 on white, 7.0:1 on subtle |
| Text 3 (captions only) | `#667085` | 5.0:1 on white, 4.5:1 on subtle |

Rules: colour only for status (positive, negative, warning) and for the one primary action per screen. Type tags (Loan, Lease, Fund, Joint Venture) become plain grey text or a neutral chip. Negative figures always `#B42318`, never orange. Put the values in `app/globals.css` under `@theme` as named tokens (`--color-primary`, `--color-neg` …) so components stop picking Tailwind hues one by one.

### Typography

**In use now:** Arial. Sizes by number of uses in the code: 12px (953), 11px (309), 14px (274), 10px (255), 18px (52), 16px (25), 9px and 10.5px (7 each), 11.5px (3), 20px and 24px (a handful). Weights: medium 676, semibold 529, bold 118. `tabular-nums` is on 304 elements but not on all money columns.

**Where the scale drifts:** page titles 18px; section titles 14px on most tabs, 16px on Portfolio Return, 12px bold on Rent Roll's "Leases in effect today"; big figures 24px on Asset Return and Debt, 20px on Firm Economics and Stress Testing, 16px on Asset Summary, 14px on Pipeline. Labels are ALL CAPS in the inputs panel, the Underwriter and some table headers, sentence case elsewhere.

**Proposed scale (Geist, already shipped; fall back to Inter, system-ui):**

| Use | Size / line | Weight |
|---|---|---|
| Page title | 22 / 28 | 600 |
| Section title | 16 / 24 | 600 |
| Key figure (card) | 24 / 30 | 600, tabular |
| Body and table cells | 13 / 20 | 400 (names 500) |
| Table header, field label | 12 / 16 | 500, sentence case |
| Caption, footnote | 12 / 16 | 400, Text 3 |
| Chip | 12 / 16 | 500 |

Nothing below 12px. Money and percent columns right-aligned with `font-variant-numeric: tabular-nums` on every table (set it once on `table` in `globals.css`). Geist Mono only for file names. First step is a one-line change: `font-family: var(--font-geist-sans), system-ui, sans-serif` on `body` in `app/globals.css`.

### Layout (desktop)

- **One top bar.** Logo, the eight areas, and manual / change log / account in a single navy bar (52px); the portfolio picker and "saved" state in a slim second row; the tab row only when an area is open. Saves about 90px on every screen. See `mockup-home-desktop.png`.
- **Move the five figure chips off the global header** and onto Home as proper cards. On every other screen they repeat firm totals that have nothing to do with the asset in view.
- **Area order to follow the life of an asset:** Home · Acquisitions · Asset Management · Property Management · Portfolio Management · Dispositions · Finance · Library, with Research's one tab (Market Data) moved under Acquisitions or Library and Setup & Maintenance behind a gear at the right. Dispositions currently sits second, before the asset is owned.
- **Asset Management has 11 tabs in one row.** Split into Overview (Asset Summary, Business Plan) · Leasing (Rent Roll, Leases, Tenant Credit, Active Leasing) · Financials (Valuation, Debt, Cash Flow, Asset Return, Return Sensitivity).
- **One page header pattern:** title (the tab's name) and one-line purpose at the left; asset or portfolio picker under the title; Excel, PDF and the one primary action at the top right. Today the title sits below the asset picker on asset tabs and above the portfolio picker on portfolio tabs.
- **Key figures first, as a row of 4 to 6 cards**, then tables. Underwriter and Portfolio Return put them below the inputs or below a secondary section.
- **Cut the scrolling.** Portfolio Return (14,840px): make the 12 "On this page" chips real sub-tabs. Asset Business Plan (6,367px): sub-tabs Plan · Leasing · Capital · Photos and map. Home (8,394px): tabs Past due / Due now / Upcoming with 10 rows each. Documents (6,284px): start grouped and closed, one row per asset.
- **Spacing and cards.** One radius (8px) instead of four; one card padding (16px); table rows 40px with 13px text; drop the outer page card that wraps every screen (cards inside a card inside a grey page).
- **Tables.** Header fill `#F2F4F7`, 12px medium labels, right-aligned numbers, totals row in 600 weight with a top border, fixed first column and fixed action column on wide tables.

### Layout (phone)

- Top bar 48px: logo and ☰ only. The portfolio picker on its own row. Figure chips live on Home, two per row.
- Menu opens as a full-height sheet listing the areas, each opening to its tabs; no tab strip left on the page afterwards.
- Lists (Home, Pipeline, Assets for Sale, Tenant Credit, Documents) become stacked cards: name and status on line one, what and when on line two, the link at the right. See `mockup-home-phone.png`.
- Tables that must stay tables (Rent Roll, cash flows) keep the fixed first column they have now, inside a scroll box that never widens the page; show 3 or 4 columns by default with "More columns".
- Every control at least 40px high, including those inside tables (status menus, Details links, × buttons).
- Treat editing as desktop work: on the phone the inputs panel and the big grids can be read-only with one "Edit" button that opens a full-screen form.

### Components worth standardising

| Component | Variants seen drifting | One standard |
|---|---|---|
| Buttons | solid blue; blue-50 "soft" (Upload, User manual); white outline; black (open area, Due now); red (Issue risk report); green outline (Record as paid); amber (Sample data); text links with → | Primary (solid `#1D4ED8`), Secondary (white, `#D0D5DD` border), Quiet (text), Danger (solid `#B42318`). 34px high on desktop, 40px on phone. One primary per screen. |
| Inputs | 28px boxes in tables, 36 to 40px in the panel and Underwriter; prefix / suffix boxes ($, %, yrs) only in some; native date boxes showing `mm/dd/yyyy`; raw numbers | One text input, one money input (commas, $), one percent input, one date input; 34px; label above in 12px sentence case |
| Tables | header in caps or sentence case; grey or white header; first column fixed or not; numbers right or left (Rent Roll SF sits mid-column) | One table style as above, in a shared `<DataTable>` |
| Status chips | square and pill shapes; 10px and 12px; red / black / grey on Home; Red / Amber on Risk; Weak / In place / No lease on file; Owned; Internal | One pill, 12px medium, four tones: negative, warning, positive, neutral |
| Type tags | Fund (blue), Joint Venture (amber), Separate Account (violet); action types in six hues | Neutral grey tag |
| Figure cards | plain (Asset Summary), tinted (Asset Return), caps label (Pipeline, Reports), with or without sub-line | Label 12px, figure 24px, one sub-line; no tint except a red figure when it breaches a stated limit |
| Section headers | h3 14px bold; 16px; 12px bold; collapsible `▸` rows; caps red-ruled headers in the Risk report | 16px 600 title, optional count, actions at right; one collapsible style |
| Empty states | dashed box with a button (Business plan, Rent Roll); grey one-liner ("None yet.", "No legal documents yet."); a table with headers and no rows (Rent delinquency) | Dashed box, one sentence, one button |
| Notices | yellow banners for warnings, model notes and "internal" labels alike; blue and green bars on Underwriter | Info (primary tint), Warning (warning tint), Internal label as a small tag by the title |
| Pickers | header portfolio picker, per-tab portfolio picker, asset picker with "Find…", "This asset / All assets" toggle, "Whole fund" toggle | One portfolio picker (header) and one asset picker (page header) |

### Highest-impact changes, by benefit against effort

1. **Font, type scale and number formats in one pass** (small to medium). Switch `body` to Geist, set the six sizes above, right-align and use tabular figures in every table, and route every date, dollar, percent and negative through one helper each. Improves every screen; fixes findings 13, 14 and 24. Font swap alone is a one-line change.
2. **Phone pass** (medium). Stop the 11 screens overflowing, make Home and the list screens stacked cards, fit the inputs panel, shrink the header. Fixes findings 1, 2, 3 and 19. Screens: Home, Reports, Benchmarking, Portfolio Return, Property Condition, Stress Testing, dispositions, Asset inputs.
3. **One portfolio in view, everywhere** (small to medium). Decide what "All portfolios" means on portfolio screens and remove the second pickers. Fixes finding 4; touches Asset Summary, Valuation, Portfolio Summary, Portfolio Return, Portfolio Debt, Distribution Analysis, Benchmarking, Reports.
4. **Single top bar and standard page header with figures first** (medium). The navy bar, one picker row, title + actions, key-figure cards above the fold, Portfolio Return and Business Plan split into sub-tabs. Fixes findings 8, 9 and 12 and gives the app its "finished" look. Screens: all, with the biggest gain on Underwriter, Portfolio Return, Asset Business Plan, Home.
5. **Shared components and colour tokens** (large, can be done screen by screen). Button, input (with money formatting), table, chip, figure card, empty state, in-app dialog; palette as tokens in `app/globals.css`. Fixes findings 5, 15 and 22 and stops the drift from coming back.

### Mockup

One static mockup of Home in the proposed look (navy top bar, one picker, figure cards, 13px Geist table with one date format and three status colours; stacked cards on the phone):
- `/tmp/claude-0/-home-user-underwriting-calculator/35575dbe-b549-510c-b85a-27c9d8d4e33d/scratchpad/design/mockup-home.html`
- `/tmp/claude-0/-home-user-underwriting-calculator/35575dbe-b549-510c-b85a-27c9d8d4e33d/scratchpad/design/mockup-home-desktop.png`
- `/tmp/claude-0/-home-user-underwriting-calculator/35575dbe-b549-510c-b85a-27c9d8d4e33d/scratchpad/design/mockup-home-phone.png`

The asset names, dates and the 133 / 19 / 114 counts are from the sample data on screen; the small sub-lines on the cards ("41 leasing · 22 lender", "1 at risk · 2 off plan") are placeholders to show the layout, not figures from the app.
