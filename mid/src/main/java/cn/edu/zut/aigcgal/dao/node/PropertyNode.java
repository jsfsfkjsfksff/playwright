package cn.edu.zut.aigcgal.dao.node;

import lombok.Data;
import org.springframework.data.neo4j.core.schema.CompositeProperty;
import org.springframework.data.neo4j.core.schema.GeneratedValue;
import org.springframework.data.neo4j.core.schema.Id;
import org.springframework.data.neo4j.core.schema.Node;

import java.util.HashMap;
import java.util.Map;

/**
 * 基础资源元素节点（角色 / 世界观规则 / 实体对象）。
 * 对应接口文档「属性配置域 (Properties)」。
 */
@Node("Property")
@Data
public class PropertyNode {

    @Id
    @GeneratedValue
    private Long id;

    // 业务主键，形如 PROP_1001，供前端与语音档案引用
    private String nodeId;

    // CHARACTER(角色) / RULE(世界观规则) / ENTITY(物品/实体)
    private String type;

    private String name;

    private String description;

    // 属性不写死：任意键值对，以复合属性形式落库（attributes.isHostile = false）
    @CompositeProperty
    private Map<String, Object> attributes = new HashMap<>();
}