package cn.edu.zut.aigcgal.export.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 发给 Python {@code /api/audio/export} 的任务体（字段与 Python 侧一一对应）。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AudioExportPayload {

    /** 按收听顺序排列的人声地址（相对路径或历史完整 URL 均可） */
    private List<String> audioUrls;

    /** 全篇 BGM 地址；为空表示不混 BGM */
    private String bgmUrl;

    /** BGM 衰减分贝，如 -15 */
    private Double bgmVolumeDb;
}
