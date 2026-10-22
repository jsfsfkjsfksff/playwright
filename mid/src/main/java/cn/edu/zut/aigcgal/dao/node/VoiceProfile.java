package cn.edu.zut.aigcgal.dao.node;

import lombok.Data;
import org.springframework.data.annotation.Transient;
import org.springframework.data.neo4j.core.schema.GeneratedValue;
import org.springframework.data.neo4j.core.schema.Id;
import org.springframework.data.neo4j.core.schema.Node;

/**
 * 全篇配音配置。
 *
 * 全篇**只有一条**：用户控制的是「讲播客的这个人」的音色，故事内角色由 agent 控制，
 * 因此这里刻意不保留 characterId 之类的关联字段 —— 配音与资源（properties）域无关。
 */
@Node("VoiceProfile")
@Data
public class VoiceProfile {

    @Id
    @GeneratedValue
    private Long id;

    // TTS 音色名，取值见百炼「Qwen-Audio-TTS 音色列表」（如 longanhuan_v3.1）
    private String voiceName;

    // 风格提示词，如「语气低沉、疲惫、带有一点不耐烦，语速偏慢」
    private String promptStyle;

    // 音调倍数（合法区间 [0.5, 2.0]，1.0 为原调）——不是半音偏移，别填负数
    private Double pitch;

    // 语速倍数（合法区间 [0.5, 2.0]）
    private Double rate;

    /**
     * 用户是否真的配置过 —— **只用于响应，不落库**。
     * 未配置时 GET /voices 仍返回 200 + 默认值（前端不用处理 404），
     * 前端靠这个字段区分「用户配过」与「这是后端默认值」，不会把默认音色说成用户的选择。
     */
    @Transient
    private Boolean configured;

    /** 从未配置过时对外返回的默认值（与前端 mock 的 DEFAULT_VOICE 保持一致） */
    public static VoiceProfile globalDefault() {
        VoiceProfile profile = new VoiceProfile();
        profile.setVoiceName("longanhuan_v3.1");
        profile.setPromptStyle("");
        profile.setPitch(1.0);
        profile.setRate(1.0);
        profile.setConfigured(false);
        return profile;
    }
}