package cn.edu.zut.aigcgal.controller;

import cn.edu.zut.aigcgal.DTO.VoiceProfileRequest;
import cn.edu.zut.aigcgal.R.R;
import cn.edu.zut.aigcgal.R.ResultCodeEnum;
import cn.edu.zut.aigcgal.dao.node.VoiceProfile;
import cn.edu.zut.aigcgal.service.VoiceService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 2. 语音档案域 (Voice)
 * 记录用户对播音演员的声音设定要求。
 */
@RestController
@RequestMapping("/api/v1")
public class VoiceController {

    private final VoiceService voiceService;

    public VoiceController(VoiceService voiceService) {
        this.voiceService = voiceService;
    }

    /** 2.1 创建/更新角色声音档案 */
    @PostMapping("/voices")
    public R<VoiceProfile> save(@RequestBody VoiceProfileRequest request) {
        return R.success(voiceService.save(request));
    }

    /** 2.2 查询声音档案（前端配置面板回显） */
    @GetMapping("/voices/{characterId}")
    public R<VoiceProfile> get(@PathVariable String characterId) {
        VoiceProfile profile = voiceService.getByCharacterId(characterId);
        if (profile == null) {
            return R.error(ResultCodeEnum.NOT_FOUND, "该角色尚未配置声音档案");
        }
        return R.success(profile);
    }
}