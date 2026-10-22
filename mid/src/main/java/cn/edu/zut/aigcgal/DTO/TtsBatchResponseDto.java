package cn.edu.zut.aigcgal.DTO;

import lombok.Data;

import java.util.List;

/**
 * 批量配音响应体：{"results": [...]}，**与请求同序**（第 i 条结果对应第 i 条输入）。
 *
 * 注意：Python 的这个接口直接返回本对象，没有 R{code, msg, data} 包装。
 */
@Data
public class TtsBatchResponseDto {

    private List<TtsResultDto> results;
}