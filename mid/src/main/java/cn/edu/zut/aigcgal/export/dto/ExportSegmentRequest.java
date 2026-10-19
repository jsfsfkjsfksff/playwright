package cn.edu.zut.aigcgal.export.dto;

import lombok.Data;

import java.util.List;

/**
 * 导出纯音频片段请求体（前端：POST /api/v1/plan/export-segment）。
 */
@Data
public class ExportSegmentRequest {

    /** 要导出的场景 id 列表，数组顺序即导出顺序 */
    private List<String> sceneIds;
}
