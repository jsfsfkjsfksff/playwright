package cn.edu.zut.aigcgal.dao.node;

import lombok.Data;
import org.springframework.data.neo4j.core.schema.GeneratedValue;
import org.springframework.data.neo4j.core.schema.Id;
import org.springframework.data.neo4j.core.schema.Node;

/**
 * 角色声音档案，用于精准指导底层 TTS 模型（Qwen 语音 / Genie-TTS）。
 * characterId 指向 {@link PropertyNode} 的 nodeId。
 */
@Node("VoiceProfile")
@Data
public class VoiceProfile {

    @Id
    @GeneratedValue
    private Long id;

    // 关联的角色资源节点，形如 PROP_1001
    private String characterId;

    // TTS 音色名，如 zh-CN-Yunxi-Neural
    private String voiceName;

    // 风格提示词，如「语气低沉、疲惫、带有一点不耐烦，语速偏慢」
    private String promptStyle;

    // 音调偏移
    private Double pitch;

    // 语速倍率
    private Double rate;
}