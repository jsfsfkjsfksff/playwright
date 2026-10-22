package cn.edu.zut.aigcgal.DTO;

import lombok.Data;

/**
 * 单条配音请求，字段名与 Python 侧 TTSInput 严格对齐。
 * 音色 / 语速 / 音调都由这里的字段下发，不存在 Python 侧再兜底的情况。
 */
@Data
public class TtsInputDto {

    private String text;

    /** 音色名，取值见百炼 Qwen-Audio-TTS 音色列表 */
    private String voice;

    /** 语速倍数，合法区间 [0.5, 2.0] */
    private Double rate;

    /** 音调倍数，合法区间 [0.5, 2.0]，1.0 为原调 */
    private Double pitch;

    /** 情感 / 角色 / 方言指令，对应配音域的 promptStyle */
    private String instruction;
}