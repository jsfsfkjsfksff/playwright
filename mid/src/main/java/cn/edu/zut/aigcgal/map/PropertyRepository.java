package cn.edu.zut.aigcgal.map;

import cn.edu.zut.aigcgal.dao.node.PropertyNode;
import org.springframework.data.neo4j.repository.Neo4jRepository;

import java.util.List;

public interface PropertyRepository extends Neo4jRepository<PropertyNode, Long> {

    PropertyNode findByNodeId(String nodeId);

    List<PropertyNode> findByType(String type);
}