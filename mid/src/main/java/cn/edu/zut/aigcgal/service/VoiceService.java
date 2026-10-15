package cn.edu.zut.aigcgal.service;

import cn.edu.zut.aigcgal.DTO.VoiceProfileRequest;
import cn.edu.zut.aigcgal.dao.node.VoiceProfile;
import cn.edu.zut.aigcgal.map.VoiceProfileRepository;
import org.springframework.stereotype.Service;

/**
 * 语音档案域业务逻辑：角色声音配置的创建/更新与查询。
 */
@Service
public class VoiceService {

    private final VoiceProfileRepository voiceProfileRepository;

    public VoiceService(VoiceProfileRepository voiceProfileRepository) {
        this.voiceProfileRepository = voiceProfileRepository;
    }

    /**
     * 创建或更新声音档案：同一 characterId 再次提交即覆盖旧配置。
     */
    public VoiceProfile save(VoiceProfileRequest request) {
        VoiceProfile profile = voiceProfileRepository.findByCharacterId(request.getCharacterId());
        if (profile == null) {
            profile = new VoiceProfile();
            profile.setCharacterId(request.getCharacterId());
        }
        profile.setVoiceName(request.getVoiceName());
        profile.setPromptStyle(request.getPromptStyle());
        profile.setPitch(request.getPitch());
        profile.setRate(request.getRate());
        return voiceProfileRepository.save(profile);
    }

    public VoiceProfile getByCharacterId(String characterId) {
        return voiceProfileRepository.findByCharacterId(characterId);
    }
}