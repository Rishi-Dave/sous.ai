from uuid import uuid4

from fastapi import APIRouter

from app.schemas.finalize import FinalizeRequest, FinalizeResponse, MacroLog

router = APIRouter()


@router.post("/finalize", response_model=FinalizeResponse)
def finalize_session(req: FinalizeRequest) -> FinalizeResponse:
    return FinalizeResponse(
        recipe_id=str(uuid4()),
        macros=MacroLog(
            calories=0, protein_g=0, fat_g=0, carbs_g=0, per_ingredient={}
        ),
        ingredients=[],
    )
