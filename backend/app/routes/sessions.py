from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.deps import get_db
from app.schemas.session import CreateSessionRequest, CreateSessionResponse

router = APIRouter()


@router.post("/sessions", response_model=CreateSessionResponse)
def create_session(req: CreateSessionRequest, db: Client = Depends(get_db)) -> CreateSessionResponse:
    result = (
        db.table("recipes")
        .insert({"user_id": req.user_id, "status": "active"})
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create session")
    recipe_id = result.data[0]["recipe_id"]
    return CreateSessionResponse(session_id=recipe_id, recipe_id=recipe_id)
