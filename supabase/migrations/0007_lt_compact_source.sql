-- Add the lt_compact PDF-history fallback parser (see
-- app/parsers/lt_compact.py) as a valid monthly_bills.source.
alter table monthly_bills drop constraint monthly_bills_source_check;
alter table monthly_bills add constraint monthly_bills_source_check check (source in (
  'scrape_paybillonline', 'scrape_paybulkpayments', 'scrape_ht_tgspdcl', 'scrape_tgnpdcl_lt',
  'pdf_history_lt_single', 'pdf_history_lt_dual', 'pdf_history_ht_wide', 'pdf_history_lt_compact',
  'manual'
));
