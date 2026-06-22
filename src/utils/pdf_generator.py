import os
from pathlib import Path
from src.core.logging import get_logger

logger = get_logger(__name__)

STORAGE_DIR = Path("/app/storage/bidding_documents")

def generate_pdf_from_html(html_content: str, filename: str) -> str:
    """
    Converts HTML content to a PDF file and saves it in the storage directory.
    Returns the absolute path to the generated PDF.
    """
    try:
        from weasyprint import HTML
    except ImportError:
        logger.error("WeasyPrint is not installed. PDF generation failed.")
        raise
        
    os.makedirs(STORAGE_DIR, exist_ok=True)
    file_path = STORAGE_DIR / filename
    
    try:
        HTML(string=html_content).write_pdf(target=str(file_path))
        logger.info(f"Successfully generated PDF: {file_path}")
        return str(file_path)
    except Exception as e:
        logger.error(f"Error generating PDF: {e}")
        raise
