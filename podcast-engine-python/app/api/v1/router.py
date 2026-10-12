from fastapi import APIRouter

api_router = APIRouter()

# 你和队友负责的模块注册在这里。
# 当前先留空，等 orchestrator / cleaned / generate 端点完成后填入。
#
# from app.api.v1 import cleaned, generate
# api_router.include_router(cleaned.router, tags=["cleaned"])
# api_router.include_router(generate.router, tags=["generate"])