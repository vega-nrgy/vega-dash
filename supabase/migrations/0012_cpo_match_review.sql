-- Cross-referencing free third-party EV-station directories (Statiq's public
-- markers API, no key/billing — see apps/predict-service/app/pipeline/statiq_match.py)
-- against our stations by proximity, to surface the real consumer-facing CPO brand
-- name distinct from stations.operator (which is the raw TSPDCL registration
-- consumer name, e.g. "SHARIFY SERVICES PVT LTD" rather than "Statiq" — both are
-- real facts about the same station, so this never overwrites operator).
--
-- Every match is manually reviewed (co-located-but-different-operator false
-- positives are common at shared petrol-bunk lots) before stations.cpo_brand is set.

alter table stations
  add column cpo_brand text,
  add column cpo_brand_source text check (cpo_brand_source in ('statiq_matched', 'manual'));

-- Raw cache of fetched third-party station listings.
create table external_cpo_stations (
  id bigserial primary key,
  source text not null check (source in ('statiq')),
  external_id text not null,
  name text not null,
  address text,
  latitude double precision not null,
  longitude double precision not null,
  fetched_at timestamptz not null default now(),
  unique (source, external_id)
);

-- One proposed nearest-match per station, awaiting human review. Never
-- recomputed/overwritten once a row exists for a station_id (see the matching
-- script's `on conflict (station_id) do nothing`) so a human decision, once made,
-- sticks even if the source cache is refreshed later.
create table station_cpo_match_proposals (
  id bigserial primary key,
  station_id text not null references stations (unique_scno) on delete cascade,
  external_station_id bigint not null references external_cpo_stations (id) on delete cascade,
  distance_m numeric not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (station_id)
);

create index station_cpo_match_proposals_status_idx on station_cpo_match_proposals (status);

-- No explicit grants needed — 0002_grants.sql's `alter default privileges`
-- already covers new tables in this schema.
