# scripts/seed_db.py
"""Seed the database with a real company and tender from the provided folders.

Run from the project root:
    python scripts/seed_db.py
"""

from __future__ import annotations

import os
import sys
import json
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

# Add project root to sys.path for src imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.db.models import Base, Company, Tender, Document, PipelineRun  # noqa: E402

# Use Docker service name for database host
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:postgres@db:5432/pipelinedemo",
)

# Data directories (relative to project root)
COMPANY_PROFILE_DIR = Path(__file__).parent.parent / "Drone Company Profile"
TENDER_DIR = Path(__file__).parent.parent / "Drone TenderID-100574982"

def _load_company_profile() -> dict:
    """Collect a list of document filenames from the company profile folder.
    This simple metadata is stored in the `profile` JSON column.
    """
    files = [p.name for p in COMPANY_PROFILE_DIR.iterdir() if p.is_file()]
    return {
        "profile_documents": files,
        "source": "local_folder",
    }

def _load_tender_metadata() -> dict:
    """Read the CSV to capture a basic item count.
    The tender CSV contains the bill of quantities; we store the count and the CSV path.
    """
    csv_path = TENDER_DIR / "203008541.csv"
    try:
        with csv_path.open("r", encoding="utf-8") as f:
            lines = f.readlines()
        item_count = max(len(lines) - 1, 0)  # exclude header line
    except Exception:
        item_count = 0
    return {
        "items_csv": str(csv_path),
        "item_count": item_count,
    }

def seed() -> None:
    engine = create_engine(DATABASE_URL, future=True)
    SessionLocal = sessionmaker(bind=engine, expire_on_commit=False, class_=Session)

    with SessionLocal() as db:
        # Skip if a company already exists (avoid duplicate seed runs)
        if db.query(Company).first():
            print("Database already seeded – skipping.")
            return

        # ---- Company ----
        company = Company(
            name="Drone Solutions Pvt. Ltd.",
            registration_number=None,
            industry="Drone Services",
            country="India",
            status="active",
            profile=_load_company_profile(),
        )
        db.add(company)
        db.flush()
        print(f"Created company: {company.name} (id={company.id})")

        # ---- Tender ----
        tender_reference = TENDER_DIR.name  # e.g. "Drone TenderID-100574982"
        tender = Tender(
            company_id=company.id,
            tender_reference=tender_reference,
            title=tender_reference,
            description="Tender generated from CSV item list.",
            status="draft",
            metadata_=_load_tender_metadata(),
        )
        db.add(tender)
        db.flush()
        print(f"Created tender: {tender.tender_reference} (id={tender.id})")

        # ---- Documents (PDF/HTML attached to tender) ----
        for doc_path in TENDER_DIR.iterdir():
            if doc_path.is_file() and doc_path.suffix.lower() != ".csv":
                document = Document(
                    tender_id=tender.id,
                    name=doc_path.name,
                    document_type="attachment",
                    source="local",
                    document_source="tender",
                    storage_path=str(doc_path),
                )
                db.add(document)
        db.flush()

        # ---- Kick off a pipeline run (Temporal workers will pick it up) ----
        pipeline_run = PipelineRun(
            tender_id=tender.id,
            company_id=company.id,
            status="pending",
        )
        db.add(pipeline_run)
        db.flush()
        print(f"PipelineRun created (id={pipeline_run.id}) – workers will process it.")

        db.commit()
        print("\nSeed data committed successfully.")

if __name__ == "__main__":
    seed()
