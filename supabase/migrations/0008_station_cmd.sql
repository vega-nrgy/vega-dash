-- Contracted Load / CMD — parsed by the predict-service PDF pipeline (HT body
-- metadata's "CMD" field, LT Consumer-Details PDF's "Contracted Load" field)
-- but previously discarded. See apps/predict-service/app/pipeline/pdf_ingest.py.
alter table stations
  add column contracted_load_kva numeric,
  add column cmd_source text
    check (cmd_source in ('ht_body_metadata', 'lt_details_pdf', 'manual'));
