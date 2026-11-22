# Deal documents plan (phases E–H)

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
  t12, loi, psa, loan, appraisal, estoppel, cam, billing, other), `deal_id`,
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

## Phase E: acquisition documents (OM, rent roll, T-12, LOI, PSA)

| Document | Connector tools | Applies to |
|---|---|---|
| Offering memo | `om_validate` / `om_show` | **New deal from OM**: name, address, SF, units, year built, asking price, in-place NOI, cap rate, occupancy, each with its source |
| Rent roll | `rentroll_validate` / `rentroll_show` | **Unit Roll**: preview new, changed and removed units, then replace or merge; SIC suggested from each business; lease dates, options and recoveries carried over |
| T-12 | `t12_validate` / `t12_show` | **T-12 vs underwriting**: income and each expense line in $ and $/SF beside the deal inputs, variances flagged; apply chosen lines (taxes, insurance, utilities, repairs, management, other income) |
| LOI | `loi_validate` / `loi_show` | **Deal terms**: price vs underwritten price, deposit, due diligence and closing periods, financing contingency; dates to critical dates |
| PSA | `cre_read_document` + `cre_search_text` (no PSA validator) | **Deal terms and critical dates**: price, deposits and when each goes hard, due diligence expiry, closing and extension notices, title and survey objection dates, estoppel and SNDA delivery, reps and warranties survival and cap, assignment, default remedies. The app's own PSA template is checked locally (every quote must be in the PDF) and shown as "not connector-validated" |

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

E, then F, G, H, each on the working branch, each with the manual, Node and
Playwright tests, and a PR left for review before merging. E depends on C's
apply and mismatch features and D's critical dates, so it starts after C and D
are reviewed.

## Open decisions

1. ~~Separate Documents tab or combined with Leases~~ **Decided (11/22):
   a separate Documents tab.**
2. PSA abstracts without connector validation (checked locally): acceptable?
3. Start E automatically after D, or after you review C and D (recommended).
4. Deal Review quota: the lease connector shows 3 free documents left. Bulk use
   likely needs a paid plan.
