package cn.edu.zut.aigcgal.DTO;

import lombok.Data;

/**
 * 2.1 保存全篇配音配置 请求体。
 * 全篇唯一，因此**没有** characterId —— 配音与资源节点无关。
 */
@Data
public class VoiceProfileRequest {
    private String voiceName;
    private String promptStyle;
    private Double pitch;
    private Double rate;
}