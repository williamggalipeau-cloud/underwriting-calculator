-- Phase P (Dispositions): new document types for sales, offers and closed
-- sales. Run once in the Supabase SQL editor (project owner). Safe to re-run.
-- Until it is applied, the app files these uploads under "Other" with the
-- type in the title, so nothing is blocked.
--
-- New types: bov (broker opinion of value), listing_agreement, offer_letter,
-- marketing (offering memo / flyers for a sale), post_closing (true-ups),
-- distribution_notice. Existing types used by sales: psa, estoppel,
-- closing_disp.

alter table public.deal_documents drop constraint if exists deal_documents_doc_type_check;
alter table public.deal_documents add constraint deal_documents_doc_type_check
  check (doc_type in ('om', 'rent_roll', 't12', 'loi', 'psa', 'ic_memo', 'closing_acq', 'closing_disp',
                      'lpa', 'ppm', 'insurance_cert', 'loan', 'rate_cap', 'appraisal', 'estoppel', 'cam', 'billing', 'other',
                      'bov', 'listing_agreement', 'offer_letter', 'marketing', 'post_closing', 'distribution_notice'));

-- Which sale / offer a document belongs to (null for other documents).
alter table public.deal_documents add column if not exists sale_id text;
alter table public.deal_documents add column if not exists offer_id text;
create index if not exists deal_documents_sale_idx on public.deal_documents (workspace_id, sale_id) where sale_id is not null;
