package cn.edu.zut.aigcgal.map;

import cn.edu.zut.aigcgal.dao.node.VoiceProfile;
import org.springframework.data.neo4j.repository.Neo4jRepository;

/**
 * 全篇配音配置仓库。
 * 系统里最多只有一条记录，取用方式见 {@link cn.edu.zut.aigcgal.service.VoiceService}，
 * 因此这里没有任何按字段查询的方法。
 */
public interface VoiceProfileRepository extends Neo4jRepository<VoiceProfile, Long> {
}