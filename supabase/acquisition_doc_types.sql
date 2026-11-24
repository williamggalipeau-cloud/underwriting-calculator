-- Acquisitions → Acquisition Documents (11/24): new document types for buying
-- an asset. Run once in the Supabase SQL editor (project owner). Safe to
-- re-run. Until it is applied, the app files these uploads under "Other"
-- with "[acq] <type>:" in the title, so nothing is blocked.
--
-- New types: current_leases, broker_model, site_plan, title_survey,
-- phase1_esa, pca, zoning, lender_appraisal, snda, ic_presentation,
-- loan_term_sheet, deed_title. Existing types used by acquisitions: om,
-- rent_roll, t12, listing_agreement, loi, psa, estoppel, ic_memo,
-- closing_acq (loan, rate_cap and insurance_cert are shown read-only).
-- Keeps every type added by earlier scripts (dispositions_doc_types.sql).

alter table public.deal_documents drop constraint if exists deal_documents_doc_type_check;
alter table public.deal_documents add constraint deal_documents_doc_type_check
  check (doc_type in ('om', 'rent_roll', 't12', 'loi', 'psa', 'ic_memo', 'closing_acq', 'closing_disp',
                      'lpa', 'ppm', 'insurance_cert', 'loan', 'rate_cap', 'appraisal', 'estoppel', 'cam', 'billing', 'other',
                      'bov', 'listing_agreement', 'offer_letter', 'marketing', 'post_closing', 'distribution_notice',
                      'current_leases', 'broker_model', 'site_plan', 'title_survey', 'phase1_esa', 'pca', 'zoning',
                      'lender_appraisal', 'snda', 'ic_presentation', 'loan_term_sheet', 'deed_title'));
