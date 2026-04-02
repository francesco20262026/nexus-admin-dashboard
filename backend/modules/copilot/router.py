import logging
import os
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional

from auth.middleware import get_current_user, CurrentUser, require_admin
from database import supabase
from config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/copilot", tags=["Copilot"])

class ChatMessage(BaseModel):
    message: str
    context: Optional[dict] = None

@router.post("/chat")
async def copilot_chat(payload: ChatMessage, user: CurrentUser = Depends(require_admin)):
    """Receives a natural language message from the Admin and executes CRM actions."""
    
    # 1. Check for AI API Key
    llm_key = getattr(settings, "OPENAI_API_KEY", os.environ.get("OPENAI_API_KEY"))
    if not llm_key:
        return {
            "reply": "⚠️ La chiave API per il Copilot (es. OPENAI_API_KEY) non è configurata nel backend.\nPer favore configura la tua API Key nel database o nelle variabili di sistema per attivarmi."
        }
        
    msg = payload.message.lower()
    reply_text = "Ho analizzato la tua richiesta, ma il mio motore neuro-linguistico è ancora in fase di calibrazione. (Simulazione Copilot)"

    # --- SIMPLY MOCKED INTENT ROUTING FOR NOW (Until real LLM hooked) ---
    # Example logic to revert quote
    if "bozza" in msg and "preventivo" in msg:
        # Extractor placeholder (in a real scenario, use OpenAI Tools)
        # Assuming the context holds the quote_id they are looking at
        if payload.context and payload.context.get("quote_id"):
            qid = payload.context["quote_id"]
            try:
                # Execute tool: revert quote
                supabase.table("quotes").update({"status": "draft"}).eq("id", qid).execute()
                reply_text = f"Fatto! Ho riportato il preventivo in stato bozza (Draft) come richiesto. Puoi ricaricare la pagina per vedere le modifiche."
            except Exception as e:
                reply_text = f"Errore durante l'esecuzione del comando: {str(e)}"
        else:
            reply_text = "Vedo che vuoi riportare un preventivo in bozza. Per favore, aprilo dalla lista oppure scrivimi il numero esatto, così so su quale operare!"
            
    elif "duplicat" in msg and "cancella" in msg:
        reply_text = "Posso cancellare i preventivi duplicati di oggi, conferma se devo procedere."

    else:
        reply_text = f"Ho ricevuto il comando: '{payload.message}'.\nIn futuro utilizzerò il Modello linguistico (OpenAI/Anthropic) collegato tramite API Key per eseguire esattamente l'azione corrispondente."

    # In production, we'd package context + msg, send to openai.ChatCompletion with tools=[...]
    
    return {"reply": reply_text}
