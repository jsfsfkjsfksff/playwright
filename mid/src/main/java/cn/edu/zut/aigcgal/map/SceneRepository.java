package cn.edu.zut.aigcgal.map;

import cn.edu.zut.aigcgal.dao.node.Scene;
import org.springframework.data.neo4j.repository.Neo4jRepository;

public interface SceneRepository extends Neo4jRepository<Scene,Long> {
    Scene findBySceneId(String sceneId);
}