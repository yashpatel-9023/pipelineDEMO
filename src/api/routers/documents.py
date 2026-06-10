from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from src.api.dependencies import get_db, get_current_user
from src.api.schemas import DocumentUploadRequest, DocumentUploadResponse
from src.db.repository import create_document

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_document(
    request: DocumentUploadRequest,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
) -> DocumentUploadResponse:
    document = create_document(
        db,
        tender_id=request.tender_id,
        name=request.name,
        document_type=request.document_type,
        source=request.source,
        document_source=request.document_source,
        storage_path=request.storage_path,
        encrypted_path=request.encrypted_path,
        content_hash=request.content_hash,
        metadata_=request.metadata,
        uploaded_by=request.uploaded_by,
    )

    if not document.id:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Document upload failed",
        )

    return DocumentUploadResponse(document_id=str(document.id), status="created")
