from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

from auth.middleware import get_current_user
from database import supabase

router = APIRouter(prefix="/categories", tags=["Categories"])

class CategoryCreate(BaseModel):
    name: str
    color: str = "#60a5fa"

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    is_active: Optional[bool] = None

@router.get("")
@router.get("/list")
async def list_categories(user = Depends(get_current_user)):
    """List invoice categories associated with the active company"""
    try:
        q = supabase.table("invoice_categories").select("*").eq("company_id", str(user.active_company_id))
        res = q.order("name").execute()
        return {"data": res.data if res.data else []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("")
async def create_category(payload: CategoryCreate, user = Depends(get_current_user)):
    """Create a new invoice category"""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Solo admin può creare categorie.")
    try:
        res = supabase.table("invoice_categories").insert({
            "company_id": str(user.active_company_id),
            "name": payload.name,
            "color": payload.color,
            "is_active": True
        }).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Creazione fallita")
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{cat_id}")
async def update_category(cat_id: str, payload: CategoryUpdate, partial: Optional[bool] = Query(False), user = Depends(get_current_user)):
    """Update a category"""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Solo admin può modificare categorie.")
    try:
        upd = {}
        if payload.name is not None: upd["name"] = payload.name
        if payload.color is not None: upd["color"] = payload.color
        if payload.is_active is not None: upd["is_active"] = payload.is_active
        
        if not upd:
            return {"message": "Nessun dato da aggiornare"}
            
        res = supabase.table("invoice_categories")\
                      .update(upd)\
                      .eq("id", cat_id)\
                      .eq("company_id", str(user.active_company_id))\
                      .execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Categoria non trovata")
        return res.data[0]
    except Exception as e:
        if isinstance(e, HTTPException): raise
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{cat_id}")
async def delete_category(cat_id: str, user = Depends(get_current_user)):
    """Delete a category"""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Solo admin può eliminare categorie.")
    try:
        # Check if used? Foreign key constraint or trigger might handle it, or we allow it
        res = supabase.table("invoice_categories")\
                      .delete()\
                      .eq("id", cat_id)\
                      .eq("company_id", str(user.active_company_id))\
                      .execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Categoria non trovata o già eliminata")
        return {"success": True, "message": "Categoria eliminata"}
    except Exception as e:
        # FK error: 23503 occurs if invoice references it.
        # Can be handled to show friendly error
        err_msg = str(e)
        if "23503" in err_msg or "violates foreign key" in err_msg:
            raise HTTPException(status_code=400, detail="Impossibile eliminare: la categoria è assegnata ad alcune fatture.")
        raise HTTPException(status_code=500, detail=err_msg)

