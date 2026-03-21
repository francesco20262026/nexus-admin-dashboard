"""
core_services/payment_matching.py — Bank transaction to invoice reconciliation
Pure service layer — no HTTP, no router concerns.

Matching philosophy: CONSERVATIVE.
- Only auto-confirm on exact reference + amount within tolerance.
- Any ambiguity → return "ambiguous" for human review.
- Failures in logging never alter match outcome.
"""
import re
import logging
from typing import Optional, Literal
from datetime import date, datetime, timezone

from pydantic import BaseModel, field_validator
from database import supabase

logger = logging.getLogger(__name__)

# ── Amount tolerance ──────────────────────────────────────────
# Conservative: allow at most €0.02 difference (bank rounding).
# This is intentionally tight — do NOT raise without explicit business approval.
AMOUNT_TOLERANCE_EUR = 0.02


# ── Models ────────────────────────────────────────────────────

class BankTransaction(BaseModel):
    transaction_date: date          # validated ISO date — not a raw string
    amount: float
    currency: str = "EUR"
    description: str
    payer_name: Optional[str] = None
    bank_account: Optional[str] = None
    external_id: Optional[str] = None

    @field_validator("amount")
    @classmethod
    def amount_must_be_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Transaction amount must be positive")
        return round(v, 2)

    @field_validator("currency")
    @classmethod
    def currency_uppercase(cls, v: str) -> str:
        return v.upper().strip()


class MatchResult(BaseModel):
    status: Literal["matched", "unmatched", "ambiguous", "already_paid", "error"]
    invoice_id: Optional[str] = None
    matched_ref: Optional[str] = None
    message: str
    # Do NOT include transaction amounts or internal amounts in message —
    # callers that need them should read the invoice directly.


# ── Reference normalisation ───────────────────────────────────

def normalize_reference(text: str) -> Optional[str]:
    """
    Extract a Nexus payment reference (INV-XXXXXXXX, 8 uppercase alphanumeric)
    from a raw banking string. Returns the first match or None.
    """
    if not text:
        return None
    clean = text.upper().replace(" ", "").replace("-", "-")
    match = re.search(r"INV-[A-Z0-9]{8}", clean)
    return match.group(0) if match else None


def extract_reference(transaction: BankTransaction) -> Optional[str]:
    """
    Try to extract a reference from the transaction, checking:
    1. external_id (primary — already structured)
    2. description (payment causale)
    3. payer_name (fallback — some banks embed ref in sender name)
    Returns the first match found, or None.
    """
    for field in (transaction.external_id, transaction.description, transaction.payer_name):
        ref = normalize_reference(field or "")
        if ref:
            return ref
    return None


# ── Invoice lookup ────────────────────────────────────────────

_FIND_SELECT = "id,status,total,payment_reference,client_id,currency"

def find_matching_invoice(
    company_id: str,
    extracted_ref: str,
    amount: float,
) -> tuple[Optional[dict], Literal["found", "not_found", "ambiguous", "already_paid", "amount_mismatch"]]:
    """
    Look up an invoice by payment_reference within a company.

    Returns (invoice_dict, reason):
      - (invoice, "found")           → exact, actionable match
      - (None, "not_found")          → no invoice with this reference
      - (None, "ambiguous")          → multiple invoices share this reference
      - (None, "already_paid")       → invoice exists but already settled
      - (None, "amount_mismatch")    → reference matched but amount is outside tolerance
    """
    try:
        res = (
            supabase.table("invoices")
            .select(_FIND_SELECT)
            .eq("company_id", company_id)
            .eq("payment_reference", extracted_ref)
            .execute()
        )
    except Exception as exc:
        logger.error("find_matching_invoice DB error ref=%s: %s", extracted_ref, exc)
        return None, "not_found"

    rows = res.data or []

    if not rows:
        return None, "not_found"

    if len(rows) > 1:
        # More than one invoice with the same reference — refuse to auto-match
        logger.warning("Ambiguous payment_reference=%s matched %d invoices in company=%s",
                       extracted_ref, len(rows), company_id)
        return None, "ambiguous"

    inv = rows[0]

    if inv.get("status") == "paid":
        return None, "already_paid"

    expected = round(float(inv.get("total") or 0.0), 2)
    incoming = round(amount, 2)
    if abs(expected - incoming) > AMOUNT_TOLERANCE_EUR:
        logger.info("Amount mismatch ref=%s expected=%.2f incoming=%.2f", extracted_ref, expected, incoming)
        return None, "amount_mismatch"

    return inv, "found"


# ── Payment application ───────────────────────────────────────

def apply_payment_match(
    invoice_id: str,
    company_id: str,
    user_id: str,
    transaction: BankTransaction,
    *,
    is_manual: bool = False,
) -> bool:
    """
    Mark the invoice as paid atomically.
    Logging failures do NOT alter the return value — the match is durable.
    Returns True if the update was applied, False if already paid (race condition).
    """
    paid_at    = transaction.transaction_date.isoformat()
    method_str = "manual_override" if is_manual else "bank_sync"
    short_desc = (transaction.description or "")[:100]

    # 1. Atomic update — only proceeds if invoice is NOT already paid
    try:
        update = (
            supabase.table("invoices")
            .update({"status": "paid", "paid_at": paid_at})
            .eq("id", invoice_id)
            .eq("company_id", company_id)
            .neq("status", "paid")   # concurrency guard
            .execute()
        )
    except Exception as exc:
        logger.error("apply_payment_match DB update failed invoice=%s: %s", invoice_id, exc)
        raise   # re-raise so caller can return "error"

    if not update.data:
        logger.info("apply_payment_match: invoice=%s already paid (concurrency)", invoice_id)
        return False

    # 2. Payment log — failure logged but does NOT roll back the mark-paid
    try:
        ref = transaction.external_id or normalize_reference(transaction.description or "")
        supabase.table("payment_logs").insert({
            "invoice_id": invoice_id,
            "company_id": company_id,
            "amount":     round(transaction.amount, 2),
            "currency":   transaction.currency,
            "paid_at":    paid_at,
            "method":     method_str,
            "reference":  ref,
            "notes":      f"Sync: {short_desc}",
            "created_by": user_id,
        }).execute()
    except Exception as exc:
        logger.warning("payment_logs insert failed invoice=%s: %s", invoice_id, exc)

    # 3. Audit log — failure logged but does NOT roll back the mark-paid
    action_type = "payment_manual_confirmed" if is_manual else "payment_auto_confirmed"
    try:
        supabase.table("audit_logs").insert({
            "company_id":  company_id,
            "user_id":     user_id,
            "entity_type": "invoice",
            "entity_id":   invoice_id,
            "action":      action_type,
            "new_values":  {"status": "paid", "sync_source": method_str},
        }).execute()
    except Exception as exc:
        logger.warning("audit_log insert failed invoice=%s: %s", invoice_id, exc)

    return True


# ── Main entry point ──────────────────────────────────────────

def process_bank_transaction(
    company_id: str,
    user_id: str,
    transaction: BankTransaction,
) -> MatchResult:
    """
    Process a single bank transaction against the invoice ledger.

    Flow:
      1. Extract reference from transaction fields.
      2. Find matching invoice (strict: reference + amount tolerance).
      3. Apply payment if unambiguous match found.
      4. Return a MatchResult with status and safe message (no internal amounts).
    """
    # Step 1: Extract reference
    ref = extract_reference(transaction)
    if not ref:
        return MatchResult(
            status="unmatched",
            message="Nessun riferimento INV-* rilevato nella causale o nel nome pagante.",
        )

    # Step 2: Find invoice
    inv, reason = find_matching_invoice(company_id, ref, transaction.amount)

    if reason == "not_found":
        return MatchResult(
            status="unmatched",
            matched_ref=ref,
            message="Fattura non trovata nel sistema per questo riferimento.",
        )
    if reason == "already_paid":
        return MatchResult(
            status="already_paid",
            matched_ref=ref,
            message="Fattura già saldata secondo il sistema.",
        )
    if reason == "ambiguous":
        return MatchResult(
            status="ambiguous",
            matched_ref=ref,
            message="Riferimento ambiguo: corrisponde a più fatture. Revisione manuale richiesta.",
        )
    if reason == "amount_mismatch":
        # Do NOT expose expected/incoming amounts — let admin review the invoice
        return MatchResult(
            status="ambiguous",
            matched_ref=ref,
            message="Importo non corrispondente alla fattura. Revisione manuale richiesta.",
        )

    # Step 3: Apply match (reason == "found")
    try:
        applied = apply_payment_match(
            invoice_id=inv["id"],
            company_id=company_id,
            user_id=user_id,
            transaction=transaction,
            is_manual=False,
        )
    except Exception as exc:
        logger.error("apply_payment_match raised invoice=%s: %s", inv.get("id"), exc)
        return MatchResult(
            status="error",
            matched_ref=ref,
            message="Errore interno durante l'aggiornamento della fattura.",
        )

    if not applied:
        return MatchResult(
            status="already_paid",
            matched_ref=ref,
            invoice_id=inv["id"],
            message="Conflitto di concorrenza: fattura già saldata da un'altra richiesta.",
        )

    return MatchResult(
        status="matched",
        invoice_id=inv["id"],
        matched_ref=ref,
        message="Riconciliazione automatica applicata con successo.",
    )
