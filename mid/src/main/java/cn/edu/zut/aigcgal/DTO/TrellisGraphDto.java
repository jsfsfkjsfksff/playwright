package cn.edu.zut.aigcgal.DTO;

import lombok.Data;

import java.util.List;

@Data
public class TrellisGraphDto {
    private List<WorldlineNodeDto> nodes;
    private List<WorldlineEdgeDto> edges;
}