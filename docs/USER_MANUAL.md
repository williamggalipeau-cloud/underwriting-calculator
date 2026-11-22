# Industrial Underwriting Calculator — User Manual

Live site: https://williamggalipeau-cloud.github.io/underwriting-calculator/
Repository: `williamggalipeau-cloud/underwriting-calculator`

This manual covers:

1. [What the app is](#1-what-the-app-is)
2. [Using the app, tab by tab](#2-using-the-app-tab-by-tab)
3. [Claude skills and connectors](#3-claude-skills-and-connectors)
4. [Plugins and code dependencies](#4-plugins-and-code-dependencies)
5. [External data sources](#5-external-data-sources)
6. [File structure](#6-file-structure)
7. [Calculation logic and assumptions](#7-calculation-logic-and-assumptions)
8. [Worked example: the default deal](#8-worked-example-the-default-deal)
9. [Key assumptions and limitations](#9-key-assumptions-and-limitations)
10. [Maintenance: building, deploying, refreshing data](#10-maintenance)
11. [Data dictionary](#11-data-dictionary)
12. [Database (Supabase)](#12-database-supabase)

---

## 1. What the app is

A browser-based underwriting model for light-industrial real estate. It
underwrites a single asset, stress-tests it, and rolls a set of assets up
into a closed-end fund with a dated LP/GP waterfall, a subscription line and
a dry-powder calculation. It also has a sales comps tool.

- **No server, no login.** It is a static website. All math runs in your
  browser. Files you upload (rent rolls, fund terms, forward curves, sales
  comps) are read in the browser and never sent anywhere.
- **Your work can be saved to a file** (Chrome or Edge). See
  [Saving your work](#saving-your-work) below. It is also always saved in
  your browser as a backup.
- **Sign in to change data.** Anyone can open the site and look around,
  but entering or changing data requires signing in (**☁ Sign in**, top
  header). Viewers of a shared database workspace stay view-only (§12.3).
- **Changes are logged.** The Change Log tab records what changed, when and
  who changed it, using the name entered in each browser (§7.17).
- **Live data:** the only automatic outside calls are to the New York Fed for
  current SOFR, and an optional one for CME SOFR futures (see §5).

### Saving your work

The workspace holds your deals, fund terms, valuation marks, comps and the
imported forward curve. It is saved in two places.

**1. A workspace file (recommended).** The buttons are at the top right.

| Button | What it does |
|---|---|
| **Save to file…** | Creates a new `.json` file wherever you choose and links it. |
| **Open file…** | Links an existing workspace file and loads it. It replaces what's in the browser, after you confirm. |
| **Save now** | Writes your changes to the file immediately. |
| **Unlink** | Stops saving to the file. The file itself is kept. |
| **Reconnect *name*** | Appears when you come back. One click lets the browser use the file again, and the app loads it. |

- **When it saves:** every **10 minutes** if anything changed, when you click
  **Save now**, and when you switch away from or close the tab.
- **Status:** the green label shows the file name and either "saved *time*"
  or "unsaved changes".
- **Where to put the file:** iCloud Drive (or Dropbox, OneDrive) lets you open
  the same file on another Mac. Documents also works.
- **Browsers:** Chrome and Edge only. Safari and Firefox don't let web pages
  write to files. There the bar shows "Auto-save to a file needs Chrome or
  Edge"; use Export / Import workspace instead.
- **Before closing the tab:** the save on close usually completes, but click
  **Save now** first if you made changes in the last few minutes.
- **One tab at a time:** keep the file open in one tab. Two tabs saving to the
  same file overwrite each other.

The change log (§7.17) is part of the workspace, so it is saved in both
places and travels with exports.

**Database (Supabase): shared and verified.** Click **☁ Sign in** in the
top header (next to User manual), enter your email and open the sign-in
link. Then **☁ Database →
Save to database** creates a shared workspace.
- **Saving:** changes save to it on the same schedule as a linked file
  (every 10 minutes when changed, on **Save now**, and when you leave), and
  every save is a new version.
- **Status:** the ☁ label shows the workspace name, version and save status.
- **Reopening:** next time you sign in on this browser, the linked workspace
  reopens automatically.
- **Conflicts:** if someone else saved first, choose **Open latest** (load
  theirs) or **Keep mine** (save over it; theirs stays in the version
  history).
- **Sharing:** owners add people under **☁ Database → People with access**
  as owner, editor or viewer. People who haven't signed in yet get access on
  their first sign-in with that email.
- **Verified change log:** the database records every changed field with
  the signed-in email and the server's time, and no one can edit or delete
  those entries.

One-time setup (full detail, table layout and admin queries in §12):
1. In Supabase, open **SQL Editor → New query**, paste
   [`supabase/setup.sql`](../supabase/setup.sql) and click **Run**. It's safe
   to run again.
2. Under **Authentication → URL Configuration**, set the **Site URL** and a
   **Redirect URL** to
   `https://williamggalipeau-cloud.github.io/underwriting-calculator/`.
3. The project URL and publishable key are in `lib/cloud.js`. The
   publishable key is designed to be public: sign-in and the database's
   row-level security rules protect the data. Never put the `service_role`
   (secret) key in the app.

**2. The browser (always on).** Every change is also saved instantly in this
browser (`localStorage`, key `uw-workspace-v1`), as a backup. That save stays
in this browser and doesn't follow you to another browser or device.

**Moving or backing up without a linked file:**
- **Export workspace** downloads a `.json` copy.
- **Import workspace** loads one into another browser, replacing its
  workspace.
- **Reset workspace** clears the browser copy. A linked file is not deleted.

---

## 2. Using the app, tab by tab

The header shows the active deal's headline metrics: IRR, equity multiple,
year-1 cash-on-cash, going-in cap rate, DSCR and equity. The strip below it
shows live NY Fed SOFR and the forward curve in use. **Shift curve to live
rate** moves the whole curve up or down so it starts at today's 30-day
average SOFR.

The left panel holds the deals (tabs across the top of the panel) and the
full-model inputs for the active deal.

| Tab | What it does |
|---|---|
| **Quick Underwrite** | The fast NOI-driven model: price, closing costs, year-1 NOI and growth, hold, exit cap, loan (LTV, SOFR + spread, IO, 3+1+1 term, extension fee), rate cap (market-priced or manual), AM / PM / CM fees, forward curve controls. When the deal is **linked** (the default), these inputs drive every other tab. |
| **Unit Roll** | Unit-by-unit rent roll for rent-roll deals: generate, edit, or import a CSV. Ignored while a deal uses Direct NOI. |
| **Debt** | Loan sizing (LTV, DSCR, LTC and debt-yield limits; the smallest wins), rate schedule, covenant tests by year, TI reserve. |
| **Cash Flow** | Sources and uses, annual cash-flow statement, levered vs. unlevered returns, cumulative cash chart, peak equity and payback. |
| **Return Stress Testing** | Sliders for vacancy, rent growth, interest rate, exit cap, opex and construction overruns. Shows base vs. stressed results for the deal and the effect on the portfolio IRR. |
| **Sensitivity** | Two-way IRR / multiple / cash-on-cash grids on any two of: exit cap, rent / SF, purchase price, NOI growth, year-1 NOI. |
| **Asset Return** | Deal returns, the deal-level LP/GP waterfall and a comparison with the other saved deals. |
| **Portfolio Return** | Funds: fund terms (upload or edit), the asset roster and timeline, gross / net fund / net LP IRR and multiple, quarterly income distributions, the dated waterfall, the subscription line, and capital called / dry powder. |
| **Asset Summary** | One row per asset in a fund, with a Details panel per asset (terms, year-by-year cash flow, returns, valuation history, capital activity): status, dates, SF, price, loan, equity, funding, underwriting (NOI, caps, exit value, IRR, multiple, CoC, DSCR) and latest valuation (fair value, NAV, unrealized gain, TVPI), with fund totals. Sortable; Excel export; click an asset to open it. |
| **Valuations** | Quarterly fair value for each fund asset: Q2/Q4 appraisals, Q1/Q3 roll-forward, appraisal schedule, asset NAV and interim returns, fund NAV and gross / net LP interim returns, import and export of marks. |
| **Change Log** | Every change to deals, fund terms, capital activity, valuations, comps and the forward curve: when, who (the name entered in this browser), what, from → to. Filter, search, export to Excel. |
| **Sales Comps** | Import CoStar / Crexi / broker exports or add comps by hand. Filters, time and per-comp adjustments, statistics, a comparison with your deal, and a button that sets your exit cap from the comps. |

**Linked deals.** A linked deal's Quick Underwrite inputs are mapped onto the
full model (`toMainInputs`, §7.3), so every tab analyses the same deal.
Edits to the same fields in the left panel are overwritten by the next Quick
Underwrite edit. Unlink the deal to edit the full model directly.

**Funds and the Fund field.** A deal belongs to the fund named in its Fund
field.
- **Matching:** names match regardless of capitals or extra spaces, so
  "Model Fund I" and "model fund i " are one fund. The sample fund's former
  name, "Light Industrial Fund I", is merged into Model Fund I, and so is
  "Fund I", the separate fund the test scenario used to create. Workspaces
  saved under any of these names are cleaned up when they load. (Because of
  this, a fund can't be named "Fund I"; use another name.)
- **Open deals with no fund:** these (for example after **Remove** in a fund's
  roster) are listed on Portfolio Return with an **Add to fund** button.
  Until then they are left out of fund returns, attribution, capital
  activity, valuations and the asset summary.
- **Capital activity Purpose list:** shows this fund's assets first, then
  every other property in the workspace.

**Sample portfolio.** The app opens with "Model Fund I": your deal
plus nine illustrative light-industrial assets (§7.13). **Load Model
Fund I** restores them and **Clear test data** removes them. **Load test
scenario** adds four more deals (Small Bay Industrial — Phase I, Eastside
Distribution Hub, Northgate Flex Center, Riverside Commerce Park) to Model
Fund I.

---

## 3. Claude skills and connectors

The app itself does not call Claude or any Claude connector. Claude (in
Claude Code) built and maintains it, using the tools below.

### Connectors (MCP servers) used to build the app

| Connector | What it was used for |
|---|---|
| **GitHub** | Opening and merging pull requests, and checking the GitHub Actions deploy runs and their logs. |
| **Claude Code Remote** (cloud session tools) | Creating the cloud environment that allows `pensford.com` and `markets.newyorkfed.org`, watching PRs, and scheduling check-ins. |
| **OloLand** | Early in the project: listing deals and running a CRE debt-sizing check on the deal, to cross-check the loan sizing. |
| **CREparser Lease Abstraction** | Opened at the start for lease abstraction. Not used in the app's calculations. |
| **FactIQ** | Searching for SOFR data series while choosing a live rate source. The app uses the NY Fed API instead (§5). |

### Skills loaded while building

| Skill | Purpose |
|---|---|
| `ololand-dd:real-estate-diligence` | Real-estate underwriting conventions for the deal set-up. |
| `creparser-leases:lease-abstraction` | Lease abstraction workflow (start of the project). |
| `dataviz` | Chart design for the Cash Flow tab (colors, marks). |

### Agents

- **web-fetch** — used to read the Pensford pages while working out how to
  get the forward curve and cap prices.

### Useful next to the app

These are optional and not wired into the app:

- **CREparser Lease Abstraction** — abstract a lease PDF, then enter the rent
  roll on the Unit Roll tab.
- **OloLand** (`run_cre_debt_sizing`, `run_cre_stress_test`) — an independent
  check of the Debt and Stress tabs.
- **Claude with your documents** — Claude can read an LPA, PPM or credit
  facility term sheet and fill in the Fund Terms template (Portfolio Return →
  New fund → Download template), which you then upload.

---

## 4. Plugins and code dependencies

### Claude Code plugins

The repository has no plugins of its own. The skills above come from plugins
installed in the Claude Code environment (OloLand DD, CREparser Leases,
dataviz). The app does not need them to run.

### Runtime dependencies (`package.json`)

| Package | Version | Role |
|---|---|---|
| `next` | 16.2.4 | App Router framework, static export (`output: "export"`). |
| `@supabase/supabase-js` | 2.x | Database sign-in and storage (§12). |
| `react`, `react-dom` | 19.2.4 | UI. |
| `tailwindcss`, `@tailwindcss/postcss` | 4 | Styling (dev). |
| `eslint`, `eslint-config-next` | 9 / 16.2.4 | Linting (dev). |

There are no other runtime libraries. The Excel reader/writer (`lib/xlsx.js`),
CSV parser, IRR/XIRR solvers, cap pricer and charts are all written in this
repository. Excel files are unzipped with the browser's built-in
`DecompressionStream`.

> `AGENTS.md`: this Next.js version has breaking changes from older
> versions. Read `node_modules/next/dist/docs/` before changing framework
> code.

---

## 5. External data sources

| Source | How it gets in | Used for | Notes |
|---|---|---|---|
| **Pensford forward curve** (pensford.com/forward-curve, Floating tab) | Built-in snapshot, plus **Update from Pensford** to import a newer export (Excel, CSV, or pasted table) | Projected SOFR for each year of the hold (loan interest, cap pricing, sub line interest) | Snapshot as of **11/20/2026**: 121 monthly resets of 1-Month Term SOFR and 30-Day Average SOFR (`lib/forwardCurve.js`). Pensford's data API only serves its own site, so the app can't fetch it live; you download the Excel and import it. |
| **Pensford cap pricer** (pensford.com/calculators/cap-pricer) | Calibration only | The volatility surface for market-priced caps | Six quotes from 11/21/2026 ($7.3M notional, 30D Avg SOFR, 12–48 months, strikes 3.91% / 4.50% / 5.50%) were used to back out normal vols. The model reproduces all six within 3% (§7.5). |
| **Supabase** (nydqmigxorahfkfpkjnq.supabase.co) | Sign-in, then saves and opens | Shared workspaces, version history, verified change log | Optional; see §12 |
| **NY Fed Markets Data API** (markets.newyorkfed.org) | Fetched live when the page opens, and on **Refresh** | Current SOFR and the 30/90/180-day SOFR averages; anchoring the curve to the live 30-day average | Public, free and allows browser requests. If it is unreachable, the app keeps working on the snapshot curve. |
| **CME SOFR futures via Yahoo Finance** | **Fetch CME** button (optional) | A per-year manual SOFR curve (December 3-month SOFR futures; rate = 100 − price) | Goes through public CORS proxies and may fail; Pensford is the default. |
| **CoStar** (and Crexi, LoopNet, RCA, broker sheets) | Upload an export on the Sales Comps tab | Sale comps: $/SF, cap rates, exit cap check | CoStar has no public API. In CoStar, run a Sale Comps search, then Export → Excel. Column names are recognized automatically (§7.14). |
| **Your files** | Upload | Rent roll CSV (Unit Roll), fund terms template (.xlsx / .csv), Pensford export, comps | All read in the browser. |

The sample portfolio and the example comps are **made up for illustration**
and are not market data.

---

## 6. File structure

```
underwriting-calculator/
├── app/
│   ├── layout.jsx            Page shell, fonts, metadata
│   ├── page.jsx              Main screen: deals, tabs, workspace save/restore,
│   │                         live NY Fed strip, curve anchoring, fund editor,
│   │                         sample portfolio, Sales Comps wiring
│   ├── globals.css           Tailwind + base styles
│   └── favicon.ico
├── components/               One file per tab or panel (React, client side)
│   ├── QuickUnderwrite.jsx   Quick Underwrite tab, forward-curve and Pensford import panels
│   ├── DealInputs.jsx        Left-panel full-model inputs (NOI source, costs, loan, fees…)
│   ├── UnitRoll.jsx          Rent roll editor and CSV import
│   ├── DebtSizing.jsx        Debt tab: sizing, rate schedule, covenants, TI reserve
│   ├── CapitalAnalysis.jsx   Capital stack detail (not currently shown on any tab)
│   ├── CashFlowAnalysis.jsx  Cash Flow tab: statement, levered/unlevered, chart
│   ├── StressTest.jsx        Return Stress Testing tab
│   ├── SensitivityTables.jsx Sensitivity tab
│   ├── ReturnsAnalysis.jsx   Asset Return tab
│   ├── FundAnalysis.jsx      Portfolio Return tab (funds, waterfall, sub line, dry powder)
│   ├── FundTermsEditor.jsx   New / edit fund dialog, template upload
│   ├── AssetSummary.jsx      Asset Summary tab (one row per fund asset + totals)
│   ├── Valuations.jsx        Valuations tab (fair value marks, NAV, interim returns)
│   ├── CloudPanel.jsx        Database panel (sign in, save/open, members)
│   ├── ChangeLog.jsx         Change Log tab
│   └── SalesComps.jsx        Sales Comps tab
├── lib/                      Calculation engine and data (no UI)
│   ├── calculations.js       Core engine: underwrite(), loan math, IRR, waterfall, sensitivity
│   ├── quickUnderwrite.js    Quick model, cap schedule, SOFR by year, toMainInputs()
│   ├── forwardCurve.js       Pensford forward-curve snapshot, annual averaging
│   ├── pensfordImport.js     Read a Pensford export (xlsx/csv/pasted)
│   ├── nyfed.js              NY Fed live SOFR, curve anchoring
│   ├── sofr.js               CME SOFR futures fetch (optional)
│   ├── capPricer.js          Bachelier cap pricer and vol surface
│   ├── fundTimeline.js       Dates, XIRR, quarterly asset events, dated waterfall
│   ├── fundTerms.js          Fund terms defaults, template, import/export, CSV parser
│   ├── subLine.js            Subscription line simulation
│   ├── samplePortfolio.js    Nine sample assets, deal snapshot for funds
│   ├── cloud.js              Supabase: sign-in, workspaces, saving, members, audit log
│   ├── audit.js              Change log: detect changes, merge repeat edits, bulk entries
│   ├── assetSummary.js       Asset Summary rows, fund totals, Excel export
│   ├── valuations.js         Fair value marks, asset/fund NAV, interim returns, appraisal schedule
│   ├── comps.js              Sales comps import, mapping, adjustments, stats
│   ├── testScenario.js       "Load test scenario" data
│   ├── workspaceFile.js      Linked workspace file (save to / open a .json file)
│   └── xlsx.js               Dependency-free .xlsx reader and writer
├── docs/USER_MANUAL.md       This manual
├── supabase/setup.sql        Database setup (run once in the Supabase SQL Editor)
├── public/                   Static icons
├── .github/workflows/deploy.yml   Build and publish to GitHub Pages on push to main
├── next.config.js            Static export, basePath /underwriting-calculator
├── package.json / package-lock.json
├── eslint.config.mjs, postcss.config.mjs, jsconfig.json ("@/..." path alias)
├── AGENTS.md / CLAUDE.md     Notes for coding agents
└── README.md
```

**How data flows:** `page.jsx` holds the deals. Each deal has `quick` (Quick
Underwrite inputs), `inputs` (full-model inputs) and a `linked` flag. Every
tab calls `underwrite(inputs)` from `lib/calculations.js`. The Portfolio
Return tab snapshots each deal (`snapshotDeal`) into dated quarterly flows
(`lib/fundTimeline.js`). Those flows go through the subscription line
(`lib/subLine.js`) and the dated waterfall.

---

## 7. Calculation logic and assumptions

Conventions used throughout:

- Year 0 is closing. Years 1…N are annual periods from the acquisition date.
  Deal-level cash flows fall at the end of each year.
- Percentages are entered as percents (6.5 = 6.5%).
- Deal IRR uses annual periods. Fund returns use actual dates (XIRR,
  Actual/365).

### 7.1 Net operating income

**Direct-NOI mode** (Quick Underwrite and all linked deals):

```
NOI_gross(y) = Year-1 NOI × (1 + g)^(y−1)          g = NOI growth %
PM fee(y)    = pmFeePct × NOI_gross(y)             basis "noi" (default)
             = pmFeePct × purchase price           basis "value"
NOI(y)       = NOI_gross(y) − PM fee(y)
```

- The NOI you enter is **before** property management. The PM fee (5%) is an
  operating expense, so NOI, value and DSCR are all net of it.
- Year-1 NOI is the forward 12 months from acquisition.
- Rent-roll TI/leasing is set to zero in this mode.

**Rent-roll mode** (unlinked deals with Rent roll selected), per year:

```
Gross revenue  = (market rent/SF × (1+esc)^(y−1) + other income/SF) × SF
                 + custom income − TI concessions
Vacancy        = gross revenue × vacancy %
EGR            = (gross − vacancy) × (1 − credit loss %)
OpEx           = landlord-paid taxes, insurance (MG, Gross), utilities,
                 maintenance, janitorial (Gross only) + mgmt fee % × EGR
                 + leasing fees/SF + capital reserves/SF + custom opex + AM fees
NOI            = EGR − OpEx
```

- **NNN:** the tenant pays all of these. **MG:** the landlord pays taxes and
  insurance. **Gross:** the landlord pays everything.
- **Rollover (TI/LC)**, normalized:
  - Rolling SF per year = SF ÷ average lease term.
  - The new and renewal shares are set by the renewal probability.
  - TI cost = SF × TI/SF.
  - Leasing commission = SF × rent × term × LC %.
  - TI/LC is deducted below NOI ("adjusted NOI").
- **Unit Roll:** each unit is simulated month by month:
  - Contract rent escalates monthly at (1+esc)^(1/12).
  - At expiry, the unit renews with the renewal probability (blended
    expected values).
  - Expected downtime = round((1 − renewal %) × downtime months), counted
    as vacancy at market rent.
  - TI, LC, free rent and TI concessions are booked at each rollover.
  - The unit re-leases at market rent.
  - Credit loss is applied to net revenue.

### 7.2 Quick Underwrite model (`lib/quickUnderwrite.js`)

```
Loan at close    = purchase price × LTV
Loan             = loan at close + capex           (if capex is lender-funded)
Equity           = price − loan at close + closing costs + initial cap cost
                   (+ capex if equity-funded)
AM fee (yearly)  = AM % × equity                   (flat, on invested equity)
CM fee (yearly)  = CM % × purchase price           (asset value, every year)

Rate(y)          = min(SOFR(y), cap strike(y)) + spread
Debt service(y)  = balance × rate(y)               (interest-only)
                 or level payment re-amortized each year at that year's rate
                 over the remaining amortization term

Operating CF(y)  = NOI(y) − debt service − AM fee − CM fee
                   − replacement cap cost(y) − extension fee(y)
Sale (year N)    = NOI(N) ÷ exit cap
Sale costs       = sale price × sale cost %
Net CF(N)        = operating CF(N) + sale − sale costs − loan balance
IRR              = IRR of [−equity, net CF(1) … net CF(N)]
Equity multiple  = Σ net CF ÷ equity
Going-in cap     = year-1 NOI (before PM) ÷ price
```

**Extensions.** Extensions needed = min(available extensions, ⌈(hold −
initial term) ÷ extension term⌉). The fee is charged in the last year of
the term being extended (year 3, then year 4 if needed). It is never charged
in the sale year.

**Warnings** appear when:
- capex pushes the loan above the LTV;
- the hold is longer than the fully extended loan;
- equity must fund a shortfall in some year;
- the exit cap is more than 25 bp below the going-in cap ("returns rely on
  cap-rate compression").

**Sensitivity grid:** NOI growth 0–35% (steps of 5) × exit cap
4.0–7.5%.

### 7.3 Linking Quick Underwrite to the full model (`toMainInputs`)

A linked deal runs the full engine in direct-NOI mode with:
- closing costs as a single line;
- debt sizing limits off (LTV only);
- interest-only for the whole hold (when amortization = 0);
- a floating rate with the per-year SOFR curve;
- a cap hedge whose all-in strike = SOFR strike + spread, with the per-year
  strike schedule, the initial cap premium and the per-year replacement
  costs;
- extension fee as a dollar amount;
- sale costs as one % of the sale price;
- AM fee as % of equity, plus the PM and CM fees.

The quick model and the full engine produce the same cash flows (checked by
a parity script during development).

### 7.4 SOFR by year (`lib/forwardCurve.js`)

- **Pensford source (default):**
  - Year *k* of the hold = the average of the monthly curve resets dated
    in [acquisition + (k−1) yrs, acquisition + k yrs).
  - Months before the curve's first reset (an acquisition date in the
    past, like 2/13/2026) count at the first reset.
  - Years past the curve's end use the last reset.
- **Index:** 30-Day Average SOFR (default) or 1-Month Term SOFR.
- **Manual:** a per-year list, or a flat SOFR % if the list is empty.
- **Anchoring to live:** shift = live NY Fed 30-day average − the curve's
  first 30-day point. Both columns of the curve move by that shift
  (`anchorCurveToLive`).

### 7.5 Rate caps (`lib/capPricer.js`)

**Schedule.**
- One cap is bought at closing, then a replacement every cap term (1 year)
  while the loan is outstanding. No cap is bought in the exit year.
- Notional = loan amount.
- The initial strike is the cap strike input (3.91%).
- **Reset** renewals are struck at-the-money: the forward SOFR on the
  purchase date, rounded to 0.01%.
- **Same** keeps the initial strike.

**Market pricing** — a strip of monthly caplets, normal (Bachelier) model:

```
caplet = N × τ × DF(pay) × [ (F − K)·Φ(d) + σ√T·φ(d) ],   d = (F − K)/(σ√T)
F   forward SOFR for the month (from the curve)
K   strike
τ   accrual, Actual/360
DF  discount factor from valuation date, compounding monthly curve forwards
T   years from valuation (curve date, 11/20/2026) to caplet start
σ   normal vol: term structure (122–148 bp) × (1 + 4.5% per 1 pt the
    strike is above the forward), plus any "vol shift"
Cost when bought = PV ÷ DF(start)        (forward value at purchase)
```

- A cap whose purchase date is before the valuation date is priced as if
  bought today. Today's market is the only one available.
- **Manual pricing** uses fixed costs instead (initial $350K, replacements
  $250K).

### 7.6 Full engine debt (`lib/calculations.js`)

- **Loan sizing** = the smallest of the enabled limits:
  - LTV × price;
  - year-1 NOI ÷ (loan constant × min DSCR);
  - LTC × (price + closing costs);
  - year-1 NOI ÷ min debt yield.
  - Then plus lender-funded capex.
- **Loan constant** = the rate if IO, else annual payment ÷ loan.
- **Effective rate** = (SOFR(y) + spread), capped at the strike while a cap
  is in force. A swap fixes it at the swap rate for the swap term. Fixed-rate
  loans use the fixed rate.
- **Equity** = price + closing costs + cap premium + capex − loan.
- **TI reserve** (optional): the lender holds back $/SF and releases it
  toward TI/LC when that year's DSCR ≥ the draw test (1.10×). Draws are
  added to the loan balance.
- **Covenants** (Debt tab):
  - DSCR = NOI ÷ debt service.
  - Debt yield = NOI ÷ balance.
  - LTV = balance ÷ (NOI ÷ exit cap).
  - Occupancy = (gross − vacancy) ÷ gross.
  - "Warn" means within 5% of the limit.

### 7.7 Deal cash flow and returns

```
Pre-tax CF(y)  = NOI − (TI/LC − TI reserve draw) − debt service − extension fee
                 − replacement cap − AM fee (direct NOI) − CM fee
Exit value     = NOI(final year) ÷ exit cap
Sale costs     = broker % + transfer % + title % of exit value + legal + misc
Reversion      = exit value − sale costs − loan balance
IRR flows      = [−equity, CF1, …, CF(N) + reversion]
Equity multiple = (Σ CF + reversion) ÷ equity
Cash-on-cash   = CF(y) ÷ equity;  year-1 and average
NPV            = at 8%
DSCR (year 1)  = NOI ÷ debt service
```

IRR is solved by bisection between −99.99% and 1,000%. It shows "—" when the
flows never change sign.

**Unlevered** (Cash Flow tab):
- Invested = price + closing costs (excluding lender title and origination)
  + capex.
- Annual flow = NOI − TI/LC − CM fee.
- Exit = exit value − sale costs.

**Peak equity** = the lowest cumulative levered cash; **payback** = the first
year cumulative cash turns positive.

### 7.8 Deal-level waterfall (Asset Return tab)

Annual, on the deal's IRR flows. The LP share = LP equity %. Positive flows
are paid in this order:

1. **LP pref:** compounds annually on outstanding LP capital.
2. **Return of capital:** LP first, then GP.
3. **GP catch-up:** at the catch-up % (100%) until the GP has its tier share
   of total profit.
4. **Split** by the tier.

The tier is chosen once, from the deal's overall IRR (the first tier whose
hurdle ≥ project IRR). It is not a running IRR hurdle. Negative flows are
called pro rata.

### 7.9 Fund timeline and quarterly distributions (`lib/fundTimeline.js`)

**Dates.**
- Investment period end = final close + 2 years.
- Fund end = final close + 5 years.
- Fully extended = + 2 × 1 year.
- Defaults (12/31/2025 close): 12/31/2027, 12/31/2030, 12/31/2032.
- Deals bought outside the investment period, or exiting after the extended
  end, are flagged.

**Asset flows.**
- Each asset's annual operating cash is spread evenly by day across its hold
  year.
- It is paid at each calendar quarter end; the final stub is paid at exit.
- Sale proceeds (reversion) are a separate capital event on the exit date.

**Distribution policy.**
- **Reserve (default):**
  - Each asset keeps a reserve = reserve years (1) × that hold year's
    (debt service + TI/LC + AM fee + PM fee + CM fee).
  - Positive quarterly income first tops the reserve up; the rest is
    distributed.
  - Negative quarters draw on the reserve first, then become capital calls.
- **Payout %:** distribute that % of each positive quarter and reserve the
  rest.
- Either way, the reserve left at exit is released on the exit date as
  income (pref, then return of capital), ahead of the sale proceeds.

### 7.10 Fund waterfall (dated)

Events run in date order: calls, then income, then capital, then fees on the
same date.

- **Calls** are split LP / GP by the GP commitment (5% GP, 95% LP).
- **LP pref (9%)** compounds annually by actual days on outstanding LP
  capital plus unpaid pref: pref += (capital + pref) × ((1+9%)^(days/365) − 1).
- **Income events** (incomeTreatment "pref then ROC", the default):
  1. Pay accrued pref.
  2. Return capital, LP then GP.
  3. Anything left is held and added to the next capital event.
  - Promote is never paid from income.
- **Capital events** (sales):
  1. Pref.
  2. Return of capital (LP, then GP).
  3. GP catch-up (100%) to its tier share of total profit.
  4. Split by the active tier.
- **Tiers:** 80/20 to 12% IRR, 70/30 to 18%, 60/40 above. The tier is picked
  once from the fund's overall project XIRR.
- **Fund management fee** (0% by default, since fees are charged at the
  asset level): % of LP invested capital, called on each anniversary of
  final close.

**Returns shown:**
- **Gross:** XIRR of the assets' gross quarterly flows, before the
  reserve policy, fund fees and promote. Multiple = distributions ÷
  contributions.
- **Net fund:** XIRR of LP + GP flows after the waterfall, the sub line and
  fund fees.
- **Net LP:** XIRR of LP flows. Multiple = LP distributions ÷ LP
  contributions.

### 7.11 Subscription line (`lib/subLine.js`)

Simulated day by day from final close:

- **Facility** = 80% × total commitments (or × planned calls if no
  commitments are entered).
- Each capital call draws on the line up to its remaining room. Anything
  above that is called from LPs that day.
- Each draw is repaid by an LP capital call **365 days** later.
- **Interest** = balance × (forward 30-day average SOFR that day + 1.75%)
  ÷ 360, accrued daily.
- **Unused fee** = undrawn amount × 0.25% ÷ 360, accrued daily from final
  close until the later of the investment-period end and the last repayment.
- Accrued interest and fees are added to each repayment call, so they are a
  cost to LPs.
- The card shows net returns with and without the line.

### 7.12 Capital called and dry powder

There are two modes, depending on whether the fund has any **capital
activity** entered.

**Model only (no entries).** The model assumes every purchase draws on the
sub line and is repaid by a capital call after the max days (365):

- **Called to date** = LP + GP capital calls (including fee and sub-line
  repayment calls) dated on or before today.
- **Dry powder today** = commitments − called to date − modelled sub line
  balance.
- **Planned calls** = all modelled calls for the fund's current deals.
- **Uncommitted** = commitments − planned calls.
- **Dry powder at IP end** = commitments − calls through the
  investment-period end − line balance then.

**With capital activity (actuals).** Open Portfolio Return → Capital & dry
powder → **Capital activity (actuals)**, and enter each:

| Type | Purpose |
|---|---|
| Capital call | An acquisition (pick the asset), fees & expenses, sub line repayment, sub line interest & fees, or other |
| Sub line draw | Usually an acquisition (pick the asset) |
| Sub line repayment | Pay-down of the line (usually alongside a capital call tagged "Sub line repayment") |

Amounts are LP + GP. **Import…** reads Excel or CSV. It needs Date and
Amount columns; Type, Purpose (asset name or description) and Notes are
optional, and "paydown"/"draw"/"call" wording is recognized. **Export**
writes the ledger and doubles as a template.

Then:

```
Called to date        = Σ capital calls dated ≤ today
Sub line today        = Σ draws − Σ repayments dated ≤ today
Dry powder today      = commitments − called to date − sub line today
Future needs          = model capital needs dated after today: purchase
                        equity (except assets an entry is tagged to),
                        shortfall calls and fund fees, before any sub line
Commitments used      = called + sub line + future needs
Uncommitted           = dry powder today − future needs
Dry powder at IP end  = dry powder today − future needs up to the IP end
                        (after the IP: commitments − calls − line at IP end)
```

- **Untagged purchases:** if the model dates a purchase on or before today
  and no entry is tagged to that asset, the card flags it. Until you tag it,
  its equity is assumed called on the model date: it counts against dry
  powder and appears as an LP call in fund returns. Tag the call or draw that
  funded it, or move the asset's acquisition date if it hasn't closed.
- **Model comparison:** the card also shows what the model alone assumed
  for called capital and the line balance, for comparison.
**Net returns and valuations with actuals** (`lib/fundFlows.js`). The fund
waterfall (§7.10), the header's Net fund / Net LP figures, the quarterly
schedule and the Valuations tab's net LP interim returns (§7.15) all run on
the same LP cash flows:

- **Up to today:** the actual capital calls entered (including fee, line
  repayment and line interest calls). The model's capital needs dated on or
  before today are dropped, except untagged purchases (above).
- **Line draws still outstanding today:** actual draws less repayments,
  first in first out. Each is repaid by an LP call max days after its draw
  date (or tomorrow if that has passed). Interest accrues from tomorrow at
  the forward 30-day average SOFR + spread.
- **After today:** the model's capital needs (unfunded purchases and
  shortfalls) draw on the line's remaining capacity as in the model.
- **Fund management fees:** charged only after today; earlier ones are in
  your actual calls.
- **Asset income and sale proceeds:** always the model's. Actual
  distributions are not entered.
- **Sub line balance:** the actual balance up to today, then the projection.
  Valuations deducts it before the hypothetical liquidation.

The Net fund and Net LP tiles and the Valuations net LP card show an
**actual calls** tag in this mode. The Subscription line card shows the
model-only figures for comparison, and its peak, interest and fees cover
tomorrow onward.

- **Saving:** entries are stored with the fund's terms and saved with the
  workspace.
- **Not modeled:** recycling of returned capital.

### 7.13 Sample portfolio (`lib/samplePortfolio.js`)

Model Fund I has **$100M of total commitments** (LP + GP). It holds your
deal plus nine illustrative assets, all owned: acquired 1/30/2026 – 11/13/2026:

| Assumption | Value |
|---|---|
| Size | 18,000–50,000 SF |
| Price | $5.4M–$14.8M |
| Year-1 NOI | $365K–$962K |
| NOI growth | 20–35% |
| Hold | 4 years (all exit in 2030, within the fund term) |
| Exit caps | 6.25–7.00% |
| Spreads | 1.75–2.25% |

Structured like the base deal:
- 65% LTV, lender-funded capex;
- closing costs = 4% of price;
- extension fee = 1.25% of the loan;
- manual cap costs scaled to the loan ($350K / $250K per $7.3M).

### 7.14 Sales comps (`lib/comps.js`)

- **Import.**
  - Finds the header row: the row in the first 25 that matches the most
    known column names.
  - Maps columns by name (CoStar names: Property Address, Sale Date, Sale
    Price, RBA, Price Per SF, Actual Cap Rate, Secondary Type, Ceiling
    Height Range, Percent Leased, True Buyer / Seller Company…). You can
    change any match.
  - Rows with no price, $/SF or cap rate are skipped.
  - $/SF = price ÷ SF when missing (and price = $/SF × SF).
  - Cap rates entered as decimals (0.065) become percents.
- **Adjusted $/SF** = $/SF × (1 + market growth)^(years from sale date to
  your acquisition date) × (1 + comp adjustment %). Sales after the
  acquisition date are discounted back.
- **Statistics:** median, mean, min and max of adjusted $/SF, cap rate and
  size for the included, filtered comps.
- **Comparison with your deal:**
  - Price/SF = price ÷ SF.
  - Going-in cap = year-1 NOI (after PM) ÷ price.
  - Value at comps $/SF = median adjusted $/SF × SF.
  - Value at comps cap = year-1 NOI ÷ median cap.
  - A warning appears if your exit cap is below the comps median.
- **Apply to deal:** exit cap = median cap + spread (25 bp default), rounded
  to 0.01%.

### 7.15 Fair value and interim returns (`lib/valuations.js`)

Every completed calendar quarter end (on or before today) that an asset is
held, from its acquisition quarter to the quarter before its sale, gets a
mark:

| Quarter | Value used |
|---|---|
| Acquisition quarter | Cost = purchase price + capex budget |
| Q2 and Q4 | The independent appraisal you enter or import |
| Q1 and Q3 | Last mark rolled forward + capex entered since |
| Any quarter | An entered value overrides the rule |

**Appraisal schedule.**
- An appraisal is required at each Q2 and Q4 end after the acquisition
  quarter.
- It is "due" for 60 days after the quarter end, then "overdue".
- Until an appraisal is entered, the asset stays at its roll-forward value.

**Per asset, each quarter:**

```
Equity NAV        = fair value − loan balance + asset cash reserve
Unrealized gain   = fair value − (cost basis + capex since)
Implied cap       = forward 12-month NOI (current hold year) ÷ fair value
Contributions     = asset capital calls to date
Distributions     = asset income + sale distributions to date
Interim IRR       = XIRR of actual flows to date + NAV on the quarter end
TVPI              = (distributions + NAV) ÷ contributions
DPI               = distributions ÷ contributions
RVPI              = NAV ÷ contributions
```

- The loan balance is the balance at the start of the hold year.
- The cash reserve is the balance kept under the distribution policy (§7.9).

**Fund, each quarter:**
- **Fund NAV** = Σ asset NAV.
- **Gross** interim returns use all assets' flows plus fund NAV.
- **Net LP** assumes a hypothetical liquidation on the quarter end:
  1. NAV less the subscription line balance becomes a capital event.
  2. That event runs through the fund waterfall (§7.10) with the actual
     flows to date.
  3. LP NAV is the LP share of that event.
- Net LP shows "n/m" while LPs have funded nothing (purchases still on the
  sub line).
- IRRs over less than one year show "n/m".

Closing costs and cap premiums are not in fair value, so TVPI starts below
1.0× (the J-curve).

**Import / export.**
- **Import:** Excel or CSV with Asset, Quarter end, Fair value, and
  optionally Source, Appraiser, Cap rate, Capex since last mark and Notes.
  Assets are matched by deal name. Any date in a quarter, or "2026 Q2", is
  filed at that quarter end.
- **Export history:** writes every asset-quarter (the importable columns
  first, then the computed values) and the fund-by-quarter table.
- Marks are saved with the workspace and included in Export / Import
  workspace.

### 7.16 Asset Summary (`lib/assetSummary.js`)

One row per asset in the selected fund.

| Column | Source |
|---|---|
| Status | Pipeline (acquisition date after today), Owned, or Sold (exit date on or before today) |
| Acquired / Exit, hold | The deal's acquisition date and hold |
| SF, price, $/SF | Deal inputs |
| Loan, loan / price, equity | The full engine. The loan includes lender-funded capex, so loan / price can exceed the LTV input. |
| Funding | From capital activity tags: Capital call, Sub line, Call + line, Not tagged, or — when the fund has no activity |
| Yr-1 NOI, going-in cap, exit cap, exit value, IRR, multiple, yr-1 CoC, yr-1 DSCR | The full engine on the deal's current inputs (gross, before fund fees and promote) |
| Fair value, NAV, unrealized, TVPI | The Valuations tab (§7.15), as of the last completed quarter |

**Fund total row:**
- **Summed:** SF and all dollar figures.
- **Weighted:** $/SF = total price ÷ total SF; loan / price = total loan ÷
  total price; going-in cap = total year-1 NOI ÷ total price; exit cap =
  total exit NOI ÷ total exit value.
- **IRR:** pooled XIRR of all assets' dated equity cash flows.
- **Multiple:** total distributions ÷ total equity.
- **TVPI:** (total distributions to date + total NAV) ÷ total
  contributions.

**Details.** The Details button under an asset's name opens a panel below
the table with:
- **Terms:** acquisition (price, closing costs, capex and how it's funded,
  cap premium, total cost, year-1 NOI and growth); debt (loan, rate, payments,
  term and extensions, extension fee, cap strike, year-1 DSCR and debt
  yield); fees and exit (AM, PM, CM, exit cap, exit value, sale costs, net
  proceeds).
- **Returns:** equity, peak equity, profit, IRR, multiple, cash-on-cash.
- **Year-by-year cash flow:** NOI (before and after PM), debt service, fees,
  caps, extension fees, cash flow, then the sale, loan payoff and net cash
  flow to equity. Below it: interest rate, DSCR, debt yield, cash-on-cash and
  loan balance by year.
- **History:** the asset's valuation history and the capital activity
  tagged to it.

**Export to Excel** writes every row plus the total.

### 7.17 Change log (`lib/audit.js`)

**How changes are detected.** Each time the workspace is saved (about
0.4 seconds after an edit), the app compares what's tracked with the
previous save and records one entry per changed field:

| Entry field | Meaning |
|---|---|
| When | Date and time of the change (this computer's clock) |
| Who | The name entered under **Change Log → Your name** in this browser ("Unknown user" if blank) |
| Area | Deal, Saved deal, Fund terms, Capital activity, Valuation, Sales comps, Forward curve, or Workspace |
| Item | The deal, fund, asset or comp |
| Field | What changed, e.g. "Quick Underwrite › Exit cap (%)" or "2026-06-30 › Fair value ($)" |
| From → To | Old and new value ("added" / "removed" for whole items) |

**What is tracked:**
- **Deals:** Quick Underwrite inputs and the deal's own inputs. For linked
  deals, fields that come from Quick Underwrite are logged only on the Quick
  side.
- **Everything else:** saved copies, fund terms, capital activity entries,
  valuation marks, sales comps and the imported forward curve.
- **Not tracked:** which tab or deal is open, the live SOFR shift, and
  calculated results.

**Rules:**
- **Typing merges:** repeated edits to the same field by the same person
  within one minute merge into one entry. An edit that ends where it started
  is dropped.
- **Bulk actions are one entry:** importing, opening or reconnecting a
  workspace file, resetting the workspace, loading Model Fund I or the test
  scenario, and clearing test data. Any single save that changes more than
  60 fields is also one "Bulk change" entry.
- **What a loaded workspace brings:** its own log, plus an entry for the
  load.
- **Size:** the latest 10,000 entries are kept.

**Database (verified) log.** When the workspace is saved to the database,
each save sends the fields changed since the previous save. The database
stamps every row with the signed-in user's email and the server time, and
rows can't be changed or deleted. Change Log shows this verified log by
default (**Database (verified)**), with **This browser** for the local log.
Signed in, local entries also use your email instead of a typed name.

**Storage.** The log is saved with the workspace (`auditLog`), so it goes
with linked files and exports. Your name is stored in this browser only
(key `uw-audit-user`).

**Limitations.**
- **Names aren't verified.** The app has no logins.
- **It isn't tamper-proof.** Anyone who can edit the workspace file can edit
  the log. Treat it as a working record. A tamper-proof audit trail needs a
  server with user accounts.

### 7.18 Stress test and sensitivity

**Stress sliders:**
- **Vacancy +x pts:**
  - Rent roll: vacancy % + x, renewal probability − 2x, downtime + 0.15x
    months.
  - Direct NOI: year-1 NOI × (1 − x%).
- **Rent / NOI growth −x pts.**
- **Rate +x bp:** added to the spread (floating) or the fixed rate.
- **Exit cap +x pts.**
- **Opex +x%:** scales each expense line and the management %.
- **Construction / TI / capex +x%.**
- The portfolio impact re-runs the stressed asset's quarterly flows and
  recomputes the portfolio XIRR.

**Sensitivity:** a 5×5 grid around the base value for any two inputs:

| Input | Step |
|---|---|
| Exit cap | 0.25% |
| Rent / SF | $0.50 |
| Price | 5% |
| NOI growth | 5 pts |
| Year-1 NOI | 5% |

Cells are colored by their difference from the base case.

---

## 8. Worked example: the default deal

The inputs are the Quick Underwrite defaults:
- $10.0M price, $400K closing costs, 30,000 SF, acquired 2/13/2026;
- $650K year-1 NOI before PM, growing 35%/yr;
- 4-year hold, 4.0% exit cap, 6% sale costs;
- 65% LTV + $800K lender-funded capex = $7.3M loan;
- 30D Avg SOFR (Pensford 11/20/2026 curve, not live-anchored) + 1.75%,
  IO, 3+1+1;
- market caps, 1-year term, reset strikes;
- AM 1.5% of equity, PM 5% of NOI, CM 1.5% of price.

| | Year 1 | Year 2 | Year 3 | Year 4 |
|---|---:|---:|---:|---:|
| SOFR (avg of curve) | 3.95% | 4.45% | 4.37% | 4.29% |
| Cap strike in force | 3.91% | 4.16% | 4.45% | 4.29% |
| All-in rate | 5.66% | 5.91% | 6.12% | 6.04% |
| NOI before PM | 650,000 | 877,500 | 1,184,625 | 1,599,244 |
| PM fee (5%) | (32,500) | (43,875) | (59,231) | (79,962) |
| **NOI** | 617,500 | 833,625 | 1,125,394 | 1,519,282 |
| Debt service (IO) | (413,180) | (431,430) | (446,921) | (440,920) |
| AM fee (1.5% × $3.94M) | (59,113) | (59,113) | (59,113) | (59,113) |
| CM fee (1.5% × $10M) | (150,000) | (150,000) | (150,000) | (150,000) |
| Replacement cap | (43,547) | (51,019) | (61,916) | — |
| Extension fee | — | — | (100,000) | — |
| Sale (1,519,282 ÷ 4.0%) | | | | 37,982,039 |
| Sale costs (6%) | | | | (2,278,922) |
| Loan payoff | | | | (7,300,000) |
| **Net cash flow** | (48,340) | 142,063 | 307,445 | 29,272,366 |

- Equity = 10,000,000 − 6,500,000 + 400,000 + 40,836 (initial cap) =
  **$3,940,836**.
- Levered IRR ≈ **66%**; equity multiple ≈ **7.5×**.

**How sensitive this is:**
- The result rests on 35% NOI growth and a 4.0% exit cap, which is 250 bp
  below the 6.5% going-in cap (6.17% after the PM fee).
- At the example comps' 6.6% median cap + 25 bp, the exit value falls to
  about $22.2M.
- The live app's figures differ slightly because the curve is shifted to the
  live NY Fed rate.

---

## 9. Key assumptions and limitations

1. **Exit value uses the final hold year's NOI** (trailing), not the
   following year's NOI.
2. **Annual periods** for deal cash flows and deal IRR; fund returns use
   actual dates.
3. **The CM fee is 1.5% of purchase price every year** of the hold, below
   NOI. It does not end when the works are finished.
4. **The AM fee is on initial invested equity**, flat each year. It does not
   fall as capital is returned.
5. **Caps** are priced on the forward curve as of its date. Replacements are
   priced at today's forward view of their future purchase date, not at
   future market levels. The vol surface is calibrated to one day's Pensford
   quotes.
6. **Waterfall tier** is chosen once from the overall IRR, not as a running
   IRR hurdle.
7. **Taxes, depreciation and refinancing are not modeled.** A hold longer
   than the fully extended loan only triggers a warning.
8. **Sub line** repayments are modeled at the max days outstanding. Calls are
   not batched or timed to dates the GP picks.
9. **Recycling** of returned capital is not in dry powder.
10. **Sample assets and example comps are illustrative.** Replace them with
    real deals and comps.
11. **Saving to a file needs Chrome or Edge.** Elsewhere the data lives in
    the browser; use Export / Import workspace to back it up or move it.
12. **The linked file saves every 10 minutes.** Changes made since the last
    save are only in the browser until then. Use Save now before closing if
    in doubt.
13. **The browser change log is a working record.** Names are typed in
    each browser and not verified, and anyone who can edit the workspace
    file can edit that log. For a verified log, save to the database: there
    the signed-in user and server time are recorded on each save, and
    entries can't be edited or deleted.
14. **The database is only as private as its access list.** Owners decide
    who can open a workspace. Supabase hosts the data (encrypted at rest).
    Deleting a workspace deletes its versions and audit history.

---

## 10. Maintenance

**Run locally:** `npm install`, then `npm run dev` (open
http://localhost:3000/underwriting-calculator).

**Check:** `npm run lint`, then `npm run build` (writes the static site to
`out/`).

**Deploy:** merge to `main`. `.github/workflows/deploy.yml` builds and
publishes to GitHub Pages, usually within a few minutes.

**Refresh the forward curve:**
- **In the app:** Quick Underwrite → Update from Pensford, then upload
  Pensford's Excel export (Table view → Download & Share → Excel).
- **For everyone (new default snapshot):** replace the `FORWARD_CURVE` rows
  in `lib/forwardCurve.js` and update `FORWARD_CURVE_AS_OF`.

**Re-calibrate cap vols:** take new Pensford cap-pricer quotes and update
`VOL_SURFACE` in `lib/capPricer.js` (term structure in bp, smile slope).

**Change defaults:**
- Deal: `QUICK_DEFAULTS` (`lib/quickUnderwrite.js`).
- Fund: `DEFAULT_FUND_TERMS` (`lib/fundTerms.js`).
- Comps: `DEFAULT_COMPS_STATE` (`components/SalesComps.jsx`).
- Saved workspaces pick up new default fields on the next load.

---

## 11. Data dictionary

Every field the app stores, imports or reports: its name in the data, its
units, its default, and what it means.

**Conventions:**
- **Units:** `$` = US dollars; `%` = a percent entered as a number (6.5 means
  6.5%); `bp` = basis points (25 = 0.25%); `$/SF` = dollars per square foot.
- **Dates:** ISO `YYYY-MM-DD`. Imports also accept `M/D/YYYY` and Excel
  dates.
- **Defaults:** the value a new deal or fund starts with.

### 11.0 Where data is stored

The app's data is one **workspace**: a JSON object holding deals, funds,
comps, valuations, settings and the browser change log (§11.1–11.11). That
same JSON is stored in several places:

| Location | What it holds | When it's written |
|---|---|---|
| **Supabase database** (project `nydqmigxorahfkfpkjnq`) | `workspaces.data`: the current workspace JSON. `workspace_versions.data`: every earlier version. `audit_log`: the verified change log. Members and invites (§11.13). | When signed in and linked: every 10 minutes when changed, on **Save now**, and on leaving the page |
| **Browser storage** (`localStorage` key `uw-workspace-v1`) | The same workspace JSON | Instantly on every change (this browser only) |
| **Linked workspace file** (`.json`) | The same workspace JSON | Every 10 minutes when changed, on **Save now**, on leaving (Chrome / Edge) |
| **Export workspace** file | A copy of the workspace JSON | When you click Export |
| **Browser storage**, other keys | `uw-audit-user`: your typed name. `uw-db-link`: which database workspace this browser saves to. `uw-db-dirty`: unsaved database changes. `sb-nydqmigxorahfkfpkjnq-auth-token`: your sign-in session. | This browser only |
| **Browser database** (IndexedDB `uw-workspace-file`) | The linked file's handle (not its contents) | When you link a file |
| **Import files** (rent roll, fund terms, comps, marks, capital activity, Pensford curve) | Read once; contents copied into the workspace | — |
| **Not stored anywhere** | Live NY Fed rates, calculated results (§11.12), snapshots of open deals | Recalculated on every load or change |

**Reading the "Stored at" column (§11.1–11.11).** Paths are inside the
workspace JSON, which is the `data` column of the `workspaces` table:
- `deals[]` means "in each deal".
- `funds["Fund name"]` means "under that fund's name".
- `valuations["deal id"]["quarter end"]` means "under the deal's id, then
  the quarter-end date".

In Supabase SQL a path is written with `->` for each step:

```sql
-- Model Fund I's commitments, and each deal's exit cap, in the current version
select data -> 'funds' -> 'Model Fund I' ->> 'targetEquity' as commitments
from workspaces where name = 'Model Fund I';

select d -> 'inputs' ->> 'propertyName' as deal, d -> 'quick' ->> 'exitCapPct' as exit_cap
from workspaces, jsonb_array_elements(data -> 'deals') d
where name = 'Model Fund I';
```

Earlier versions use the same paths in `workspace_versions.data`.
Database-level columns (`id`, `version`, who saved and when) are in §11.13.

### 11.1 Workspace (`workspaces.data` in Supabase; also the browser, linked file and exports)

The workspace JSON. In Supabase it's the `data` column of `workspaces`
(current version) and `workspace_versions` (earlier versions). In the
browser it's under the key `uw-workspace-v1`. Linked and exported files hold
the same object.

| Field | Stored at (`workspaces.data`) | Type | Meaning |
|---|---|---|---|
| `v` | `v` | number | Format version (1) |
| `app` | `app` | text | `"industrial-uw"` (files written by the app) |
| `savedAt` / `exportedAt` | `savedAt`<br>`exportedAt` | date-time | When it was saved / exported |
| `deals` | `deals` | list of Deal (§11.2) | Open deals: the tabs in the left panel |
| `savedDeals` | `savedDeals` | list of Deal snapshot (§11.6) | Fixed copies added with **Add to Fund** |
| `funds` | `funds` | map: fund name → Fund terms (§11.7) | Fund terms, including capital activity |
| `baseCurve` | `baseCurve` | Forward curve (§11.11) | Imported Pensford curve (before live anchoring) |
| `anchorToLive` | `anchorToLive` | yes / no | Shift the curve to today's NY Fed 30-day average SOFR |
| `activeDealId` | `activeDealId` | text | The deal open in the left panel |
| `comps` | `comps` | Sales comps (§11.10) | Comps and their settings |
| `auditLog` | `auditLog` | list of Change (§7.17) | The browser change log: `id`, `at`, `user`, `area`, `item`, `field`, `path`, `from`, `to`, `note`. The verified log is the `audit_log` table (§11.13). |
| `valuations` | `valuations` | map: deal id → quarter end → Mark (§11.9) | Fair value marks |

### 11.2 Deal

| Field | Stored at (`workspaces.data`) | Type | Meaning |
|---|---|---|---|
| `id` | `deals[].id` | text | Unique id (`deal-1`, `sample-deal-1` … `sample-deal-9`, or generated) |
| `linked` | `deals[].linked` | yes / no | Quick Underwrite drives every tab (§7.3) |
| `quick` | `deals[].quick` | Quick Underwrite inputs (§11.3) | The deal's Quick Underwrite inputs |
| `inputs` | `deals[].inputs` | Full-model inputs (§11.4) | Inputs to the full engine. For linked deals, rebuilt from `quick`. |

### 11.3 Quick Underwrite inputs (`quick`)

| Field | Stored at (`workspaces.data`) | Units | Default | Meaning |
|---|---|---|---|---|
| `propertyType` | `deals[].quick.propertyType` | text | Light industrial | Label only |
| `purchasePrice` | `deals[].quick.purchasePrice` | $ | 10,000,000 | Purchase price |
| `closingCosts` | `deals[].quick.closingCosts` | $ | 400,000 | Acquisition closing costs (one amount) |
| `noiYear1` | `deals[].quick.noiYear1` | $ | 650,000 | Forward 12-month NOI **before** property management |
| `noiGrowthPct` | `deals[].quick.noiGrowthPct` | % / yr | 35 | NOI growth from year 2 |
| `holdYears` | `deals[].quick.holdYears` | years | 4 | Hold period; sale at the end of the last year |
| `exitCapPct` | `deals[].quick.exitCapPct` | % | 4.0 | Exit cap rate on final-year NOI |
| `saleCostPct` | `deals[].quick.saleCostPct` | % of sale price | 6 | Total sale costs |
| `acquisitionDate` | `deals[].quick.acquisitionDate` | date | 2026-02-13 | Closing date; anchors the forward curve and fund dates |
| `ltvPct` | `deals[].quick.ltvPct` | % of price | 65 | Loan at closing |
| `capex` | `deals[].quick.capex` | $ | 800,000 | Up-front capex budget |
| `capexLenderFunded` | `deals[].quick.capexLenderFunded` | yes / no | yes | Capex added to the loan (yes) or paid by equity (no) |
| `sofrPct` | `deals[].quick.sofrPct` | % | 3.91 | Flat SOFR when no curve applies |
| `sofrCurveSource` | `deals[].quick.sofrCurveSource` | `pensford` / `manual` | pensford | Where SOFR by year comes from |
| `sofrIndex` | `deals[].quick.sofrIndex` | `avgSofr30D` / `termSofr1M` | avgSofr30D | Pensford column: 30-Day Average SOFR or 1-Month Term SOFR |
| `sofrCurve` | `deals[].quick.sofrCurve` | list of % | [] | Manual SOFR by hold year (index 0 = year 1) |
| `forwardCurve` | `deals[].quick.forwardCurve` | Forward curve (§11.11) | snapshot | Curve this deal uses (anchored to live SOFR when on) |
| `spreadPct` | `deals[].quick.spreadPct` | % | 1.75 | Loan spread over SOFR |
| `amortYears` | `deals[].quick.amortYears` | years | 0 | 0 = interest-only |
| `initialTermYears` | `deals[].quick.initialTermYears` | years | 3 | Initial loan term |
| `extensionCount` | `deals[].quick.extensionCount` | count | 2 | Extension options |
| `extensionTermYears` | `deals[].quick.extensionTermYears` | years | 1 | Length of each extension |
| `extensionFee` | `deals[].quick.extensionFee` | $ | 100,000 | Fee per extension exercised |
| `capStrikePct` | `deals[].quick.capStrikePct` | % SOFR | 3.91 | Initial cap strike; 0 = no cap |
| `capRenewalStrike` | `deals[].quick.capRenewalStrike` | `reset` / `same` | reset | Replacement caps struck at-the-money (reset) or at the initial strike |
| `capTermYears` | `deals[].quick.capTermYears` | years | 1 | Term of each cap |
| `capPricing` | `deals[].quick.capPricing` | `market` / `manual` | market | Price caps off the curve and vols, or use the costs below |
| `capVolShiftBp` | `deals[].quick.capVolShiftBp` | bp | 0 | Parallel shift to the cap vol surface (market pricing) |
| `initialCapCost` | `deals[].quick.initialCapCost` | $ | 350,000 | Initial cap cost (manual pricing) |
| `replacementCapCost` | `deals[].quick.replacementCapCost` | $ | 250,000 | Each replacement cap (manual pricing) |
| `amFeePct` | `deals[].quick.amFeePct` | % of equity / yr | 1.5 | Asset management fee |
| `pmFeePct` | `deals[].quick.pmFeePct` | % / yr | 5 | Property management fee |
| `pmFeeBasis` | `deals[].quick.pmFeeBasis` | `noi` / `value` | noi | PM fee basis: NOI before the fee, or purchase price |
| `cmFeePct` | `deals[].quick.cmFeePct` | % of price / yr | 1.5 | Construction management fee |

### 11.4 Full-model inputs (`inputs`)

Fields set from Quick Underwrite on linked deals are marked **Q**.

**Property and fund:**

| Field | Stored at (`workspaces.data`) | Units | Default | Meaning |
|---|---|---|---|---|
| `propertyName` | `deals[].inputs.propertyName` | text | | Deal name shown everywhere |
| `fundName` | `deals[].inputs.fundName` | text | | Fund the deal belongs to (matched ignoring capitals and spaces; §2) |
| `squareFootage` | `deals[].inputs.squareFootage` | SF | 60,000 | Rentable SF (summed from units when a rent roll is used) |
| `purchasePrice` **Q** | `deals[].inputs.purchasePrice` | $ | 9,000,000 | Purchase price |
| `acquisitionDate` **Q** | `deals[].inputs.acquisitionDate` | date | | Closing date (fund timeline; falls back to final close) |
| `closingCosts` **Q** | `deals[].inputs.closingCosts` | $ by item | see below | `titleInsuranceOwner`, `titleInsuranceLender`, `transferTax`, `loanOrigination`, `acquisitionFee`, `legalFees`, `environmentalReport`, `appraisal`, `surveyAndPCA`, `miscClosingCosts` |
| `capexBudget` **Q** | `deals[].inputs.capexBudget` | $ | 0 | Up-front capex |
| `capexLenderFunded` **Q** | `deals[].inputs.capexLenderFunded` | yes / no | | Capex funded by the loan |

**NOI source:**

| Field | Stored at (`workspaces.data`) | Units | Default | Meaning |
|---|---|---|---|---|
| `noiOverrideEnabled` **Q** | `deals[].inputs.noiOverrideEnabled` | yes / no | no | Direct NOI (yes) instead of the rent roll |
| `noiYear1` **Q** | `deals[].inputs.noiYear1` | $ | | Year-1 NOI before PM (direct NOI) |
| `noiGrowthPct` **Q** | `deals[].inputs.noiGrowthPct` | % / yr | | NOI growth (direct NOI) |
| `pmFeePct`, `pmFeeBasis` **Q** | `deals[].inputs.pmFeePct`<br>`deals[].inputs.pmFeeBasis` | %, `noi`/`value` | 5, noi | PM fee in direct-NOI mode |
| `cmFeePct` **Q** | `deals[].inputs.cmFeePct` | % of price / yr | 1.5 | Construction management, below NOI |

**Rent roll and operations** (used when direct NOI is off):

| Field | Stored at (`workspaces.data`) | Units | Default | Meaning |
|---|---|---|---|---|
| `leaseType` | `deals[].inputs.leaseType` | NNN / MG / Gross | NNN | Who pays expenses (§7.1) |
| `rentPerSF` | `deals[].inputs.rentPerSF` | $/SF / yr | 14.00 | Market rent |
| `annualRentEscalationPct` | `deals[].inputs.annualRentEscalationPct` | % / yr | 3 | Market rent growth and default in-lease escalation |
| `vacancyPct` | `deals[].inputs.vacancyPct` | % | 10 | General vacancy (no rent roll) |
| `creditLossPct` | `deals[].inputs.creditLossPct` | % | 1 | Bad debt on revenue after vacancy |
| `otherIncomePSF` | `deals[].inputs.otherIncomePSF` | $/SF / yr | 0.25 | Other income |
| `realEstateTaxPSF`, `insurancePSF`, `utilitiesPSF`, `maintenancePSF`, `janitorialPSF` | `deals[].inputs.realEstateTaxPSF`<br>`deals[].inputs.insurancePSF`<br>`deals[].inputs.utilitiesPSF`<br>`deals[].inputs.maintenancePSF`<br>`deals[].inputs.janitorialPSF` | $/SF / yr | 1.20, 0.35, 0.50, 0.40, 0.20 | Operating expenses (landlord-paid per lease type) |
| `managementFeePct` | `deals[].inputs.managementFeePct` | % of EGR | 5 | Management fee (rent-roll mode) |
| `leasingFeesPSF`, `capitalReservesPSF` | `deals[].inputs.leasingFeesPSF`<br>`deals[].inputs.capitalReservesPSF` | $/SF / yr | 0.10, 0.30 | Leasing fees; capital reserves |
| `unitCount`, `avgLeaseTerm` | `deals[].inputs.unitCount`<br>`deals[].inputs.avgLeaseTerm` | count, years | 20, 2 | Rollover assumptions without a unit roll |
| `renewalProbabilityPct` | `deals[].inputs.renewalProbabilityPct` | % | 60 | Chance a tenant renews |
| `downtimeBetweenLeases` | `deals[].inputs.downtimeBetweenLeases` | months | 2 | Vacancy between leases |
| `tiPerSFNew`, `tiPerSFRenewal` | `deals[].inputs.tiPerSFNew`<br>`deals[].inputs.tiPerSFRenewal` | $/SF | 8, 2 | Tenant improvements |
| `leasingCommissionNewPct`, `leasingCommissionRenewalPct` | `deals[].inputs.leasingCommissionNewPct`<br>`deals[].inputs.leasingCommissionRenewalPct` | % of lease value | 6, 2 | Leasing commissions |
| `freeRentMonthsNew`, `freeRentMonthsRenewal` | `deals[].inputs.freeRentMonthsNew`<br>`deals[].inputs.freeRentMonthsRenewal` | months | 1, 0 | Free rent at rollover |
| `tiConcessionPSFNew`, `tiConcessionPSFRenewal` | `deals[].inputs.tiConcessionPSFNew`<br>`deals[].inputs.tiConcessionPSFRenewal` | $/SF | 0, 0 | TI concessions charged against income |
| `constructionCosts` | `deals[].inputs.constructionCosts` | $/SF by trade, % markups | see app | Build-up of new-lease TI: trades plus `generalConditionsPct`, `overheadProfitPct`, `contingencyPct` |
| `units` | `deals[].inputs.units` | list of Unit (§11.5) | [] | Unit roll; when present it drives income |
| `customIncomeItems`, `customExpenseItems`, `customRolloverItems` | `deals[].inputs.customIncomeItems`<br>`deals[].inputs.customExpenseItems`<br>`deals[].inputs.customRolloverItems` | `{label, psf}` | [] | Extra income / expense / rollover lines in $/SF |
| `amFeeItems` **Q** | `deals[].inputs.amFeeItems` | `{label, basis, value}` | | AM fees; `basis` = `fixed` $, `psf` $/SF, `pctEGR` %, `pctEquity` % of equity |

**Debt:**

| Field | Stored at (`workspaces.data`) | Units | Default | Meaning |
|---|---|---|---|---|
| `ltvPct` **Q** | `deals[].inputs.ltvPct` | % of price | 65 | LTV sizing |
| `loanSizingConstraints` | `deals[].inputs.loanSizingConstraints` | | off | `minDSCR…`, `maxLTCPct…`, `minDebtYieldPct…`, each with an `…Enabled` switch (§7.6) |
| `floatingRate` **Q** | `deals[].inputs.floatingRate` | yes / no | yes | Floating (SOFR + spread) or fixed |
| `indexRatePct` **Q** | `deals[].inputs.indexRatePct` | % | | Flat SOFR when there's no curve |
| `sofrForwardCurve` **Q** | `deals[].inputs.sofrForwardCurve` | list of % | [] | SOFR by hold year |
| `spreadPct` **Q** | `deals[].inputs.spreadPct` | % | | Spread over SOFR |
| `interestRatePct` | `deals[].inputs.interestRatePct` | % | 7.50 | Fixed rate (fixed loans) |
| `amortizationYears`, `ioPeriodYears` **Q** | `deals[].inputs.amortizationYears`<br>`deals[].inputs.ioPeriodYears` | years | 25, 0 | Amortization; interest-only years |
| `loanTermYears`, `extensionCount`, `extensionTermYears` **Q** | `deals[].inputs.loanTermYears`<br>`deals[].inputs.extensionCount`<br>`deals[].inputs.extensionTermYears` | years, count, years | 3, 2, 1 | Term and extensions |
| `extensionFeeAmount` **Q** / `extensionFeePct` | `deals[].inputs.extensionFeeAmount`<br>`deals[].inputs.extensionFeePct` | $ / % of balance | | Extension fee (amount wins if set) |
| `hedgingType` | `deals[].inputs.hedgingType` | `cap` / `swap` / none | cap | Rate hedge |
| `capStrikeRatePct` **Q** | `deals[].inputs.capStrikeRatePct` | % all-in | | Cap strike on the all-in rate (SOFR strike + spread) |
| `capStrikeRatesByYear` **Q** | `deals[].inputs.capStrikeRatesByYear` | list of % | | All-in strike in force each hold year |
| `capTermYears` **Q** | `deals[].inputs.capTermYears` | years | | Cap term |
| `capPremiumAmount` **Q** / `capPremiumPct` | `deals[].inputs.capPremiumAmount`<br>`deals[].inputs.capPremiumPct` | $ / % of loan | | Initial cap cost |
| `capReplacementCosts` **Q** / `capReplacementCost` | `deals[].inputs.capReplacementCosts`<br>`deals[].inputs.capReplacementCost` | list of $ / $ | | Replacement cap cost by hold year / flat |
| `swapFixedRatePct`, `swapTermYears` | `deals[].inputs.swapFixedRatePct`<br>`deals[].inputs.swapTermYears` | %, years | 7.75, 3 | Swap terms |
| `tiReserve` | `deals[].inputs.tiReserve` | | off | `enabled`, `reservePSF`, `minDrawDSCR` (§7.6) |
| `loanCovenants` | `deals[].inputs.loanCovenants` | | DSCR 1.25 on | `dscrMin`, `debtYieldMin`, `ltvMax`, `occupancyMin`, each with `…Enabled` |
| `lenderName` | `deals[].inputs.lenderName` | text | | Label only |

**Exit and deal waterfall:**

| Field | Stored at (`workspaces.data`) | Units | Default | Meaning |
|---|---|---|---|---|
| `holdPeriodYears` **Q** | `deals[].inputs.holdPeriodYears` | years | 7 | Hold period |
| `exitCapRatePct` **Q** | `deals[].inputs.exitCapRatePct` | % | 6.75 | Exit cap rate |
| `sellingCosts` **Q** | `deals[].inputs.sellingCosts` | %, $ | 2.0 / 0.5 / 0.2 %, $15k, $5k | `brokerCommissionPct`, `transferTaxPct`, `titleInsurancePct`, `legalFees`, `miscDispositionCosts` |
| `customDispositionItems` | `deals[].inputs.customDispositionItems` | `{label, basis, value}` | [] | Extra sale costs; `basis` `pct` of exit value or fixed $ |
| `waterfallEnabled`, `waterfall` | `deals[].inputs.waterfallEnabled`<br>`deals[].inputs.waterfall` | | on | Deal-level LP/GP: `lpEquityPct`, `preferredReturnPct`, `catchUpGpPct`, `tiers` (§7.8) |

### 11.5 Unit (rent roll row)

**Unit Roll → Import CSV** reads these columns. Header names in brackets
are also accepted.

| Field | Stored at (`workspaces.data`) | CSV column | Units | Default | Meaning |
|---|---|---|---|---|---|
| `name` | `deals[].inputs.units[].name` | unit [unitname, name, suite] | text | row no. | Unit / suite |
| `squareFeet` | `deals[].inputs.units[].squareFeet` | **sf** [squarefeet, sqft, size] | SF | required | Unit size (rows without SF are skipped) |
| `tenantName` | `deals[].inputs.units[].tenantName` | tenant [tenantname, lessee] | text | | Tenant |
| `businessDescription` | `deals[].inputs.units[].businessDescription` | business [description, use] | text | | Tenant's business |
| `creditRating` | `deals[].inputs.units[].creditRating` | credit [creditrating, rating] | text | | Credit rating |
| `naicsCode` | `deals[].inputs.units[].naicsCode` | sic [naics, naicscode, industry] | text | | Industry code |
| `leaseStatus` | `deals[].inputs.units[].leaseStatus` | status [leasestatus, occupied] | occupied / vacant | occupied | "occupied", "yes", "1" etc. = occupied |
| `leaseType` | `deals[].inputs.units[].leaseType` | lease_type [lease, type] | NNN / MG / Gross | NNN | Expense responsibility |
| `currentRentPSF` | `deals[].inputs.units[].currentRentPSF` | rent [rentpsf, currentrent] | $/SF / yr | 0 | Contract rent |
| `otherIncomePSF` | `deals[].inputs.units[].otherIncomePSF` | otherincome | $/SF / yr | 0 | Other income |
| `annualEscalationPct` | `deals[].inputs.units[].annualEscalationPct` | escalation [esc] | % / yr | 3 | In-lease escalation |
| `monthsRemaining` | `deals[].inputs.units[].monthsRemaining` | months_remaining [months] | months | 12 | Lease term left |
| `newLeaseTerm` | `deals[].inputs.units[].newLeaseTerm` | new_term [newleaseterm] | months | 24 | Term of the next lease |
| `renewalProbabilityPct` | `deals[].inputs.units[].renewalProbabilityPct` | renewal_pct [renew] | % | 60 | Renewal chance |
| `tiNewPSF`, `tiRenewalPSF` | `deals[].inputs.units[].tiNewPSF`<br>`deals[].inputs.units[].tiRenewalPSF` | ti_new, ti_renewal | $/SF | 8, 2 | TI at rollover |
| `leasingCommissionNewPct`, `leasingCommissionRenewalPct` | `deals[].inputs.units[].leasingCommissionNewPct`<br>`deals[].inputs.units[].leasingCommissionRenewalPct` | lc_new, lc_renewal | % | 6, 2 | Leasing commissions |
| `realEstateTaxPSF` … `janitorialPSF` | `deals[].inputs.units[].realEstateTaxPSF`<br>`deals[].inputs.units[].janitorialPSF` | retax, insurance, utilities, maintenance, janitorial | $/SF / yr | property rates | Per-unit expense overrides |

### 11.6 Deal snapshot (fund deals and saved deals)

Every fund view works from snapshots of each deal. **Add to Fund** stores
one as a fixed copy in `savedDeals`. Live deals are snapshotted fresh every
time they change.

| Field | Stored at (`workspaces.data`) | Meaning |
|---|---|---|
| `id`, `inputs` | `savedDeals[].id`<br>`savedDeals[].inputs` | Deal id and its full-model inputs at the snapshot |
| `irrFlows` | `savedDeals[].irrFlows` | Equity cash flows by hold year: [year 0 (negative), year 1 … year N incl. sale] |
| `opFlows` | `savedDeals[].opFlows` | Operating cash flow by hold year, excluding the sale |
| `reversion` | `savedDeals[].reversion` | Net sale proceeds after costs and loan payoff |
| `reserveBasis` | `savedDeals[].reserveBasis` | Per hold year: debt service + TI/LC + AM + PM + CM fees (the reserve target, §7.9) |
| `metrics` | `savedDeals[].metrics` | `irr` %, `equityMultiple` ×, `yearOneCashOnCash` %, `equityRequired` $, `loanAmount` $ |
| `live` | Live deals: recalculated, not stored | Snapshot of an open deal (recalculates) rather than a saved copy |

### 11.7 Fund terms (`funds[name]`)

**Fund terms template** (Excel or CSV) uses the labels in the second
column.

| Field | Stored at (`workspaces.data`) | Template label | Units | Default | Meaning |
|---|---|---|---|---|---|
| `name` | `funds["Fund name"].name` | Fund name | text | | Must match the deals' Fund field |
| `finalClose` | `funds["Fund name"].finalClose` | Final close date | date | 2025-12-31 | Start of the fund timeline |
| `investmentPeriodYears` | `funds["Fund name"].investmentPeriodYears` | Investment period (years) | years | 2 | From final close |
| `termYears` | `funds["Fund name"].termYears` | Fund term (years) | years | 5 | From final close |
| `extensionCount`, `extensionYears` | `funds["Fund name"].extensionCount`<br>`funds["Fund name"].extensionYears` | Extension options; Extension length | count, years | 2, 1 | Fund term extensions |
| `targetEquity` | `funds["Fund name"].targetEquity` | Total commitments ($) | $ | 0 (Model Fund I: 100,000,000) | LP + GP commitments; drives dry powder and sub line size |
| `gpCommitPct` | `funds["Fund name"].gpCommitPct` | GP commitment (% of equity) | % | 5 | GP share of every capital call |
| `prefPct` | `funds["Fund name"].prefPct` | Preferred return (% / yr) | % | 9 | LP pref, compounding annually |
| `catchUpGpPct` | `funds["Fund name"].catchUpGpPct` | GP catch-up (%) | % | 100 | Share of distributions to the GP during catch-up |
| `tiers` | `funds["Fund name"].tiers` | Tier n IRR hurdle / LP split / GP split | %, %, % | 12% 80/20, 18% 70/30, above 60/40 | Promote tiers (up to 5; blank hurdle = top tier) |
| `mgmtFeePct` | `funds["Fund name"].mgmtFeePct` | Management fee (% / yr) | % of LP invested | 0 | Fund-level fee (0 when fees are at the asset level) |
| `distributionPolicy` | `funds["Fund name"].distributionPolicy` | Distribution policy | `reserve` / `payout` | reserve | How quarterly income is distributed (§7.9) |
| `reserveYears` | `funds["Fund name"].reserveYears` | Reserve (years of …) | years | 1 | Reserve policy target |
| `incomePayoutPct` | `funds["Fund name"].incomePayoutPct` | Quarterly income payout (%) | % | 100 | Payout policy share |
| `incomeTreatment` | `funds["Fund name"].incomeTreatment` | Income distributions | `prefThenROC` / `full` | prefThenROC | Income pays pref then capital, or runs the full waterfall |
| `subLineEnabled` | `funds["Fund name"].subLineEnabled` | Subscription line | yes / no | yes | Model a subscription line |
| `subLineSizePct` | `funds["Fund name"].subLineSizePct` | Sub line size (% of commitments) | % | 80 | Facility size |
| `subLineSpreadPct` | `funds["Fund name"].subLineSpreadPct` | Sub line spread over SOFR (%) | % | 1.75 | Over 30-day average SOFR |
| `subLineUnusedFeePct` | `funds["Fund name"].subLineUnusedFeePct` | Sub line unused fee (% / yr) | % | 0.25 | On the undrawn facility |
| `subLineMaxDays` | `funds["Fund name"].subLineMaxDays` | Sub line max days outstanding | days | 365 | Each draw repaid by an LP call after this |
| `capitalActivity` | `funds["Fund name"].capitalActivity` | — | list of §11.8 | [] | Actual capital calls and line activity |

### 11.8 Capital activity entry (`capitalActivity[]`)

| Field | Stored at (`workspaces.data`) | Import column [also accepted] | Units | Meaning |
|---|---|---|---|---|
| `id` | `funds["Fund name"].capitalActivity[].id` | — | text | Unique id |
| `date` | `funds["Fund name"].capitalActivity[].date` | **Date** [call date, value date, transaction date] | date | Date of the call, draw or repayment |
| `type` | `funds["Fund name"].capitalActivity[].type` | Type [transaction, activity] | `call` / `draw` / `repay` | Capital call, sub line draw, sub line repayment ("paydown", "draw", "call" recognized; blank = call) |
| `amount` | `funds["Fund name"].capitalActivity[].amount` | **Amount** [total, call amount, capital called] | $ (LP + GP) | Positive; "(500,000)" and "-500,000" are read as 500,000 |
| `purpose` | `funds["Fund name"].capitalActivity[].purpose` | Purpose [asset, use, description] | `acq:<deal id>` / `fees` / `line-repay` / `line-interest` / `other` | What it funded. An asset name in the text tags that asset. |
| `notes` | `funds["Fund name"].capitalActivity[].notes` | Notes [memo, comments] | text | Free text |

### 11.9 Valuation mark (`valuations[dealId][quarterEnd]`)

| Field | Stored at (`workspaces.data`) | Import column | Units | Meaning |
|---|---|---|---|---|
| (key) quarter end | `valuations["deal id"]` key | **Quarter end** (any date in the quarter, or "2026 Q2") | date | Calendar quarter end the mark applies to |
| `value` | `valuations["deal id"]["quarter end"].value` | **Fair value ($)** | $ | Gross asset fair value; blank = roll-forward |
| `source` | `valuations["deal id"]["quarter end"].source` | Source (Appraisal / Internal) | `appraisal` / `internal` | Independent appraisal or internal mark (default by quarter: Q2/Q4 appraisal) |
| `appraiser` | `valuations["deal id"]["quarter end"].appraiser` | Appraiser | text | Firm |
| `capRate` | `valuations["deal id"]["quarter end"].capRate` | Cap rate (%) | % | Appraisal cap rate (reference) |
| `capex` | `valuations["deal id"]["quarter end"].capex` | Capex since last mark ($) | $ | Added to the roll-forward and to cost |
| `notes` | `valuations["deal id"]["quarter end"].notes` | Notes | text | Free text |
| (row) asset | Import file only (matched to a deal id) | **Asset** | text | Matched to the deal name |

### 11.10 Sales comps (`comps`)

**Settings:**

| Field | Stored at (`workspaces.data`) | Units | Default | Meaning |
|---|---|---|---|---|
| `marketGrowthPct` | `comps.marketGrowthPct` | % / yr | 3 | Time adjustment of $/SF to the acquisition date |
| `spreadBp` | `comps.spreadBp` | bp | 25 | Exit cap = comps median + spread |
| `filters` | `comps.filters` | | none | `sinceISO` sold on/after, `minSF`, `maxSF`, `type` text filter |
| `comps` | `comps.comps` | list of Comp | [] | The comps |

**Comp:**

| Field | Stored at (`workspaces.data`) | Import column (CoStar names recognized) | Units | Meaning |
|---|---|---|---|---|
| `name` | `comps.comps[].name` | Property / address [Property Address, Building Name] | text | Property |
| `city`, `state`, `submarket` | `comps.comps[].city`<br>`comps.comps[].state`<br>`comps.comps[].submarket` | City, State, Submarket [Property City, Submarket Name] | text | Location |
| `propertyType` | `comps.comps[].propertyType` | Property type [Secondary Type] | text | Type |
| `saleDate` | `comps.comps[].saleDate` | Sale date [Sold Date, Close Date] | date | Sale date |
| `price` | `comps.comps[].price` | Sale price ($) [Sold Price] | $ | Price (filled from $/SF × SF if missing) |
| `sf` | `comps.comps[].sf` | Building SF [RBA, Bldg SF] | SF | Building size |
| `pricePSF` | `comps.comps[].pricePSF` | Price / SF [Price Per SF] | $/SF | Filled from price ÷ SF if missing |
| `capRate` | `comps.comps[].capRate` | Cap rate (%) [Actual Cap Rate] | % | 0.065 is read as 6.5% |
| `yearBuilt`, `clearHeight`, `occupancy` | `comps.comps[].yearBuilt`<br>`comps.comps[].clearHeight`<br>`comps.comps[].occupancy` | Year built, Clear height [Ceiling Height Range], Occupancy [Percent Leased] | year, ft, % | Building details |
| `buyer`, `seller` | `comps.comps[].buyer`<br>`comps.comps[].seller` | Buyer, Seller [True Buyer Company …] | text | Parties |
| `adjPct` | `comps.comps[].adjPct` | Adjustment (%) | % | Comp-specific adjustment to $/SF |
| `include` | `comps.comps[].include` | — | yes / no | Counted in statistics |
| `example` | `comps.comps[].example` | — | yes / no | Made-up example comp |

### 11.11 Forward curve

| Field | Stored at (`workspaces.data`) | Meaning |
|---|---|---|
| `source` | `baseCurve.source`, `deals[].quick.forwardCurve.source` | "Pensford" (or the imported file) |
| `asOf` | `baseCurve.asOf`, `deals[].quick.forwardCurve.asOf` | Curve date (snapshot: 2026-11-20) |
| `points` | `baseCurve.points`, `deals[].quick.forwardCurve.points` | Monthly resets: `[date, 1-Month Term SOFR %, 30-Day Average SOFR %]` |
| `anchoredTo` | `baseCurve.anchoredTo`, `deals[].quick.forwardCurve.anchoredTo` | When shifted to live: `{ rate, shiftBp }` |

### 11.12 Calculated metrics (glossary)

| Metric | Stored | Definition | Where |
|---|---|---|---|
| NOI | Calculated, not stored (not in the database) | Net operating income: revenue less operating expenses (direct NOI: entered NOI less PM fee) | §7.1 |
| EGR | Calculated, not stored (not in the database) | Effective gross revenue: gross revenue less vacancy and credit loss | §7.1 |
| Going-in cap | Calculated, not stored (not in the database) | Year-1 NOI ÷ purchase price | §7.7 |
| Exit value | Calculated, not stored (not in the database) | Final-year NOI ÷ exit cap | §7.7 |
| Equity | Calculated, not stored (not in the database) | Price + closing costs + cap premium + capex − loan | §7.6 |
| Loan / price | Calculated, not stored (not in the database) | Loan (incl. lender-funded capex) ÷ purchase price | §7.16 |
| Loan constant | Calculated, not stored (not in the database) | Annual debt service ÷ loan (the rate if interest-only) | §7.6 |
| DSCR | Calculated, not stored (not in the database) | NOI ÷ debt service | §7.6 |
| Debt yield | Calculated, not stored (not in the database) | NOI ÷ loan balance | §7.6 |
| Cash-on-cash | Calculated, not stored (not in the database) | Year's cash flow ÷ equity | §7.7 |
| IRR | Calculated, not stored (not in the database) | Rate that sets the NPV of equity cash flows to zero. Annual periods for deals; actual dates (XIRR) for funds and interim returns. | §7.7, §7.10 |
| Equity multiple | Calculated, not stored (not in the database) | Total distributions ÷ equity contributed | §7.7 |
| Gross / Net fund / Net LP | Calculated, not stored (not in the database) | Assets before fund costs / all investors after fund costs / LPs after pref, promote and fees | §7.10 |
| Pooled IRR | Calculated, not stored (not in the database) | XIRR of all assets' dated equity cash flows together | §7.16 |
| Fair value | Calculated, not stored (not in the database) | Gross asset value from an appraisal, internal mark, roll-forward or cost | §7.15 |
| NAV | Calculated, not stored (not in the database) | Fair value − loan balance + asset cash reserve | §7.15 |
| TVPI / DPI / RVPI | Calculated, not stored (not in the database) | (Distributions + NAV) ÷ contributions / distributions ÷ contributions / NAV ÷ contributions | §7.15 |
| Unrealized gain | Calculated, not stored (not in the database) | Fair value − cost (price + capex) | §7.15 |
| Dry powder | Calculated, not stored (not in the database) | Commitments − capital called − sub line outstanding (− untagged purchases) | §7.12 |
| Uncommitted capital | Calculated, not stored (not in the database) | Dry powder − future capital needs of current deals | §7.12 |
| Status | Calculated, not stored (not in the database) | Pipeline (acquisition after today), Owned, Sold (exit on or before today) | §7.16 |

---

### 11.13 Database tables (Supabase)

Created by `supabase/setup.sql`. Relationships and access rules are in §12.4
and §12.5. All tables are in the `public` schema. Users come from Supabase
Auth (`auth.users`).

**`workspaces`**: one row per shared workspace.

| Column | Type | Default | Meaning |
|---|---|---|---|
| `id` | uuid, primary key | random | Workspace id |
| `name` | text, required | | Name shown in the app |
| `data` | jsonb, required | | The whole workspace (§11.1) |
| `version` | integer, required | 1 | +1 on every save; used to detect conflicting saves |
| `created_by` | uuid | signed-in user | Creator's user id |
| `created_at` | timestamptz, required | now | When created |
| `updated_by` | uuid | signed-in user | Last saver's user id |
| `updated_by_email` | text | signed-in email | Last saver's email |
| `updated_at` | timestamptz, required | now | When last saved |

**`workspace_members`**: who can open a workspace.
Primary key (`workspace_id`, `user_id`).

| Column | Type | Default | Meaning |
|---|---|---|---|
| `workspace_id` | uuid → `workspaces.id` | | Workspace |
| `user_id` | uuid | | Supabase user id |
| `email` | text | | Their email (for display) |
| `role` | text: `owner` / `editor` / `viewer` | `editor` | **Owner**: save, manage access, delete. **Editor**: save. **Viewer**: read only. |
| `added_at` | timestamptz, required | now | When added |

**`workspace_invites`**: people invited before their first sign-in.
Primary key (`workspace_id`, `email`).

| Column | Type | Default | Meaning |
|---|---|---|---|
| `workspace_id` | uuid → `workspaces.id` | | Workspace |
| `email` | text, required | | Invited email (lower case) |
| `role` | text: `owner` / `editor` / `viewer` | `editor` | Role they'll get |
| `invited_by` | uuid | signed-in user | Who invited them |
| `invited_at` | timestamptz, required | now | When invited |

**`workspace_versions`**: every earlier version, written on each save.
Index on (`workspace_id`, `version` desc).

| Column | Type | Meaning |
|---|---|---|
| `id` | bigserial, primary key | Row id |
| `workspace_id` | uuid → `workspaces.id` | Workspace |
| `version` | integer, required | The version number this data had |
| `data` | jsonb, required | The workspace as it was |
| `saved_by` | uuid | Who had saved that version |
| `saved_by_email` | text | Their email |
| `saved_at` | timestamptz, required | When that version was saved |

**`audit_log`**: the verified change log. Index on (`workspace_id`, `at`
desc).

| Column | Type | Set by | Meaning |
|---|---|---|---|
| `id` | bigserial, primary key | database | Row id |
| `workspace_id` | uuid → `workspaces.id` | function | Workspace |
| `version` | integer | function | Version the change was saved in |
| `at` | timestamptz, required | **database** (`now()`) | When it was saved |
| `user_id` | uuid | **database** (`auth.uid()`) | Who saved it |
| `user_email` | text | **database** (sign-in email) | Their email |
| `area` | text | app | Deal, Saved deal, Fund terms, Capital activity, Valuation, Sales comps, Forward curve, Workspace, Members |
| `item` | text | app | Deal, fund, asset or member |
| `field` | text | app | What changed, e.g. "Quick Underwrite › Exit cap (%)" |
| `path` | jsonb | app | Location in the workspace JSON |
| `from_value` / `to_value` | jsonb | app | Old and new value |
| `note` | text | app / function | Events: "Created workspace", "Added as editor", "Bulk change", imports … |

The trigger `audit_stamp` overwrites `at`, `user_id` and `user_email` on
every insert, so the app can't set them.

**How the browser change log maps to `audit_log`:**

| Browser `auditLog` field | `audit_log` column | Difference |
|---|---|---|
| `id` | `id` | Database row number |
| `at` | `at` | Database: server time at save; can't be set by the app |
| `user` | `user_email` (+ `user_id`) | Database: the signed-in email; browser: email if signed in, else the typed name |
| `area`, `item`, `field`, `path` | same names | Same values |
| `from`, `to` | `from_value`, `to_value` | Same values (JSON) |
| `note` | `note` | Same, plus database events (e.g. "Added as editor") |
| — | `workspace_id`, `version` | Which workspace and the version it was saved in |

The browser log merges quick repeat edits (§7.17). The database log records
the net change between saves.

## 12. Database (Supabase)

The app can save workspaces to a hosted Postgres database on
[Supabase](https://supabase.com). It's optional: without signing in, the app
works exactly as before, saving in the browser and in linked or exported
files.

**What the database adds:**
- **Sharing:** shared workspaces with owner, editor and viewer access.
- **Version history:** every save is kept.
- **Verified change log:** entries record the signed-in user and the
  server's time, and can't be edited or deleted.

### 12.1 Project and keys

| Item | Value / location |
|---|---|
| Project | `nydqmigxorahfkfpkjnq` (Supabase dashboard → your project) |
| Project URL | `https://nydqmigxorahfkfpkjnq.supabase.co` (in `lib/cloud.js`) |
| Publishable (anon) key | In `lib/cloud.js`. Designed to be public: sign-in and row-level security decide what anyone can read or write. |
| Secret / `service_role` key | Never in the app, the repository or chat. It bypasses all security. Use it only in the Supabase dashboard. |
| Setup script | [`supabase/setup.sql`](../supabase/setup.sql) |
| Client library | `@supabase/supabase-js` 2.x |
| Sign-in method | Email sign-in links (no passwords) |
| Site / Redirect URL | `https://williamggalipeau-cloud.github.io/underwriting-calculator/` (Authentication → URL Configuration) |

### 12.2 One-time setup

1. **Run the setup script.** Go to **SQL Editor → + New query**, paste
   `supabase/setup.sql` and click **Run**. You should see "Success. No rows
   returned".
   - It's safe to run again: it creates what's missing and replaces the
     functions and policies.
   - "Syntax error at end of input, LINE 0" means the editor was empty or
     only highlighted text was run. Paste again with nothing selected.
2. **Set the sign-in address.** Under **Authentication → URL
   Configuration**, set **Site URL** to the address above and add it under
   **Redirect URLs**.
3. **Optional hardening** (Authentication settings):
   - turn off new sign-ups and invite people only;
   - require multi-factor authentication;
   - use a custom SMTP sender so sign-in emails come from your domain.

### 12.3 How the app uses it

**Sign-in is required to change data.** `REQUIRE_SIGN_IN` is set in
`lib/cloud.js`.
- **Signed out:** the app is view-only. A banner says "View only. Sign in
  to enter or change data". Every tab can still be viewed, sorted and
  opened, but nothing typed is kept.
- **Blocked while view-only:** importing or opening workspace files, loading
  the samples or test scenario, clearing test data and resetting.
- **Viewers** of a database workspace stay view-only after signing in.
- **This is a screen rule.** The database itself only accepts saves from
  signed-in owners and editors. Someone determined could still change the
  copy held in their own browser, but those changes can't reach the
  database.
- **To allow local editing without signing in,** set `REQUIRE_SIGN_IN` to
  `false`.

| Action in the app | What happens in the database |
|---|---|
| **☁ Sign in** (top header) | Supabase emails a sign-in link. Opening it starts a session, kept in this browser. The app then calls `claim_invites()`. |
| **☁ Database → Save to database** | `create_workspace(name, data)`: a new `workspaces` row (version 1). You become its owner, and a "Created workspace" audit row is written. |
| Editing, then a save (every 10 min when changed, on **Save now**, or when you leave the page) | `save_workspace(id, expected version, data, changes)`. In one transaction it: (1) checks nobody saved since your version; (2) copies the old version to `workspace_versions`; (3) stores the new data with version + 1; (4) writes one `audit_log` row per changed field. |
| Someone else saved first | The save is refused (conflict). The app offers **Open latest** (load theirs) or **Keep mine** (save over it; theirs stays in `workspace_versions`). |
| **Open** a workspace | Reads `workspaces.data` and loads it into the app. On sign-in, the app reopens the workspace this browser was linked to (`uw-db-link`). |
| **People with access** | `add_member` / `remove_member`. If the person hasn't signed in yet, a `workspace_invites` row waits until they do. |
| **Delete** (owners) | Deletes the workspace and, by cascade, its members, invites, versions and audit rows. |
| **Change Log** tab | Reads `audit_log` for the open workspace (latest 1,000 rows) and shows it as **Database (verified)**. |

**Saved data.** Each saved workspace is the same JSON as the workspace
file (§11.1): deals, saved deals, funds (with capital activity), comps,
valuations, curve settings and the browser change log.

**Audit rows.** The changes sent with each save are the field-level
differences since the previous save, using the same comparison as the
browser log (§7.17). More than 60 changes in one save are sent as a single
"Bulk change" row.

### 12.4 Table layout

The tables, and how they relate (all cascade-delete with their workspace):

```
workspaces (1) ──┬── (many) workspace_members    who can open it, and their role
                 ├── (many) workspace_invites    emails invited before first sign-in
                 ├── (many) workspace_versions   every earlier saved version
                 └── (many) audit_log            one row per changed field
auth.users (Supabase) ── user_id in workspace_members / audit_log
```

Column-by-column definitions of every table are in the data dictionary,
[§11.13](#1113-database-tables-supabase).

### 12.5 Access rules (row-level security)

Row-level security is on for every table. Signed-in users can **read**:
- workspaces, members, versions and audit rows of the workspaces they're a
  member of;
- invites, owners only.

There are **no direct insert or update rules**. All writes go through the
functions below, which check the caller's role first. Owners may also
delete a workspace. Nobody can update or delete `audit_log` rows.

**Functions:**

| Function | Who | Returns | What it does |
|---|---|---|---|
| `create_workspace(ws_name, ws_data)` | any signed-in user | new id | Creates a workspace; the creator becomes owner (trigger `ws_after_insert`); writes "Created workspace" |
| `save_workspace(ws, expected_version, new_data, changes, new_name)` | owner, editor | new version | Conflict check → keep old version → save → audit rows, in one transaction. A stale version raises `conflict: version N`. |
| `log_note(ws, note_text)` | owner, editor | — | Adds a note row to the audit log |
| `add_member(ws, member_email, member_role)` | owner | `added` / `invited` | Adds or updates a member, or records an invite; logs it |
| `remove_member(ws, member_email)` | owner | — | Removes a member or invite (never the last owner); logs it |
| `claim_invites()` | the signed-in user | count | Turns invites for your email into memberships |
| `ws_role(ws)`, `ws_can(ws, roles)` | internal | role / yes-no | Used by the rules above |

### 12.6 Looking at the data

- **Table Editor:** browse the tables.
- **SQL Editor:** run queries. It runs as the database owner, so it sees
  every workspace.

```sql
-- Workspaces and their members
select w.name, w.version, w.updated_at, w.updated_by_email, m.email, m.role
from workspaces w join workspace_members m on m.workspace_id = w.id
order by w.name, m.role;

-- Latest changes in a workspace
select at, user_email, area, item, field, from_value, to_value, note
from audit_log
where workspace_id = (select id from workspaces where name = 'Model Fund I')
order by at desc limit 200;

-- Who changed a given field, ever
select at, user_email, item, from_value, to_value
from audit_log where field ilike '%Exit cap%' order by at desc;

-- Versions of a workspace
select version, saved_at, saved_by_email from workspace_versions
where workspace_id = (select id from workspaces where name = 'Model Fund I')
order by version desc;
```

**Restoring an earlier version.** The usual way:
1. Open the workspace in the app.
2. Export it (a safety copy).
3. In the SQL Editor, copy the old `data` from `workspace_versions`.
4. Paste it into a `.json` file and **Import workspace**, then **Save now**.

Doing it this way records the restore in the audit log. Editing
`workspaces.data` directly in the SQL Editor works too, but it isn't logged
and doesn't bump the version.

### 12.7 Backups, limits and costs

- **Backups:** the free plan has no automatic backups you can restore
  yourself. Paid plans keep daily backups. Use **Export workspace** now and
  then as your own copy.
- **Free plan pause:** free projects pause after about a week without
  activity. Open the dashboard and click **Restore** to wake one up.
- **Size:** each save stores a full copy in `workspace_versions`. A
  workspace is small (tens to hundreds of KB), so thousands of saves fit in
  the free plan's 500 MB.
- **Data location:** data lives in the Supabase region chosen when the
  project was created, encrypted at rest.

### 12.8 Troubleshooting

| Message | Cause / fix |
|---|---|
| "The database isn't set up yet" | Run `supabase/setup.sql` (§12.2) |
| The sign-in link opens a page that isn't the app, or says "redirect URL not allowed" | Set the Site URL and Redirect URL (§12.2 step 2) |
| No sign-in email | Check spam. Supabase's built-in sender is rate-limited (a few emails per hour); for regular use set up custom SMTP. |
| "Someone else saved this workspace…" | Another person saved first. Choose **Open latest** or **Keep mine**. |
| "You don't have permission…" | Your role doesn't allow it (viewers can't save; only owners manage access) |
| The project is paused | Supabase dashboard → **Restore project** |
