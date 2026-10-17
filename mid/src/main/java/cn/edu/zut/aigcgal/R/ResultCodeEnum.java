package cn.edu.zut.aigcgal.R;

import lombok.Getter;

/**
 * 全局统一状态码枚举
 */
@Getter
public enum ResultCodeEnum {

    // --- 成功状态码 ---
    SUCCESS(200, "操作成功"),

    // --- 客户端/参数错误 (4xx) ---
    PARAM_ERROR(400, "参数校验失败"),
    UNAUTHORIZED(401, "尚未登录或授权过期"),
    FORBIDDEN(403, "权限不足，拒绝访问"),
    NOT_FOUND(404, "请求资源不存在"),
    /** 业务冲突（如「启用了全篇 BGM 却没给文件」）：具体原因看 R.errCode 里的业务码 */
    CONFLICT(409, "业务冲突"),

    // --- 服务端错误 (5xx) ---
    ERROR(500, "系统内部异常"),
    DB_ERROR(503, "数据库操作异常"), INTERNAL_ERROR(500, "AI 剧情网格推演为空"), BAD_REQUEST(400, "请求参数错误");

    private final Integer code;
    private final String msg;

    ResultCodeEnum(Integer code, String msg) {
        this.code = code;
        this.msg = msg;
    }
}