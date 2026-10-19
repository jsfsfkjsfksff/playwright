package cn.edu.zut.aigcgal.export.service;

import cn.edu.zut.aigcgal.R.BusinessCodeEnum;
import cn.edu.zut.aigcgal.R.ResultCodeEnum;

/**
 * 导出失败：带上要回给前端的 code / 业务码 / 文案。
 */
public class ExportException extends RuntimeException {

    private final ResultCodeEnum code;
    private final BusinessCodeEnum businessCode;

    private ExportException(ResultCodeEnum code, BusinessCodeEnum businessCode, String message) {
        super(message);
        this.code = code;
        this.businessCode = businessCode;
    }

    /** 所选片段没有可用音频（409 + AUDIO_SEGMENT_EMPTY） */
    public static ExportException segmentEmpty(String message) {
        return new ExportException(ResultCodeEnum.CONFLICT, BusinessCodeEnum.AUDIO_SEGMENT_EMPTY, message);
    }

    /** 场景不存在 / 请求不合法 */
    public static ExportException notFound(String message) {
        return new ExportException(ResultCodeEnum.NOT_FOUND, null, message);
    }

    /** Python 混音失败或服务不可用 */
    public static ExportException failed(String message) {
        return new ExportException(ResultCodeEnum.ERROR, null, message);
    }

    public ResultCodeEnum getCode() {
        return code;
    }

    public BusinessCodeEnum getBusinessCode() {
        return businessCode;
    }
}
