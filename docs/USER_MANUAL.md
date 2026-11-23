# Baywise · Industrial Real Estate Management — User Manual

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
13. [Roadmap](#13-roadmap)

---

## 1. What the app is

A browser-based underwriting model for light-industrial real estate. It
underwrites a single asset, stress-tests it, and rolls a set of assets up
into a closed-end fund with a dated LP/GP waterfall, a subscription line and
a dry-powder calculation. It also has a sales comps tool.

- **No app server.** It is a static website. All math runs in your
  browser. Files you upload (rent rolls, fund terms, forward curves, sales
  comps) are read in the browser and never sent anywhere. Signing in and
  the shared database are handled by Supabase (see
  [Signing in](#signing-in) and §12).
- **Your work is saved only in the database.** Sign in and every change
  saves to your workspace in the Supabase database. Nothing is kept in the
  browser. See [Saving your work](#saving-your-work).
- **Sign in to change data.** Anyone can open the site and look around,
  but entering or changing data requires signing in (**☁ Sign in** on the
  yellow View only banner). Viewers of a shared database workspace stay view-only. See
  [Signing in](#signing-in).
- **Changes are logged.** The Change Log tab records what changed, when and
  who changed it, using your signed-in email (§7.17).
- **Live data:** the only automatic outside calls are to the New York Fed for
  current SOFR, and an optional one for CME SOFR futures (see §5).

### Signing in

You sign in with your **email and a password**. Email is only used twice:
once to confirm a new account, and if you ever click **Forgot password?**.

**What works without signing in.** You can open every tab, look at the
sample deals, sort tables and read results. Anything you type is not kept,
and a yellow **View only** banner appears at the top. Opening or importing
workspace files, loading samples and resetting are also blocked until you
sign in.

**First time: create an account**
1. Click **☁ Sign in** on the yellow View only banner, above the tabs.
   (Once you're signed in, the **☁** button in the top header, next to
   **User manual**, opens the Database panel instead.)
2. Click **Create an account**.
3. Enter your email and a password (at least 8 characters), type the
   password again, and click **Create account**.
4. Open the confirmation email from Supabase and click its link. This is
   needed only once, to prove the email is yours.
5. Back in the app, sign in with your email and password.

**Every time after that: sign in**
1. Click **☁ Sign in**.
2. Enter your email and password and click **Sign in**.
3. The header shows ☁ with your workspace name (or **Database**), and the
   View only banner disappears.

Your browser can save the password for you; the app labels the fields so
password managers recognise them.

**Staying signed in.** You stay signed in on this browser, even after
closing the tab or restarting the computer, until you sign out. Other
browsers and devices need their own sign-in.

**Forgot your password?**
1. Click **☁ Sign in → Forgot password?**, enter your email and click
   **Email me a reset link**.
2. Open the email and click the link, in this browser.
3. The app opens and asks for a new password. Type it twice and click
   **Save password**. You're signed in, and the new password works from
   now on.

Reset links work once and expire after about an hour.

**Changing your password.** While signed in, open **☁ Database** and click
**Change password** next to "Signed in as …".

**After you sign in** the firm's data opens straight away: there are no
workspaces to choose (phase Q, 11/22).
- If an owner added you, or invited your email, you get access the first
  time you sign in.
- If you have no access yet, the app says so. Nothing is created for you;
  ask an owner to add you.
- Anything an older version of the app left in this browser is cleared, not
  imported.

**What you can do depends on your role** in a shared database workspace:

| Role | Can view | Can change data and save | Can add or remove people | Can delete the workspace |
|---|---|---|---|---|
| Owner | ✓ | ✓ | ✓ | ✓ |
| Editor | ✓ | ✓ | — | — |
| Viewer | ✓ | — (stays View only) | — | — |

Editing needs an open database workspace. While one is opening, the app
stays View only for a moment.

**Signing out.** Open **☁ Database** and click **Sign out** next to
"Signed in as …". Any unsaved changes are saved first, then the page
reloads with the starting sample deals in View only. Your workspace stays
in the database and opens again when you sign in. Sign out on shared or
public computers.

**Getting access to someone else's workspace.** Ask an owner to add your
email under **☁ Database → People with access**. You don't need an account
first: the invite waits, and the workspace appears the first time you sign
in with that email. Create your account with the exact email the owner
entered.

**How your data is protected**
- **The database checks who you are on every request.** You can only read
  workspaces you are a member of, and only owners and editors can save.
  These rules are enforced by the database itself, not just by the screen.
- **Signed-out visitors can't call the database.** Only signed-in users can
  run saves, sharing and invites.
- **Every change is stamped by the server** with your signed-in email and
  the server's clock. Nobody can type in someone else's name or edit the
  verified change log.
- **Passwords are handled by Supabase**, stored scrambled (hashed), and
  never seen by the app or saved in the workspace. Use a password you don't
  use anywhere else.

**Sign-in problems**

| What you see | What to do |
|---|---|
| "Wrong email or password" | Check both. If you've never set a password (for example, you only used email links before), use **Forgot password?** to set one. |
| "Confirm your email first" | Open the confirmation email from when you created the account. If it's lost, create the account again or ask an admin to resend it. |
| "There's already an account for this email" | Sign in instead, or use **Forgot password?**. |
| No confirmation or reset email | Check spam and wait a minute. The email sender allows only a few emails per hour, so don't request many in a row. |
| The reset link says it is invalid or expired | It was already used or is over an hour old. Request a new one. |
| A link opens a page that isn't the app | The project's sign-in address isn't set. An admin fixes it (§12.2 step 2). |
| Signed in, but still View only | You are a viewer on this workspace. Ask an owner for editor access. |
| Signed in, but a shared workspace is missing | The owner may have used a different email. Ask them to check **People with access**, then click **Refresh** under **Your workspaces**. |
| Signed in on one computer but not another | Each browser needs its own sign-in. |

For administrators: sign-in settings, the database setup and optional
hardening (turning off open sign-ups, multi-factor authentication, a custom
email sender) are in §12.2 and §12.3.

### Saving your work

Everything you enter is saved in **one place: the firm's data in the
Supabase database** (named **Baywise**). Everyone with access sees the same
data. Nothing is saved in the browser, and no files are written
automatically.

- **Sign in first.** Signed out, the app is View only and nothing is saved.
- **The firm opens on sign-in:** deals, fund terms, valuation marks, comps
  and the forward curve. There are no workspaces to open, create or delete.
- **When it saves:** about **one second after each change**. Only what
  changed is saved: the deal, fund or setting you edited, each as its own
  record. It also saves when you click **Save now** and when you switch away
  from or close the tab.
- **Live updates:** when someone else saves, their change appears on your
  screen within a moment, without reloading.
- **Status:** the ☁ label in the header shows **Baywise** and either "saved
  *time*" or "unsaved changes".
- **Leaving with unsaved changes:** the browser asks before closing the tab.
- **Two people editing the same thing:** nothing is overwritten. If someone
  saved that deal (or fund, or setting) after you opened it, your save of it
  is refused. The app reloads their version and shows "*Name* was changed by
  *email*; reloaded. Your other changes are kept." Re-enter your change if
  it's still needed. Edits to different deals never clash.
- **The asset on screen** is remembered per browser; it isn't firm data.
- **Sharing:** owners add people under **☁ Database → People with access**
  as owner, editor or viewer. People who haven't signed in yet get access on
  their first sign-in with that email.
- **Verified change log:** the database records every changed field with
  the signed-in email and the server's time, and no one can edit or delete
  those entries.

**Backups (optional, by hand; 11/23: the "workspace" buttons are gone):**
- **Download backup** saves a `.json` copy of all the firm's data (deals,
  funds, capital activity, valuations, comps, curve and change log) for you
  to keep. You never need it to save: every change is saved automatically.
- **Restore from backup** (owners only) replaces **all** of the firm's data,
  for everyone, with a backup file. A backup of the current data downloads
  first; anything not in the file is removed from the app; every record it
  changes is saved and logged as usual. Only for recovering from a mistake.
- There is no Reset button any more; **Sample data → Load Model Fund I**
  still loads the sample deals.

**What the browser still keeps:** only your sign-in, so you don't have to
sign in on every visit (`sb-nydqmigxorahfkfpkjnq-auth-token`). It holds no
deals or other data and is removed when you sign out.

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

---

## 2. Using the app, tab by tab

**Header.** **Baywise**, *Industrial Real Estate Management*, then a
firm-wide strip that is the same on every tab. It covers every fund in the
workspace and owned assets only (no sold, pipeline, Deal Screener or
unassigned deals). Hover over a figure for its definition:

| Figure | Definition |
|---|---|
| **AUM** | Sum of each owned asset's latest fair value (Valuation mark on or before today); purchase price while in the 6-month cost hold or with no mark |
| **Square feet** | Total SF of owned assets |
| **Assets** | Owned assets, "across N funds" |
| **Tenants** | Occupied units on the rent rolls, each tenant counted once per asset |
| **Occupancy** | Leased SF ÷ total SF |

Then **User manual**, **Change log** and **Database / Sign in**. The live NY
Fed SOFR and forward-curve panel is at the top of the **Debt** tab; **Shift
curve to live rate** there moves the whole curve so it starts at today's
30-day average SOFR.

The left panel holds the deals (tabs across the top of the panel) and the
full-model inputs for the active deal: it is where you type an asset's
assumptions by hand. Click a tab to switch assets; **+** sets up a new asset.
The tabs have no ✕: an asset can't be deleted from here (to take one out of
a fund, use Remove on the Fund Return tab, which keeps the deal). Phase O
replaces this with New / Edit asset and New / Edit fund buttons.

**Tab bar.** Tabs are grouped, with a small header over each group:

| Group | Tabs (left to right) | Coming later |
|---|---|---|
| **Acquisitions** | Pipeline · Deal Screener · Fund Impact | |
| **Dispositions** | (none yet) | Assets for Sale · Offers · Track Record · Documents (P) |
| **Asset Management** | Asset Business Plan · Asset Summary · Unit Roll · Leases · Valuation · Sales Comps · Debt · Cash Flow · Asset Return · Return Sensitivity · Sell/Hold Analysis | Leasing (R), after Leases |
| **Property Management** | (none yet) | Property Taxes · Insurance · Property Condition · Service Contracts (T) |
| **Portfolio Management** | Fund Summary · Fund Plan · Fund Return · Distribution Analysis · Stress Testing | Fund Debt (S) |
| **Market** | (none yet) | Market Data (U) |
| **Library** | Documents · Reports | |

A group's header appears once it has tabs. Each fund carries a **type tag**
(Fund, Separate Account or Joint Venture), chosen in **New fund** and
editable in the fund's terms. It shows as a badge next to the fund's name on
Asset Summary, Valuation and Fund Return, in fund pickers (e.g. "Fund II ·
Separate Account") and on the valuation and business plan PDF covers. Fund
Return has an **All types** filter when there is more than one fund. The tag
is a label only: every type uses the same fund model. The Change Log opens from the **Change log** button
in the header, next to User manual.

**Acquisitions**

| Tab | What it does |
|---|---|
| **Deal Screener** (named Quick Underwrite until 11/22/2026) | The fast NOI-driven model: price, closing costs, year-1 NOI and growth, hold, exit cap, loan (LTV, SOFR + spread, IO, 3+1+1 term, extension fee), a one-line rate cap summary (the cap itself is set on the Debt tab), AM / PM / CM fees, forward curve controls. When the deal is **linked** (the default), these inputs drive every other tab. |

**Asset Management**

| Tab | What it does |
|---|---|
| **Asset Business Plan** | The asset's business plan by revision (§7.30): thesis and strategy, KPIs vs target, leasing plan unit by unit, capital plan (spent vs budget), operating, financing and exit plans, milestones (late ones flagged; open ones on Leases → Critical dates), risks and a hold / sell / refinance recommendation. **Create business plan (revision 1)** seeds it from the IC memo and the closing model and locks the closing budget; **Edit plan** → **Save as revision n** (revision 1 never changes); **Compare with** any revision; a banner offers a new revision when the rent roll, loan, exit or capex budget changes. **Import actuals** (monthly income statement, CSV or Excel, for the whole fund) and **Budget vs. plan vs. actual** by month, quarter, year to date or since closing, in $ and $/SF, flagged amber / red over the threshold, with a comment per line. **PDF** (any revision) and **Excel**. Fund Return shows NOI vs budget by asset. Below the plan: **photos** (caption, date, order, cover), a **location map** (Google Maps, map or satellite) and a **floor plan** (uploaded image with unit boxes colored by lease status, or a schematic), where vacant units can be **demised** or **combined** (§7.31). |
| **Asset Summary** | One row per asset in a fund, with a Details panel per asset (leases, terms, year-by-year cash flow, returns, valuation history, capital activity). A **Leases abstracted** column (e.g. 3 of 4) and the Details' leases line (WALT, next critical date, risk flags, Open Leases tab) come from the Leases tab when signed in. Columns: status, dates, SF, price, loan, equity, funding, underwriting (NOI, caps, exit value, IRR, multiple, CoC, DSCR) and latest valuation (fair value, NAV, unrealized gain, TVPI), with fund totals. Sortable; Excel export; click an asset to open it. Details also has **Underwritten vs. actual** (freeze a baseline; by-year and returns comparison, the IRR gap by cause, Excel and a PDF report; §7.32). |
| **Unit Roll** | Unit-by-unit rent roll and leases: generate, edit, or import a CSV or Excel rent roll (**Download template** / **Download Excel**). Summary tiles (units, leased, occupancy, WALT, in-place vs market rent, rent rolling in 12 months), lease expirations by year, critical dates for the next 12 months, tenant industries by **SIC code**, and **▸ Lease details** per unit (dates, deposit, guarantor, recoveries, renewal and termination options, other rights, notes). See §7.19. The rent roll drives the cash flow only while the deal uses rent-roll NOI; under Direct NOI it is reference data. **Rent delinquency** (below the roll): upload Yardi's aged receivables each month (§7.29); a red **$ late** badge marks units with past-due balances and **⚠ estoppel** marks units whose estoppel differs from the lease. |
| **Leases** | Lease documents for each asset, stored privately in the database. **Add a lease**: tenant, the rent roll unit(s) it covers, and its PDFs (base lease first, then amendments; drag to reorder; each marked Lease, Amendment or Other). Each lease card lists its documents (click to open; links last an hour), with **+ Add documents**, **Edit tenant / units** and **Delete lease**. **Abstract with Claude** makes a prompt (1-hour document links, the Model Fund I template) for a Claude session with the CREparser connector and saves the finished abstract; **View abstract** shows key terms by group, rent schedule, critical dates and risk flags, each with its clause, quote and a link to the PDF page, and amended terms with their earlier value (§7.24). **This asset / Whole fund** switches between the selected asset's leases and every lease in its fund. Viewers can open documents and abstracts; owners and editors can change them. **Apply to rent roll** compares the abstract with a rent roll unit field by field (tick the fields to change) or adds a new unit prefilled from it, shows the effect on units, occupancy, WALT and mark to market before you apply, marks the lease "Applied to rent roll" and logs each field as from the abstract (§7.25). A flag on each abstracted lease shows whether its unit matches the lease, differs (which fields) or is not on the rent roll yet. **Critical dates** and **Risk flags** (views at the top, for this asset or the whole fund) list every deadline and flagged clause from the abstracts, filterable, with Excel export and a printable **Abstraction report (PDF)** (§7.26). **Tenant credit** on each lease holds credit reports and tenant / guarantor financial statements with key figures and flags (owners and editors only; §7.27). Needs sign-in and an open database workspace. |
| **Valuation** | Quarterly fair value for each fund asset: Q2/Q4 appraisals, Q1/Q3 roll-forward, appraisal schedule, asset NAV and interim returns, each asset's quarter-over-quarter value change for the last four quarters ($ and %) with each asset's planned exit cap, a PDF report of valuation adjustments and their effect on returns, import and export of marks. (Fund NAV and the fund's gross / net LP interim returns and value change are on Fund Return.) |
| **Sales Comps** | Import CoStar / Crexi / broker exports or add comps by hand. Filters, time and per-comp adjustments, statistics, a comparison with your deal, and a button that sets your exit cap from the comps. |
| **Debt** | Loan sizing (LTV, DSCR, LTC and debt-yield limits; the smallest wins; DSCR 1.25×, LTC 75% and debt yield 8% are on by default), **rate cap** (initial strike, cap term, renewal strike, market or manual pricing, and the full schedule: each hold year's SOFR and all-in strike, each cap's cost and the institution that wrote it; §7.5), rate schedule, covenant tests by year, TI reserve. The live NY Fed SOFR and forward-curve panel is at the top of this tab. |
| **Cash Flow** | Sources and uses, annual cash-flow statement, levered vs. unlevered returns, cumulative cash chart, peak equity and payback. |
| **Asset Return** | Deal returns, projected cash-on-cash yield by hold year (§7.21), the deal-level LP/GP waterfall and a comparison with the other saved deals. IRR, equity multiple, year-1 cash-on-cash and DSCR turn red below 14%, 2.0x, 7% and 1.25x (hover for the threshold). The waterfall summary shows **GP profit** (GP distributions − GP equity: upside above capital returned; formerly "GP Promote"), **GP promote** (GP distributions − the GP's share of equity × all distributions: upside above its pro-rata share) and **GP ROE** (GP profit ÷ GP equity, total, not annualized). Example: GP 10% of equity ($1.0M), the deal distributes $20M, the GP gets $2.6M: GP profit $1.6M, GP promote $0.6M, GP ROE 160%. **Projected fee revenue**: property management and construction management fees by hold year, the total and its present value at a discount rate you set (default 8%); Excel. The asset management fee is the fund's management fee (Fund Return), so it isn't counted per asset, and promote is never fee revenue (phase L, 11/23). |
| **Return Sensitivity** | Two-way IRR / multiple / cash-on-cash grids on any two of: exit cap, rent / SF, purchase price, NOI growth, year-1 NOI. |
| **Sell/Hold Analysis** | For each fund asset on a decision date: sell now, hold to a later year, or refinance and hold. Forward IRR and forward multiple of holding, spread to the fund's hurdle, NPV versus selling, total IRR and equity multiple since purchase, breakeven exit cap, and a suggested decision (§7.23). **Whole fund** sets a decision per asset (or **Use suggested decisions**) and compares the fund's returns with the base plan, including net LP TVPI, LP DPI by the end of the fund's term and GP promote. **All assets** changes every hold at once (each hold ± years, or every asset to one year); holds past the fund's final extended term are capped with a note, and sales past the term are flagged as needing an extension (§7.33). Scenarios can be saved and reloaded. Excel export. |

**Portfolio Management**

| Tab | What it does |
|---|---|
| **Fund Summary** | One page of key facts about a fund: key dates, capital raised / called / deployed / available, every key term, legal entities with an ownership chart, org chart and formation document uploads, links to the tabs that hold the rest; fact sheet (PDF) and Excel (§7.38). |
| **Fund Plan** | The fund's frozen plan (and re-forecasts) against actuals to date and today's forecast: capital called, deployment, distributions, DPI, NAV, projected returns vs. targets, GP promote, a cumulative chart, attribution by asset and cause; Excel and PDF report (§7.33). |
| **Fund Return** | Funds: cost of capital against the fund's hurdle rate (default: its pref; §7.22), fund expenses and fund cash (§7.20), projected cash-on-cash yield (§7.21), fund terms (upload or edit), the asset roster and timeline, gross / net fund / net LP IRR and multiple, quarterly income distributions, the dated waterfall, the subscription line, and capital called / dry powder. At the top: **Fund NAV and interim returns** (fund NAV, gross and net LP interim IRR / TVPI / DPI for the As of quarter, and the fund's quarter-by-quarter totals; moved from Valuation on 11/23), with a link to the Valuation tab for the marks and the valuation PDF. Then **Underwritten vs. actual + projected**: each asset with a frozen baseline ranked by IRR gap (§7.32). |
| **Distribution Analysis** | Each quarter's distributable cash: asset cash (Yardi upload or entered; projected where none is entered, labelled), less reserves, committed TI / capex and 3 months of asset expenses; fund cash less 6 months of fund expenses; less any sub line repayment. Choose the distribution (% or amount), LP / GP split per the waterfall, yield on LP contributed capital and NAV, last 4 quarters; save a proposal and record it as paid; Excel and PDF (§7.34). |
| **Stress Testing** | Sliders for vacancy, rent growth, interest rate, exit cap, opex and construction overruns. Shows base vs. stressed results for the deal and the effect on the portfolio IRR. |

**Library**

| Tab | What it does |
|---|---|
| **Documents** | Deal and fund documents (§7.28), for this asset or the whole fund: offering memo, rent roll, T-12, LOI, PSA, final IC memo, acquisition and disposition closing statements, insurance certificates (owner and tenant) and the fund's LPA and PPM. **Review with Claude** makes a prompt for a Claude session with the CREparser Deal Review connector (validators for OM, rent roll, T-12 and LOI; the others are read and checked locally); **Save abstract**; **View abstract** shows each value with its quote, page link and status; **Apply** compares the model with the document field by field (tick and apply; each change logged as from the document; a badge stays on fields not taken). Rent roll: merge or replace units. OM: **New deal from this OM**. IC memo: approved vs current and a conditions checklist. Insurance: **Check coverage** against the tenant's lease. LPA / PPM: fund terms and investment limits. Estoppel, CAM reconciliation and billing: **Check** against the leases and the rent roll (§7.29). The LPA and PPM upload has an **Assign to fund** picker, and each LPA/PPM card can be moved to another fund. Deadlines go to Leases → Critical dates. Owners and editors change; viewers read. |
| **Change log** (header button, next to User manual) | Every change to deals, fund terms, capital activity, valuations, comps and the forward curve: when, who (your signed-in email), what, from → to. Filter, search, export to Excel. |


**Asset dropdown.** Deal Screener, Unit Roll, Debt, Cash Flow, Asset
Return, Return Sensitivity and Sales Comps have an **Asset** dropdown at the top,
grouped by fund, listing every open deal; choosing one switches the active
deal (the same as clicking its tab in the left panel). Saved fund snapshots
(**Add to Fund** copies) are listed under "Saved snapshots"; choosing one
opens it as an editable deal and takes it off the saved list, so the fund
still counts it once. Stress Testing keeps its own asset dropdown.

**Location.** The Property section of the inputs has **Location** (street
address, city, state, ZIP). The Asset Summary shows city and state. Model
Fund I's twelve assets have fictional addresses in California, Nevada,
Washington and Texas, matching the sample leases (`docs/sample-leases`);
workspaces saved before locations existed get them when they open.

**Units.** The Property section of the inputs has a **Units** field. When a
deal has a rent roll, the count comes from the rent roll instead.

**Linked deals.** A linked deal's Deal Screener inputs are mapped onto the
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
  roster) are listed on Fund Return with an **Add to fund** button.
  Until then they are left out of fund returns, attribution, capital
  activity, valuations and the asset summary.
- **Capital activity Purpose list:** shows this fund's assets first, then
  every other property in the workspace.

**Sample portfolio.** The app opens with "Model Fund I": nine
illustrative light-industrial assets (§7.13). The **Sample data ▾** menu
(left, under the header; owners only, 11/23) holds three actions, each with
a warning and a confirm because they change the firm's data for everyone:
**Load Model Fund I** restores them and **Clear test data** removes them.
**Add drawn photos to the sample assets** gives each sample asset that has
no photos or floor plan four drawn photos (front, truck court, interior,
street; the front is the cover) and a drawn floor plan with its units boxed
(fictional drawings, not photographs; edits to the assets are kept). Load
Model Fund I includes them too.
**Load test scenario** adds three more saved deals to Model Fund I, all closed after the fund's
final close: Eastside Distribution Hub (5/29/26), Northgate Flex Center
(8/31/26) and Riverside Commerce Park (10/30/26), for twelve assets.
(The former opening deal "Light Industrial (30k SF)" and the test deal
"Small Bay Industrial — Phase I" were removed from the sample and test
data; saved workspaces drop them once when they open.)

**NOI source.** Every Model Fund I asset, and every new deal, runs on
**rent-roll NOI**: the cash flow is built from the rent roll (§7.1). Direct
NOI (an entered year-1 NOI and growth rate) is still available per deal
(NOI Source in the deal inputs, or linking the deal to Deal Screener).

**Rent rolls and mark to market.** Every Model Fund I asset has a rent roll
(`lib/sampleRentRolls.js`):
- **Units:** the asset's unit count, about 90% leased (or 1 − the asset's
  vacancy), sizes split evenly, fictional tenants (each with a business
  and an SIC code, §7.19), lease ends staggered over the next five years.
- **In-place rent:** from the asset's current income (year-1 NOI ÷ leased SF
  for direct-NOI assets; its rent/SF otherwise), ±5% by unit.
- **Market rent:** set 20–40% above in-place (each asset has its own target
  in that range), so **mark to market** (market ÷ in-place − 1) is 20–40%.
- **The nine sample assets** were moved from direct NOI to rent-roll NOI and
  unlinked from Deal Screener (loan, cap, fee and exit terms unchanged).
  Each rent roll is **calibrated to the asset's former NOI path**:
  - about 80% of leases roll 6–24 months after purchase, the rest at 36–48
    months, so most income re-prices during the 4-year hold;
  - in-place rents are scaled so year-1 NOI matches the former year-1 NOI;
  - market rent is solved so the final hold year's NOI matches the former
    exit NOI.
  Reproducing the original 20–35% a year NOI growth needs a mark to market
  of about **86–195%** on these nine assets (Harbor Light 86%, Canal Street
  97%, Granite Ave 108%, Airport Flex 113%, Mill Creek 140%, Lakeshore 159%,
  Route 9 160%, Southpoint 176%, Ridgeway 195%). Asset IRRs stay within
  about 1.5 points of the direct-NOI figures (re-leasing costs and downtime).
- **Eastside, Northgate and Riverside** were already on rent-roll NOI; their
  market rent is 20–40% above in-place and raises rents on rollover.
- Saved workspaces get these once when they open (`rentRollModel`, then
  `noiModel` for the rent-roll NOI switch and calibration), saved as a new
  version. Vacancy, occupancy and WALT in the Asset Summary come from
  the rent rolls and update whenever a unit's status changes or a unit is
  added.

**Acquisition dates and the fund terms.** Every fund asset needs an
acquisition date: it places the asset's cash flows in the fund's timeline.
- **Where to set it:** Deal Screener for linked deals; **Acquisition
  date** in the deal inputs' Property section for unlinked deals.
- **Missing date:** the fund assumes the asset was bought at its final
  close. The field turns amber, and the Asset Summary lists the asset and
  marks its date with *.
- **Fund terms check:** the Asset Summary also lists any asset bought after
  the investment period ends (final close + investment period) or exiting
  after the fund term ends (final close + term, before extensions).
- **Model Fund I** (final close 12/31/25, 2-year investment period, 5-year
  term): all 12 assets were bought between 1/30/26 and 11/13/26 and, on
  4-year holds, exit in 2030, inside the term (12/31/30).

**Hold period.** Every deal defaults to a **4-year hold**: new deals, the
nine sample assets and the three test-scenario deals. Change
it per deal under **Hold** (Deal Screener, for linked deals) or **Hold
Period** (deal inputs, for unlinked deals). Deals you already have keep the
hold they were saved with, except sample and test-scenario deals still on an
earlier default hold, which move to 4 years when the workspace opens.

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
| **Supabase** | Checking the database against `supabase/setup.sql`, running Supabase's security advisor (§12.5), and creating the first database workspace, "Model Fund I" (§12.9). |

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

- **CREparser Lease Abstraction** — abstracts lease PDFs; the Leases tab's
  **Abstract with Claude** prompt drives it (§7.24). The "Light industrial
  (Model Fund I)" template is saved in the connector for Excel / CSV exports.
- **OloLand** (`run_cre_debt_sizing`, `run_cre_stress_test`) — an independent
  check of the Debt and Stress tabs.
- **Supabase connector** — lets Claude read the database directly: check the
  setup, list workspaces and members, query the audit log and run the
  security and performance advisors. Add it at claude.ai → Settings →
  Connectors, then start a new Claude session. It acts as your Supabase
  account, so prefer read-only access and ask for changes explicitly.
- **Claude with your documents** — Claude can read an LPA, PPM or credit
  facility term sheet and fill in the Fund Terms template (Fund Return →
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
| `jspdf`, `jspdf-autotable` | 2.5.2, 3.8.4 | PDF reports, built in the browser and loaded only when you export (Valuation → Export PDF). |
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
│   ├── QuickUnderwrite.jsx   Deal Screener tab, forward-curve and Pensford import panels
│   ├── DealInputs.jsx        Left-panel full-model inputs (NOI source, costs, loan, fees…)
│   ├── UnitRoll.jsx          Rent roll editor and CSV import
│   ├── RateCapSchedule.jsx   Rate cap settings and schedule (Debt tab)
│   ├── DebtSizing.jsx        Debt tab: sizing, rate schedule, covenants, TI reserve
│   ├── CapitalAnalysis.jsx   Capital stack detail (not currently shown on any tab)
│   ├── CashFlowAnalysis.jsx  Cash Flow tab: statement, levered/unlevered, chart
│   ├── StressTest.jsx        Stress Testing tab
│   ├── SensitivityTables.jsx Return Sensitivity tab
│   ├── ReturnsAnalysis.jsx   Asset Return tab
│   ├── FundAnalysis.jsx      Fund Return tab (funds, waterfall, sub line, dry powder)
│   ├── FundTermsEditor.jsx   New / edit fund dialog, template upload
│   ├── AssetSummary.jsx      Asset Summary tab (one row per fund asset + totals)
│   ├── Valuations.jsx        Valuation tab (fair value marks, asset NAV, valuation PDF)
│   ├── FundNav.jsx           Fund NAV and interim returns (top of Fund Return)
│   ├── AssetMedia.jsx        Photos, location map, floor plan, demise / combine
│   ├── UwVsActual.jsx        Underwritten vs. actual (asset Details, Fund Return ranking)
│   ├── FundTypeBadge.jsx     Fund type tag badge
│   ├── AssetPicker.jsx       Asset dropdown above the single-deal tabs
│   ├── CashYield.jsx         Cash-on-cash yield charts and table
│   ├── SellHold.jsx          Sell/Hold Analysis tab
│   ├── Leases.jsx            Leases tab (lease documents, abstracts, apply to rent roll, mismatch flags)
│   ├── LeaseViews.jsx        Leases tab: Critical dates and Risk flags views
│   ├── BusinessPlan.jsx      Asset Business Plan tab (plan revisions, budget vs actual) and the fund NOI card
│   ├── Documents.jsx         Documents tab (deal and fund documents, review, apply, IC conditions)
│   ├── LoanAgreement.jsx     Debt tab: loan agreement terms, covenant tests, executed rate caps
│   ├── TenantCredit.jsx      Tenant credit section on each lease
│   ├── CloudPanel.jsx        Database panel (sign in, save/open, members)
│   ├── ChangeLog.jsx         Change Log tab
│   └── SalesComps.jsx        Sales Comps tab
├── lib/                      Calculation engine and data (no UI)
│   ├── calculations.js       Core engine: underwrite(), loan math, IRR, waterfall, sensitivity
│   ├── quickUnderwrite.js    Quick model, cap schedule, SOFR by year, toMainInputs()
│   ├── forwardCurve.js       Pensford forward-curve snapshot, annual averaging
│   ├── pensfordImport.js     Read a Pensford export (xlsx/csv/pasted)
│   ├── nyfed.js              NY Fed live SOFR, curve anchoring
│   ├── enterprise.js         Firm-wide header figures (AUM, SF, assets, tenants, occupancy)
│   ├── assetMedia.js         Photos, map, floor plan, demise / combine, actual NOI (§7.31)
│   ├── assetPhotos.js        asset-photos bucket: upload, signed links, delete
│   ├── uwActual.js           Underwritten vs. actual + projected, IRR gap by cause (§7.32)
│   ├── uwActualPdf.js        Asset-management report PDF
│   ├── fundTypes.js          Fund type tag (Fund / Separate Account / Joint Venture)
│   ├── sofr.js               CME SOFR futures fetch (optional)
│   ├── capPricer.js          Bachelier cap pricer and vol surface
│   ├── fundTimeline.js       Dates, XIRR, quarterly asset events, dated waterfall
│   ├── fundTerms.js          Fund terms defaults, template, import/export, CSV parser
│   ├── subLine.js            Subscription line simulation (monthly interest and unused fees)
│   ├── fundFlows.js          Fund LP cash flows: model or actuals to date + model after
│   ├── fundExpenses.js       Fund expenses: management fee, sub line costs, fund cash, expense calls
│   ├── cashYield.js          Projected cash-on-cash yield (asset and fund)
│   ├── sellHold.js           Sell / hold / refinance analysis and fund scenarios
│   ├── samplePortfolio.js    Nine sample assets, deal snapshot for funds
│   ├── cloud.js              Supabase: sign-in, members, audit log (and the old workspace save)
│   ├── records.js            Phase Q: the firm saved record by record, live updates, conflicts
│   ├── audit.js              Change log: detect changes, merge repeat edits, bulk entries
│   ├── assetSummary.js       Asset Summary rows, fund totals, Excel export
│   ├── leaseDocs.js          Lease documents in Supabase (table + storage bucket), save abstract
│   ├── leaseAbstract.js      Abstract template, prompt, parsing and grouping
│   ├── leaseApply.js         Abstract → rent roll unit fields, comparison, apply, mismatch flags
│   ├── leaseViews.js         Fund critical dates, risk flags, per-asset lease summary, Excel rows
│   ├── leaseReportPdf.js     Printable lease abstraction report (PDF)
│   ├── tenantCredit.js       Credit figures, checks, flags, statement requirements
│   ├── creditDocs.js         Tenant credit documents (Supabase rows and files)
│   ├── dealDocs.js           Deal documents (Supabase rows and files, deal-docs bucket)
│   ├── dealDocTypes.js       Document types, templates, prompts, local checks
│   ├── businessPlan.js       Business plan revisions, budget from the model, actuals import, variance
│   ├── businessPlanPdf.js    Business plan PDF for a revision
│   ├── dealDocApply.js       Compare and apply documents: deal inputs, T-12, rent roll, IC, closings, insurance, LPA
│   ├── assetLocations.js     Model Fund I asset addresses; state list
│   ├── sampleRentRolls.js    Model Fund I rent rolls with a 20–40% mark to market
│   ├── leases.js             Unit counts, occupancy, WALT, expirations, critical dates, rent roll import/export
│   ├── valuations.js         Fair value marks, asset/fund NAV, interim returns, appraisal schedule,
│   │                         quarter-over-quarter change, effect of adjustments on returns
│   ├── valuationPdf.js       Valuation adjustments PDF report (jsPDF)
│   ├── comps.js              Sales comps import, mapping, adjustments, stats
│   ├── testScenario.js       "Load test scenario" data
│   ├── workspace.js          Workspace check; clears data older versions left in the browser
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

**Direct-NOI mode** (Deal Screener and all linked deals):

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
  - **TI and leasing commissions are charged to each unit when it rolls,**
    using that unit's own rent roll figures (TI new / renewal $/SF, LC new /
    renewal %): the renewal share at expiry; the new-lease share at expiry
    if there is no downtime, otherwise in the month the unit is re-let. A
    unit that starts vacant is charged the full new-lease TI and commission
    in the month it is leased. (New-lease TI falls back to the construction
    cost budget, then the property default, only when the unit has none.)
  - Free rent and TI concessions are booked at each rollover.
  - The unit re-leases at market rent (market rent in force that month).
  - Credit loss is applied to net revenue.

### 7.2 Deal Screener model (`lib/quickUnderwrite.js`)

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

### 7.3 Linking Deal Screener to the full model (`toMainInputs`)

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

**Where it's set.** The rate cap is set on the **Debt** tab (moved from
Deal Screener, then called Quick Underwrite, on 11/22/2026; Deal Screener
shows a one-line summary).
The settings are initial strike (on SOFR), cap term, renewal strike (reset
to market or same as initial), and pricing (market with an optional vol
shift, or manual costs). A change reprices the caps and updates the cash
flows and returns on every tab:
- **Linked deals:** as before, through Deal Screener's mapping.
- **Unlinked deals** (every Model Fund I asset): priced on the deal's own
  loan amount, hold, spread and acquisition date (`capEngineFields`,
  `capSettingsFor` in `lib/quickUnderwrite.js`).

The schedule table shows, for each hold year, the cap in force (initial,
renewal or held), its SOFR strike, the all-in strike (SOFR strike +
spread, the rate each year's interest is capped at), the cost of each
cap when bought, with the total, and the **provider**: the bank or
institution that wrote each cap (typed per cap; years where a cap is only
held show its provider in grey). Providers are saved with the deal
(`quick.capProviders`, keyed by the hold year the cap was bought in) and
changes appear in the change log.

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
- **Default tests:** min DSCR 1.25×, max LTC 75% and min debt yield 8% are
  on for every Model Fund I asset and for new deals (Deal inputs → Loan
  Sizing Constraints; each can be switched off or changed per asset).
  Saved workspaces got them once when they opened (`sizingModel`, values
  already entered kept). At these levels LTV (65%) still sets every Fund I
  loan, so loans and returns did not change; the Asset Summary shows the
  cushion to the next test. Deals linked to Deal Screener size on LTV
  only.
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

**Actual loan.** When a loan agreement has been applied
(`loanAmountActual` > 0), the loan is that amount instead of the lesser of
the sizing tests (§7.28).

**Realized sale.** When a disposition closing statement has been applied
(`realizedSalePrice` > 0), the exit value is the actual sale price instead
of exit NOI ÷ exit cap, and `realizedSellingCosts` (when given) replaces
the modelled selling costs.

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
- **Fund expenses:** the management fee and sub line costs are fund-level
  expenses, paid from fund cash, then the line, before income is
  distributed (§7.20). Capital for them is assumed called only when both are
  exhausted (fee part LP-only); the waterfall adds no fee of its own.

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

**With capital activity (actuals).** Open Fund Return → Capital & dry
powder → **Capital activity (actuals)**, and enter each:

| Type | Purpose |
|---|---|
| Capital call | An acquisition (pick the asset), fees & expenses, sub line repayment, sub line interest & fees, or other |
| Sub line draw | Usually an acquisition (pick the asset) |
| Sub line repayment | Pay-down of the line (usually alongside a capital call tagged "Sub line repayment") |

Amounts are LP + GP. **Import…** reads Excel or CSV. It needs Date and
Amount columns; Type, Purpose (asset name or description) and Notes are
optional, and "paydown"/"draw"/"call" wording is recognized. **Export**
writes the ledger, with the running totals below as extra "(calculated)"
columns that **Import…** ignores, and doubles as a template.

**Running totals.** The ledger lists entries in date order (same-day
entries in the order entered). After each entry it shows:

```
Called to date   = Σ capital calls up to and including this entry
Line balance     = Σ draws − Σ repayments up to and including this entry
Dry powder       = commitments − called to date − line balance
                   (shown when the fund has commitments)
```

A **Total** row repeats the final figures with total calls, draws and
repayments. Running totals include entries dated after today, so the last
row can differ from the card's "today" figures; a negative line balance or
dry powder is shown in red.

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
schedule and the Valuation tab's net LP interim returns (§7.15) all run on
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
- **Fund expenses** (§7.20): calculated over the whole life. Up to today the
  expenses, their line draws and repayments appear as **Automatic** entries
  (Source column); capital calls never do. A capital call you enter for
  fees or sub line interest replaces the model's assumed expense call for
  that quarter.
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
| First 6 months: every quarter ending within 6 months of the acquisition date (the acquisition quarter and usually the next), whatever the quarter | Cost = purchase price + capex budget, plus capex entered since. No appraisal is due, and a value entered for these quarters is not used (shown struck through) |
| Q2 and Q4 after that | The independent appraisal you enter or import |
| Q1 and Q3 after that | Last mark rolled forward + capex entered since |
| Any later quarter | An entered value overrides the rule |

For example, an asset bought 1/30/2026 is held at cost at 3/31 and 6/30/2026
(6/30 is within 6 months), and its first appraisal is due at 12/31/2026; one
bought 8/14/2026 is held at cost at 9/30 and 12/31/2026, with its first
appraisal at 6/30/2027 (`COST_HOLD_MONTHS = 6`).

**Appraisal schedule.**
- An appraisal is required at each Q2 and Q4 end after the first 6 months
  (none while the asset is held at cost).
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

**Quarter-over-quarter value change** (`valueTrend`). A table under the
assets shows each asset's fair value for the last four completed quarters up
to the **As of** quarter (fewer if the fund is younger), and under each value
its change from the prior quarter:

```
Change $   = fair value this quarter − fair value last quarter
Change %   = change $ ÷ fair value last quarter
```

- The acquisition quarter has no prior value and shows "Acquired".
- The change includes capex added to the value (roll-forward adds capex).
- **Exit cap (plan)** is the exit cap rate in the asset's plan (the deal's
  exit cap input; the business plan's exit cap once phase I is built).
  **Implied cap now** is forward NOI ÷ fair value at the As of quarter.
- **Fund total:** gross asset value each quarter and its change, which
  includes acquisitions and sales, plus the **same-store** change: only
  assets valued in both quarters. The fund exit cap is weighted by value.

**PDF report: valuation adjustments** (**Export PDF**, `lib/valuationPdf.js`).
A landscape PDF for the As of quarter and the three before it:
1. **Fund summary:** gross asset value, change in $ and %, and same-store %
   by quarter, with the fund's value-weighted exit cap.
2. **By asset:** value, change $ and change % each quarter, exit cap (plan)
   and implied cap.
3. **Adjustment detail:** every asset-quarter whose value changed: prior and
   new value, change, basis (appraisal, internal mark, roll-forward, cost)
   and support (appraiser, cap rate, capex, notes).
4. **Effect on returns** (`valuationImpact`): for each quarter with
   adjustments, returns with the adjustments against returns with each
   adjusted asset carried at its prior-quarter value plus capex (everything
   else unchanged; the whole fund is rerun), for each adjusted asset, the
   fund (gross) and the fund (net LP):

```
Adjustment      = fair value − (prior-quarter value + capex this quarter)
Interim IRR     = without / with, and the change in points
Equity multiple = TVPI, without / with, and the change
Cash-on-cash    = trailing-12-month distributions ÷ contributions
                  (cash-based, so the same with or without)
Cash yield on equity NAV = trailing-12-month distributions ÷ equity NAV
                  (without / with)
```

   IRRs under one year show "n/m", as elsewhere on the tab.

**Import / export.**
- **Import:** Excel or CSV with Asset, Quarter end, Fair value, and
  optionally Source, Appraiser, Cap rate, Capex since last mark and Notes.
  Assets are matched by deal name. Any date in a quarter, or "2026 Q2", is
  filed at that quarter end.
- **Export history:** writes every asset-quarter (the importable columns
  first, then the computed values, including the change from the prior
  quarter in $ and % and the exit cap) and the fund-by-quarter table (with
  the change in gross asset value).
- Marks are saved with the workspace and included in Export / Import
  workspace.

### 7.16 Asset Summary (`lib/assetSummary.js`)

One row per asset in the selected fund.

| Column | Source |
|---|---|
| Status | Pipeline (acquisition date after today), Owned, or Sold (exit date on or before today) |
| Acquired / Exit, hold | The deal's acquisition date and hold |
| SF, price, $/SF | Deal inputs |
| Location | City and state from the deal's Location |
| Units | Rent roll unit count, else the deal's Units field |
| Occupancy | Leased SF ÷ rent roll SF; — without a rent roll |
| Vacancy | Vacant SF ÷ rent roll SF (100% − occupancy); — without a rent roll |
| WALT | Rent-weighted remaining lease term from today (§7.19); — without a rent roll |
| Loan, loan / price, equity | The full engine. The loan includes lender-funded capex, so loan / price can exceed the LTV input. |
| Sized by | The loan sizing test that sets the loan: LTV, DSCR, LTC or Debt Yield (§7.6) |
| Sizing cushion | How much the loan could grow before the next-tightest test binds: next limit ÷ binding limit − 1; amber under 5%; — when only one test is on. The Details panel lists each test's target, the loan it allows and its room. |
| Funding | From capital activity tags: Capital call, Sub line, Call + line, Not tagged, or — when the fund has no activity |
| Yr-1 NOI, going-in cap, exit cap, exit value, IRR, multiple, yr-1 CoC, yr-1 DSCR | The full engine on the deal's current inputs (gross, before fund fees and promote) |
| Fair value, NAV, unrealized, TVPI | The Valuation tab (§7.15), as of the last completed quarter |

**Fund total row:**
- **Summed:** SF, units and all dollar figures.
- **Occupancy, vacancy and WALT:** across assets with a rent roll only
  (occupancy and vacancy weighted by SF, WALT by annual rent).
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
| Field | What changed, e.g. "Deal Screener › Exit cap (%)" or "2026-06-30 › Fair value ($)" |
| From → To | Old and new value ("added" / "removed" for whole items) |

**What is tracked:**
- **Deals:** Deal Screener inputs and the deal's own inputs. For linked
  deals, fields that come from Deal Screener are logged only on the Quick
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
default (**Database (verified)**), with **Working log** for the working
log kept in the workspace. Signed in, those entries also use your email.

**Storage.** The working log is saved with the workspace (`auditLog`) in
the database, so it also goes with exports. Nothing is kept in the browser.

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
- **Rent / NOI growth −x pts** (Lower Rent Increases, 0–15%): cuts market
  rent growth (or NOI growth on direct-NOI deals); a cut larger than the base
  growth means rents fall. Rent bumps written into existing leases are
  unchanged.
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

### 7.19 Units and leases (`lib/leases.js`)

Reference figures from each deal's rent roll (`inputs.units`), shown on the
Unit Roll tab and in the Asset Summary. They don't change the cash flow.

**Lease end and months remaining.** The engine (§7.1) runs each unit from
its **months remaining**, counted from the analysis start: the deal's
acquisition date, or today when it has none.
- Entering a **Lease end** date sets months remaining = whole months from
  the analysis start to that date (at least 1 for an occupied unit).
- Editing months remaining clears the entered date; the date then shown
  (grey) is the analysis start + months remaining.
- Importing a rent roll with lease end dates does the same.

| Figure | Calculation |
|---|---|
| Units, leased | Rent roll rows; rows with status Occupied |
| Occupancy | Leased SF ÷ total rent roll SF |
| Annual rent (per lease) | Contract rent $/SF × SF |
| WALT | Σ (years from today to lease end × annual rent) ÷ Σ annual rent, over occupied units; expired leases count 0 years |
| In-place rent | Σ annual rent ÷ leased SF |
| Mark to market | Market rent (deal input) ÷ in-place rent − 1 |
| Rolling 12 mo | Annual rent of leases ending within 12 months ÷ total annual rent |
| Expirations by year | Leases, SF and annual rent by calendar year of lease end; leases already past their end (holdover) fall in the current year; % and cumulative % of rent |

**Critical dates** (from 30 days ago to 12 months ahead; amber within 90
days, red when past):
- **Lease expires:** the lease end.
- **Renewal notice due:** lease end − renewal notice months, when the unit
  has renewal options and a notice period.
- **Termination notice date:** early termination date − termination notice
  months, when a termination date is entered.

**Tenant SIC codes.** Each unit has an **SIC** column (4-digit Standard
Industrial Classification code, `lib/sicCodes.js`) next to Business and a
separate, optional **NAICS** column.
- **Suggested from the business:** typing or changing a unit's Business
  description fills the SIC code when it is blank or still the code
  suggested for the previous business; a code you typed yourself is kept.
  The placeholder shows the suggestion. Matching is by keywords, specific
  first (e.g. "HVAC equipment wholesale" → 5075, "HVAC installation" →
  1711, "stainless brewing equipment" → 3443, "craft brewery" → 2082);
  a business it can't place stays blank.
- **Picking a code:** the SIC cell offers a list of about 90 codes common in
  light industrial and flex tenants (manufacturing, trades, wholesale,
  warehousing, auto and repair services); any other 4-digit code can be
  typed. The industry name shows under the code.
- **Tenant industries (SIC):** a table under the lease summary with leases,
  SF, % of leased SF and annual rent by SIC code, largest first (units
  without a code show as "—").
- **Sample tenants:** generated sample units named "Tenant 001", … were
  given fictional businesses with SIC codes (names like "Summit Cabinet
  Works"); every other tenant with a business got the suggested code.
  Saved workspaces get this once when they open (`sicModel`), saved as a new
  version. Lease abstracts record the tenant's business and SIC code from
  the permitted-use clause (Leases tab).

**Rent roll import and export.** **Import CSV / Excel** reads `.csv` or
`.xlsx`; only an SF column is required (§11.5 lists every column and the
header names accepted). Numbers may include `$`, `,` and `%`; dates may be
`YYYY-MM-DD`, `M/D/YYYY` or Excel dates. Missing values take the deal's
defaults. Importing over an existing rent roll asks first. **Download
Excel** (or **Download template** when empty) writes the same columns, so a
downloaded file can be edited and imported back.

### 7.20 Fund expenses and fund cash (`lib/fundExpenses.js`)

Fund-level expenses are the **management fee** and the **sub line's
interest and unused fees**. Property management and construction management
fees stay at the asset level. Model Fund I's former 1.5% asset management fee
(on each asset's equity) was removed when the fee moved to the fund, so it
is charged once.

**Management fee** (Model Fund I: 1.5% a year):

```
Fee each quarter = fee % ÷ 4 × basis, charged on the first day of the
                   quarter (in advance), from the day after final close
                   until the last asset is sold
Basis            = LP commitments (total commitments × (1 − GP %))
                   while the quarter starts on or before the investment
                   period end; then LP invested capital in assets still
                   held (purchase equity × (1 − GP %))
                   ("Invested" basis: LP invested capital throughout)
```

Model Fund I: $100M × 95% = $95M of LP commitments → $356,250 a quarter
through 2027. Fees are borne by LPs only.

**Sub line costs:** interest on the balance (forward 30-day average SOFR +
spread, Actual/360) and the unused fee on the undrawn facility, added up by
month and due at month end. With actual activity, past months use the actual
line balance; future months the projected one. Draws made to pay expenses
bear interest at the line rate until repaid.

**Fund cash and payment order.** All fund cash and all sub line capacity
are used before capital is called:

1. Each expense is paid from fund cash, down to zero.
2. The rest is drawn on the sub line that day, up to the line's undrawn
   capacity. Expense draws stay on the line, bearing interest at the line
   rate, until repaid.
3. Only if cash and the line are both exhausted is capital needed: the model
   assumes one call at quarter end (the fee part from LPs only, the rest
   from LPs and GP by commitment). Calls are never generated as activity:
   you enter them, bundled no more than quarterly. Fund Return flags
   any past quarter that needed a call you haven't entered.
4. At quarter end the assets' operating income (after their own reserves,
   §7.9) comes into fund cash. It first repays expense draws, then rebuilds
   the minimum cash balance of `cashReserveQuarters` (2) quarters of
   projected expenses; the rest is distributed.
5. Sale proceeds repay any expense draws before they are distributed.
   After the last sale nothing is kept.

Fund Return shows this in **Fund expenses & fund cash**: lifetime fees,
sub line costs, capital needed, distributions, cash and expense draws now,
this quarter's fee, and **Show by quarter** for the full schedule (fee
basis, costs, paid from cash, drawn, income, draws repaid, capital needed,
distributed, cash and expense draws at end, minimum). Valuations adds fund
cash to NAV and deducts expense draws in the net LP liquidation.

**Automatic capital activity.** For every completed month and quarter up to
today, the ledger lists the fee and sub line cost entries (**Fund expense
paid**), the line draws that paid them and their repayments from income or
sale proceeds, with Source **Automatic** (hover for how each was paid). No
capital call is ever automatic. They are recalculated
whenever the model changes and are not stored. **Keep** turns a quarter's
automatic entries into stored entries (Source "Automatic, kept"); a quarter
with fee or sub line interest entries of your own is not generated. Entries
you add or import are never changed. Fund expense paid entries don't change
called capital or the line balance.

### 7.21 Projected cash-on-cash yield (`lib/cashYield.js`)

**Asset** (Asset Return tab): each hold year's pre-tax cash flow (after debt
service, caps and asset-level fees) ÷ the equity invested at closing, with
the average, low and high over the hold.

**Fund** (Fund Return), by calendar year:

```
Equity invested  = Σ each asset's purchase equity × days held in the year
                   ÷ days in the year (time-weighted)
Gross yield      = assets' operating cash flow in the year ÷ equity invested
Net yield        = operating income distributed to investors in the year
                   (after fund expenses, sub line costs and the fund cash
                   reserve) ÷ equity invested
Life average     = Σ cash ÷ Σ equity-years (gross and net)
```

The life averages also appear in the fund's header, in a **Cash-on-cash**
box to the right of Net LP (gross · net). Sale proceeds are excluded.
Under the fund's payment order (§7.20), income
first repays expense draws and rebuilds fund cash, so net yield can be zero
for years; the year of the last sales includes the release of asset
reserves and fund cash.

### 7.22 Cost of capital (hurdle rate)

Each fund's **hurdle rate** (cost of capital: the annual return investors
require) defaults to its **preferred return** (`prefPct`, Model Fund I: 9%)
and follows it. To override it, type a rate on the card or in the fund
terms (`hurdleRatePct`); **Use pref** (or a blank field) returns to the pref. Fund Return → **Cost of
capital** measures the gross, net fund and net LP cash flows against it:

```
NPV               = Σ dated cash flows ÷ (1 + hurdle)^(days from final close ÷ 365)
Spread            = IRR − hurdle
Profitability idx = PV of money returned ÷ PV of money invested
```

Positive NPV (index above 1.0x) means the fund creates value above its cost
of capital. (Asset Return's NPV still uses its own 8% rate.)


### 7.23 Sell / hold analysis (`lib/sellHold.js`)

On a **decision date** (default today; saved per fund), each fund asset is
analysed three ways. Hold years are counted from the purchase date, up to the
fund's final extended term.

```
Year-ahead NOI     = NOI over the 12 months after the date (pro rata of the
                     hold years it spans, from the rent-roll cash flow)
Value              = year-ahead NOI ÷ cap rate (the asset's exit cap, editable
                     per asset on the tab)
Net proceeds       = value − sale costs (the asset's sale cost %) − loan balance
```

- **Sell now:** net proceeds on the decision date.
- **Hold to year n:** the cash flows after the decision date (the current
  year pro rata), then a sale at the end of hold year n, valued the same way
  (year n + 1 NOI ÷ cap rate), so selling now and later are comparable.
- **Refinance and hold to year n:** on the decision date a new interest-only
  loan of the lower of **LTV × value** and **year-ahead NOI ÷ (min DSCR ×
  rate)** repays the old loan; rate = forward SOFR + spread; financing costs
  are a % of the new loan; **cash-out** (new loan − old balance − costs) is
  paid out (negative = a paydown is needed). Debt service after that date is
  the new loan's, and the sale repays it. Defaults (editable per asset): 65%
  LTV, 1.25x DSCR, SOFR + 2.00%, 1% costs, 5-year term.

For each option:

| Measure | Calculation |
|---|---|
| Forward IRR | IRR of −(net proceeds now) + the cash flows after the decision date (incl. any cash-out) + the later sale |
| Spread to hurdle | Forward IRR − the fund's hurdle rate (§7.22) |
| NPV vs selling | Those flows discounted at the hurdle to the decision date; positive = holding beats selling |
| Forward multiple | Cash from the decision date on (income, any cash-out, the later sale) ÷ equity left in (net proceeds now less any cash-out); — for Sell now |
| Total IRR, equity multiple | Since purchase, under that option: total distributions ÷ equity invested |
| Breakeven exit cap | Exit cap at which that option's NPV versus selling is zero |

IRRs over less than a year show n/m. The **Equity multiple** tile shows
the suggested option's multiple since purchase and its forward multiple;
the **Whole fund** table shows each asset's equity multiple under the
decision chosen for it. The **suggested** option is the one
with the highest NPV versus selling among options that sell within the fund
term (extension years only if nothing inside the term is better).

**Fund scenario.** Each asset gets a decision (base plan, sell now, hold to
year n, refinance and hold). The fund is re-run with those cash flows (asset
income and reserves, sale proceeds, cash-out, the sub line, fund expenses and
the waterfall) and compared with the base plan: gross, net fund and net LP
IRR and multiple, net LP NPV at the hurdle, LP and GP distributions. Base
plan sales use the underwriting (final-year NOI); scenario sales use the
year-ahead NOI above. Decisions, cap rate overrides, refinance terms and
saved scenarios are stored with the fund (`funds["Fund name"].sellHold`) and
appear in the change log.

### 7.24 Lease abstracts (`lib/leaseAbstract.js`)

Abstracts are made in a **Claude session** with the CREparser Lease
Abstraction connector, not in the app, and saved on the lease row.

**Workflow** (Leases tab, owners and editors):
1. Upload the lease and its amendments in order (base lease first).
2. **Abstract with Claude → Create prompt.** The prompt holds the lease id,
   asset, linked units, a 1-hour link to each document in order, the
   template below, and how to save. **Copy prompt** and paste it into a
   Claude chat with the CREparser connector. Links expire after an hour:
   **Make a new prompt** if needed.
3. The session imports the PDFs, combines them in order, reads the whole
   lease, drafts the abstract and runs the connector's validation until
   every quote, figure and date matches the PDF. It does **not** open the
   connector's viewer unless you ask: on the free CREparser plan, a document
   counts against the allowance only when its abstract is shown there, while
   validating is free. The app's **View abstract** shows it instead.
4. **Save:** with the Supabase connector the session saves it directly
   (`save_lease_abstract`, as you); otherwise paste the JSON it returns into
   **Save abstract**. The app accepts the stored object or the connector's
   draft (`{ "leases": [ … ] }`, also inside a code block) and checks that
   it has fields with keys, values and statuses, dated critical dates and
   titled risks. Status becomes **Abstracted – review**.
5. **View abstract** (everyone): key terms by template group; rent
   schedule; critical dates (days to go, amber within 90 days, grey once
   past) with notice and action; risk flags (high, medium, low). Each item
   shows its clause (§) and quote, and **p. N** opens that document at that
   page (combined page numbers are mapped back to the file). A term changed
   by an amendment is tagged "Amended by …" and shows the earlier value with
   its own quote. The badge says whether the connector validated it.
   **Re-abstract with Claude** replaces it; **Remove abstract** deletes it.

**Template "Light industrial (Model Fund I)"** (67 fields; also saved in
the connector for its Excel / CSV export):
- Standard: parties and premises (incl. tenant business and SIC code),
  term, rent, security, options.
- The eight added groups: permitted use, exclusives and co-tenancy;
  environmental and hazardous materials (incl. baseline); insurance (and
  indemnity); maintenance and repairs (roof, structure, HVAC, repair caps);
  operating details (hours, parking, truck court and yard, loading docks,
  signage, outside storage); operating expense terms (expenses, taxes, cap,
  management fee cap, audit rights, base year); legal (SNDA, estoppel,
  tenant and landlord default and cure, holdover, relocation, assignment,
  governing law, notices); improvements and TI (allowance, unpaid
  allowance balance, landlord's work, alterations, surrender,
  restoration).
- **Tenant business and SIC code** come from the permitted-use clause (SIC
  is a calculated field naming the business and code, from the §7.19
  list), so applying the abstract can set the unit's SIC code.

Field statuses: **Found** (quoted), **Calculated** (arithmetic shown),
**Unclear** (the ambiguous clause is quoted), **Not in lease** (no relevant
clause anywhere).

**Pilot.** The Mill Creek Business Park sample lease with its first
amendment (`docs/sample-leases/07…` and `07a…`) was abstracted this way and
validated by the connector (67 fields, 12 rent periods, 10 critical dates,
6 risk flags; draft b8158a5a…). The result is in
`docs/sample-leases/abstracts/07-mill-creek-snohomish-brewing.json`: paste
it into **Save abstract** after uploading those two PDFs to Mill Creek to
see a finished abstract.

**Sample abstracts.** Validated abstracts of eleven sample leases are in
`docs/sample-leases/abstracts/`, one JSON file per lease, each with its
connector draft id in `app.draft_id`:

| File | Asset | Tenant | Notable terms |
|---|---|---|---|
| 02-airport-flex… | Airport Flex Park | Desert Aero Parts | Personal guaranty (12 months' rent); exclusive on aircraft parts sales in Building B; renewal notice by 8/29/2027 |
| 03-route-9… | Route 9 Small Bay | Cascade Cabinet Works | Expires 5/31/2027; renewal notice due 11/30/2026 |
| 04-harbor-light… | Harbor Light Industrial | Portside Marine Electric | With the first amendment: Suite 212 added 9/1/2025 (3,400 RSF total, 9.44% share); $8,800 allowance request deadline 6/30/2026 passed; battery storage up to 2,000 lb |
| 05-ridgeway… | Ridgeway Trade Center | Lone Star HVAC Supply | Tenant termination right (effective 7/31/2027, notice by 1/31/2027); ROFO on Suite 310 |
| 06-canal-street… | Canal Street Workshops | Bayou Fabrication Studio | Gross lease; personal guaranty |
| 07-mill-creek… | Mill Creek Business Park | Snohomish Brewing Equipment | With the first amendment: extended to 3/31/2032, renewal option deleted |
| 08-southpoint… | Southpoint Flex | Sunrise Solar Installers | Lithium battery storage; outside storage yard |
| 09-granite-ave… | Granite Ave Industrial | Granite State Signs & Graphics | Landlord relocation right; 2 months' free rent |
| 12-eastside… | Eastside Distribution Hub | Inland Northwest Grocery | 10-year term; ROFR on Dock Suite E |
| 13-northgate… | Northgate Flex Center | Hill Country Robotics | Termination right and Suite 160 expansion option (both by 1/31/2027); 3 months' free rent |
| 14-riverside… | Riverside Commerce Park | Citrus Belt Logistics | Landlord relocation right; 200% holdover |

Each draft is produced by `scripts/sample-leases/abstract_all.py` (all 67
template fields, rent schedule, critical dates and risk flags, with every
quote checked against the PDF text) and then validated by the connector.
Where the PDF's rent table splits a date across cells (free-rent rows), the
row's dates are recorded as calculated from the Commencement Date. All 12
are validated, including Lakeshore (10 with its first amendment, which
deletes the early termination right, adds one five-year renewal option at
95% of market and abates rent for February and March 2025; SIC 7538), and
all 12 are attached to their leases in the Model Fund I workspace (11/22).
To use one elsewhere, upload that lease's PDF on the asset's Leases tab and
paste the JSON into **Save abstract**.

The sample leases' tenants and suites are not on the generated rent rolls
(for example, Desert Aero Parts' Building B, Suite 104 is not a unit at Airport
Flex Park). Attaching an abstract does not change the Unit Roll; the tenant
reaches the rent roll only when you apply the lease (§7.25), replacing a
unit or adding a new one. That is your choice to make: nothing was applied
to the live workspace.

### 7.25 Applying abstracts to the rent roll (`lib/leaseApply.js`)

**Apply to rent roll** (Leases tab, owners and editors) reads the abstract
into rent roll fields and shows them next to the chosen unit:

| Rent roll field | From the abstract |
|---|---|
| Tenant | `tenant`, the name before ", a … company/corporation" |
| SF | `rentable_area` (all suites the lease covers) |
| Status, months remaining | occupied when the expiration is on or after the analysis start; months from the analysis start to the expiration |
| Lease type | `lease_type`: modified gross → MG; gross → Gross; net / NNN → NNN |
| Lease start / end | `commencement_date` / `expiration_date` |
| Rent $/SF | the rent step in force at the analysis start (acquisition date, else today); a lease starting later takes its first step |
| Escalation % | the % in `rent_escalations`; for fixed $ increases, the % between the first two paying steps (noted; the steps drive the cash flow) |
| Rent steps | the rent schedule as dated steps, $/SF/yr on the whole leased area; abated months are $0 steps; suites with their own schedules are added up |
| Security deposit | first $ amount in `security_deposit` |
| Guarantor | `guarantor` (blank when None) |
| Expense recoveries | lease type, tenant's share and expense cap |
| Renewal options, years, notice | the counts in `renewal_option` ("One (1) option(s) of five (5) years, on at least nine (9) months' notice"); 0 when None |
| Renewal rent | "95% of market", "greater of current rent and 95% of market", or "fixed $x" |
| Early termination date, notice, fee | the termination critical dates (notice months = notice date to effective date) and any $ fee; cleared when None |
| Other rights | expansion / ROFR / ROFO, purchase option and the landlord's relocation right |
| Business, SIC | the abstract's tenant business and SIC code |

- **Existing unit**: fields that differ are ticked (untick any you want to
  keep); fields that match show "same". Months remaining always follows an
  applied lease end. **New unit**: every field from the abstract, other
  assumptions (TI, LC, renewal %, downtime, expenses) from the deal's
  defaults, named after the abstract's premises (editable).
- Before you apply, the panel shows units / vacant, occupancy (SF), WALT
  (by rent) and mark to market now → after.
- Applying sets the lease to **Applied to rent roll** (with the date and
  who applied it) and links it to the unit. The Change log records each
  field (unit › field, from → to) with the source "From lease abstract
  (tenant)", in the working log and the database's verified log.
- **Rent steps in the cash flow** (`simulateUnit`): while the lease on the
  rent roll at the analysis start runs, each month's rent is the step in
  force on that month's date (abated months $0). After the last step the
  rent escalates from it at the unit's escalation %. Once the lease rolls,
  the steps no longer apply. Units without steps are modelled as before.
- **Renewal options in the cash flow**: when the lease ends and the unit has
  options left with a readable option rent, the tenant renews on the
  option if the option rent is at or below market that month: no
  downtime, renewal TI, commissions and free rent, rent = option rent,
  term = years per option (else the unit's new-lease term). Otherwise (or
  with no options left) the usual renewal probability and re-leasing
  apply. "Greater of current rent and x% of market" uses the higher of the
  two, so it is exercised only when current rent is at or below market.
- **Mismatch flags**: each abstracted lease's card shows "✓ Rent roll
  matches the lease", "⚠ Rent roll differs: …" (hover for each value) or
  "Not on the rent roll yet". On the Unit Roll, a unit linked to an
  abstracted lease shows "✓ lease" or "⚠ n vs lease". Flagged fields: tenant,
  SF, lease start and end, rent $/SF, escalation, lease type, security
  deposit and renewal options. A lease covering two rent roll units
  compares the lease's total SF with each unit, so SF is flagged on both.
- **Unit Roll → ▸ Lease details** lists a unit's rent steps, with **Remove
  steps** to go back to rent and escalation.

### 7.26 Fund lease views and reports (`lib/leaseViews.js`)

The Leases tab has three views: **Leases** (the cards), **Critical dates**
and **Risk flags**, each for the selected asset or the whole fund
(including saved deals in the fund).

**Critical dates**: every `critical_dates` entry of every abstract
(expirations, renewal and termination notices, option and allowance
deadlines, rent increases), plus, for owners and editors, **financial
statements due** (§7.27). SNDA and estoppel response periods (e.g. "within
ten (10) days after request") run from a request, so they are listed last
as "On request". Oldest first; **red** when past, **amber** within 90 days.
Default view: upcoming dates and those past in the last 90 days, without
lease-signing and commencement history; **All dates** shows everything.
Filters: asset, type. Each row shows the notice window, action required,
clause (hover for the quote) and, for calculated dates, the arithmetic.

**Risk flags**: every flag with its severity, clause and quote, most severe
first. Types for filtering are matched on the flag's title and detail:
termination rights, relocation, expenses and caps, environmental, guaranty
and credit, options and rights, rent and concessions, other.

**Exports**: **Export to Excel** in each view (the rows shown, with
quotes and pages). **Abstraction report (PDF)**: for the asset or the whole
fund, a summary page (each lease's premises, SF, expiration, current rent,
status, validated), upcoming critical dates (amber within 90 days) and all
risk flags, then one section per lease: summary, every key term by group
with its clause and status, rent schedule, critical dates and risk flags
with quotes.

**Asset Summary**: *Leases abstracted* = abstracted ÷ leases on the Leases
tab ("—" with none; amber when some aren't abstracted). Details shows WALT
(rent roll), leases abstracted and applied, the next critical date from
today (after any past ones), the number of risk flags (high in red), and
**Open Leases tab**. The Asset Summary Excel export does not include these
yet.

**Reminders** (proposal; nothing is set up): the app never sends messages.
A Claude scheduled task could run weekly, read the critical dates through
the Supabase connector and send you a phone notification listing notice
deadlines in the next 90 days. Ask Claude to set it up if you want it.

### 7.27 Tenant credit (`lib/tenantCredit.js`)

**Tenant credit** on each lease card (owners and editors only) holds credit
reports, financial statements, tax returns and bank references for the
tenant or a guarantor: type, whose (and the guarantor's name), source
(e.g. bureau, CPA), audited or not, report date (credit reports) or period
end (statements), the PDF, who uploaded it, and key figures:

| Figure | Check |
|---|---|
| Credit score, rating | Score within 0–1,000 |
| Revenue, net income, EBITDA | Net income not above revenue; EBITDA not below net income |
| Current assets, current liabilities, current ratio | Ratio calculated from its parts if blank; flagged if an entered ratio differs by more than 2% |
| Total debt, equity, debt / equity | Same |
| Rent as % of revenue | Lease's annual rent (unit rent × SF, else the abstract's current monthly rent × 12) ÷ tenant revenue (tenant documents only) |

Figures are entered by hand or **read with Claude**: the section makes a
prompt with a one-hour link to the PDF for a Claude session; paste the JSON
it returns (figures plus the quote for each) and the app checks and saves
it ("figures read by Claude").

**Flags**: latest tenant or guarantor statements more than 12 months old;
the latest credit score below the previous report's; debt / equity up more
than 10% from the previous tenant statements; no documents on file; and a
lease clause requiring financial statements (found in the abstract's terms
and risk flags, e.g. "within one hundred twenty (120) days after the end of
each fiscal year"). For such a clause the next due date is the period after
the latest statements on file (or the last calendar year end) plus the
days; it appears in Critical dates as "Financial statements due" (red when
overdue). None of the sample leases has such a clause.

**Apply rating to unit**: when the lease is linked to a unit, the newest
credit report's rating can be applied to the unit's Credit rating, logged
as from the credit report.

**Privacy**: rows are in `lease_credit_documents` and files under the
lease's `credit/` folder in the `leases` bucket; both are owners and
editors only (viewers can't list or open them). The change log records
that a document was added, changed or deleted, never its figures.

**Sample documents**: `docs/sample-deal-docs/tenant-credit/` (fictional):
two Desert Aero Parts credit reports (score 78 → 64), FY2024 and FY2025
statements (debt / equity 0.60 → 1.05), the guarantor's June 2024
personal statement (stale) and a Cascade Cabinet report; the expected
figures and flags are in `expected.json`.

### 7.28 Deal and fund documents (`lib/dealDocTypes.js`, `lib/dealDocApply.js`)

Each document is stored with its PDFs (in order) in `deal_documents` and
the private `deal-docs` bucket; fund-level documents (LPA, PPM) have no
asset and are kept with the fund's name. The abstract has `fields` (each
with value, status, clause and quotes), `critical_dates`, and per type a
list: `units` (rent roll), `policies` (insurance), `limits` (LPA / PPM),
`conditions` (IC memo).

**Checks.** OM, rent roll, T-12 and LOI can be validated by the CREparser
connector (`om_validate`, `rentroll_validate`, `t12_validate`,
`loi_validate`; the prompt forbids the `*_show` tools so no free documents
are used). The other types have no validator. Every abstract is also
checked in the app: each figure and date in a found value must appear in
its quote ("checked locally"; problems listed in the viewer). The badge
reads "✓ Validated by the connector" or "Not connector-validated".

**What each type applies** (field → model):

| Document | Applies to |
|---|---|
| Offering memo | Property name, street, city, state, ZIP, square footage, unit count, year built, purchase price (asking; the note shows the difference from the underwritten price), year-1 NOI (used with Direct NOI), vacancy = 100 − occupancy. **New deal from this OM** creates a deal with all of them (in the current fund) and moves the OM to it. |
| Rent roll | Units matched by name: new, changed (tenant, SF, status, lease type, rent, lease end, escalation) and not in the document. **Merge** updates and adds; **Replace** also removes units not in the document. New units take the deal's assumptions; SIC is suggested from each business; months remaining follow the lease end. |
| T-12 | Each expense line ÷ the deal's SF → real estate tax, insurance, utilities, maintenance, janitorial $/SF; other income $/SF; management fee % = fee ÷ (rent + other income + recoveries). Lines more than 10% from underwriting are highlighted. |
| LOI | Purchase price; deal terms (`dealTerms`): deposit, due diligence and closing days, financing contingency, LOI date. |
| PSA | Purchase price; deal terms: deposits, the date they go hard, due diligence expiry, closing date, reps survival and cap, PSA date. Title, survey, closing and other deadlines go to critical dates. |
| Final IC memo | The as-approved baseline (`icApproved`: approval date, approvers, price, total cost, loan, equity, year-1 NOI, going-in and exit caps, IRR, multiple, cash-on-cash, hold, capex), a reference that doesn't change the model, and the conditions of approval (`icConditions`). **IC approved vs current** compares the baseline with the current model (Documents tab and Asset Summary → Details); each condition is ticked off with who and when (logged). |
| Closing statement (acquisition) | Purchase price and acquisition date (actual); closing costs replaced by one line for the statement's total; `actualBasis` (loan proceeds, equity funded, seller credits, prorations, deposits transferred), shown in Asset Summary → Details. |
| Closing statement (disposition) | `realizedSalePrice` and `realizedSellingCosts` replace the modelled exit value and selling costs (§7.7); hold = whole years from acquisition to the sale; sale date, loan payoff and net proceeds recorded. |
| Loan agreement / rate cap confirmation / appraisal | See below. |
| Insurance certificate | Owner or tenant (linked to the lease). **Check coverage**: policies lapsed or expiring within 60 days; for a tenant, the lease's requirements (general liability per occurrence and aggregate, umbrella, auto, pollution, workers' comp, additional insured, waiver of subrogation, read from the lease abstract) against the certificate. Expiry dates go to critical dates (amber 60 days before, red when lapsed). Loan insurance covenants come with phase F. |
| LPA / PPM | Fund terms: commitments, GP commitment, management fee, preferred return, catch-up, investment period, term, extensions and their length, sub line size. Investment limits (single investment, tenant, state, metro, property types, non-core, fund and asset leverage, hold, other), each with its clause and quote, stored in the fund's `limits` (phase L checks actual vs limit). Also shown in **New fund / Edit all terms** (LPA / PPM panel: upload, then **Use** each term or limit). |

**Loan agreement** (validated by the CREparser connector,
`loan_validate_abstract`): loan amount → `loanAmountActual` (the engine
uses it instead of the sizing tests; "Loan agreement" is shown as the
binding test), spread, floating rate, initial term, extensions, extension
fee, IO and amortization years; covenants (`loanCovenants`: DSCR, debt
yield, LTV, testing, cure); and `loanTerms` (lender, maturity, index floor,
the rate cap requirement: maximum index strike, minimum counterparty rating
and days before expiry a replacement is due; prepayment, reserves,
reporting). The Debt tab's **Loan agreement and executed rate caps** panel
shows the terms and the covenant tests by year from the model (DSCR = NOI
÷ debt service, debt yield = NOI ÷ loan balance, LTV = loan balance ÷
purchase price; failures in red). Maturity, extension notice deadlines and
other dated terms go to critical dates.

**Rate cap confirmation** (the executed trade confirmation; read and
checked locally): counterparty and rating, trade, effective and
termination dates, notional, index, strike, premium and payment date, day
count, calculation agent, assignment to the lender. Upload it on the Debt
tab (**Upload cap confirmation**) or the Documents tab; apply it on the
Documents tab. Applying records it in `executedCaps` for the hold year its
effective date falls in and puts its terms in the cash flows: the premium
(initial cap: `capPremiumAmount`; a renewal: that year's replacement cost)
and the all-in strike (index strike + spread) for the years it covers. The
rate cap schedule marks that year **executed** with the provider; renewals
not yet bought stay modeled, and changing the cap settings keeps executed
caps. **Checks** against the applied loan agreement: strike above the
maximum, notional below the loan, counterparty rating below the minimum
(S&P / Fitch scale; Moody's mapped), term under a year, and expiry before
the loan matures (a replacement is needed). The cap's expiry and the
replacement deadline (expiry minus the loan's days, 30 if none) go to
critical dates.

**Appraisal** (validated by the CREparser connector, `appraisal_validate`):
appraiser, effective date of value, report date, interest appraised, market
value, direct cap rate, NOI and the value by each approach. **Apply** sets
the mark of the quarter the effective date falls in (Valuation tab):
fair value, source "appraisal", appraiser, cap rate, a note citing the
document and page, and the document link (`docId`, `page`); the Valuations
tab's marks show a **PDF p. n** link. It warns when that quarter is inside
the 6-month cost hold (the asset is held at cost, so the value isn't used),
says which mark it replaces, and compares the appraisal with the
underwriting: NOI vs the underwritten NOI of that hold year, the cap rate
vs the going-in and exit caps (bp), and the value vs the purchase price.

**Applying** marks the document "Applied" with the fields taken
(`applied_fields`) and logs each change (field, from → to) with the source
"From <document>" in the working log and the database's verified log.

**Critical dates**: every document's dated deadlines and insurance
expirations appear on Leases → Critical dates (type "Document deadline" /
"Insurance expires").

**Samples**: `docs/sample-deal-docs/deals/` (fictional) has a full set for
Airport Flex Park, a test sale of Route 9 Small Bay and Model Fund I's LPA
and PPM, with abstracts (see its README).

### 7.29 Rent delinquency, estoppels, CAM and billing (`lib/delinquency.js`, `lib/dealDocApply.js`)

**Aged receivables.** Upload Yardi's aged receivables report (CSV or Excel)
on the Unit Roll tab, one per month-end. The report date comes from the
title ("as of 10/31/2026"); the header row is found by its column names
(Property, Tenant Code, Tenant, Unit, Charge Code, Current, 0-30, 31-60,
61-90, 91-180, Over 180, Prepayments, Total). Property codes are mapped to
assets by name or Yardi code, and tenant codes to units by tenant name or
unit; the map is kept for later months. Credits (prepayments) are negative.

| Measure | Calculation |
|---|---|
| Past due | 1–30 + 31–60 + 61–90 + 91–180 + over 180 (current charges are not late) |
| % of monthly rent | past due ÷ the monthly rent of the asset's (or fund's) occupied units (rent PSF × SF ÷ 12) |
| Months owed | a tenant's past due ÷ its monthly rent |
| Net of deposits | past due − the unit's security deposit (not below zero) |
| Change vs last month | this month's fund past due − last month's |
| Collections (tenant ledger) | payments ÷ charges, vs 100% − the asset's credit loss % |

Each tenant shows its lease's default and cure terms. Stored on the fund as
`funds[name].delinquency` (§11.7).

**Estoppel check.** Each estoppel row compares the estoppel with the lease
abstract and the rent roll unit: expiration and commencement dates, monthly
base rent (the abstract's rent schedule on the estoppel date), security
deposit, number of renewal options, amendments, tenant defaults, landlord
defaults or claims (high), and prepaid rent. **CAM reconciliation:** for each
tenant with an abstracted lease, recoverable = lease share × (total expenses
− management fee above the lease's cap × gross revenue) − base year amount;
over-recovery (billed above recoverable) is owed back to the tenant. A billed
share different from the lease's, or a fee over the cap, is flagged.
**Billing:** each month's billed base rent vs the lease's rent for that month.
Each estoppel, CAM and billing card on the Documents tab shows a red
**⚠ n issues** badge with the differences, without opening **Check**.


### 7.30 Business plan and budget vs. plan (`lib/businessPlan.js`)

**Revisions.** Revision 1 is the plan at closing, seeded from the IC memo
(thesis, strategy) and the closing model: a leasing row per unit (vacant →
lease up; a lease ending within the hold → renew if its renewal probability
is 50% or more, else re-tenant; target rent = in-place × 1.03, vacant at the
unit's rent), the capex budget as a project, milestones (each lease action
three months before expiry, lease-up within six months, the capital plan,
the annual review), KPI targets from the model and the exit from the hold
and exit cap. A revision is never edited: every save adds the next one with
who, when, the note, the reason and the list of changes from the previous
revision. The model's rent roll, loan, hold / exit cap and capex budget are
fingerprinted with each revision; when they change, the tab offers a new
revision (reason "Model change").

**Budget.** Locked from the model at closing: each hold year's lines from the
cash flow (§7.9), signed like an income statement, ÷ 12 for a month, from
the acquisition month. On NNN deals the model nets recoverable expenses out;
the budget grosses them back up (inputs $/SF × SF) as both an expense and a
recovery so lines compare with an income statement. NOI is the model's.
A re-forecast ("2027 budget") is saved with a new revision; revision 1's
budget stays the plan.

| Line | Budget (from the model) | Actual (income statement columns) |
|---|---|---|
| Base rent and other income | gross revenue | Base Rent, Rental Income, Other Income |
| Expense recoveries | NNN gross-up | Expense Recoveries, Reimbursements, CAM Income |
| Vacancy and credit loss | EGR − gross revenue | Vacancy, Credit Loss, Bad Debt, Concessions |
| Taxes, insurance, utilities, repairs | model lines (or the gross-up) | matching columns |
| Management fee | model | Management Fee |
| Other operating expenses | leasing fees, reserves, AM fees in opex | any other negative column |
| NOI | model NOI | EGR + expenses (checked against the statement's NOI) |
| TI, leasing and capital; debt service; cash flow | model | not imported |

**Variance** = actual − current budget for the months with actuals in the
period (month, quarter, year to date, since closing); positive is favorable
for every line. Flag: amber when unfavorable by more than the threshold
(default 5%), red over twice it. Also vs plan (revision 1) and $/SF.
**KPIs:** NOI (last 12 months of actuals, annualized), occupancy and average
rent from the rent roll, WALT, capex spent vs budget.

### 7.32 Underwritten vs. actual (`lib/uwActual.js`)

**Baseline.** Asset Summary → Details → **Freeze underwriting baseline**
keeps a copy of the asset's model inputs as underwritten (do it at closing;
"IC" is noted when the IC-approved figures are on the deal). It is stored as
`inputs.uwBaseline` and never changes unless you **Replace baseline**
(confirmed and logged). Its figures are recalculated from the frozen inputs,
so the baseline always runs through the same model as today.

**Actual + projected.** For each hold year (year 1 starts in the acquisition
month): NOI from the Asset Business Plan's actuals for the months that have
them, and today's model for the rest (status actual, partial or projected).
Cash flow moves with NOI; capital and debt service come from the model (the
income statement import has none). Occupancy for the current year is the
rent roll's today. Returns: levered IRR and multiple on these cash flows
with today's model's exit; unlevered IRR on NOI less TI and leasing, with
the exit net of sale costs.

**Comparison.** By year: NOI, occupancy, capital, cash flow, cash-on-cash,
DSCR; returns: levered and unlevered IRR, multiple, exit value, exit cap,
total cost, loan; each with its variance.

**IRR gap by cause.** Starting from the baseline, each group of inputs is
switched to today's values in turn, and the change in IRR is credited to it:
price and closing costs → rent and leasing (rent roll, rents, vacancy,
leasing costs, NOI overrides) → operating expenses and fees → capex →
financing (loan, rate, curve, caps) → timing (acquisition date, hold) → exit
(exit cap, sale costs, realized sale). **Other inputs** is anything not in a
group; **Operations to date** is actual + projected vs. today's model. The
causes add up to the gap. The order matters a little (a later group is
measured with the earlier ones already changed).

**Views.** Asset Summary → Details (with **Excel** and a **PDF report**, the
printable asset-management report) and, on Fund Return, every asset with a
baseline ranked by IRR gap, largest shortfall first (Excel).

### 7.31 Asset photos, map, floor plan and actual NOI (`lib/assetMedia.js`)

Shown under the business plan on the **Asset Business Plan** tab (phase I
part 2). Owners and editors change them; viewers see them.

**Photos.** **Add photos** uploads JPEG, PNG, WebP or GIF files (up to 25 MB
each) to the private `asset-photos` bucket. Each photo has a caption, a date
(today when added) and an order (← / → to move it). One photo is the
**cover** (the first added, until **Make cover** picks another; deleting the
cover makes the first photo the cover). Photos open through one-hour signed
links.

**Location map.** A Google Maps map of the address in the Property inputs
(Google finds the address itself), with **Map** / **Satellite** views and
**Open in Google Maps**. If the pin is off (for example a street Google
doesn't know), **Enter coordinates** sets the point by hand; **Use the
address** goes back. The map uses Google's keyless embed (user's choice,
11/23, after trying the Maps Embed API key). The code still accepts a key
through `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` if one is wanted later; the
deploy workflow doesn't pass one now.

**Floor plan.** Without an uploaded plan, a **schematic** shows the rent roll
units in order as boxes in rows, each as wide as its share of the row's SF.
**Upload plan** (an image; save a PDF page as PNG or JPEG) shows the plan;
choose a unit under **Place unit** and drag a box over it. Boxes are colored
by status: leased (green), lease ending within 12 months (amber), vacant
(red); hover for the unit, SF, tenant and lease end.

**Demising and combining** (vacant units only). Click units on the plan to
select them. **Demise** one unit into 2–10 units (sizes must add up to its
SF): the new units are named 014-A, 014-B, …, take its place in the rent
roll, are vacant at its market rent, and split its box left to right by SF.
**Combine** two or more units into one named 012/013, at the SF-weighted
market rent, in the first unit's place, with a box covering theirs. The rent
roll, cash flow and every tab update, and each change is in the change log.

**Actual NOI.** From the business plan's imported actuals: the trailing 12
months on or before today, annualized when fewer months are in. The
**Valuation** tab shows the cap rate on actual NOI (actual NOI ÷ the
quarter's fair value) under each asset's implied cap; **Sell/Hold Analysis**
shows an **Actual NOI** tile with its difference from the year-ahead NOI and
the value at the same cap. Neither changes the underwritten model.

### 7.32a The full Asset Business Plan PDF (phase L)

The business plan's **PDF** button prints the whole plan in one file:
- page 1 with the **cover photo** at the top right;
- the plan, KPIs, leasing, capital, operating, financing and exit,
  milestones, risks;
- **the asset**: address, coordinates (when entered), a Google Maps link
  (clickable; no map picture, since the free map can't be printed), size,
  and **actual NOI** (annualized from the months imported);
- **photos**, two across with captions and dates (up to 12);
- the **floor plan**: the uploaded plan (or the schematic) with each unit
  coloured by lease status (leased, expiring within 12 months, vacant), a
  legend and a unit table;
- the budget and budget vs. actual;
- **underwritten vs. actual + projected** (phase J) when the asset has a
  frozen baseline: returns, the IRR gap by cause and the by-year table;
- changes since the previous revision.
Stored photos are included when you're signed in; drawn sample photos
always. A PDF upload as the floor plan prints as the schematic.

### 7.32b Reports: the quarterly performance report (phase L)

The **Reports** tab (Library) builds each quarter's performance report from
the app's own figures. Choose the fund, the quarter (default: the last
completed one) and the version:
- **Shareable** (for investors and the investor portal): the letter; fund
  summary (net LP IRR, TVPI, DPI, RVPI, gross IRR and TVPI since
  inception); the quarter's LP NAV movement (start, contributions,
  distributions, change in value, end) and gross asset value; capital
  called and distributed against commitments; property debt and loan to
  value; the portfolio table; plan vs. actual once a fund plan is frozen
  (§7.33); and a half page per asset with its cover photo, value, occupancy,
  NOI (actual and plan), business plan status and loan.
- **Internal** (owners and editors only): the same plus underwritten vs.
  actual by asset (§7.32), flagged budget variances with their comments
  (§7.30) and **internal notes**; every page is marked "INTERNAL - not for
  distribution".

The **letter** starts as a draft written from the figures (with a
placeholder for the quarter's highlights); edit it in place, or **Redraft
from the figures**. Drafts are saved per quarter. **PDF (draft)** and
**Excel** download the current version. **Issue report** freezes the
figures, letter and notes as an issued version (v1, v2…) with who and when;
later changes never alter it, and its PDF can be downloaded again from the
issued list. Before LPs have funded capital, net returns show as not yet
meaningful and the letter describes gross asset value. The app never sends
anything: download the PDF and upload it to the investor portal.

### 7.32c Fund limits, actual vs. limit (phase L)

On the Reports tab (owners and editors), **Fund limits** lists every
investment limit applied from the fund's LPA / PPM (Documents tab, phase E:
with its clause; hover ⓘ for the document's words) and every **internal
limit** you add, each with the fund's actual figure, what drives it (the
largest asset, tenant, state…), the headroom and a status: **within**,
**near** (90% of the limit or more), **breached**, or **review** (text
limits such as permitted property types, and limits the app can't measure
yet).

| Limit | Actual figure |
|---|---|
| Single asset, % of commitments | largest asset's equity ÷ commitments |
| Single tenant, % of fund rent | largest tenant's rent (all its units) ÷ fund rent |
| Single state / metro, % of fund value | largest state's (city's, until ZIPs map to metros) share of value |
| Fund leverage (LTV) | property loans ÷ value |
| Single-asset LTV | highest loan ÷ value |
| Total borrowing, % of commitments | sub line balance ÷ commitments |
| Maximum hold | longest planned hold |

Values are each asset's mark for the quarter (else cost). **Pre-acquisition
check:** pick a pipeline deal (a deal not yet in a fund) and each limit shows
its status with the deal added, flagging any **new breach**. Excel export.
The internal quarterly report includes the limits table.

### 7.32d Risk report (internal, phase L)

On the Reports tab, **Risk report (internal)** (owners and editors; never in
the shareable report) shows, as of the quarter end:
- **Watch list:** assets ranked by a risk score (each flag weighs 1–3), with
  the reasons; and **fund-level flags** (concentration limits, fund limit
  breaches).
- **Fund limits** (§7.32c).
- **Leasing:** lease expirations by year as % of rent, the 12-month rollover
  and vacancy, for the fund and each asset (flags: 30%+ of rent rolling in
  12 months, 15%+ vacant).
- **Largest tenants** by rent (flag above 10% of fund rent).
- **Industry (SIC 2-digit):** share of fund rent and each asset's largest
  industry (limits 20% of the fund, 40% of an asset).
- **Geography:** a drawn map of the states (no map image), each state's
  circle sized by its share of fund value and red above the limit, and
  states and metros (cities) by share of value and NOI (limits 30% / 25%).
- **Debt:** each loan's balance, LTV, lender, spread, maturity, DSCR vs. its
  test, cap strike, expiry, provider and the cap's market value (flags:
  maturing within 18 months, DSCR below or near the test, no cap, cap
  expiring within 12 months).
- **Debt by lender** and **rate cap counterparties:** balance or notional,
  share, loans, spread, maturities or expiries, the exposure (cap value, what
  the fund would lose if the counterparty failed) and a concentration index
  (HHI); limits 35% of debt per lender and 50% of capped notional per
  counterparty; caps with no provider listed.
- **Valuation:** marks vs. cost (flag 5%+ below cost), implied vs. exit cap.
- **Execution:** IRR gap to underwriting (phase J), budget lines over the
  threshold (phase I), the fund plan gap (phase K).
- **Environmental and climate,** entered per asset: Phase I date, RECs,
  Phase II / remediation, no-further-action letter, tenants using hazardous
  materials, FEMA flood zone, wildfire and heat exposure, notes. Open items:
  no Phase I or one over 5 years old, RECs without an NFA letter, flood zone
  A or V, high wildfire or heat.
- **TI funding coverage** (heat map): for each asset and the next 8
  quarters, the TI and leasing commissions due (expiring leases at the
  renewal / new-lease mix the cash flow uses, vacant units leased in the
  first quarter, and planned TI entered for the asset) and how they're
  covered, in order: the loan's TI facility (what's left, if the asset
  passes the draw test that quarter: DSCR at or above the minimum, a debt
  yield minimum where set, and the facility not yet expired), the asset's
  cash flow, the fund's sub line (active to the end of the investment period,
  room = size less the model's balance, shared across assets), then a
  capital call. Green = facility, light green = asset cash flow, amber =
  needs the sub line, red = capital call or the draw test fails, grey = no
  TI due. Hover a cell for the need, each source, and how far NOI could fall
  before draws stop. A fund row shows the capital call needed each quarter.
  Draw-test failures and capital calls go on the watch list.
- **Stress tests:** each asset's levered IRR under five standard shocks
  (rent growth −3 pts, vacancy +10 pts, exit cap +75 bps, rates +200 bps,
  all four together) and the fund's equity-weighted IRR; red where DSCR
  falls below the asset's test in some year (combined-shock breaches go on
  the watch list). The Stress Testing tab has the sliders.
- **Insurance certificates** (from the Documents tab, signed in): expired or
  expiring (60 days) policies, no owner's certificate, leases with no tenant
  certificate, and tenant coverage below the lease's requirements; expired
  policies go on the watch list.
- **Lease risk flags** (abstracted leases): counts by type and the high ones,
  which go on the watch list.
- **Change vs. last quarter:** the largest lender, cap counterparty, state,
  metro, industry and tenant shares, the 12-month rollover, vacancy and both
  HHIs, now and at the previous quarter end, with the change (red = more
  concentrated).
- **TI actions (modeling only):** click a heat-map cell to postpone its TI to
  a later quarter, cut it by a percentage, or plan a capital call (shown
  blue). Actions are saved as the fund's TI scenario; tick **With scenario
  actions** to see the heat map with them. Nothing changes on the asset;
  carry chosen actions into the business plan as a new revision.
- **Concentration limits used here** can be changed per fund.
**PDF** (watermarked "Internal - not for distribution" on every page),
**Excel**, and **Issue risk report** (frozen, v1, v2…).

**Sample data → Add risk test data to the sample assets** (owners) gives the
sample assets made-up lenders (one over the 35% limit), cap counterparties
(one writing most caps, one asset with none), environmental entries (an
open REC, flood zones, high heat, an old Phase I), TI facilities on the
loans and one planned re-tenanting, set so the heat map shows every colour,
only where empty. Still to
come: insurance against loan requirements (once loan agreements carry
them).

### 7.35 Pipeline (phase M)

The **Pipeline** tab (first under Acquisitions) lists every deal being
watched, one row each: name, address, market, SF, asking price, $/SF, cap
rate (or NOI), broker or source, seller, **stage**, probability of closing,
deal lead, target fund, next step and date, expected close, notes, and the
date added.
- **Stages:** Watching → Screening → LOI → Under contract (PSA) → Closed,
  plus Passed / lost (with a reason). Changing the stage sets its default
  probability (10 / 20 / 40 / 75 / 100 / 0%), which you can change.
- **Adding deals:** **Add deal** by hand, or **Upload** a CoStar export or an
  internal spreadsheet (CSV or Excel). Columns are matched by name like the
  Sales Comps import, and the match is remembered for each source; **Template**
  downloads the columns. A re-upload **updates** the deal with the same name
  and address instead of adding a copy (the stage, lead and next steps set in
  the app are kept unless the file has them).
- **Totals by stage** (count, value, SF, probability-weighted value); click
  one to filter. Filter by stage (default: active, Watching to PSA), fund,
  market or lead. **Excel** exports what's shown.
- **Screen** creates a deal from the row (no fund yet, so it stays out of the
  fund's figures) with the asking price, NOI and expected close in Deal
  Screener, opens it there, and moves the row to Screening; afterwards the
  button is **Open in Screener**.
- **Convert to asset** (once Closed, with a target fund): the deal joins the
  fund, acquired on its expected close date (asks first; logged).
- **Pipeline report** (bottom of the tab): choose the fund and how to rank
  the top 10 (price, deal IRR, equity, expected close or fund net IRR
  impact). It shows the active deals for that fund by stage (price, SF,
  equity and debt needed, probability-weighted), expected closings by
  quarter against the fund's dry powder, the whole pipeline's effect on the
  fund (screened deals, owned assets as the base) and any limits it would
  breach, and a one-paragraph summary of each top-10 deal with its key risks
  (unscreened deals use 65% leverage for equity). **Preview**, **PDF**,
  **Excel**, and **Save dated version** (re-download its PDF later).
- An offering memo read on the Documents tab can start a row: **Add to
  pipeline** (next to New deal from this OM) adds it at Screening, linked
  to the OM.
- Every change is in the change log (area Pipeline). Fictional sample files
  for testing: `docs/sample-pipeline/`.

### 7.36 Deal Screener: pipeline deals and Model in fund (phase M)

**Deal Screener is for pipeline deals only** (11/23): deals with no fund, or
bought after today. A row of **Pipeline deals** at the top switches between
them. With an owned asset selected, the tab says so and points to the Asset
Management tabs instead of showing the screener. The app opens on
**Home** (§7.42); opening an asset from Asset Summary goes to its business
plan.

**Model in fund** (above the screener inputs, labelled "Scenario — not
actual"): choose the fund the deal would be held in (default: its target
fund on the Pipeline tab) and compare against **owned plus other pipeline
assets** (default) or **owned assets only**. The deal is always left out of
the "without" side. Shown: gross IRR and multiple, net LP IRR and multiple
(through the fund's sub line, expenses and waterfall) and GP promote,
without / with / change; the equity the deal needs and dry powder before and
after (red if the fund would be over-committed); the largest tenant and
state shares and fund LTV before and after; and any fund limit (§7.32c) the
deal would newly breach. Nothing changes on the fund or the deal. Excel.
When the screener's price, NOI or close date differ from the deal's
Pipeline row, **Update pipeline row** copies them back (logged).

### 7.37 Fund Impact (phase M)

The **Fund Impact** tab (last under Acquisitions; labelled "Scenario — not
actual") models pipeline deals into a fund without changing it.
- Choose the **fund** and the base (owned plus the fund's other pipeline
  assets, or owned only), and tick the **candidates**: pipeline deals with no
  fund or bought after today. **Send to Fund Impact** on the Pipeline tab
  opens this tab with that deal ticked (creating its deal if needed).
- **Fund with vs. without** all the ticked candidates: gross IRR and
  multiple, net LP IRR and multiple, GP promote, equity, dry powder (and %
  used), the largest tenant and state shares, fund LTV, and every fund limit
  before → after, with **new breaches** in red.
- **Compare candidates:** each alone on the base, ranked by its effect on
  fund net LP IRR, with each one's share of the combined change and its
  breaches.
- Per candidate: **Break-even price** (the highest price at which fund net
  LP IRR stays at or above the fund plan's target, or the fund without it,
  with no new breach) and **Sensitivity** (fund net LP IRR across price ±10%
  and exit cap ±50 bps).
- **Saved scenarios:** name the scenario and **Save as new scenario** (v1);
  later changes **Save current as v2**, v3… Each saved version is frozen
  (inputs and results, who and when, a note) and can be viewed again; **Load
  candidates** picks the latest version's candidates. Saved on the fund's
  record.
- **Add to fund** is the only step that changes anything: the candidate
  becomes a deal of the fund (asks first; logged).
- **PDF** and **Excel** for the live view or the version shown, stamped
  "Scenario - not actual" with the scenario name, version, date and author.

### 7.38 Fund Summary (phase N)

The **Fund Summary** tab (first under Portfolio Management) is one page of
key facts about the chosen fund. It doesn't repeat performance, the
portfolio or upcoming dates; **Elsewhere** links to Fund Return, Valuation,
Asset Summary, Leases → Critical dates, Fund Plan and Reports.
- **Key dates:** launch (entered here), final close, investment period end,
  end of term, and the outside date with every extension, with months left.
- **Capital:** raised (commitments), called (from capital activity when
  entered, else the model's purchase equity to date) and % of commitments,
  deployed in assets, available (dry powder) before and after the fund's
  cash reserve, and the sub line drawn vs. capacity.
- **Key terms:** fund type, commitments (LP / GP), pref, hurdle, catch-up,
  promote tiers, income treatment, management fee and basis, investment
  period, term and extensions, distribution policy, fund cash reserve, the
  sub line, investment limits, and **key person** and **GP removal**
  (entered here from the LPA).
- **Legal entities:** the fund, GP, manager and each asset's property
  company (**Add a company for each asset** creates "<Asset> LLC" owned by
  the fund): state, formation date, **EIN (only the last 4 digits are
  kept)**, registered agent, annual-report due date and who owns it. An
  **ownership chart** is drawn from those links. Annual-report due dates
  appear on Leases → Critical dates (whole fund).
- **Org charts and formation documents** (signed in): upload PDFs by type
  (org chart, formation documents, operating agreement, good standing,
  other legal); open or delete them.
- **Fact sheet (PDF)** on one page, and **Excel**.

### 7.39 Setting up assets and funds (phase O)

The asset inputs are no longer always open on the left; the tabs use the
full page width. Under the header:
- **New asset** adds a deal and opens its inputs; **Edit asset…** picks any
  asset (listed with its fund, or "pipeline") and opens its inputs.
- The inputs open as a **slide-over** on the right with **Done** (or press
  Escape, or click outside) to close it. Nothing else opens it. Assets are
  never deleted from it; taking an asset out of a fund stays on Fund Return.
- **New fund** and **Edit fund…** open the fund terms editor (with the LPA /
  PPM upload), as from Fund Return.
- The **Asset** picker above the single-asset tabs still chooses which asset
  those tabs show.

### 7.40 "Working on" fund picker (`lib/workingOn.js`)

The **Working on** dropdown at the left of the header's figure strip chooses
the portfolio you are working on: **All funds** (the whole firm), or one
fund, separate account or joint venture (shown with its type). It is a
filter only: all the firm's data is already loaded, and choosing a fund
changes nothing and saves nothing.

- The header figures (AUM, square feet, assets, tenants, occupancy) become
  that fund's, labelled with its name.
- Every tab follows it: Asset Summary, Fund Return, Valuation, Fund Plan,
  Fund Summary, Distribution Analysis, Fund Impact, Reports, the critical
  dates and the stress test show only that fund. The Pipeline tab starts
  filtered to deals screened for it (clear the fund filter there to see all).
- The **Asset** list above the single-asset tabs shows the fund's assets,
  pipeline deals being screened for it, and drafts not yet on the pipeline. A
  pipeline deal aimed at another fund, or at no fund, shows under All funds.
  If the open asset isn't in the chosen fund, the fund's first asset opens.
- Your choice is remembered on your sign-in (not the firm's data), so you
  reopen on the portfolio you last worked on, on any computer. Signed out,
  this browser remembers it. A fund that no longer exists falls back to All
  funds.
- **Edit asset…**, **Edit fund…** and the Documents tab still list every
  asset and fund, so nothing is out of reach.

### 7.41 Revert, restore and recently deleted (`lib/revert.js`)

On the **Change log** tab (working log or the database's verified log):
- **Revert** on an entry puts that one field back to its earlier value. It is
  offered only while the field still holds the value that change wrote, so a
  later edit is never overwritten (revert the later change first). It works
  for asset inputs (including a unit's fields), fund terms, capital activity
  amounts and dates, valuation marks and pipeline deals. A whole record added
  or removed, a note, and saved copies (fixed snapshots) have no Revert. The
  revert is saved and logged as a **Revert** entry, by whom and when; it can
  itself be reverted.
- **Restore a deal or fund as of a date…**: choose an asset, fund or
  pipeline deal and a date, **Preview** (each field: now → restored), then
  **Apply restore**. It undoes that record's logged changes made after the
  date, newest first; nothing else is touched. Changes that can't be undone
  here (a record added or removed) are listed and stay as they are. It uses
  the database's log when signed in, else the working log.
- **Recently deleted** lists deals, saved copies and funds that were deleted
  (they are kept in the database, marked deleted), with when and by whom.
  **Restore** brings one back exactly as it was when deleted.

### 7.42 Home page (`lib/home.js`, phase Z)

The app opens on **Home** (the first button in the tab bar). It shows the
portfolio chosen in **Working on** (§7.40) and is computed from data already
loaded; nothing on it is saved.
- **Today · needs attention:** leases expiring in the next 90 days (unit
  roll), loans maturing within 18 months, rate caps expiring within 12
  months, assets with no valuation mark for the last quarter end, rent 60+
  days late (each fund's latest delinquency report) and assets whose NOI is
  in the red against budget year to date. Dated items come first, soonest
  first; each opens the tab that handles it on that asset.
- **Recent activity:** the last 10 changes from the change log (the
  database's log when signed in).
- **Funds:** a card per fund, separate account or joint venture with its
  type badge: NAV, net IRR (against the target when one is set in Fund
  Plan), % called, dry powder, assets and the next key date, with links to
  Fund Summary and Fund Return.
- **Workflows:** one lane per tab header in the tab bar's order
  (Acquisitions, Asset Management, Portfolio Management, Library), each with
  a few live numbers (active pipeline by stage and dry powder; occupancy,
  leases expiring this year, NOI vs. budget and appraisals due; NAV, loans
  maturing, sub line drawn and caps expiring) and links to its tabs. Lanes
  for Dispositions, Property Management and Market appear once those tab
  headers exist.
- **Quick actions:** New asset, New fund setup, Upload rent roll, Upload
  Yardi actuals, Import marks, Record capital activity and New report, each
  opening the screen that does it.

### 7.43 Dispositions (`lib/dispositions.js`, phase P)

A **Dispositions** group sits right after Acquisitions. Each asset's sales
are kept on the asset itself, so they save and log like any other edit, and
they follow the **Working on** picker.

- **Assets for Sale:** **Start sale** for an owned asset: the whole asset or
  selected units, and the reason (business plan complete, hold reached, fund
  term, opportunistic). Each sale opens to:
  - **Stage** (Preparing → Marketing → Offers → Under contract → Closed, or
    Withdrawn with a reason), target price, cap and close date, with $/SF.
  - **Broker opinions of value** side by side (price, cap, fee); **Choose**
    one as the broker; the listing fee, term and exclusions; CAs signed,
    tours and the call-for-offers date.
  - **Offers** on the sale, best net proceeds first, with **Select**.
  - **Under contract:** PSA date, deposit, hard date, due diligence and
    closing dates, and the contract price. A price change asks for a reason
    (a credit, a re-trade) and is logged on the sale.
  - **Record closing statement:** date, price, and selling costs and loan
    payoff (blank uses the model). It shows the net proceeds. A whole sale
    then becomes the asset's realized sale, so Fund Return, valuations and
    the header figures use it. A partial sale records the part sold.
  - **Excel** of every active sale with its offers side by side.
- **Offers:** every offer by sale: buyer, type, broker, date, round
  (initial, best and final), price ($/SF and cap shown), deposit, due
  diligence and closing days, financing contingency and notes. Each offer's
  **net proceeds** after selling costs (the model's %) and loan payoff (the
  model's balance at the closing or target date; a partial sale's share by
  SF) are shown, with the best marked. A buyer's earlier offers on other
  assets show under their name.
- **Track Record:** every closed sale: purchase and sale price and date, net
  proceeds, hold, realized IRR, multiple and profit, against the acquisition
  underwriting (the frozen baseline when there is one) and the last
  valuation mark before the sale, with fund and firm totals and Excel. A
  partial sale's figures cover the part sold (its share of cost and equity;
  interim cash flow isn't split).
- Home has a **Dispositions** lane: assets for sale, offers received and
  sales closed this year.
- **Start sale** on **Sell/Hold Analysis** starts a sale of that asset
  (reason: hold period reached) and opens it on Assets for Sale; with a sale
  already in progress the button opens it instead.
- **Documents** (signed in): each sale has an upload area for BOVs, the
  listing agreement, offering memo / marketing, PSA and amendments,
  estoppels and the closing statement; each offer takes its offer letter or
  LOI (Offers tab); each closed sale takes the final closing statement,
  post-closing true-ups and the distribution notice (Track Record). The
  **Sale Documents** tab lists them all, filterable by asset and type. They
  are kept in the same store as Library → Documents (each file once). Until
  `supabase/dispositions_doc_types.sql` is applied, the new types are filed
  as "Other" with the type in the title; nothing is blocked.
- **Distribution:** a closed sale shows how its net proceeds split between
  LPs and the GP through the fund's waterfall (pref, catch-up and promote as
  set in the fund terms), after every earlier fund flow.
- **PDF** on Assets for Sale (each active sale, and each sale's offers side
  by side with net proceeds) and on Track Record (with totals).
- Still to come: reading a document's terms in with Claude (BOV, LOI, PSA,
  closing statement) and applying them to the sale.

### 7.44 Leasing (`lib/leasing.js`, phase R)

The **Leasing** tab (Asset Management, right after Leases) is kept on each
asset, so its edits save and log like any other.

- **Leasing Pipeline:** **+ Prospect** adds one (it starts on a vacant
  unit); **+ Renewal** adds a renewal negotiation for the next lease to
  expire, with its tenant. For each one:
  - the unit, prospect or tenant, source and broker;
  - the stage (Inquiry → Tour → Proposal → LOI → Lease out → Signed, or
    Lost with a reason);
  - SF, asking and proposed rent, term, free months, TI per SF and the
    expected start;
  - the next step and its date.

  It shows the **net effective rent** (rent over the term with escalations,
  less free rent and TI, per year). It also compares the deal with the
  business plan's leasing target for that unit (the latest revision): rent
  against the target, and downtime (from the lease end, or today for a
  vacant unit, to the expected start) against the plan's. Counts by stage
  are at the top. Signed and lost prospects are hidden unless **Show signed
  and lost** is on. The **All assets** view lists every asset's prospects
  in the chosen portfolio.
- **Rent Comps:** add comps by hand, or **Upload** a CoStar export or an
  internal spreadsheet (.xlsx or .csv). The columns are matched like Sales
  Comps, shown before importing and remembered for the asset's next upload.
  A comp with the same address, tenant and sign date updates instead of
  duplicating. You can filter by sign date, size, submarket and lease type,
  and untick a comp to leave it out. The summary shows the SF-weighted
  average, median, range and net effective rent, and the asset's in-place
  rent and the model's market rent against the comps. **Set market rent
  from comps** sets the model's market rent to the comps' average (asked
  first); the returns update.
- **Excel** exports the pipeline and the comps.
- **Documents** (signed in): each prospect has an upload for proposals,
  LOIs, lease drafts, lease approval memos and broker reports, and the Rent
  Comps section takes rent comp and broker reports. They're kept in the same
  store as Library → Documents (filed as "Other", the prospect and type in
  the title; no database change needed).
- **PDF** of the pipeline (with the plan comparison) and the rent comps with
  their statistics, for the asset or the whole portfolio.
- On **Home**, an active prospect's next step due within a week (or overdue)
  is on the attention list, and the Asset Management lane counts active
  prospects.

### 7.45 Fund Debt (`lib/fundDebt.js`, phase S)

**Fund Debt** (Portfolio Management, right after Fund Return) shows every
loan in the fund. It's built from each asset's Debt inputs and model, and
changes nothing. The Debt tab stays for one asset's loan.

- **Summary:** total debt, number of loans, DSCR and LTV weighted by loan
  balance, the share floating (including capped), and loans maturing within
  18 months.
- **Loans:** one row per owned asset with a loan:
  - lender and balance;
  - rate type (floating, capped, swapped or fixed) with the spread or fixed
    rate;
  - current maturity, fully extended date and extensions left;
  - DSCR, debt yield and LTV in the current hold year (value from the latest
    valuation mark, else cost);
  - the **next extension test**: DSCR, debt yield and LTV projected at the
    next maturity against the loan's tests. The tests are the asset's
    sizing constraints unless covenants are entered.
- **Maturity ladder:** balance maturing each year on current terms, and if
  fully extended.
- **Rate exposure and caps:** balance and share by rate type, and each cap's
  notional, strike and expiry (soonest first; flagged when it expires before
  the loan matures).
- **Lender concentration:** balance and share by lender, with the HHI.
- **Refinance planner:** pick a loan and set rate, maximum LTV, minimum
  DSCR, amortization and an optional minimum debt yield. It shows the
  proceeds each test allows, which test binds, the payoff, the cash out or
  pay-down, and the new DSCR.
- **Excel** of all of the above.
- **Covenant compliance certificates:** choose a quarter end (the last eight)
  and one loan or all. Each certificate tests that quarter's DSCR, debt yield
  and LTV against the loan's covenants. It uses model NOI for that hold year
  and the latest valuation mark at the quarter end, and shows each
  calculation, overall compliance and a signature block. The table shows
  compliance per loan; **Certificates PDF** gives one page per loan, and
  **Certificates Excel** gives one block per loan. Review against the loan
  agreement's definitions before signing.
- **PDF** of the tab: loans, maturity ladder, rate exposure and lenders.
- On **Home**, a covenant breach now, or an extension test that fails
  within 18 months, is on the attention list and opens Fund Debt.

### 7.46 Property Management (`lib/propertyMgmt.js`, phase T)

A **Property Management** group sits after Asset Management, with four
tabs. Each shows the open asset, with editable tables (**+ Add** a row; ✕
removes one). **All assets** gives a read-only whole-fund view by asset.
Each tab has a summary line, a **Coming up (120 days)** list and Excel.
Everything is kept on the asset, so edits save and log like any other.

- **Property Taxes:**
  - **Parcels:** APN, address, assessed value, rate and year.
  - **Tax bills:** parcel, tax year, installment, amount, due and paid
    dates.
  - **Appeals:** filed, hearing, outcome, savings and consultant.
  - The summary gives, for the chosen tax year: billed, paid, unpaid, the
    business plan's tax budget and the difference, assessed value, appeal
    savings and pending appeals.
- **Insurance:**
  - **Policies:** coverage, carrier, number, limit, deductible, premium,
    effective and renewal dates, and broker.
  - **Claims log:** date of loss, cause, policy, amount, status and
    recovery.
  - The summary gives total premium, property limit, open claims, and
    claimed vs. recovered.
- **Property Condition:** findings from a PCA, Phase I/II, zoning or
  inspection report. Each has the system, finding, cost, urgency
  (Immediate, within 1 year, 1–5 years, 5+ years), status and Yardi job.
  The summary gives open cost by urgency and the completed cost.
- **Service Contracts:** vendor, service, start and end, annual cost,
  auto-renewal, notice days and Yardi contract. The summary gives annual
  cost and how many auto-renew.
- **On Home**, these go on the attention list within 60 days:
  - an unpaid tax bill coming due
  - an appeal hearing
  - a policy renewal
  - a contract's notice deadline (end date less notice days) or end date

  An open **Immediate** repair leads the list. The Property Management lane
  shows the annual premium, open condition items and their cost, and the
  dates coming up. When there are more than 12 items, **Show all** lists
  every one.
- **Documents** (signed in): each section takes PDF uploads (tax bills and
  appeal filings, policies and certificates, PCA / Phase I / zoning reports,
  contracts). They're kept in the same store as Library → Documents (filed
  as "Other" with the section in the title; no database change).
- **Add to capital plan** on a Property Condition finding adds it to the
  asset's business plan as a capital project. This makes a new plan
  revision, so the plan keeps its history. The project's budget is the cost
  and its timing follows the urgency. The finding then shows **In the plan
  ✓**. The asset needs a business plan first.
- **PDF** of each tab (summary and every section, for the asset or the whole
  portfolio).
- Still to come: the Yardi Construction Manager upload and TI spend by unit,
  with sample construction files.

### 7.33 Fund plan vs. actual (`lib/fundPlan.js`, phase K)

The **Fund Plan** tab (Portfolio Management, before Fund Return) tracks the
fund against its own plan.

- **Freeze the original plan** saves the fund model as it stands (usually
  the final close model) with who froze it, when and an optional note. It is
  a copy of the numbers, so later edits to deals never change it. **Save a
  re-forecast** adds v2, v3…; the original stays, and the version picker
  compares against any of them. Plans are saved on the fund's record.
- **What a plan holds** (the fund model, ignoring capital activity, so plans
  and re-forecasts compare like for like): LP capital called and
  distributed by quarter, equity deployed and assets bought by quarter, fund
  NOI by year (each hold year's NOI in the year it starts), LP cash yield by
  year (operating distributions ÷ LP capital called by year end; sale
  proceeds excluded), gross IRR and multiple, net LP IRR and multiple, LP
  and GP distributions, GP promote (GP distributions above its pro-rata
  share) and a summary per asset.
- **Since inception** (through the last completed quarter): plan vs. actual
  LP capital called, equity deployed, assets acquired, LP distributions and
  DPI; LP NAV and interim TVPI (actual only: the plan has no NAV). Actuals
  are the Valuation tab's LP figures, which use capital activity when it
  has been entered and the model to date otherwise.
- **Projected (life of fund):** plan vs. today's forecast (the fund model
  now) vs. **targets** you enter (net LP IRR, net LP multiple, gross IRR);
  a forecast below its target turns red.
- **Chart:** cumulative LP capital called and distributed: plan (dashed),
  actual and forecast. **By quarter** opens the quarter-by-quarter table.
- **Attribution:** the change in projected net profit (forecast − plan) by
  asset (assets not in the plan or dropped are marked) and by cause:
  deployment (assets added or dropped), pricing (purchase price vs. plan),
  operations, financing and exits (the rest of the plan assets' change), and
  fees, fund expenses and the sub line (the change in net profit the assets'
  gross profit doesn't explain). The causes add up to the total; the split
  is an estimate.
- **Excel** and a **PDF report** (landscape, two pages) for LP updates.

On **Sell/Hold Analysis → Whole fund**, the fund table adds net LP TVPI, LP
DPI by the end of the fund's term (before extensions: how much cash LPs get
back within the term) and GP promote. **All assets** applies one hold change
to every held asset: "Change each hold by" ± years, or "Hold every asset to
year" n; +0 puts every asset back on its base plan. Holds that would run past
the final extended term (or end before the decision date) are adjusted to
the nearest allowed year, with a note naming them; a sale after the fund's
term is flagged as needing the extensions.

### 7.34 Distribution Analysis (`lib/distributions.js`, phase X)

The **Distribution Analysis** tab (Portfolio Management, after Fund Return)
works out how much the fund can distribute for a quarter (default: the last
completed quarter) and how it splits.

**Asset cash.** One row per asset held at the quarter end (assets bought
later or sold earlier are listed as not included):
- **Cash at quarter end:** **Upload Yardi cash** reads a cash or bank
  balance report (CSV or Excel: a property code or name column and a
  balance column; amounts in parentheses are negative; total rows are
  skipped). Properties match by Yardi code or name and the match is
  remembered. The report's as-of date picks the quarter. Or type a balance.
- With no balance, the asset uses the model's **projected** operating cash
  for the quarter, marked **projected, no balance entered**; the total shows
  how much of the cash is actual and how much projected.
- Less **lender reserves** and **committed TI / capex** not yet paid
  (entered), and a **working-capital minimum** of 3 months of the asset's
  projected operating expenses (the model's hold year containing the
  quarter). An asset never adds less than $0.

**Fund cash and sub line.** Fund cash (entered, else the model's projected
fund cash) less a minimum of 6 months of projected fund expenses
(management fee and sub line costs for the next two quarters). The **sub
line term sheet** rule: no repayment, repay the balance outstanding first
(clean-down), or repay a fixed amount first.

**Distributable cash** = assets + fund cash available − sub line repayment.

**The distribution:** a % of distributable cash or an amount (capped at
distributable). It splits LP / GP by the fund's waterfall and income
treatment (the LPA terms), run on the fund's history before the quarter.
Under "income pays pref, then returns capital", cash beyond the pref and
the capital outstanding waits for the next sale and shows as **held by the
waterfall**; before LPs have funded any capital (purchases on the sub line)
all of it is held, and the tab suggests repaying the sub line. What isn't
distributed stays in reserve.

**Yield:** the LP distribution × 4 ÷ LP contributed capital, and ÷ LP NAV
(the Valuation tab's figures at the quarter).

**History:** the 4 quarters before, from distributions recorded in capital
activity, each with its yield, the trailing 12 months, and the proposed
quarter.

**Proposals:** **Save proposal** keeps the amount and split (with who and
when). **Record as paid** (with the paid date) adds a **Distribution paid**
entry to the fund's capital activity and marks the proposal paid. It feeds
the history; it doesn't change the fund model, and it doesn't switch the
fund to actual capital calls. There is no approval step yet (phase V).

**Excel** and **PDF** export the quarter. Everything entered (balances,
fund cash, the sub line rule, Yardi code matches, proposals) is saved on the
fund's record.

## 8. Worked example: the default deal

The inputs are the Deal Screener defaults:
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
11. **You need to be online and signed in to save.** Nothing is kept in
    the browser, so changes made while the database can't be reached stay
    on screen only until a save succeeds. The header shows "unsaved
    changes" until then.
12. **Saves happen about 20 seconds after the last change.** Closing the
    tab sooner triggers a save and a "leave page?" prompt; use Save now if
    in doubt.
13. **The working change log is a working record.** It is part of the
    workspace data, so anyone who can edit the workspace (or an exported
    file) can edit it. The verified log is the database's: the signed-in
    user and server time are recorded on each save, and entries can't be
    edited or deleted.
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
- **In the app:** Deal Screener → Update from Pensford, then upload
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
comps, valuations, settings and the browser change log (§11.1–11.11). It is
stored in the database; the only other copies are exports you download:

| Location | What it holds | When it's written |
|---|---|---|
| **Supabase database** (project `nydqmigxorahfkfpkjnq`) | `workspaces.data`: the current workspace JSON. `workspace_versions.data`: every earlier version. `audit_log`: the verified change log. Members and invites (§11.13). | About 20 seconds after the last change, on **Save now**, and on leaving the page |
| **Download backup** file | A copy of all the firm's data (JSON) | When you click Download backup (and automatically before a restore) |
| **Browser storage** | Only the sign-in session (`sb-nydqmigxorahfkfpkjnq-auth-token`). No workspace data. Data saved there by earlier versions of the app is moved to the database on sign-in and then deleted. | On sign-in; removed on sign-out |
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

### 11.1 Workspace (`workspaces.data` in Supabase; also exports)

The workspace JSON. In Supabase it's the `data` column of `workspaces`
(current version) and `workspace_versions` (earlier versions). Exported
files hold the same object.

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
| `linked` | `deals[].linked` | yes / no | Deal Screener drives every tab (§7.3) |
| `quick` | `deals[].quick` | Deal Screener inputs (§11.3) | The deal's Deal Screener inputs |
| `inputs` | `deals[].inputs` | Full-model inputs (§11.4) | Inputs to the full engine. For linked deals, rebuilt from `quick`. |

### 11.3 Deal Screener inputs (`quick`)

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
| `amFeePct` | `deals[].quick.amFeePct` | % of equity / yr | 0 | Asset-level asset management fee (Model Fund I charges its fee at the fund level, §7.20) |
| `pmFeePct` | `deals[].quick.pmFeePct` | % / yr | 5 | Property management fee |
| `pmFeeBasis` | `deals[].quick.pmFeeBasis` | `noi` / `value` | noi | PM fee basis: NOI before the fee, or purchase price |
| `cmFeePct` | `deals[].quick.cmFeePct` | % of price / yr | 1.5 | Construction management fee |

### 11.4 Full-model inputs (`inputs`)

Fields set from Deal Screener on linked deals are marked **Q**.

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
| `unitCount` | `deals[].inputs.unitCount` | count | 20 (sample assets: 9–22) | Units field (Property). Used when the deal has no rent roll; otherwise the rent roll's count is shown |
| `avgLeaseTerm` | `deals[].inputs.avgLeaseTerm` | years | 2 | Rollover assumption without a unit roll |
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
| `loanSizingConstraints` | `deals[].inputs.loanSizingConstraints` | | on: 1.25× DSCR, 75% LTC, 8% debt yield | `minDSCR…`, `maxLTCPct…`, `minDebtYieldPct…`, each with an `…Enabled` switch (§7.6) |
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
| `holdPeriodYears` **Q** | `deals[].inputs.holdPeriodYears` | years | 4 | Hold period |
| `exitCapRatePct` **Q** | `deals[].inputs.exitCapRatePct` | % | 6.75 | Exit cap rate |
| `sellingCosts` **Q** | `deals[].inputs.sellingCosts` | %, $ | 2.0 / 0.5 / 0.2 %, $15k, $5k | `brokerCommissionPct`, `transferTaxPct`, `titleInsurancePct`, `legalFees`, `miscDispositionCosts` |
| `customDispositionItems` | `deals[].inputs.customDispositionItems` | `{label, basis, value}` | [] | Extra sale costs; `basis` `pct` of exit value or fixed $ |
| `waterfallEnabled`, `waterfall` | `deals[].inputs.waterfallEnabled`<br>`deals[].inputs.waterfall` | | on | Deal-level LP/GP: `lpEquityPct`, `preferredReturnPct`, `catchUpGpPct`, `tiers` (§7.8) |

### 11.5 Unit (rent roll row)

**Unit Roll → Import CSV / Excel** reads these columns (a `.csv` or
`.xlsx` file). The template's header is listed first; names in brackets are
also accepted (case, spaces and symbols ignored).

| Field | Stored at (`workspaces.data`) | CSV column | Units | Default | Meaning |
|---|---|---|---|---|---|
| `name` | `deals[].inputs.units[].name` | unit [unitname, name, suite] | text | row no. | Unit / suite |
| `squareFeet` | `deals[].inputs.units[].squareFeet` | **sf** [squarefeet, sqft, size] | SF | required | Unit size (rows without SF are skipped) |
| `tenantName` | `deals[].inputs.units[].tenantName` | tenant [tenantname, lessee] | text | | Tenant |
| `businessDescription` | `deals[].inputs.units[].businessDescription` | business [description, use] | text | | Tenant's business |
| `creditRating` | `deals[].inputs.units[].creditRating` | credit [creditrating, rating] | text | | Credit rating |
| `sicCode` | `deals[].inputs.units[].sicCode` | SIC [sic, siccode] | text | 4-digit SIC, e.g. 3444 | Tenant industry (SIC); suggested from the business (§7.19) |
| `naicsCode` | `deals[].inputs.units[].naicsCode` | NAICS [naics, naicscode, industry] | text | | NAICS industry code (optional) |
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

**Lease fields** (Unit Roll → ▸ Lease details, or the import). All optional;
reference data except lease end, which sets months remaining (§7.19).

| Field | Stored at (`workspaces.data`) | Column | Units | Meaning |
|---|---|---|---|---|
| `leaseStart` | `deals[].inputs.units[].leaseStart` | Lease start [start, commencement] | date | Lease commencement |
| `leaseEnd` | `deals[].inputs.units[].leaseEnd` | Lease end [expiration, expires, end] | date | Lease expiration; sets `monthsRemaining` |
| `securityDeposit` | `deals[].inputs.units[].securityDeposit` | Security deposit [deposit] | $ | Deposit held |
| `guarantor` | `deals[].inputs.units[].guarantor` | Guarantor [guaranty] | text | Lease guarantor |
| `recoveries` | `deals[].inputs.units[].recoveries` | Recoveries | text | How expenses are recovered (e.g. base year) |
| `renewalOptions` | `deals[].inputs.units[].renewalOptions` | Renewal options [options] | count | Number of renewal options |
| `renewalOptionYears` | `deals[].inputs.units[].renewalOptionYears` | Years per option | years | Length of each option |
| `renewalNoticeMonths` | `deals[].inputs.units[].renewalNoticeMonths` | Renewal notice (months) | months | Notice before lease end to exercise |
| `renewalRentBasis` | `deals[].inputs.units[].renewalRentBasis` | Renewal rent | text | e.g. 95% of market, fixed $15.00 |
| `terminationDate` | `deals[].inputs.units[].terminationDate` | Termination date | date | Earliest early-termination date |
| `terminationNoticeMonths` | `deals[].inputs.units[].terminationNoticeMonths` | Termination notice (months) | months | Notice required |
| `terminationFee` | `deals[].inputs.units[].terminationFee` | Termination fee | $ | Fee payable on termination |
| `otherRights` | `deals[].inputs.units[].otherRights` | Other rights [expansion, rofr] | text | Expansion, ROFR, ROFO, relocation, etc. |
| `leaseNotes` | `deals[].inputs.units[].leaseNotes` | Notes [comments] | text | Free-form notes |
| `rentSteps` | `deals[].inputs.units[].rentSteps` | (from an applied lease abstract; not imported) | [{ start, end, rentPSF }] | Dated rent steps, $/SF/yr on the unit's SF; drive the rent while the in-place lease runs (§7.25) |

**Document fields on the deal** (`deals[].inputs`, set by the Documents tab, §7.28):

| Field | Meaning |
|---|---|
| `yearBuilt` | From the offering memo |
| `dealTerms` | `{ deposit, additionalDeposit, depositHardDate, ddDays, ddExpiry, closingDays, closingDate, financingContingency, repsSurvivalMonths, repsCap, loiDate, psaDate }` from the LOI / PSA |
| `icApproved` | As-approved baseline from the final IC memo (reference only) |
| `icConditions` | `[{ id, text, deadline, done, doneBy, doneAt }]` conditions of approval |
| `actualBasis` | `{ loanProceeds, equityFunded, sellerCredits, prorations, depositsTransferred, docId }` from the acquisition closing statement |
| `realizedSalePrice`, `realizedSellingCosts`, `realizedSaleDate`, `realizedNetProceeds`, `realizedLoanPayoff` | From the disposition closing statement; price and costs replace the modelled exit (§7.7) |
| `loanAmountActual` | From the loan agreement; replaces the sizing tests (§7.7) |
| `loanTerms` | `{ lender, maturityDate, floorPct, capMaxStrikePct, capMinRating, capReplacementDays, prepayment, reserves, reporting, docId }` |
| `loanCovenants` | `{ dscr, debtYieldPct, ltvPct, testing, cure }` |
| `businessPlan` | `{ revisions: [{ n, at, by, note, reason, changes, plan, budget, model }], actuals: { "YYYY-MM": lines }, actualsSource, comments: { "<period>|<line>": text }, thresholdPct }` (§7.30) |
| `uwBaseline` | `{ at, by, note, source: "closing" \| "ic", inputs }`: the frozen underwriting (model inputs without `businessPlan`, `assetMedia`, `icApproved`) (§7.32) |
| `assetMedia` | `{ photos: [{ id, path, name, caption, date, order, cover }], floorPlan: { path, name, kind, boxes: { unitId: { x, y, w, h } } }, geo: { lat, lon, label, query, source, at } }` (§7.31). Files are in the private `asset-photos` bucket at `<workspace>/<deal id>/photos/…` and `…/floorplan/…`; box coordinates are fractions of the plan; `geo` is a point entered by hand (`source: manual`); without it the map uses the address |
| `executedCaps` | `[{ holdYear, provider, rating, strikePct, effective, termination, notional, premium, index, tradeDate, docId }]` from cap confirmations |

Fund terms (`funds[name]`) also get `limits`: `[{ key, label, limit, unit, basis, clause, quote, docId }]` from the LPA / PPM.

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
| `type` | `funds["Fund name"].type` | — | `Fund` / `Separate Account` / `Joint Venture` | Fund (when missing) | Type tag, a label only (11/23): chosen in New fund, editable in the terms; badge on Asset Summary, Valuation, Fund Return, pickers and PDF covers; Fund Return can filter by it. No effect on any calculation |
| `finalClose` | `funds["Fund name"].finalClose` | Final close date | date | 2025-12-31 | Start of the fund timeline |
| `investmentPeriodYears` | `funds["Fund name"].investmentPeriodYears` | Investment period (years) | years | 2 | From final close |
| `termYears` | `funds["Fund name"].termYears` | Fund term (years) | years | 5 | From final close |
| `extensionCount`, `extensionYears` | `funds["Fund name"].extensionCount`<br>`funds["Fund name"].extensionYears` | Extension options; Extension length | count, years | 2, 1 | Fund term extensions |
| `targetEquity` | `funds["Fund name"].targetEquity` | Total commitments ($) | $ | 0 (Model Fund I: 100,000,000) | LP + GP commitments; drives dry powder and sub line size |
| `gpCommitPct` | `funds["Fund name"].gpCommitPct` | GP commitment (% of equity) | % | 5 | GP share of every capital call |
| `prefPct` | `funds["Fund name"].prefPct` | Preferred return (% / yr) | % | 9 | LP pref, compounding annually |
| `hurdleRatePct` | `funds["Fund name"].hurdleRatePct` | Hurdle rate / cost of capital (% / yr) | % or blank | blank = pref | Override of the hurdle rate (§7.22) |
| `catchUpGpPct` | `funds["Fund name"].catchUpGpPct` | GP catch-up (%) | % | 100 | Share of distributions to the GP during catch-up |
| `tiers` | `funds["Fund name"].tiers` | Tier n IRR hurdle / LP split / GP split | %, %, % | 12% 80/20, 18% 70/30, above 60/40 | Promote tiers (up to 5; blank hurdle = top tier) |
| `mgmtFeePct` | `funds["Fund name"].mgmtFeePct` | Management fee (% / yr) | % / yr | 0 (Model Fund I: 1.5) | Fund-level fee, quarterly in advance, LPs only (§7.20) |
| `mgmtFeeBasis` | `funds["Fund name"].mgmtFeeBasis` | Management fee basis | `commitments-then-invested` / `invested` | commitments-then-invested | LP commitments during the investment period, then LP invested capital |
| `rentRollModel`, `testDataModel`, `noiModel`, `sicModel`, `sizingModel` | `funds["Fund name"].…` | — | text | mtm-v1, v2, rentroll-v1, sic-v1, lsc-v1 (Model Fund I) | Mark one-time updates already applied to a saved workspace (rent rolls, removed sample assets, rent-roll NOI, tenant SIC codes, loan sizing tests); not edited |
| `sellHold` | `funds["Fund name"].sellHold` | — | object | {} | Sell / hold: `decisionDate`, `capRates` {deal id: %}, `refi` {deal id: {ltvPct, minDscr, spreadPct, feePct, termYears}}, `decisions` {deal id: {decision, years}}, `scenarios` [{name, decisionDate, decisions, savedAt}] (§7.23) |
| `cashReserveQuarters` | `funds["Fund name"].cashReserveQuarters` | Fund cash reserve (quarters of expenses) | quarters | 2 | Minimum fund cash: quarters of projected fees + sub line costs |
| `feeModel` | `funds["Fund name"].feeModel` | — | text | fund-v1 (Model Fund I) | Marks a workspace already moved to the fund-level fee (set once; not edited) |
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
| `delinquency` | `funds["Fund name"].delinquency` | — | `{ mapping: { properties: {code: deal id}, tenants: {code: unit id} }, months: { "YYYY-MM-DD": { rows, file, uploadedAt } }, notes: {tenant code: text}, ledger }` | none | Yardi aged receivables by month-end (§7.29) |

### 11.8 Capital activity entry (`capitalActivity[]`)

| Field | Stored at (`workspaces.data`) | Import column [also accepted] | Units | Meaning |
|---|---|---|---|---|
| `id` | `funds["Fund name"].capitalActivity[].id` | — | text | Unique id |
| `date` | `funds["Fund name"].capitalActivity[].date` | **Date** [call date, value date, transaction date] | date | Date of the call, draw or repayment |
| `type` | `funds["Fund name"].capitalActivity[].type` | Type [transaction, activity] | `call` / `draw` / `repay` / `expense` | Capital call, sub line draw, sub line repayment ("paydown", "draw", "call" recognized; blank = call), or fund expense paid (record only) |
| `amount` | `funds["Fund name"].capitalActivity[].amount` | **Amount** [total, call amount, capital called] | $ (LP + GP) | Positive; "(500,000)" and "-500,000" are read as 500,000 |
| `purpose` | `funds["Fund name"].capitalActivity[].purpose` | Purpose [asset, use, description] | `acq:<deal id>` / `fees` / `line-repay` / `line-interest` / `other` | What it funded. An asset name in the text tags that asset. |
| `notes` | `funds["Fund name"].capitalActivity[].notes` | Notes [memo, comments, details] | text | Details; shown when hovering over the Source label |
| `source` | `funds["Fund name"].capitalActivity[].source` | — (export: Source) | blank / `import` / `kept` | How the entry was created: User added (blank), User imported, or Automatic, kept. Automatic entries (§7.20) are not stored. |

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
| `field` | text | app | What changed, e.g. "Deal Screener › Exit cap (%)" |
| `path` | jsonb | app | Location in the workspace JSON |
| `from_value` / `to_value` | jsonb | app | Old and new value |
| `note` | text | app / function | Events: "Created workspace", "Added as editor", "Bulk change", imports … |

The trigger `audit_stamp` overwrites `at`, `user_id` and `user_email` on
every insert, so the app can't set them.

**`lease_documents`**: one row per lease (created by `supabase/leases.sql`).
Index on (`workspace_id`, `deal_id`).

| Column | Type | Default / set by | Meaning |
|---|---|---|---|
| `id` | uuid, primary key | app (random) | Lease id; also the lease's storage folder |
| `workspace_id` | uuid → `workspaces.id` (cascade) | app | Workspace |
| `deal_id` | text, required | app | The asset (`deals[].id` or `savedDeals[].id`) |
| `unit_ids` | text[] | `{}` | Rent roll units covered (`units[].id`) |
| `tenant`, `title` | text | `''` | Tenant name; optional title |
| `files` | jsonb array | `[]` | Documents in order: `path`, `name`, `size` (bytes), `kind` (lease / amendment / other), `uploaded_at`, `uploaded_by_email` |
| `status` | text | uploaded | uploaded → abstracted → applied |
| `abstract` | jsonb | null | The abstract (§7.24): the CREparser connector's validated lease object (`title`, `summary`, `property_type`, `documents`, `fields`, `rent_schedule`, `critical_dates`, `risks`) plus `app` (`tenant_business`, `sic_code`, `draft_id`, `validated`, `files`, `made_with`, `version`). Saved only through `save_lease_abstract` |
| `abstracted_at`, `abstracted_by_email` | timestamptz, text | null | When and by whom it was abstracted |
| `applied_at`, `applied_by_email` | timestamptz, text | null | When and by whom it was applied to the rent roll |
| `created_by`, `created_by_email` | uuid, text | signed-in user | Who added the lease |
| `created_at`, `updated_at` | timestamptz | now | When added / last changed (trigger) |

Every insert, change and delete writes `audit_log` rows with area
**Leases**: "Lease added", "Documents" (file names before and after),
"Status", "Lease details" (tenant, units, asset), "Abstract", "Lease
deleted".

**`lease_credit_documents`**: one row per tenant credit document (created
by `supabase/tenant_credit.sql`; §7.27). Owners and editors only. Index on
(`workspace_id`, `lease_id`).

| Column | Type | Default / set by | Meaning |
|---|---|---|---|
| `id` | uuid, primary key | random | Document id |
| `workspace_id` | uuid → `workspaces.id` (cascade) | app | Workspace |
| `lease_id` | uuid → `lease_documents.id` (cascade) | app | The lease (same workspace) |
| `deal_id` | text | app | The asset |
| `kind` | text | credit_report | credit_report, financial_statement, tax_return, bank_reference, other |
| `subject`, `subject_name` | text | tenant, `''` | tenant or guarantor; the guarantor's name |
| `source` | text | `''` | Bureau, CPA, "guarantor-prepared", … |
| `audited` | boolean | null | Statements: audited or not |
| `period_end`, `report_date` | date | null | Statement period end; credit report date |
| `file` | jsonb | null | `path` (…/`credit`/…), `name`, `size` |
| `figures` | jsonb | `{}` | `score`, `rating`, `revenue`, `netIncome`, `ebitda`, `currentAssets`, `currentLiabilities`, `currentRatio`, `totalDebt`, `equity`, `debtToEquity`, optional `quotes` |
| `figures_source` | text | manual | manual or claude |
| `notes` | text | `''` | Notes |
| `uploaded_by_email` | text | signed-in user | Who added it |
| `created_at`, `updated_at` | timestamptz | now | When added / last changed |

Inserts, changes and deletes write `audit_log` rows with area **Tenant
credit** ("Credit document added / changed / deleted"), without figures.

**`deal_documents`**: one row per deal or fund document (created by
`supabase/deal_documents.sql`; §7.28). Index on (`workspace_id`, `deal_id`).

| Column | Type | Default / set by | Meaning |
|---|---|---|---|
| `id` | uuid, primary key | app (random) | Document id; also its storage folder |
| `workspace_id` | uuid → `workspaces.id` (cascade) | app | Workspace |
| `deal_id` | text | app | The asset; null for fund documents (LPA, PPM, other) |
| `fund_name` | text | `''` | The fund |
| `doc_type` | text | required | om, rent_roll, t12, loi, psa, ic_memo, closing_acq, closing_disp, lpa, ppm, insurance_cert, loan, rate_cap, appraisal, estoppel, cam, billing, other |
| `title` | text | `''` | Optional title |
| `lease_id` | uuid → `lease_documents.id` (set null) | null | Tenant insurance certificate (and later estoppels): the lease |
| `files` | jsonb array | `[]` | `path`, `name`, `size`, `uploaded_at`, `uploaded_by_email`, in order |
| `status` | text | uploaded | uploaded → abstracted → applied |
| `abstract` | jsonb | null | §7.28; saved only through `save_deal_abstract` |
| `applied_fields` | jsonb | `{}` | Field key → `{ at, by }` for each field applied |
| `abstracted_at`, `abstracted_by_email`, `applied_at`, `applied_by_email` | timestamptz, text | null | Who and when |
| `created_by_email`, `created_at`, `updated_at` | text, timestamptz | signed-in user, now | Who added it; when added / changed |

Every insert, change and delete writes `audit_log` rows with area
**Documents** ("Document added", "Files", "Status", "Abstract", "Document
details", "Document deleted").

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

The app saves the firm's data only to a hosted Postgres database on
[Supabase](https://supabase.com). Without signing in the app is View only
and nothing is saved; nothing is ever saved in the browser.

**What the database adds:**
- **Sharing:** one firm, with owner, editor and viewer access.
- **Record-by-record saving:** each change is saved within about a second,
  and screens update live.
- **Verified change log:** entries record the signed-in user and the
  server's time, and can't be edited or deleted.

**Firm records (phase Q, `supabase/firm_records.sql`, applied 11/22).**
- **Storage:** the firm's data lives in `firm_records`, one row per item:

  | `kind` | `key` | Holds |
  |---|---|---|
  | `deal` | deal id | an open deal (`sort` = tab order) |
  | `saved_deal` | deal id | a saved fund snapshot |
  | `fund` | fund name | fund terms |
  | `valuation` | deal id | quarterly marks |
  | `settings` | `main` | comps, forward curve and other settings |
  | `local_log` | `main` | the working change log, kept for history; not re-saved |

  Each row has a `version`, `updated_by_email` and `updated_at`.
- **Saving:** writes go only through `save_records(ws, items, changes)`:
  - each item names the version it started from;
  - a mismatch refuses the whole call (`conflict: kind/key is at version n`)
    and nothing is saved;
  - `changes` go to `audit_log`;
  - only owners and editors can save, and archived workspaces are refused.
- **Never hard-deleted:** a removed deal is saved with `deleted = true`.
- **Live updates:** `firm_records` is in the `supabase_realtime`
  publication. Open screens apply other people's saves, and row-level
  security limits each person to their firm.
- **The migration (11/22):** the user's real workspace ("Moved from browser
  11/21/2026") became the firm and was renamed **Baywise**:
  - 12 deals, 1 fund and the 247-entry working log moved across, and a
    rebuild was checked to equal the original exactly;
  - its leases, documents, members and change log stay attached (same
    workspace id);
  - the two other workspaces were **archived** (`workspaces.archived`): kept,
    never shown, never deleted;
  - `workspaces.data` was left as a fallback, and `records_from_version`
    notes the version it was copied from.
- **Old-app saves:** if an older copy of the app saved after the move, owners
  see **Import changes made in the old app**, a one-time import.

### 12.1 Project and keys

| Item | Value / location |
|---|---|
| Project | `nydqmigxorahfkfpkjnq` (Supabase dashboard → your project) |
| Project URL | `https://nydqmigxorahfkfpkjnq.supabase.co` (in `lib/cloud.js`) |
| Publishable (anon) key | In `lib/cloud.js`. Designed to be public: sign-in and row-level security decide what anyone can read or write. |
| Secret / `service_role` key | Never in the app, the repository or chat. It bypasses all security. Use it only in the Supabase dashboard. |
| Setup script | [`supabase/setup.sql`](../supabase/setup.sql) |
| Client library | `@supabase/supabase-js` 2.x |
| Sign-in method | Email + password (Authentication → Sign In / Providers → Email). Email is used to confirm new accounts and for password resets. |
| Site / Redirect URL | `https://williamggalipeau-cloud.github.io/underwriting-calculator/` (Authentication → URL Configuration) |

### 12.2 One-time setup

1. **Run the setup script.** Go to **SQL Editor → + New query**, paste
   `supabase/setup.sql` and click **Run**. You should see "Success. No rows
   returned".
   - It's safe to run again: it creates what's missing and replaces the
     functions and policies.
   - "Syntax error at end of input, LINE 0" means the editor was empty or
     only highlighted text was run. Paste again with nothing selected.
   Then run `supabase/leases.sql` the same way. It adds the lease documents
   table and the private **leases** storage bucket (§12.4). It is safe to
   run again. (Both are already applied to the project.)
2. **Set the sign-in address.** Under **Authentication → URL
   Configuration**, set **Site URL** to the address above and add it under
   **Redirect URLs**.
3. **Optional hardening** (Authentication settings):
   - turn off new sign-ups and invite people only;
   - require multi-factor authentication;
   - use a custom SMTP sender so confirmation and reset emails come from
     your domain;
   - turn on **leaked password protection** (Authentication → Passwords),
     which rejects passwords known from data breaches.

### 12.3 How the app uses it

**Sign-in is required to change data.** `REQUIRE_SIGN_IN` is set in
`lib/cloud.js`.
- **Signed out:** the app is view-only. A banner says "View only. Sign in
  to enter or change data". Every tab can still be viewed, sorted and
  opened, but nothing typed is kept.
- **Signed in:** editing starts once your database workspace has opened.
- **Blocked while view-only:** importing workspace files, loading the
  samples or test scenario, clearing test data and resetting.
- **Viewers** of a database workspace stay view-only after signing in.
- **This is a screen rule.** The database itself only accepts saves from
  signed-in owners and editors. Someone determined could still change the
  copy held in their own browser, but those changes can't reach the
  database.
- **`REQUIRE_SIGN_IN = false`** would allow typing while signed out, but
  those changes are never saved, because the app keeps nothing in the
  browser.

| Action in the app | What happens in the database |
|---|---|
| **☁ Sign in** (View only banner) | Email + password sign-in through Supabase Auth. **Create an account** sends a one-time confirmation email; **Forgot password?** sends a reset link that reopens the app to choose a new password. The session is kept in this browser. After sign-in the app calls `claim_invites()`. |
| **☁ Database → Save to database** | `create_workspace(name, data)`: a new `workspaces` row (version 1). You become its owner, and a "Created workspace" audit row is written. |
| Editing, then a save (about 20 seconds after the last change, on **Save now**, or when you leave the page) | `save_workspace(id, expected version, data, changes)`. In one transaction it: (1) checks nobody saved since your version; (2) copies the old version to `workspace_versions`; (3) stores the new data with version + 1; (4) writes one `audit_log` row per changed field. |
| Someone else saved first | The save is refused (conflict). The app offers **Open latest** (load theirs) or **Keep mine** (save over it; theirs stays in `workspace_versions`). |
| **Open** a workspace | Reads `workspaces.data` and loads it into the app. On sign-in, the app opens your most recently saved workspace, or creates one if you have none. If opening applies updates (for example new fund terms, the fund-level fee, or new sample dates and holds), they are saved straight away as a new version, with the changes in the audit log. |
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
                 ├── (many) audit_log            one row per changed field
                 └── (many) lease_documents      one row per lease; its PDFs in Storage
auth.users (Supabase) ── user_id in workspace_members / audit_log

Storage bucket "leases" (private, PDF only, 50 MB per file):
  <workspace id>/<deal id>/<lease id>/<timestamp>-<file name>.pdf
```

Deleting a lease in the app removes its files from storage first. Deleting
a whole workspace removes its lease rows; their files stay in the bucket
until removed in **Storage → leases**.

Column-by-column definitions of every table are in the data dictionary,
[§11.13](#1113-database-tables-supabase).

### 12.5 Access rules (row-level security)

**Leases** (`lease_documents` and the `leases` storage bucket): every member
(owner, editor, viewer) can read rows and open files, except files in a
lease's `credit/` folder (`lease_path_is_credit`), which only owners and
editors can open; owners and editors can add, change and delete them,
directly under these rules. **Tenant credit** (`lease_credit_documents`):
owners and editors only, for reading as well as changes. **Documents**
(`deal_documents` and the `deal-docs` bucket): every member reads and
opens; owners and editors add, change and delete; abstracts are saved with
`save_deal_abstract` (owners and editors). Storage paths must
start with the workspace id (`lease_path_ws`). Abstracts are saved with `save_lease_abstract`
(owners and editors; checked in the function as well).

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
| `save_lease_abstract(lease, abstract)` | owner, editor | new status | Saves a lease's abstract (must be a JSON object) and sets status `abstracted`, `abstracted_at` and `abstracted_by_email`; `null` removes it (status back to `uploaded`). A new abstract always needs review again, even after an earlier one was applied. Logged as "Abstract" in `audit_log`. |
| `log_note(ws, note_text)` | owner, editor | — | Adds a note row to the audit log |
| `add_member(ws, member_email, member_role)` | owner | `added` / `invited` | Adds or updates a member, or records an invite; logs it |
| `remove_member(ws, member_email)` | owner | — | Removes a member or invite (never the last owner); logs it |
| `claim_invites()` | the signed-in user | count | Turns invites for your email into memberships |
| `ws_role(ws)`, `ws_can(ws, roles)` | internal | role / yes-no | Used by the rules above |

Only signed-in users (the `authenticated` role) can run these functions;
signed-out visitors (`anon`) can't. The trigger functions `ws_after_insert`
and `audit_stamp` can't be called directly by anyone; the database runs
them on its own.

**Security advisor.** Supabase's advisor (Database → Advisors) reports:
- *"Signed-in users can execute SECURITY DEFINER function"* (8 functions).
  Expected, by design. The functions above are the only way to write, and
  each checks the caller's role before doing anything. `ws_role` and
  `ws_can` only tell a caller their own role.
- *"Leaked password protection disabled."* Turn it on (Authentication →
  Passwords) now that the app signs in with passwords (§12.2 step 3).

Re-run the advisor after any change to `setup.sql`. A new warning about a
table without row-level security, or a missing policy, does need fixing.

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
2. Download a backup (a safety copy; the restore also makes one).
3. In the SQL Editor, copy the old `data` from `workspace_versions`.
4. Paste it into a `.json` file and **Restore from backup** (owners only).

Doing it this way records the restore in the audit log. Editing
`workspaces.data` directly in the SQL Editor works too, but it isn't logged
and doesn't bump the version.

### 12.7 Backups, limits and costs

- **Backups:** the free plan has no automatic backups you can restore
  yourself. Paid plans keep daily backups. Use **Download backup** now and
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
| A confirmation or reset link opens a page that isn't the app, or says "redirect URL not allowed" | Set the Site URL and Redirect URL (§12.2 step 2) |
| No confirmation or reset email | Check spam. Supabase's built-in sender is rate-limited (a few emails per hour); for regular use set up custom SMTP. |
| "Someone else saved this workspace…" | Another person saved first. Choose **Open latest** or **Keep mine**. |
| "You don't have permission…" | Your role doesn't allow it (viewers can't save; only owners manage access) |
| The project is paused | Supabase dashboard → **Restore project** |

### 12.9 Saved workspaces

| Workspace | Created | Contents |
|---|---|---|
| **Model Fund I** | 11/22/2026, version 1, by the project owner (who is its owner) | The sample fund with the test scenario loaded: created with 14 assets ($100M commitments). When it next opens it drops "Light Industrial (30k SF)" and "Small Bay Industrial — Phase I" (removed from the sample and test data), leaving 12: the nine sample assets and Eastside Distribution Hub, Northgate Flex Center and Riverside Commerce Park. No capital activity, valuations or comps yet. |

It was created by Claude through the Supabase connector, using the same
`create_workspace` function as the app's **Save to database** button and
signed as the owner, so its audit row ("Created workspace") shows the
owner's email.

Its test scenario deals were saved before they had acquisition dates
and with their earlier holds (5–8 years, past the fund term). When the
workspace next opens, the app gives them their acquisition dates (§2,
Sample portfolio) and 4-year holds, re-runs the three saved snapshots, and
saves the result as a new version, so every asset is held 4 years and exits
in 2030.

**To start using it:** sign in on the site. As the most recently saved
workspace, it opens automatically. If the browser still held data from an
earlier version of the app, that is moved in first as **Moved from
browser** and opens instead; switch with **☁ Database → Your workspaces →
Model Fund I → Open**.

## 13. Roadmap

*Lease, documents, performance and reporting: phases A–V.* What has been built and
what is coming, kept up to date as each phase finishes. The full scope of
each phase and the decisions behind it are in
[`docs/DEAL_DOCUMENTS_PLAN.md`](DEAL_DOCUMENTS_PLAN.md).

| Phase | What it does | Status |
|---|---|---|
| A. Lease documents | Upload, store and open each lease's PDFs per asset (Leases tab) | ✅ Live |
| B. Lease abstraction | Abstract with Claude, Save abstract, View abstract (§7.24) | ✅ Live |
| C. Review and apply | Apply an abstract to the rent roll (replace or add a unit); rent steps and renewal options drive the cash flow; mismatch flags (§7.25) | ✅ Live (PR #69) |
| D. Fund lease views | Critical dates, risk flags, Excel and printable reports, lease info on the Asset Summary; tenant credit reports and financial statements on each lease (§7.26–7.27) | ✅ Live (PR #70) |
| E. Acquisition documents | New Documents tab: OM, rent roll, T-12, LOI, PSA, final IC memo, acquisition and disposition closing statements, insurance certificates (owner and tenant); the fund's LPA and PPM, also from New fund (fund terms and investment limits) | ✅ Live (PR #71) |
| F. Loan agreement | Loan terms, rate cap, covenants and dates to the Debt tab; executed rate cap confirmations read into the cap schedule (counterparty, strike, dates, premium) | ✅ Live (PR #71) |
| G. Appraisal | Appraised value and cap rate to the Valuation tab | ✅ Live (PR #71) |
| H. Estoppels, CAM, billing and delinquency | Estoppels checked against leases and the rent roll; CAM and billing checked against lease terms; rent delinquency imported from Yardi | ✅ Live (PR #72) |
| I. Asset business plan and budget vs. plan | Business plan per asset (strategy, leasing, capex, financing, exit, milestones, KPIs, photos, map, floor plan by unit) with revisions and PDF export; budget locked at closing; plan vs. budget vs. actual by line | ✅ Part 1 live (PR #73): plan, revisions, budget, actuals, variance, PDF / Excel, fund card. Part 2 built 11/23: photos, Google map, floor plan, demising / combining, actual NOI in Valuation and Sell/Hold |
| Layout (11/23) | Baywise name and tagline, grouped tab bar and renamed tabs, firm-wide header strip, Asset Return target warnings and DSCR, SOFR panel on Debt, fund NAV and interim returns on Fund Return, fund type tag (Fund / Separate Account / Joint Venture) | ✅ Built 11/23 |
| J. Underwritten vs. actual | Acquisition underwriting vs. actual and projected results, with the return gap by cause | ✅ Built 11/23: frozen baseline per asset, by-year and returns comparison, IRR gap by cause, fund ranking, Excel and PDF (§7.32) |
| K. Fund plan vs. actual | Fund plan vs. actual capital, deployment, distributions, NAV and returns; on Sell/Hold, change the hold period and see the fund-level impact | ✅ Built 11/23: Fund Plan tab (frozen plan and re-forecasts, plan vs. actual vs. forecast vs. targets, chart, attribution by asset and cause, Excel and PDF); Sell/Hold all-asset hold change, past-term flags, TVPI, DPI by term end, GP promote (§7.33) |
| L. Performance and risk reporting | Quarterly performance report (shareable and internal versions) and an internal-only risk report (concentration by SIC, geography, lender and cap counterparty; fund limits; TI funding heat map; insurance; delinquency; environmental and climate risk); mock (drawn) photos and floor plans for the sample assets; the full Asset Business Plan PDF (photos, floor plan, location, actual NOI, underwritten vs. actual); Asset Return: GP ROE, "GP profit" relabel with a true GP promote row, and projected fee revenue (property and construction management fees by year; the AM fee is the fund management fee) | 🔨 Started 11/23: Asset Return GP rows and fee revenue; the full business plan PDF (§7.32a); drawn sample photos and floor plans; Reports tab with the quarterly report, shareable and internal, issued versions (§7.32b); fund limits with a pre-acquisition check (§7.32c); the internal risk report (§7.32d). TI funding heat map, stress tests, insurance and lease flags (§7.32d). TI actions and change vs. last quarter. Remaining: insurance vs. loan requirements, an asset map sized by value |
| M. Fund impact modeling and Pipeline | Pipeline tab of deals being watched (manual entry or CoStar / spreadsheet upload, stages Watching to Closed). Add a candidate asset to a fund as a what-if and see the effect on fund returns, capital, mix and limits; Deal Screener and Full Underwrite are the two ways to add a candidate; pipeline report with the top 10 assets; Deal Screener gets a fund picker showing the impact of acquiring the asset, and lists pipeline assets only (Deal Screener is not retired) | 🔨 Started 11/23: Pipeline tab (§7.35); Deal Screener pipeline-only with Model in fund (§7.36). Fund Impact tab (§7.37); pipeline report (§7.35). Fund Impact PDF; Update pipeline row from the screener; Add to pipeline from an OM (11/23) |
| N. Fund Summary | New Fund Summary tab: key dates (launch, final close, investment period end), key terms, and capital raised, deployed and available (plus end of term with extensions, % called and sub line use; PDF and Excel export; links to the tabs that already show performance, the portfolio and dates); all key terms; legal entities (fund, GP, manager, asset companies) with an ownership chart and annual-report dates; uploads for org charts and formation documents; one-page fact sheet | ✅ Built 11/23: Fund Summary tab (§7.38) |
| O. Asset and fund setup | New / Edit asset and New / Edit fund buttons; the inputs panel opens only from them | ✅ Built 11/23: New / Edit asset slide-over, New / Edit fund (§7.39) |
| P. Dispositions | Dispositions group: Assets for Sale (whole or partial sales, BOVs, broker, stages, closing and distribution), Offers (every offer received, net proceeds side by side), Track Record (realized results vs. underwriting and marks), Documents; uploads in each tab; Excel and PDF exports | ✅ Built 11/23: Assets for Sale, Offers, Track Record, Sale Documents, Start sale from Sell/Hold, LP / GP split, Excel and PDF, Home lane (§7.43); reading documents in with Claude later |
| Q. Workspace storage | One firm, no workspaces to choose; every change saved within about a second, record by record; live updates; nothing overwritten when two people edit | ✅ Built 11/22 night (PR #80) |
| R. Leasing | Leasing tab (Asset Management): Leasing Pipeline (leasing prospects) and Rent Comps, with uploads | ✅ Built 11/23: Leasing Pipeline (prospects and renewals, net effective rent, vs. plan), Rent Comps (manual and upload, filters, set market rent), whole-fund view, documents, Excel and PDF, Home items (§7.44) |
| S. Fund Debt | Fund Debt tab (Portfolio Management): every loan, maturities, rate exposure, covenant certificates | ✅ Built 11/23: loans, maturity ladder, extension tests, refinance planner, rate exposure and caps, lenders, covenant compliance certificates (Excel and PDF), tab Excel and PDF, Home alerts (§7.45) |
| T. Property Management | Property Taxes, Insurance, Property Condition and Service Contracts tabs, linked to Yardi Construction Manager; TI spend by unit, with mock TI actuals on the sample assets | 🔨 Parts 1–2 built 11/23: Property Taxes, Insurance, Property Condition, Service Contracts (one asset and whole fund, summaries, key dates, uploads, Excel and PDF, findings to the capital plan), Home items (§7.46); Yardi construction and TI spend next |
| U. Market | Market Data tab: submarket statistics with sources; Stress Testing shocks shown in standard deviations, with a simulation of how likely the stressed case is | ⛓ After T |
| V. Automated workflow | Approvals and reminders | ⏸ Later |
| X. Distribution Analysis | New tab in Portfolio Management after Fund Return: distributable cash from asset cash (Yardi upload or entered, else the model's projected cash, labelled as projected) and fund cash, after 3 months of asset and 6 months of fund expenses and any sub line repayment the term sheet requires; choose the distribution (LP / GP split per the LPA); projected yield on contributed capital and NAV; last 4 quarters of distributions | ✅ Built 11/23: distributable cash by asset and fund, Yardi cash upload with the projected fallback, sub line rule, LP / GP split per the waterfall, yields, 4-quarter history, proposals and record as paid, Excel and PDF (§7.34) |
| Revert | Revert any change from the change log, restore a deal or fund as of a date, and bring back deleted ones | ✅ Built 11/23: Revert button, Restore as of a date with preview, Recently deleted (§7.41) |
| Z. Home page | The page the app opens on: attention list, one workflow lane per tab header (Acquisitions, Dispositions, Asset Management, Property Management, Portfolio Management, Market, Library) with live numbers, fund cards, quick actions (New deal, New fund setup, uploads, capital activity, new report), recent activity | ✅ Built 11/23: attention list, recent activity, fund cards, lanes for the tab headers that exist, quick actions; follows Working on (§7.42) |
| Fund picker | "Working on" dropdown in the header (All funds, or one Fund / SMA / JV) that filters every tab and is remembered for each person | ✅ Built 11/23: header Working on dropdown; every tab, the header figures and the asset list follow it; remembered on the sign-in (§7.40) |
| Demo firm | A separate Demo firm for the sample fund and test deals, so the real firm holds only real assets; the Sample data menu moves there | ⛓ After the fund picker |
| Mock comps | Fictional sales comps and lease comps for each Model Fund I asset, so the Sales Comps tab, valuations and reports show a full set | ⛓ Future release |
| Y. Benchmarking | New tab in Portfolio Management: fund and asset returns vs. NCREIF (property, time-weighted), Preqin and Cambridge Associates (fund vintage quartiles) from your licensed data uploads, and a public market equivalent against the FTSE Nareit Industrial index and a small-bay REIT basket (EastGroup, Rexford, Terreno, STAG) | ⛓ After L |
| W. GP Economics | New tab in Portfolio Management after Fund Return: fee revenue by year (the fund management fee, which is the asset management fee, plus property and construction management fees), promote kept separate, GP co-invest returns and GP ROE; firm-wide, by fund and by asset; internal PDF and Excel | ⛓ After L |

**How phases are delivered.**
- **Scheduling:** phases I–O run in scheduled 5-hour windows (from 11/22, 8:40
  PM Pacific). Phases Q–U run in bundles, one per usage window, each started
  when you say "next bundle":
  1. Q, with you present;
  2. P;
  3. R and S;
  4. T;
  5. U.
  V (automated workflow) is scoped later.
- **Testing:** each phase comes with this manual updated and Node and
  Playwright tests. The tests are kept in the repository and run
  automatically on every pull request.
- **Merging:** each phase goes into a pull request that is merged only when
  you say so.
- **Your data:** CREparser connectors are used to validate only, so your free
  documents are not used. Nothing changes your data until you click to apply
  it.

**What each phase adds**

- **A. Lease documents.** Add a lease with its tenant, rent roll unit(s) and
  PDFs in order (lease, then amendments). Stored privately; viewers read,
  owners and editors change; every change is logged.
- **B. Lease abstraction.** A prompt for a Claude session with the CREparser
  connector produces a validated abstract (67 fields, rent schedule,
  critical dates, risks), each value with its clause, quote and page link.
- **C. Review and apply.** Compare the abstract with the rent roll field by
  field and apply the ones you choose, to an existing unit or a new one.
  Rent steps set the rent while the lease runs; renewal options decide
  renewals when the option rent is at or below market.
- **D. Fund lease views.** Every deadline and risk flag across the fund,
  with exports, and lease status on the Asset Summary. Each lease also gets
  a Tenant credit section for credit reports and tenant or guarantor
  financial statements (owners and editors only), with key figures and
  flags for stale statements and falling credit.
- **E. Acquisition documents.** Each document's key figures shown beside the
  model and applied by choice; the IC memo gives approved vs. current and a
  conditions checklist; closing statements set the actual cost basis and
  the realized sale. The fund's LPA and PPM, uploaded when you create a fund
  (New fund) or later, are read for the fund terms (fees, preferred return,
  promote, term, investment period) and the investment limits, which you
  review and apply one by one. Insurance certificates (the owner's policies
  and each tenant's) are checked against lease and loan requirements, with
  expiry dates tracked.
- **F–H.** Loan agreements and executed rate cap confirmations (each cap's
  counterparty, strike, dates and premium replace the modeled ones on the
  Debt tab, checked against the loan's cap requirement), appraisals, estoppels and CAM reconciliations
  read the same way and checked against the model and the leases. Phase H
  also imports Yardi's monthly aged delinquency report: arrears by tenant
  in 30, 60, 90, 180 and over-180-day buckets, delinquency % by asset and fund,
  a fund total of all amounts owed by aging bucket, default and cure terms, and
  deposit and guarantor coverage.
- **I. Asset business plan.** A business plan for each asset (thesis,
  leasing, capital, operating, financing and exit plans, milestones, KPIs and
  risks), with your asset photos, a location map and a floor plan showing
  each unit with its size, tenant and status. Demising a unit into smaller
  units (or combining units) is planned once and flows through the capital
  plan (cost, downtime), the leasing and operating plan (new units, rents,
  recoveries, operating costs) and returns (yield on cost). The plan at
  closing is
  revision 1; any change to the asset while
  it's held creates a new revision, so no revision is ever overwritten.
  Export any revision to PDF.
- **I–K.** Track each asset's budget, each deal's underwriting and the
  fund's plan against actual results, with variances explained.
- **L. Performance and risk reporting.** A quarterly performance report in
  a shareable version (to post to your investor portal) and an internal
  version with more detail, plus an internal-only risk report: lease
  rollover, tenant concentration and credit, industry (SIC) concentration
  by asset and for the fund, geographic concentration for the fund (state
  and metro, with a map), each against the fund's limits from the LPA and
  PPM (actual vs. limit, headroom, breaches, and a check on pipeline deals
  before purchase), lease risk flags, insurance gaps and expiries, debt
  maturities and covenant cushions, debt concentration by lender, rate cap
  counterparty exposure (notional and market value by the institution that
  wrote each cap, ratings against loan requirements), a TI funding heat map (whether each
  asset's TI is covered by its loan's TI facility and draw test, its own
  cash flow, the sub line or a capital call, quarter by quarter, with
  what-if actions), valuation sensitivity, budget and
  underwriting variances, stress tests and a watch list. Investor records,
  capital accounts and notices stay in your CRM and investor portal.
- **M. Fund impact modeling.** Add one or more candidate assets to a fund as
  a what-if (nothing changes until you choose Add to fund) and see the fund
  with and without them: net and gross IRR, multiple, promote, capital
  calls and dry powder, NOI and yield, leverage, concentration and fund
  limits. In the Deal Screener you can pick a pipeline asset (Model in
  fund) and model its effect on the fund, against owned assets only or owned
  plus the other pipeline assets, without changing the pipeline deal unless
  you save back. A **pipeline report** (PDF and Excel) summarizes the
  pipeline by stage, capital needed against dry powder and its effect on
  the fund, with the top 10 assets (ranked by price, or another measure
  you choose). Compare candidates and find the highest price that still meets
  the fund's target. Modeling only: scenarios never change your actual
  data. Each scenario is named and saved; a saved version is never
  overwritten, and any change creates a new version. Every version exports
  to Excel and PDF, marked "Scenario — not actual". Deal Screener
  becomes the quick way to add a candidate here, and the separate Quick
  Underwrite tab is then retired (deals and results unchanged).