package cn.edu.zut.aigcgal.dao.node;

import cn.edu.zut.aigcgal.dao.re.Transition;
import lombok.Data;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.neo4j.core.schema.GeneratedValue;
import org.springframework.data.neo4j.core.schema.Id;
import org.springframework.data.neo4j.core.schema.Node;
import org.springframework.data.neo4j.core.schema.Relationship;

import java.util.ArrayList;
import java.util.List;

@Node("Scene")
@Data
public class Scene {
    @Id@GeneratedValue
    private Long id;
    private String sceneId;
    private String text;
    //默认旁白
    @Value("旁白")
    private String speaker;
    private String audioUrl;
    private Integer timeStage;

    @Relationship(type = "TRANSITION_TO", direction = Relationship.Direction.OUTGOING)
    private List<Transition> edges = new ArrayList<>();

    public void addChoice(Scene nextscene, String action, String condition) {
        Transition transition = new Transition();
        transition.setTargetScene(nextscene);
        transition.setAction(action);
        transition.setCondition(condition);
        this.edges.add(transition);
    }
}