from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:postgres@localhost:5432/pipelinedemo",
)

BASE_DIR = Path(__file__).resolve().parents[0]
MIGRATIONS_SQL = BASE_DIR / ".." / "src" / "db" / "migrations" / "001_initial_schema.sql"

if __name__ == "__main__":
    engine = create_engine(DATABASE_URL, future=True)
    sql = MIGRATIONS_SQL.read_text(encoding="utf-8")

    with engine.begin() as conn:
        conn.execute(text(sql))

    print("Applied migrations from", MIGRATIONS_SQL)
