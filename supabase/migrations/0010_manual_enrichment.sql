-- Manual/editable amenities, station rating, and per-station fleet operators.
-- Reuses the existing-but-unpopulated Places-enrichment tables (0001) instead
-- of new parallel ones, so a `source` column can later distinguish manual
-- entries from a real Google Places integration without a schema change.
alter table station_nearby_places
  add column source text not null default 'manual'
    check (source in ('manual', 'google_places')),
  add column updated_at timestamptz not null default now();

alter table station_places_cache
  add column rating_source text
    check (rating_source in ('manual', 'google_places'));

-- Per-station fleet operators signed up with this station's CPO. No auto
-- population source exists — entirely user-entered, editable via the
-- detailed report page.
create table station_fleet_operators (
  id bigserial primary key,
  station_id text not null references stations (unique_scno) on delete cascade,
  operator_name text not null,
  vehicle_class text,
  fleet_size integer,
  contact_name text,
  contact_info text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index station_fleet_operators_station_idx on station_fleet_operators (station_id);

-- No explicit grants needed — 0002_grants.sql's `alter default privileges`
-- already covers new tables/sequences in this schema.
