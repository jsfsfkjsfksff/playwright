package cn.edu.zut.aigcgal.dao.node;

import lombok.Data;
import org.springframework.data.neo4j.core.schema.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
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

    // 无需新建 PropertyRelation 类，直接在 PropertyNode 中声明：
    @Relationship(direction = Relationship.Direction.OUTGOING)
    private Map<String, List<PropertyNode>> dynamicRelations = new HashMap<>();

    // 便捷连线方法：传入的 relationType ("HOLDS" / "ENEMY_OF") 会直接成为 Neo4j 的边类型！
    public void addDynamicRelation(String relationType, PropertyNode target) {
        this.dynamicRelations
                .computeIfAbsent(relationType.toUpperCase(), k -> new ArrayList<>())
                .add(target);
    }
}