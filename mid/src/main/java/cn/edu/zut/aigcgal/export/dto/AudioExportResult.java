package cn.edu.zut.aigcgal.export.dto;

import lombok.Data;

/**
 * Python {@code /api/audio/export} 的返回体。
 *
 * <p>契约：只有 {@code status == "OK"} 且 {@code error} 为空才算成功；
 * 失败时 Python 会明确回 {@code status="FAILED"}，Java 不得返回半个成品。</p>
 */
@Data
public class AudioExportResult {

    private String status;
    /** 相对媒体路径，如 static/exports/x.mp3 */
    private String url;
    private String filename;
    private Integer segments;
    private Long sizeBytes;
    private Long durationMs;
    private String error;
}
