package cn.edu.zut.aigcgal.DTO;

import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * 1.1 添加图谱资源节点 请求体。
 */
@Data
public class PropertyRequestDto {
    private String type;                        // CHARACTER, ITEM, LOCATION, RULE
    private String name;                        // 如 "miku"
    private String description;
    private Map<String, Object> attributes;     // 如 {"fixed_song": "World is Mine", "isAngry": true}
    private List<RelationTargetDto> relations;  // 【新增】：该节点发出的原生图关系列表
}

