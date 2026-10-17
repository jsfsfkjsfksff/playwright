package cn.edu.zut.aigcgal.DTO;

import lombok.Data;

@Data
public class RelationTargetDto {
    private String type;        // 关系名：如 "HOLDS", "LOCATED_AT", "ENEMY_OF"
    private String targetName;  // 目标节点名：如 "复古立麦", "排练室"
    private String targetType;  // 目标节点类型(若目标不存在时自动创建用)：如 "ITEM", "LOCATION", "CHARACTER"
}