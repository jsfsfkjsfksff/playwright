package cn.edu.zut.aigcgal.play.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * 消费播放域出参：一个可播放的场景节点（对应后端 Scene 实体）。
 *
 * 为什么用 DTO 而不是直接序列化 Scene：
 *   实体是 Scene.edges → Transition.targetScene → Scene... 的双向引用，
 *   直接交给 Jackson 会无限递归；此外实体上还挂着内部主键与图关系细节，
 *   不应该暴露给听众侧。这里显式裁成契约要求的形状。
 */
@Data
public class PlaySceneDto {

    /** 后端内部主键（契约里与 sceneId 并存，可缺省） */
    private Long id;

    /** 场景业务 id */
    private String sceneId;

    /** 台词 / 场景文本 */
    private String text;

    /** 发声人 */
    private String speaker;

    /** 音频地址；为空表示该场景还没有音频（前端据此如实提示，不假装能播） */
    private String audioUrl;

    /** 后续分支选项；契约字段名是 edges，不是 choices */
    private List<PlayEdgeDto> edges = new ArrayList<>();
}