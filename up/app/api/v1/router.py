from fastapi import APIRouter

from app.api.v1 import generate

api_router = APIRouter()

# 你和队友负责的模块注册在这里。
api_router.include_router(generate.router, prefix="/ai", tags=["generate"])

# from app.api.v1 import cleaned
# api_router.include_router(cleaned.router, tags=["cleaned"])