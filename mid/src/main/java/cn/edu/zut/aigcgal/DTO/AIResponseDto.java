package cn.edu.zut.aigcgal.DTO;

import lombok.Data;

@Data
//这怎么处理audioURL和sceneText对应？
public class AIResponseDto {
    private String action;
    private String sceneText;
}