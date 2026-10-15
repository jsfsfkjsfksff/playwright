package cn.edu.zut.aigcgal.DTO;

import lombok.AllArgsConstructor;
import lombok.Data;

/**
 * 1.2 查询资源列表 返回项，只暴露前端画布筛选需要的三个字段。
 */
@Data
@AllArgsConstructor
public class PropertyListItemDto {

    private String nodeId;
    private String name;
    private String type;
}