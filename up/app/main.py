import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.deps import (
    get_llm_gateway,
    shutdown_services,
)
from app.api.v1 import generate
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.exceptions import AppException
from app.core.logging import (
    configure_logging,
    get_logger,
    get_trace_id,
    set_trace_id,
)
from app.schemas.common import ErrorResponse

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ---------- startup ----------
    configure_logging(debug=settings.debug)
    settings.audio_path.mkdir(parents=True, exist_ok=True)

    # 预热：提前构造 gateway，避免首个请求慢
    get_llm_gateway()

    logger.info(
        "app_start",
        app_name=settings.app_name,
        version=settings.app_version,
        debug=settings.debug,
    )

    try:
        yield
    finally:
        # ---------- shutdown ----------
        logger.info("app_shutdown_begin")
        try:
            await shutdown_services()
        except Exception as e:
            logger.error("app_shutdown_error", error=str(e), exc_info=True)
        logger.info("app_shutdown_done")


app = FastAPI(
    title="Podcast Engine Python",
    version=settings.app_version,
    lifespan=lifespan,
)


# ---------- traceId 中间件 ----------
@app.middleware("http")
async def trace_id_middleware(request: Request, call_next):
    incoming = request.headers.get("X-Trace-Id")
    trace_id = set_trace_id(incoming)
    response = await call_next(request)
    response.headers["X-Trace-Id"] = trace_id
    return response


# ---------- 全局异常处理 ----------
@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    logger.warning(
        "app_exception",
        code=exc.code,
        message=exc.message,
        details=exc.details,
    )
    body = ErrorResponse(
        code=exc.code,
        message=exc.message,
        traceId=get_trace_id(),
        details=exc.details,
    )
    return JSONResponse(status_code=exc.http_status, content=body.model_dump())


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error("unhandled_exception", error=str(exc), exc_info=True)
    body = ErrorResponse(
        code="INTERNAL_ERROR",
        message="服务内部错误",
        traceId=get_trace_id(),
        details={},
    )
    return JSONResponse(status_code=500, content=body.model_dump())


# ---------- CORS ----------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- 路由 ----------
app.include_router(api_router, prefix="/api/v1")

# Java 端（PEngineController）固定按 /api/ai/generate-worldline 调用，保留该兼容路径
app.include_router(generate.router, prefix="/api/ai", tags=["generate"])


# ---------- 静态资源 ----------
settings.static_path.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=settings.static_dir), name="static")


# ---------- 健康检查 ----------
@app.get("/health", tags=["system"])
async def health():
    return {
        "status": "ok",
        "app": settings.app_name,
        "version": settings.app_version,
    }