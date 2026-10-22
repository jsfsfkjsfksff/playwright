package cn.edu.zut.aigcgal.play;

import cn.edu.zut.aigcgal.R.R;
import cn.edu.zut.aigcgal.R.ResultCodeEnum;
import cn.edu.zut.aigcgal.common.tts.SceneDubbingService;
import cn.edu.zut.aigcgal.dao.node.Scene;
import cn.edu.zut.aigcgal.dao.re.Transition;
import cn.edu.zut.aigcgal.map.SceneRepository;
import cn.edu.zut.aigcgal.play.dto.PlayEdgeDto;
import cn.edu.zut.aigcgal.play.dto.PlaySceneDto;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 4. 消费播放域 (Play)
 * 听众侧按 sceneId 拉取一个场景节点及其分支；不改剧情图，只可能补录缺失的音频。
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/play")
public class PlayController {

    private final SceneRepository sceneRepository;
    private final SceneDubbingService sceneDubbingService;

    public PlayController(SceneRepository sceneRepository, SceneDubbingService sceneDubbingService) {
        this.sceneRepository = sceneRepository;
        this.sceneDubbingService = sceneDubbingService;
    }

    /** 4.1 拉取单个场景与它的分支 */
    @GetMapping("/scene/{sceneId}")
    public R<PlaySceneDto> scene(@PathVariable String sceneId) {
        Scene scene = sceneRepository.findBySceneId(sceneId);
        if (scene == null) {
            return R.error(ResultCodeEnum.NOT_FOUND, "场景不存在: " + sceneId);
        }
        backfillAudio(scene);
        return R.success(toDto(scene, true));
    }

    /**
     * 惰性补录音频。
     *
     * 为什么需要：**锚点场景从不经过「一键生成」**（`POST /plan/anchors` 只落库、不配音，
     * 而生成时的配音只覆盖本次新生成的场景），所以它们的 audioUrl 一直是空的；
     * 听众一进播放页第一幕就没有音频，播放器会卡在那里。
     *
     * 规则：
     *   1. 已有音频直接跳过 —— 幂等，不会每次进页都重合成；
     *   2. 只补当前这一个场景（其余场景由前端按需拉取时各自补录），单次请求的耗时可控；
     *   3. 补录失败**不影响返回**：场景照旧返回，前端按「该场景没有音频」如实提示；
     *   4. 成功后只 `SET audioUrl` 一个属性，不动剧情图。
     */
    private void backfillAudio(Scene scene) {
        if (scene.getAudioUrl() != null && !scene.getAudioUrl().isBlank()) {
            return;
        }
        if (scene.getText() == null || scene.getText().isBlank()) {
            return;
        }

        sceneDubbingService.dub(List.of(scene));
        String dubbed = scene.getAudioUrl();
        if (dubbed == null || dubbed.isBlank()) {
            log.warn("场景 {} 的音频补录失败，本次仍按无音频返回", scene.getSceneId());
            return;
        }

        sceneRepository.updateAudioUrl(scene.getSceneId(), dubbed);
        log.info("场景 {} 的音频已补录：{}", scene.getSceneId(), dubbed);
    }

    /**
     * 实体 → 出参。
     *
     * @param withEdges 是否展开本场景的分支。只有根场景为 true；
     *                  分支里的目标场景一律置 false —— 契约保证只嵌套一层
     *                  （嵌套层的 edges 恒为空数组），同时这条规则本身就掐断了
     *                  环形引用导致的无限递归。想拿再下一层的分支，前端再请求一次。
     */
    private PlaySceneDto toDto(Scene scene, boolean withEdges) {
        PlaySceneDto dto = new PlaySceneDto();
        dto.setId(scene.getId());
        dto.setSceneId(scene.getSceneId());
        dto.setText(scene.getText());
        dto.setSpeaker(scene.getSpeaker());
        dto.setAudioUrl(scene.getAudioUrl());

        if (withEdges && scene.getEdges() != null) {
            for (Transition transition : scene.getEdges()) {
                PlayEdgeDto edge = new PlayEdgeDto();
                edge.setAction(transition.getAction());
                edge.setCondition(transition.getCondition());
                if (transition.getTargetScene() != null) {
                    edge.setTargetScene(toDto(transition.getTargetScene(), false));
                }
                dto.getEdges().add(edge);
            }
        }
        return dto;
    }
}