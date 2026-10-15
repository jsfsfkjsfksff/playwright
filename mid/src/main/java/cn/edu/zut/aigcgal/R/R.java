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
}