package cn.edu.zut.aigcgal.DTO;

import lombok.Data;

@Data
public class WorldlineEdgeDto {
    private String fromSceneId;
    private String toSceneId;
    private String action;
    private String condition;
}
