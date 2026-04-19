import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO)
from app.routes import finalize, recipes, sessions, tts, utterance

app = FastAPI(title="Sous Chef", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions.router, tags=["sessions"])
app.include_router(utterance.router, tags=["utterance"])
app.include_router(finalize.router, tags=["finalize"])
app.include_router(recipes.router, tags=["recipes"])
app.include_router(tts.router, tags=["tts"])


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}
