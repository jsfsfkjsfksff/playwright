package cn.edu.zut.aigcgal.dao.re;

import cn.edu.zut.aigcgal.dao.node.Scene;
import lombok.Data;
import org.springframework.data.neo4j.core.schema.RelationshipId;
import org.springframework.data.neo4j.core.schema.RelationshipProperties;
import org.springframework.data.neo4j.core.schema.TargetNode;

@RelationshipProperties
@Data
public class Transition {
    @RelationshipId
    private Long id;
    @TargetNode
    private Scene targetScene;
    private String action;
    private String condition;
}