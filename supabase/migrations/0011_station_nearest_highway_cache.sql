-- Caches the free OSM Overpass API lookup for each station's nearest National
-- Highway (ref + name), same cache-external-call pattern as geocode_cache
-- (0001) for Nominatim. See apps/web/src/lib/geo/overpass.ts.
create table station_nearest_highway (
  station_id text primary key references stations (unique_scno) on delete cascade,
  highway_ref text,
  highway_name text,
  distance_m numeric,
  nearest_lat double precision,
  nearest_lon double precision,
  source text not null default 'osm_overpass',
  fetched_at timestamptz not null default now()
);

-- No explicit grants needed — 0002_grants.sql's `alter default privileges`
-- already covers new tables in this schema.
