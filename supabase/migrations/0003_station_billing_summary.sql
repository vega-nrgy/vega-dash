-- Per-station billing aggregate, computed once in SQL rather than pulled to
-- the app and reduced in JS. monthly_bills is ~8k rows (over PostgREST's
-- local max_rows=1000 cap, and this instance has aggregate-in-select
-- disabled — PGRST123), so a plain SELECT over a pre-aggregated view is the
-- simplest reliable path. Backs the map's "billing history" / "performance
-- tier" filters (apps/web).
create view station_billing_summary as
select
  station_id,
  count(*) as bill_count,
  avg(units_kwh) filter (where units_kwh is not null) as avg_units_kwh,
  min(bill_month) as first_bill_month,
  max(bill_month) as last_bill_month
from monthly_bills
group by station_id;

grant select on station_billing_summary to service_role, anon, authenticated;
