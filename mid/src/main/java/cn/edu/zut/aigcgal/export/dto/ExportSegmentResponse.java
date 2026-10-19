package cn.edu.zut.aigcgal.export.dto;

import lombok.Data;

/**
 * 导出结果（前端直接拿去播放 / 下载）。
 *
 * <p>{@code url} 是前端类型里用的字段，{@code finalAudioUrl} 是契约文档里的叫法，
 * 两个字段同值，避免两边对不齐。</p>
 */
@Data
public class ExportSegmentResponse {

    /** 可直接播放的完整地址（由 MediaUrlResolver 拼出） */
    private String url;

    /** 同 {@link #url}，契约文档命名 */
    private String finalAudioUrl;

    private String filename;
    private Integer segments;
    private Long durationMs;
}
