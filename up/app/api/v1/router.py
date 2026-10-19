from fastapi import APIRouter

from app.api.v1 import audio, generate

api_router = APIRouter()

# 你和队友负责的模块注册在这里。
api_router.include_router(generate.router, prefix="/ai", tags=["generate"])
api_router.include_router(audio.router, prefix="/audio", tags=["audio"])

# from app.api.v1 import cleaned
# api_router.include_router(cleaned.router, tags=["cleaned"])
