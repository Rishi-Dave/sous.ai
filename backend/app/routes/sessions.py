from uuid import uuid4

from fastapi import APIRouter

from app.schemas.session import CreateSessionRequest, CreateSessionResponse

router = APIRouter()


@router.post("/sessions", response_model=CreateSessionResponse)
def create_session(req: CreateSessionRequest) -> CreateSessionResponse:
    return CreateSessionResponse(
        session_id=str(uuid4()),
        recipe_id=str(uuid4()),
    )
