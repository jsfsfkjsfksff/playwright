package cn.edu.zut.aigcgal.map;

import cn.edu.zut.aigcgal.dao.node.VoiceProfile;
import org.springframework.data.neo4j.repository.Neo4jRepository;

public interface VoiceProfileRepository extends Neo4jRepository<VoiceProfile, Long> {

    VoiceProfile findByCharacterId(String characterId);
}