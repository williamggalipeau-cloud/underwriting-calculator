-- Joint ventures and separate accounts (11/24): their governing documents,
-- read in like a fund's LPA. Run once in the Supabase SQL editor (project
-- owner). Safe to re-run. Until it is applied, the app files a JVA / SMA
-- under "Other" with "[jva] " / "[sma] " leading its title and still reads it
-- as its real type.
--
-- New types: jva (joint venture agreement), sma (separate account /
-- investment management agreement). Keeps every type added by earlier
-- scripts (dispositions_doc_types.sql, acquisition_doc_types.sql).

alter table public.deal_documents drop constraint if exists deal_documents_doc_type_check;
alter table public.deal_documents add constraint deal_documents_doc_type_check
  check (doc_type in ('om', 'rent_roll', 't12', 'loi', 'psa', 'ic_memo', 'closing_acq', 'closing_disp',
                      'lpa', 'ppm', 'insurance_cert', 'loan', 'rate_cap', 'appraisal', 'estoppel', 'cam', 'billing', 'other',
                      'bov', 'listing_agreement', 'offer_letter', 'marketing', 'post_closing', 'distribution_notice',
                      'current_leases', 'broker_model', 'site_plan', 'title_survey', 'phase1_esa', 'pca', 'zoning',
                      'lender_appraisal', 'snda', 'ic_presentation', 'loan_term_sheet', 'deed_title',
                      'jva', 'sma'));
