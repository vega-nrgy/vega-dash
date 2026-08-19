-- Add the live TGNPDCL LT-bill scrape (tgnpdcl.com, see
-- app/scrapers/tgnpdcl_lt_scraper.py) as a valid monthly_bills.source.
alter table monthly_bills drop constraint monthly_bills_source_check;
alter table monthly_bills add constraint monthly_bills_source_check check (source in (
  'scrape_paybillonline', 'scrape_paybulkpayments', 'scrape_ht_tgspdcl', 'scrape_tgnpdcl_lt',
  'pdf_history_lt_single', 'pdf_history_lt_dual', 'pdf_history_ht_wide',
  'manual'
));
