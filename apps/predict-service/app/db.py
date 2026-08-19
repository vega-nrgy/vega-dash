"""Own Postgres connection for predict-service — never runs migrations
(supabase/migrations/ is the single schema source of truth, see plan §2)."""

import os

import psycopg

DEFAULT_LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"


def get_connection() -> psycopg.Connection:
    return psycopg.connect(os.environ.get("DATABASE_URL", DEFAULT_LOCAL_DB_URL))
