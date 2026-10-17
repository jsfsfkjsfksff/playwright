package cn.edu.zut.aigcgal.service;

import cn.edu.zut.aigcgal.DTO.VoiceProfileRequest;
import cn.edu.zut.aigcgal.dao.node.VoiceProfile;
import cn.edu.zut.aigcgal.map.VoiceProfileRepository;
import org.springframework.stereotype.Service;

import java.util.Optional;

/**
 * 配音域业务逻辑：**全篇唯一**的一条配音配置的保存与查询。
 * 不按角色区分 —— 用户配的是「讲播客的这个人」的音色。
 */
@Service
public class VoiceService {

    private final VoiceProfileRepository voiceProfileRepository;

    public VoiceService(VoiceProfileRepository voiceProfileRepository) {
        this.voiceProfileRepository = voiceProfileRepository;
    }

    /**
     * 保存全篇配音配置：库里已有则覆盖同一条，没有则新建 —— 始终只有一条。
     */
    public VoiceProfile save(VoiceProfileRequest request) {
        VoiceProfile profile = current().orElseGet(VoiceProfile::new);
        applyRequest(profile, request);

        VoiceProfile saved = voiceProfileRepository.save(profile);
        saved.setConfigured(true);
        return saved;
    }

    /**
     * 查询全篇配音配置。
     * 从未配置过时返回默认值（configured = false），**不返回 null、也不报 404** ——
     * 与 GET /play/bgm 同一风格，前端不需要为「还没配」写一条错误分支。
     */
    public VoiceProfile get() {
        return current()
                .map(profile -> {
                    profile.setConfigured(true);
                    return profile;
                })
                .orElseGet(VoiceProfile::globalDefault);
    }

    /** 库里唯一的那条；为空表示用户还没配过 */
    private Optional<VoiceProfile> current() {
        // 全篇唯一，因此直接取第一条；
        // 早期按角色存下的多条旧数据同样只取第一条，不做自动迁移（迁移请手动清理库）
        return voiceProfileRepository.findAll().stream().findFirst();
    }

    private void applyRequest(VoiceProfile profile, VoiceProfileRequest request) {
        profile.setVoiceName(request.getVoiceName());
        profile.setPromptStyle(request.getPromptStyle());
        profile.setPitch(request.getPitch());
        profile.setRate(request.getRate());
    }
}