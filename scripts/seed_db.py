#!/usr/bin/env python3
"""Seed the database with real company and tender data from the provided folders.

This script:
- Creates a company record and stores its profile JSON.
- Creates a tender record linked to that company.
- Populates the `documents` table for every file in the company profile folder
  and the tender folder (excluding the CSV, which is stored in metadata).
- Optionally creates a pipeline run (commented out because we want to start
  pipelines via API).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

# Add project root to sys.path for src imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.db.models import Base, Company, Tender, Document  # noqa: E402

# Use Docker service name for database host
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:postgres@db:5432/pipelinedemo",
)

# Data directories (relative to project root)
COMPANY_PROFILE_DIR = Path(__file__).parent.parent / "Drone Company Profile"
TENDER_DIR = Path(__file__).parent.parent / "Drone-TenderID-99896935"


def _load_company_profile() -> dict:
    """Return a dict with company metadata (list of documents)."""
    files = [p.name for p in COMPANY_PROFILE_DIR.iterdir() if p.is_file()]
    return {
        "profile_documents": files,
        "source": "local_folder",
        "total_documents": len(files),
    }


def _load_tender_metadata() -> dict:
    """Read the CSV to capture item count and store path."""
    csv_path = TENDER_DIR / "201281728.csv"
    item_count = 0
    try:
        with csv_path.open("r", encoding="utf-8") as f:
            lines = f.readlines()
        item_count = max(len(lines) - 1, 0)  # exclude header
    except Exception as e:
        print(f"Warning: Could not read CSV: {e}")
    return {
        "items_csv": str(csv_path),
        "item_count": item_count,
    }


def seed(company_name: str = "Garuda Aerospace Limited") -> None:
    engine = create_engine(DATABASE_URL, future=True)
    SessionLocal = sessionmaker(bind=engine, expire_on_commit=False, class_=Session)

    with SessionLocal() as db:
        # Check if company already exists (by name)
        existing = db.query(Company).filter(Company.name == company_name).first()
        if existing:
            print(f"Company '{company_name}' already exists (id={existing.id}). Skipping seed.")
            return

        # 1. Create Company
        company = Company(
            name=company_name,
            registration_number=None,      # you can add later
            industry="Drone Services",
            country="India",
            status="active",
            profile=_load_company_profile(),
            metadata_={"seeded_at": str(Path(__file__).stat().st_ctime)},
        )
        db.add(company)
        db.flush()
        print(f"✅ Created company: {company.name} (id={company.id})")

        # 2. Create Tender (linked to this company)
        tender_reference = TENDER_DIR.name
        tender = Tender(
            company_id=company.id,
            tender_reference=tender_reference,
            title=tender_reference,
            description="Tender from CSV item list and PDF attachments.",
            folder_path=str(TENDER_DIR),
            status="draft",
            metadata_=_load_tender_metadata(),
        )
        db.add(tender)
        db.flush()
        print(f"✅ Created tender: {tender.tender_reference} (id={tender.id})")

        # 3. Populate documents table with company profile documents
        for doc_path in COMPANY_PROFILE_DIR.iterdir():
            if not doc_path.is_file():
                continue
            document = Document(
                tender_id=tender.id,
                name=doc_path.name,
                document_type="company_profile",          # categorize
                source="upload",                          # or "local"
                document_source="company",                # distinguish from tender docs
                storage_path=str(doc_path),
                status="available",
                uploaded_by="seed_script",
                metadata_={"file_size": doc_path.stat().st_size},
            )
            db.add(document)
        print(f"📄 Added {len([p for p in COMPANY_PROFILE_DIR.iterdir() if p.is_file()])} company documents to `documents` table.")

        # 4. Populate documents table with tender attachments (excluding CSV)
        for doc_path in TENDER_DIR.iterdir():
            if not doc_path.is_file():
                continue
            # Skip the CSV – it's already in tender.metadata_
            if doc_path.suffix.lower() == ".csv":
                continue
            document = Document(
                tender_id=tender.id,
                name=doc_path.name,
                document_type="tender_attachment",
                source="upload",
                document_source="tender",                 # tender‑specific
                storage_path=str(doc_path),
                status="available",
                uploaded_by="seed_script",
                metadata_={"file_size": doc_path.stat().st_size},
            )
            db.add(document)
        tender_doc_count = sum(1 for p in TENDER_DIR.iterdir() if p.is_file() and p.suffix.lower() != ".csv")
        print(f"📄 Added {tender_doc_count} tender documents to `documents` table.")

        # Optional: Create a pipeline run? No, we let the user start via API.
        # But we can create a placeholder if you like – I'll leave it out.

        db.commit()
        print("\n✅ Seeding completed successfully.")
        print(f"   Company ID: {company.id}")
        print(f"   Tender ID:  {tender.id}")
        print("\nYou can now start a pipeline via Swagger UI using these IDs.")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Seed the database.")
    parser.add_argument("--company", type=str, default="Drone Solutions Pvt. Ltd.", help="Company name")
    args = parser.parse_args()
    seed(company_name=args.company)