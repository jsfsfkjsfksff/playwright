package cn.edu.zut.aigcgal.common.tts;

import cn.edu.zut.aigcgal.DTO.TtsInputDto;
import cn.edu.zut.aigcgal.DTO.TtsResultDto;
import cn.edu.zut.aigcgal.common.media.MediaUrlResolver;
import cn.edu.zut.aigcgal.dao.node.Scene;
import cn.edu.zut.aigcgal.dao.node.VoiceProfile;
import cn.edu.zut.aigcgal.service.VoiceService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * 场景配音：把「文字 → 音频」这件事收口到一处，供剧情生成与播放端共用。
 *
 * 为什么需要共用（而不是各写一份）：
 *   · 剧情生成侧（{@code PEngineController}）：新生成的场景要顺带配音；
 *   · 播放侧（{@code PlayController}）：锚点场景从不经过生成流程，audioUrl 一直是空的，
 *     听众进播放页第一幕就没有音频 —— 需要惰性补录。
 *   两处若各写一份「音色配置 → TTS 入参」的映射，参数语义（倍数区间、指令字段）
 *   迟早会漂移成两套，出问题时很难判断是哪一边写错了。
 *
 * 约定：本服务**只回填内存里对象的 audioUrl，不落库** —— 落库时机由调用方决定
 * （生成侧要等整张图缝合完一起存，播放侧则补录完立刻存）。
 */
@Slf4j
@Service
public class SceneDubbingService {

    private final VoiceService voiceService;
    private final PythonTtsClient pythonTtsClient;
    private final MediaUrlResolver mediaUrlResolver;

    public SceneDubbingService(VoiceService voiceService,
                               PythonTtsClient pythonTtsClient,
                               MediaUrlResolver mediaUrlResolver) {
        this.voiceService = voiceService;
        this.pythonTtsClient = pythonTtsClient;
        this.mediaUrlResolver = mediaUrlResolver;
    }

    /**
     * 批量配音：回填传入场景的 {@code audioUrl}（对外完整地址）。
     *
     * 规则：
     *   1. 只处理 text 非空的场景 —— 没有文本无从合成；
     *   2. Python 只返回相对路径，这里用 MediaUrlResolver 拼成对外地址；
     *   3. 音色 / 语速 / 音调取「全篇唯一」的那条配音配置 —— Java 是 audioUrl 的唯一写入者；
     *   4. **失败不抛异常**：剧情/播放都不该因为配音不可用而整体失败，
     *      缺的音频留给下一次调用或播放端补录。
     */
    public void dub(List<Scene> scenes) {
        List<Scene> targets = scenes.stream()
                .filter(s -> s.getText() != null && !s.getText().isBlank())
                .toList();
        if (targets.isEmpty()) {
            return;
        }

        VoiceProfile voice = voiceService.get();
        List<TtsInputDto> inputs = new ArrayList<>();
        for (Scene scene : targets) {
            TtsInputDto input = new TtsInputDto();
            input.setText(scene.getText());
            input.setVoice(voice.getVoiceName());
            input.setRate(boundedMultiplier(voice.getRate()));
            input.setPitch(boundedMultiplier(voice.getPitch()));
            input.setInstruction(voice.getPromptStyle());
            inputs.add(input);
        }

        List<TtsResultDto> results;
        try {
            results = pythonTtsClient.synthesizeBatch(inputs);
        } catch (Exception e) {
            log.warn("场景配音失败，这些场景暂时没有音频（播放端会兜底补录）：{}", e.getMessage());
            return;
        }

        if (results.size() != targets.size()) {
            log.warn("配音结果条数与场景条数不一致（{} vs {}），本次不回填 audioUrl",
                    results.size(), targets.size());
            return;
        }

        for (int i = 0; i < targets.size(); i++) {
            targets.get(i).setAudioUrl(mediaUrlResolver.url(results.get(i).getAudioUrl()));
        }
        log.info("已为 {} 幕场景配音", targets.size());
    }

    /**
     * 语速 / 音调是**倍数**语义，合法区间 [0.5, 2.0]（见 Qwen-Audio-TTS 文档）。
     * 缺省或越界一律回落到 1.0 —— 否则 Python 侧 pydantic 会把整批请求判成 422。
     */
    private static double boundedMultiplier(Double value) {
        if (value == null || value < 0.5 || value > 2.0) {
            return 1.0;
        }
        return value;
    }
}