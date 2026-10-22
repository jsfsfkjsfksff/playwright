package cn.edu.zut.aigcgal.map;

import cn.edu.zut.aigcgal.dao.node.Scene;
import org.springframework.data.neo4j.repository.Neo4jRepository;
import org.springframework.data.neo4j.repository.query.Query;
import org.springframework.data.repository.query.Param;

public interface SceneRepository extends Neo4jRepository<Scene,Long> {
    Scene findBySceneId(String sceneId);

    /**
     * 只回填 audioUrl 这一个属性。
     *
     * 为什么不用 save(Scene)：save 会把整个节点连同已加载的 TRANSITION_TO 关系一起写回，
     * 而播放端拉到的目标场景其 edges 是空的（只加载了一层），整节点保存等于拿一份
     * 不完整的图去覆盖用户的剧情 —— 手术式更新只碰 audioUrl，风险为零。
     */
    @Query("MATCH (s:Scene {sceneId: $sceneId}) SET s.audioUrl = $audioUrl")
    void updateAudioUrl(@Param("sceneId") String sceneId, @Param("audioUrl") String audioUrl);
}