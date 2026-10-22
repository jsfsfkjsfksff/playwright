package cn.edu.zut.aigcgal.DTO;

import lombok.Data;

/**
 * 前端的单向剧情连线（对应 Python 端的 TransitionInput）。
 *
 * ⚠️ 第六代约定：画布上的双向边对**不会**原样传过来，前端已把它收敛成一条单向边，
 * 并在 action 里带 {@code [[USER_FIXED]]} 标记；后端只负责透传给 Python，
 * 不新增任何 Transition 字段。
 */
@Data
public class TransitionDto {
    private String fromSceneId;
    private String toSceneId;
    private String action;
}