package cn.edu.zut.aigcgal.DTO;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/** 批量配音请求体：{"inputs": [...]}。 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class TtsBatchRequestDto {

    private List<TtsInputDto> inputs;
}