-- Backfill stations.station_type from unique_scno's shape.
--
-- Before this: LT was only ever set by the live-scrape success path
-- (predict-service/app/pipeline/lt_ingest.py's UPDATE on a found bill), and
-- nothing ever set HT — so all 94 real HT stations (alphanumeric scno, e.g.
-- SPT1307/BJH2143) sat at the default 'UNKNOWN', indistinguishable from LT
-- stations whose scrape simply hadn't succeeded yet (228 of them).
--
-- The ID shape alone is a reliable, always-available classifier — confirmed
-- by the ingestion pipelines themselves, which already route on exactly this
-- pattern (numeric unique_scno = LT ukscno format; alphanumeric = HT, a
-- structurally different system). No numeric row is HT and no alpha row is
-- LT in the live data (verified before writing this migration), so this is
-- a pure backfill of previously-unclassified rows, not a reclassification.
update stations
set station_type = case when unique_scno ~ '^[0-9]+$' then 'LT' else 'HT' end,
    updated_at = now()
where station_type = 'UNKNOWN';
