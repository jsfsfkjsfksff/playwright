package cn.edu.zut.aigcgal.R;

import lombok.Data;
import java.io.Serializable;

/**
 * 统一API响应结果封装
 */
@Data
public class R<T> implements Serializable {
    private static final long serialVersionUID = 1L;

    private Integer code;
    private String msg;
        
    /**
     * 业务码（见 {@link BusinessCodeEnum}）。
     * 为空表示只是一次普通的成功 / 失败，前端按 code + msg 处理即可；
     * 有值时才需要前端**按码分支**，而不是去猜 msg 文案。
     */
    private String errCode;

    private T data;

    private R() {}

    // --- 核心底座方法 ---
    private static <T> R<T> build(ResultCodeEnum resultCodeEnum, T data) {
        R<T> r = new R<>();
        r.setCode(resultCodeEnum.getCode());
        r.setMsg(resultCodeEnum.getMsg());
        r.setData(data);
        return r;
    }

    // --- 成功响应 ---
    public static <T> R<T> success() {
        return build(ResultCodeEnum.SUCCESS, null);
    }

    public static <T> R<T> success(T data) {
        return build(ResultCodeEnum.SUCCESS, data);
    }

    // --- 失败响应 ---
    public static <T> R<T> error(ResultCodeEnum resultCodeEnum) {
        return build(resultCodeEnum, null);
    }

    // 允许自定义覆盖 Enum 的默认 message（通常用于捕获具体的异常信息）
    public static <T> R<T> error(ResultCodeEnum resultCodeEnum, String customMsg) {
        R<T> r = build(resultCodeEnum, null);
        r.setMsg(customMsg);
        return r;
    }

    /**
     * 业务冲突（HTTP 语义 409）：带上业务码，前端按码分支。
     * 例：启用了全篇 BGM 却没给文件 → CONFLICT + BGM_FILE_REQUIRED。
     */
    public static <T> R<T> conflict(BusinessCodeEnum businessCode, String customMsg) {
        R<T> r = build(ResultCodeEnum.CONFLICT, null);
        r.setErrCode(businessCode.name());
        r.setMsg(customMsg);
        return r;
    }
}