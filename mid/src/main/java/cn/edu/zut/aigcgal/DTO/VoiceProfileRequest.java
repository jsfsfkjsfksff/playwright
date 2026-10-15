package cn.edu.zut.aigcgal.DTO;

import lombok.Data;

/**
 * 2.1 创建/更新角色声音档案 请求体。
 */
@Data
public class VoiceProfileRequest {

    private String characterId;
    private String voiceName;
    private String promptStyle;
    private Double pitch;
    private Double rate;
}