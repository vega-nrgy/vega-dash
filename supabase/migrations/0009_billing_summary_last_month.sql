-- Adds last_month_units_kwh to the existing per-station billing aggregate
-- (see 0003_station_billing_summary.sql for why this is a view, not a
-- client-side reduction) — backs the station panel/report "units consumed
-- last month" and the nearby-analysis panel/report per-station figures.
create or replace view station_billing_summary as
select
  station_id,
  count(*) as bill_count,
  avg(units_kwh) filter (where units_kwh is not null) as avg_units_kwh,
  min(bill_month) as first_bill_month,
  max(bill_month) as last_bill_month,
  (array_agg(units_kwh order by bill_month desc))[1] as last_month_units_kwh
from monthly_bills
group by station_id;

grant select on station_billing_summary to service_role, anon, authenticated;
