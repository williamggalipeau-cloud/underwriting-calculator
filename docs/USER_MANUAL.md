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
| **Valuations** | Quarterly fair value for each fund asset: Q2/Q4 appraisals, Q1/Q3 roll-forward, appraisal schedule, asset NAV and interim returns, fund NAV and gross / net LP interim returns, import and export of marks. |
| **Sales Comps** | Import CoStar / Crexi / broker exports or add comps by hand. Filters, time and per-comp adjustments, statistics, a comparison with your deal, and a button that sets your exit cap from the comps. |

**Linked deals.** A linked deal's Quick Underwrite inputs are mapped onto the
full model (`toMainInputs`, §7.3), so every tab analyses the same deal.
Edits to the same fields in the left panel are overwritten by the next Quick
Underwrite edit. Unlink the deal to edit the full model directly.

**Sample portfolio.** The app opens with "Model Fund I": your deal
plus nine illustrative light-industrial assets (§7.13). **Load Model
Fund I** restores them and **Clear test data** removes them.

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
│   ├── Valuations.jsx        Valuations tab (fair value marks, NAV, interim returns)
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
│   ├── valuations.js         Fair value marks, asset/fund NAV, interim returns, appraisal schedule
│   ├── comps.js              Sales comps import, mapping, adjustments, stats
│   ├── testScenario.js       "Load test scenario" data
│   ├── workspaceFile.js      Linked workspace file (save to / open a .json file)
│   └── xlsx.js               Dependency-free .xlsx reader and writer
├── docs/USER_MANUAL.md       This manual
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

- **Called to date** = LP + GP capital calls (including fee and sub-line
  repayment calls) dated on or before today.
- **Dry powder today** = commitments − called to date − sub line balance
  outstanding. The outstanding balance will be repaid by future calls, so it
  is already spoken for.
- **Planned calls** = all calls for the fund's current deals.
- **Uncommitted** = commitments − planned calls.
- **Dry powder at IP end** = commitments − calls through the
  investment-period end − line balance then.
- **Not modeled:** recycling of returned capital.

### 7.13 Sample portfolio (`lib/samplePortfolio.js`)

Model Fund I has **$100M of total commitments** (LP + GP). It holds your
deal plus nine illustrative assets, acquired 4/30/2026 – 12/15/2027:

| Assumption | Value |
|---|---|
| Size | 18,000–50,000 SF |
| Price | $5.4M–$14.8M |
| Year-1 NOI | $365K–$962K |
| NOI growth | 20–35% |
| Hold | 3–5 years |
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

### 7.16 Stress test and sensitivity

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
