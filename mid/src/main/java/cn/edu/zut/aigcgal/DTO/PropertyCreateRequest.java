package cn.edu.zut.aigcgal.DTO;

import lombok.Data;

import java.util.Map;

/**
 * 1.1 添加图谱资源节点 请求体。
 */
@Data
public class PropertyCreateRequest {

    private String type;
    private String name;
    private String description;
    private Map<String, Object> attributes;
}