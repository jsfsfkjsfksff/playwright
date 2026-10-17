package cn.edu.zut.aigcgal.controller;

import cn.edu.zut.aigcgal.DTO.VoiceProfileRequest;
import cn.edu.zut.aigcgal.R.R;
import cn.edu.zut.aigcgal.dao.node.VoiceProfile;
import cn.edu.zut.aigcgal.service.VoiceService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 2. 语音档案域 (Voice)
 * 全篇唯一的一条配音配置 —— 用户控制的是「讲播客的这个人」的音色，
 * 故事内角色由 agent 控制，因此这一域**与资源（properties）域无关**，也没有 characterId。
 */
@RestController
@RequestMapping("/api/v1")
public class VoiceController {

    private final VoiceService voiceService;

    public VoiceController(VoiceService voiceService) {
        this.voiceService = voiceService;
    }

    /** 2.1 保存全篇配音配置（全篇唯一，重复提交只更新同一条） */
    @PostMapping("/voices")
    public R<VoiceProfile> save(@RequestBody VoiceProfileRequest request) {
        return R.success(voiceService.save(request));
    }

    /**
     * 2.2 查询全篇配音配置 —— 无路径参数。
     * 从未配置过时同样返回 200 + 默认值（data.configured = false），前端不用处理 404。
     */
    @GetMapping("/voices")
    public R<VoiceProfile> get() {
        return R.success(voiceService.get());
    }
}