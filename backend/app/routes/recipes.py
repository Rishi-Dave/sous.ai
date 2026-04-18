from fastapi import APIRouter

from app.schemas.finalize import FinalizeResponse, MacroLog

router = APIRouter()


@router.get("/recipes/{recipe_id}", response_model=FinalizeResponse)
def get_recipe(recipe_id: str) -> FinalizeResponse:
    return FinalizeResponse(
        recipe_id=recipe_id,
        macros=MacroLog(
            calories=0, protein_g=0, fat_g=0, carbs_g=0, per_ingredient={}
        ),
        ingredients=[],
    )
