package cn.edu.zut.aigcgal.DTO;

import lombok.Data;

@Data
public class WorldlineNodeDto {
    private String sceneId;  // 新增：对应 Python 分配的唯一 ID
    private String action;     // 玩家或角色的动作
    private String text;       // 剧本内容
    private String speaker;    // 谁在说话
    private String audioUrl;   // 语音地址
}