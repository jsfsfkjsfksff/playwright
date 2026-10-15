from fastapi import APIRouter, Depends

from app.api.deps import get_worldline_service
from app.domain.worldline.models import InterpolateRequest, WorldlineNode
from app.services.worldline_service import WorldlineService

router = APIRouter()


@router.post(
    "/generate-worldline",
    response_model=list[WorldlineNode],
    summary="锚点间世界线插值（供 Java 端调用）",
)
async def generate_worldline(
    req: InterpolateRequest,
    service: WorldlineService = Depends(get_worldline_service),
) -> list[WorldlineNode]:
    """根据起点/终点锚点与大纲，生成补全中间空白的线性世界线。"""
    return await service.generate_worldline(req)