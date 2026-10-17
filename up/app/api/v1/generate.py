from fastapi import APIRouter, Depends

from app.api.deps import get_worldline_service
from app.domain.worldline.models import InterpolateRequest, TrellisGraphResponse
from app.services.worldline_service import WorldlineService

router = APIRouter()


@router.post(
    "/generate-worldline",
    response_model=TrellisGraphResponse,
    summary="锚点间世界线插值：图约束 + 硬校验 + 状态空间 DP（供 Java 端调用）",
)
async def generate_worldline(
    req: InterpolateRequest,
    service: WorldlineService = Depends(get_worldline_service),
) -> TrellisGraphResponse:
    """根据起点/终点锚点、必经节点图谱与大纲，生成 DP 剪枝后的剧情网格图。"""
    return await service.generate_worldline(req)