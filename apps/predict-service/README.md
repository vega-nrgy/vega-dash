# apps/predict-service

Python backend for Vega Charge: scraping, bill parsing, and (later) the
prediction model. Deployed independently from `apps/web` — see the plan's
decoupling contract (§3): the dashboard stays fully usable without this
service running, except for the "predict new site" feature.

Connects to the **same** Postgres database as `apps/web` (local Supabase by
default) but never runs migrations — `supabase/migrations/` is the single
schema source of truth.

## Setup

```
pip install -r requirements.txt
```

`DATABASE_URL` defaults to the local Supabase instance
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`); override via env
var for other targets.

## Structure

```
app/
  db.py                    # Postgres connection
  scrapers/
    base.py                # shared session, retries, rate limiting
    lt_scraper.py           # POST /paybulkpayments -> current LT bill JSON
  pipeline/
    month_shift.py          # bill-date -> covered-usage-month heuristic
    lt_ingest.py             # orchestrator: scrape -> upsert monthly_bills,
                              # station_audit, ingestion_batches
scripts/
  run_lt_ingest.py           # CLI entrypoint for the LT ingestion pipeline
  archive/                   # one-off exploratory/manual scripts, kept for
                              # historical reference only — not run in normal
                              # operation, see each file's docstring
```

## Running the LT ingestion pipeline

```
cd apps/predict-service
python scripts/run_lt_ingest.py --dry-run --limit 5   # validate, no DB writes
python scripts/run_lt_ingest.py                        # full run, all eligible stations
```

Only targets stations with a purely-numeric `unique_scno` (the LT `ukscno`
format). Alphanumeric HT-style IDs (e.g. `SPT1326`) are a structurally
different system, scraped separately once `ht_scraper.py` exists (not yet
built).

## Not yet built (Phase 2+)

- `ht_scraper.py` (different site/flow — see plan §6)
- PDF History/Details parsers (`detect.py`, `lt_single.py`, `lt_dual.py`, `ht_wide.py`)
- `places_enrichment.py` (Phase 3, **gated behind explicit Google API approval** — do not build/enable without asking first)
- FastAPI app (`/predict`, `/health`, `/internal/pipeline/run-monthly`) and the model itself (Phase 4)
