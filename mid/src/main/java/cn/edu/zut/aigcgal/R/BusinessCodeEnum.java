package cn.edu.zut.aigcgal.R;

/**
 * 业务码：与 HTTP 状态码解耦，放在 {@link R#getErrCode()} 里供前端**按码分支**，
 * 前端不该靠猜 msg 文案来判断到底出了什么事。
 *
 * 规矩：
 *   1. 一个业务码只表示一件事，禁止复用；
 *   2. 枚举名就是对外字符串（大写蛇形），**改名等于改接口**；
 *   3. 新增只许追加，不许删改已有项。
 */
public enum BusinessCodeEnum {

    /** 全篇 BGM 已启用，但没有可用的音频文件 */
    BGM_FILE_REQUIRED,

    /** 还没有配置全篇 BGM（读取时用） */
    BGM_NOT_CONFIGURED,

    /** 所选片段没有任何可用的人声音频，无法混音导出 */
    AUDIO_SEGMENT_EMPTY
}