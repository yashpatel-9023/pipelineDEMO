import re
import difflib
from typing import List, Tuple, Optional

def _tokenize(text: str) -> set:
    """Normalize and tokenize text, removing common stop words."""
    if not text:
        return set()
    text = text.lower().replace('.pdf', '').replace('_', ' ').replace('-', ' ')
    words = re.findall(r'\b[a-z]{3,}\b', text)
    stop_words = {
        'certificate', 'document', 'declaration', 'form', 'and', 'for', 
        'the', 'of', 'to', 'per', 'regarding', 'uploaded', 'buyer', 
        'requirement', 'general', 'seller', 'specific', 'company', 
        'profile', 'supporting', 'documents', 'details', 'items'
    }
    return set(w for w in words if w not in stop_words)

def semantic_match(ai_name: str, db_names: List[str], threshold: float = 0.3) -> Optional[str]:
    """
    Finds the best matching document name from a list of database document names.
    Uses token overlap and SequenceMatcher for fuzzy semantic matching.
    """
    if not ai_name or not db_names:
        return None
        
    ai_words = _tokenize(ai_name)
    if not ai_words:
        # Fallback to pure string distance if no meaningful tokens
        best_match = max(db_names, key=lambda x: difflib.SequenceMatcher(None, ai_name.lower(), x.lower()).ratio(), default=None)
        score = difflib.SequenceMatcher(None, ai_name.lower(), best_match.lower()).ratio() if best_match else 0
        return best_match if score > 0.6 else None

    best_match = None
    best_score = 0.0

    for db_doc in db_names:
        db_words = _tokenize(db_doc)
        if not db_words:
            continue
            
        overlap = 0
        for aw in ai_words:
            for dw in db_words:
                # Use difflib for fuzzy token matching (e.g., 'blacklisting' vs 'blacklisted')
                if difflib.SequenceMatcher(None, aw, dw).ratio() > 0.75:
                    overlap += 1
                    break
                    
        # Custom domain mappings
        if 'mse' in ai_words and 'msme' in db_words:
            overlap += 1
        if ('past' in ai_words or 'performance' in ai_words) and 'experience' in db_words:
            overlap += 1.5  # Boost this since it's a critical conceptual match
        if 'boq' in ai_words and ('specifications' in db_words or 'technical' in db_words):
            overlap += 1
            
        # Penalties for mismatched critical terms
        if 'oem' in ai_words and 'oem' not in db_words:
            overlap -= 1.0
        if 'value' in ai_words and 'value' not in db_words:
            overlap -= 1.0
            
        score = overlap / max(len(ai_words), 1)
        
        if score > best_score:
            best_score = score
            best_match = db_doc

    if best_score >= threshold:
        return best_match
    return None
