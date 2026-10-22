package cn.edu.zut.aigcgal.DTO;

import lombok.Data;

/** 单条配音结果，对应 Python 侧的 AudioResult。 */
@Data
public class TtsResultDto {

    /** 相对路径，如 /static/audio/xxx.mp3 —— 对外地址必须由 MediaUrlResolver 拼出来 */
    private String audioUrl;

    private Integer durationMs;

    private String localPath;

    private String format;
}