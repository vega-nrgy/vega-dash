-- Add the live HT-bill scrape (webportal.tgsouthernpower.org, see
-- app/scrapers/ht_scraper.py) as a valid monthly_bills.source. Unlike
-- scrape_paybulkpayments (LT), the HT bill page prints its covered month
-- directly ("...for the Month of July 2026...") -- no covered_month()
-- heuristic needed -- so this is real per-month data, not a guess.
alter table monthly_bills drop constraint monthly_bills_source_check;
alter table monthly_bills add constraint monthly_bills_source_check check (source in (
  'scrape_paybillonline', 'scrape_paybulkpayments', 'scrape_ht_tgspdcl',
  'pdf_history_lt_single', 'pdf_history_lt_dual', 'pdf_history_ht_wide',
  'manual'
));
