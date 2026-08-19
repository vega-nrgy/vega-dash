-- Vega Charge — clean schema, Phase 1
-- See plan: C:\Users\srima\.claude\plans\you-are-given-a-compiled-star.md (§4)

create extension if not exists postgis;
create extension if not exists pg_trgm;

-- ── stations ────────────────────────────────────────────────────────────────
-- Core identity/location. unique_scno is the real-world business key shared
-- across the Excel sheet (ID), LT bill PDFs (Unique SCNo) and HT bill PDFs
-- (Service No.) — used as the primary key instead of a surrogate uuid.
create table stations (
  unique_scno text primary key,
  station_type text not null default 'UNKNOWN'
    check (station_type in ('HT', 'LT', 'UNKNOWN')),
  name text not null,
  operator text,
  status text,
  discom text,
  ownership text,
  category text,
  location_class text check (location_class in ('HIGHWAY', 'CITY')),
  district text,
  latitude double precision not null,
  longitude double precision not null,
  geom geography(point, 4326)
    generated always as (
      st_setsrid(st_makepoint(longitude, latitude), 4326)::geography
    ) stored,
  geocode_precision text
    check (geocode_precision in ('exact', 'pincode', 'landmark', 'division')),
  -- Explicitly named "seed" — the Excel's own README states these are
  -- synthetic placeholder values, not real consumption. Never use as
  -- real data or as a model training feature/label.
  seed_avg_consumption_kwh_month numeric,
  seed_footfall text,
  google_place_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index stations_geom_idx on stations using gist (geom);
create index stations_district_idx on stations (district);
create index stations_name_trgm_idx on stations using gin (name gin_trgm_ops);
create index stations_type_idx on stations (station_type);

-- ── station_chargers ───────────────────────────────────────────────────────
-- Normalized charger hardware — replaces the old schema's loose jsonb.
create table station_chargers (
  id bigserial primary key,
  station_id text not null references stations (unique_scno) on delete cascade,
  charger_type text not null,
  power_kw numeric,
  count integer not null default 1,
  source text not null check (source in ('excel_parsed', 'places_enrichment', 'manual')),
  raw_label text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create index station_chargers_station_idx on station_chargers (station_id);

-- ── station_audit ──────────────────────────────────────────────────────────
-- Ingestion/parsing provenance, kept OUT of the core stations table.
create table station_audit (
  id bigserial primary key,
  station_id text not null references stations (unique_scno) on delete cascade,
  is_valid boolean not null default true,
  validity_reason text,
  parser_used text not null,
  source_file text,
  scrape_ts timestamptz,
  ingestion_batch_id uuid,
  raw_extract jsonb,
  created_at timestamptz not null default now()
);

create index station_audit_station_idx on station_audit (station_id);
create index station_audit_batch_idx on station_audit (ingestion_batch_id);

-- ── monthly_bills ──────────────────────────────────────────────────────────
-- Unified HT/LT shape. Nullable = not applicable/not parsed; 0 = a real
-- billed zero (fixes the old schema's ambiguous null-vs-zero semantics).
create table monthly_bills (
  id bigserial primary key,
  station_id text not null references stations (unique_scno) on delete cascade,
  bill_month date not null,
  units_kwh numeric,
  billed_demand_kva numeric,
  demand_amount_rs numeric,
  total_amount_rs numeric,
  arrears_rs numeric,
  collection_rs numeric,
  closing_reading numeric,
  bill_date date,
  source text not null check (source in (
    'scrape_paybillonline', 'scrape_paybulkpayments',
    'pdf_history_lt_single', 'pdf_history_lt_dual', 'pdf_history_ht_wide',
    'manual'
  )),
  raw jsonb,
  ingested_at timestamptz not null default now(),
  unique (station_id, bill_month)
);

create index monthly_bills_station_idx on monthly_bills (station_id);
create index monthly_bills_month_idx on monthly_bills (bill_month);

-- ── Places enrichment cache (Phase 3, gated — tables ready, unpopulated) ────
create table station_places_cache (
  station_id text primary key references stations (unique_scno) on delete cascade,
  google_place_id text,
  place_types text[],
  rating numeric,
  user_ratings_total integer,
  ev_charge_options jsonb,
  refreshed_at timestamptz
);

create table station_nearby_places (
  id bigserial primary key,
  station_id text not null references stations (unique_scno) on delete cascade,
  place_id text,
  name text,
  category text,
  distance_m numeric,
  lat double precision,
  lon double precision,
  rating numeric,
  refreshed_at timestamptz
);

create index station_nearby_places_station_idx on station_nearby_places (station_id);

-- ── station_geo_features ───────────────────────────────────────────────────
-- Versioned jsonb, consumed in bulk by the model, not queried ad hoc.
create table station_geo_features (
  id bigserial primary key,
  station_id text not null references stations (unique_scno) on delete cascade,
  feature_set_version text not null,
  features jsonb not null,
  computed_at timestamptz not null default now(),
  unique (station_id, feature_set_version)
);

-- ── model_runs / model_predictions ─────────────────────────────────────────
create table model_runs (
  id uuid primary key default gen_random_uuid(),
  run_ts timestamptz not null default now(),
  model_version text not null,
  algorithm text,
  training_window jsonb,
  metrics jsonb,
  is_active boolean not null default false
);

create table model_predictions (
  id bigserial primary key,
  run_id uuid not null references model_runs (id) on delete cascade,
  station_id text not null references stations (unique_scno) on delete cascade,
  predicted_month date not null,
  predicted_units_kwh numeric,
  confidence_score numeric,
  unique (run_id, station_id, predicted_month)
);

-- ── site_predictions ────────────────────────────────────────────────────────
-- Right-click "new site" prediction — not tied to a real station.
create table site_predictions (
  id uuid primary key default gen_random_uuid(),
  requested_by text,
  lat double precision not null,
  lon double precision not null,
  district text,
  charger_config jsonb,
  contracted_load_kva numeric,
  run_id uuid references model_runs (id),
  predicted_units_kwh numeric,
  status text not null default 'queued'
    check (status in ('queued', 'done', 'failed', 'stub_no_model')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- ── prediction_accuracy_log ─────────────────────────────────────────────────
-- Frozen log written by the monthly cron — survives later corrections to
-- bills/model versions, unlike a live view would.
create table prediction_accuracy_log (
  id bigserial primary key,
  run_id uuid not null references model_runs (id),
  station_id text not null references stations (unique_scno) on delete cascade,
  bill_month date not null,
  predicted_units_kwh numeric,
  actual_units_kwh numeric,
  abs_error_kwh numeric,
  pct_error numeric,
  evaluated_at timestamptz not null default now()
);

-- ── Supporting tables ───────────────────────────────────────────────────────
create table fleet_mix (
  id bigserial primary key,
  district text not null,
  vehicle_class text not null,
  fleet_share_pct numeric,
  avg_session_kwh numeric,
  is_estimated boolean not null default true,
  source text default 'indicative'
);

create table competitor_ev_stations (
  id bigserial primary key,
  place_id text unique,
  name text,
  lat double precision,
  lon double precision,
  rating numeric,
  charger_config jsonb,
  matched_station_id text references stations (unique_scno),
  match_confidence numeric,
  fetched_at timestamptz
);

-- geocode_cache.source distinguishes provider so Nominatim (used now, free)
-- and Google Places Text Search (Phase 3, gated) can coexist / be swapped.
create table geocode_cache (
  query_text_normalized text primary key,
  source text not null check (source in ('nominatim', 'google_places')),
  resolved_lat double precision,
  resolved_lon double precision,
  place_id text,
  bounds jsonb,
  resolved_at timestamptz not null default now()
);

create table ingestion_batches (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  stations_processed integer default 0,
  errors_count integer default 0,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed'))
);
