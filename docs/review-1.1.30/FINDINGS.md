# End-to-end review of Baywise 1.1.30: ranked findings (first half)

Reviewed 11/28/2026 at version 1.1.30. Four reviews: calculations, tie-out, loading and saving, design and user flow. Nothing in the app or in your firm's data was changed.

**Every figure quoted is test copy** (the fictional sample portfolios), not your firm's data. Your firm's live data was not read for this review.

**How to read this.** Each line has an ID. Reply with the IDs you want fixed in 1.1.31 (or "all of A and B"). The full detail behind each line, with file and line numbers and the numbers each reviewer ran, is in the four reports in this folder.

**Checked by me:** I read the code behind A1 to A4, B1 to B5, B9, B10, B12, B13 and D1, and looked at the screenshots behind E2 and the mockup. They hold. The others were reproduced by the reviewers with scripts on the sample data; I have not re-run each one.

Still to come (second half): security, the manual against the screens, test coverage and dead code.

---

## A. Your data could be lost or changed without you knowing

None of these has been seen on your firm's data. They are sequences that can happen.

| ID | What happens | When | Size |
|---|---|---|---|
| A1 | An edit typed while a save is in progress is not saved, and the screen says "Saved". It is saved only if you edit something else later in the same session. | Any edit made in the second or two an autosave takes | Small |
| A2 | A construction invoice upload shows on screen and is never saved. | The jobs are already loaded and the invoice file is for the same month as the last upload (or has no month in its name) | Small |
| A3 | The button "Import changes made in the old app" replaces everything with an old copy, with no confirmation, and the banner comes back afterwards. | Only if that banner is showing. I have not checked whether it shows for your firm. | Small |
| A4 | The automatic sample load marks every GP agreement waiting to be checked as checked, including one for a real portfolio. | At the next release that carries sample data, if a real GP agreement is waiting | Small |
| A5 | "Apply rent roll" blanks the lease start and the business description of each changed unit, without showing or logging it. | The rent roll document has no lease start or business for a unit whose rent (or another field) changed | Small |
| A6 | Edits made during the minute the sample load takes are overwritten at the end: GP partners, tenant credit on sample assets, aged receivables on Model Fund I. | You, or a colleague, edit one of those while the load runs | Medium |
| A7 | With two people working: a colleague's save removes your pending rows from the change log (the data is saved, the history is not), and can undo your last keystrokes in a 150 ms window. | Two people editing at once | Medium |
| A8 | Signing out goes ahead even when the save before it failed or was still running. | Sign out within 2 minutes of an edit, on a bad connection | Small |

## B. A figure is wrong, or two screens disagree

| ID | What is wrong | Example (test copy) | Size |
|---|---|---|---|
| B1 | Closing a sale on the Dispositions tab does not shorten the asset's hold. Returns keep the original exit date and count cash flow after the sale. (Closing by document does it right.) | Sold after 2 years of a 4-year hold: IRR 32.3% shown, 63.8% on the Track Record | Small |
| B2 | The cliff tier method and the separate-account incentive fee are ignored on Portfolio Return, Valuations and Sell/Hold. | Cliff: promote $23.0M on Portfolio Return, $27.1M on Portfolio Plan. Incentive fee: $23.0M against $11.8M | Small |
| B3 | Recording one distribution or fund expense makes "capital called" read $0. | Sample joint venture: Portfolio Summary and Home say $0 called; Reports say $68.7M | Small |
| B4 | Asset Summary's totals include an asset already sold. | Joint venture: NAV $106.3M on Asset Summary, $59.6M on Valuations and Reports | Small |
| B5 | Reports and the Risk report show a loan's original maturity; Portfolio Debt shows the extended one. | Summit: 2/28/2026 against 2/28/2027; the Risk report flags a date already past | Small |
| B6 | Occupancy has three definitions (rent roll as entered, leases in effect today, leases in effect at quarter end). | Foundry: 67.9% on the portfolio report, 75.7% on the asset report for the same quarter, 74.4% on the Business Plan | Medium |
| B7 | A quarterly report's "NOI actual" is the latest 12 months on file, not the 12 months to that quarter. Occupancy in the portfolio report has no date at all. | Summit Q3 2026: $5,155,656 shown, $5,124,642 to September. Q1's report shows the same figure. | Small |
| B8 | LTV uses different values: Portfolio Debt and the lender's covenant certificate use the purchase price; Reports, Valuations and the limits use price plus the capex budget. | Model Fund I: 70.5% on Portfolio Debt, 67.3% on Reports | Medium |
| B9 | GP promote has two formulas. They agree for Model Fund I and differ for the joint venture and the separate account. | Joint venture: $2,889,417 on Portfolio Plan, $2,704,856 on GP Economics | Small |
| B10 | WALT is weighted by SF on the Business Plan and by rent on Asset Summary, Leases and Rent Roll. The Leases tab also measures from the purchase date. | Foundry: 2.28 against 2.53 years | Small |
| B11 | Covenant tests come from three places. The compliance certificate tests the loan-sizing limits, not the loan document's covenants. | Airport Flex: the loan has one covenant (DSCR 1.25x); the certificate tests three | Medium |
| B12 | Gross multiple and gross IRR are computed two ways. | Separate account (one asset): 1.90x on Portfolio Plan, 1.98x on Asset Summary | Medium |
| B13 | A lender-funded capex budget is added after the loan-sizing tests, so the final loan fails the test it is labelled as bound by. | Minimum debt yield 9.5%: the loan shown has 8.95% | Small |
| B14 | The year-1 NOI used to size the loan is not the year-1 NOI in the cash flow (credit loss by unit, fee on equity). | Minimum DSCR 1.25: DSCR shown 1.198 | Medium |
| B15 | A negative or zero year-1 NOI switches the DSCR and debt-yield tests off; the loan becomes the full LTV amount. | NOI of -$50,000: loan $5,850,000 | Small |
| B16 | A realized sale's IRR jumps because the hold is rounded to whole years. | Sold after 1.48 years: 158.3%. After 1.51 years: 63.8% | Medium |
| B17 | No management fee during the investment period when total commitments are blank. | Fees $1.28M against $4.13M with commitments entered | Small |
| B18 | Sell/Hold charges a loan extension fee in the year of sale. | Airport Flex, hold to year 4: $62,000 too low | Small |
| B19 | An empty or fractional Hold Period, or an average lease term of 0, breaks the model (error or blank figures). | Hold 0 or 4.5 | Small |
| B20 | Model Fund I's sample distribution proposal shows $10,682 with LP $0 and GP $0 (the held-back part is not stored). "Record as paid" would post it. | | Small |
| B21 | Property debt in reports is the original loan, not the balance. Equal today only because every sample loan is interest-only. | Amortizing copy: $4,980,000 against $4,703,165 | Small |
| B22 | Reports' "unrealized gain" and three figures all called cost or basis (price plus capex, all-in basis, total cost). | Airport Flex: $7,500,000, $7,788,000, $7,815,858 | Medium |
| B23 | The year of the hold is counted three ways (calendar month, anniversary, 365.25 days), so "current-year NOI" can differ between tabs for part of a month. | | Small |
| B24 | Smaller: the last quarter's management fee is not pro-rated though the note says so ($26,950); a "hold to year 1" option appears on a purchase anniversary; the fund card counts a sold asset (3 against 2); Home's "NAV" is Fund NAV where Reports' is LP NAV, unlabelled. | | Small |

## C. Sample data that does not tie, or is not protected by a test

| ID | What | Size |
|---|---|---|
| C1 | The sample income statement file has different monthly figures from the sample actuals in the app (all 40 rows differ). | Small |
| C2 | The sample cash balances file is written by hand: made-up balances, different property codes, one asset missing. | Small |
| C3 | A limit you change on Model Fund I, or a sample item you remove or clear on a sample asset, comes back at each release. | Medium |
| C4 | If one upload fails during the sample load, every later open deletes and re-uploads the rewritten sample documents until it succeeds. (Not reproduced.) | Medium |
| C5 | The browser test of the load, in the mode your firm uses, starts from data that already holds most additions, so it would pass even if the load added nothing. No test covers: something you entered surviving the load, an edit made during it, a failed upload, or a start from version 14. | Medium |
| C6 | The tie-out test compares documents with the app. It does not compare one screen or report with another, which is why none of section B was caught. A screen-to-screen tie-out is needed. | Medium |

## D. Design problems (things that are broken or misleading)

| ID | What the user sees | Size |
|---|---|---|
| D1 | The whole app is set in Arial. The intended font (Geist) is loaded but one line in the stylesheet overrides it. | One line |
| D2 | Phone: 11 screens are wider than the screen, so tables and the report letter are cut off (Reports, Benchmarking, Portfolio Return, Property Condition, Stress Testing and six more). | Medium |
| D3 | Phone Home: the column that says what to do is squeezed to one letter wide; Upcoming Events lists all 160 rows. | Small |
| D4 | The Asset inputs panel is wider than a phone screen (Done button cut off); on desktop it cuts off the ZIP field. | Small |
| D5 | With "All portfolios" chosen, portfolio screens quietly show one portfolio, and not the same one on every tab. A joint venture's NAV can be read as the firm's. | Medium |
| D6 | Dollar amounts are typed and shown without commas (52500000). | Medium |
| D7 | A firm with no assets is told "Couldn't open your workspace" and is shown the sample fund. (Seen with test data; the real first-run path was not walked.) | Small |
| D8 | Signed out, the app shows the sample fund with nothing saying it is sample data. | Small |
| D9 | The same screen has different names: tab "Rent Roll" opens "Unit Lease Roll"; "Open in Screener" for the Underwriter; "Dashboard" for Home (27 times in the manual); "Portfolio Limits" is not a screen; "fund" used for a joint venture. | Small |
| D10 | Dates are written five ways and quarters four ways; negatives, percents and money scales several ways. | Medium |
| D11 | Rent Roll: a table row is drawn over the top bar when you scroll. | Small |
| D12 | New Portfolio Setup: "add the current asset" is ticked by default; "name is required" shows before you type; untouched defaults are marked "Entered"; a version number shows in the text. | Small |
| D13 | Wide tables are cut at the right with no sign there is more. On Pipeline it is the column that moves a deal forward. | Small |
| D14 | Leaving with unsaved changes opens a plain browser box whose buttons have to be explained in the text. | Small |
| D15 | "New asset" creates an asset with made-up figures ($9,000,000, 60,000 SF) before you type anything. | Small |
| D16 | Words a finance person would not know: "mark", "KRI", "HHI", "phase V", "18 open · 3 saved", "Psa", "Loi". | Small |
| D17 | Smaller: export and add buttons worded many ways; faint text and delete buttons; tab badges with no explanation; the Saved pill covers buttons; the User manual button opens a file on GitHub. | Small |

## E. Design suggestions (new work, not for the clean-up patch)

The reviewer's judgment: it reads as a capable internal tool, not yet as a finished product for an investment firm. In order of benefit for the effort:

| ID | Change | Size |
|---|---|---|
| E1 | Font and type scale: Geist, six sizes, nothing below 12px, money columns right-aligned with even-width digits. One format each for dates, dollars, percents and negatives (this also fixes D10). | Small to medium |
| E2 | Phone pass: lists as stacked cards, a shorter header, the inputs panel fitted (fixes D2 to D4). | Medium |
| E3 | One portfolio in view everywhere: decide what "All portfolios" means and remove the second pickers (fixes D5). | Small to medium |
| E4 | One dark top bar and a standard page header with the key figures first; Portfolio Return and the Business Plan split into sub-tabs. See the mockup. | Medium |
| E5 | A colour palette with meaning: colour only for status and the one main action per screen; one red for negatives. | Medium |
| E6 | Shared parts (button, money input, table, status label, figure card, empty state, in-app dialog) so the drift does not come back. | Large, screen by screen |
| E7 | Navigation: areas in the order of an asset's life; Asset Management's 11 tabs in three groups. | Medium |

Mockup of Home in the proposed look: `mockup-home-desktop.png` and `mockup-home-phone.png` in this folder. The small sub-lines on its cards are placeholders, not figures from the app.

---

## Decisions I need from you

These are definitions, not bugs, so the fix depends on your answer. My recommendation is first in each.

1. **Occupancy (B6):** leases in effect on the screen's own date (today on live screens, quarter end in reports). The rent roll as entered stays only on the underwriting screens.
2. **WALT (B10):** weighted by rent, as on Asset Summary, Leases and Rent Roll; the Business Plan changes to match. Or by SF.
3. **LTV (B8):** loan balance over the latest valuation; where there is none, price plus capex spent to date. One definition on every screen and on the lender's certificate.
4. **Gross multiple (B12):** the model's own (cash flow plus sale proceeds, over equity). Portfolio Plan changes to match.
5. **GP promote (B9):** the waterfall's own carry figure everywhere.
6. **Covenants (B11):** the loan document's covenants first, then the tests switched on in the Debt tab; never the sizing limits.
7. **Cost (B22):** keep three figures, name them differently: "Cost (price plus capex)", "All-in basis", "Total capitalization".
8. **"All portfolios" (D5):** on a portfolio screen, show "Choose a portfolio" with no figures, until a true roll-up is built.
9. **Expected downtime (reviewer's item, not listed above):** the model rounds expected vacant months to whole months at each lease rollover (60% renewal and 2 months gives 1 month, not 0.8). Leave as is, or book the fraction? I would leave it and say so in the manual.

## What I recommend for 1.1.31

- **All of A** (data safety), with a browser test for each.
- **All of B**, once you have answered the decisions above.
- **All of C**, including the screen-to-screen tie-out test (C6) so section B cannot come back.
- **From D:** D1, D3, D4, D7, D8, D9, D11, D12, D16: small and plainly wrong. D2 with them if you want the phone fixed now.
- **Leave for a design release** (with a mockup first): D5, D6, D10, D13 to D15, D17 and all of E.
- Plus the two items already agreed: capital projects in the IC memo and the business plan PDF, and trimming the plan document.

That is a large patch. It could be split: 1.1.31 for A and the small B items, 1.1.32 for the definitions (B6, B8 to B12, B22) and C6.
