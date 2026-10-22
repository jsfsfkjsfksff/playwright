package cn.edu.zut.aigcgal.play.dto;

import lombok.Data;

/**
 * 消费播放域出参：一条分支（对应后端 Transition 实体）。
 * targetScene 里已带全下一层的台词与音频地址，听众点击分支无需再发请求。
 */
@Data
public class PlayEdgeDto {

    /** 选项文案，例如「向左走」 */
    private String action;

    /** 触发条件，契约示例为 NONE */
    private String condition;

    /** 目标场景；其 edges 恒为空数组（契约只嵌套一层） */
    private PlaySceneDto targetScene;
}