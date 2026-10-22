package cn.edu.zut.aigcgal.DTO;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.Map;

/**
 * 1.2 查询资源列表 返回项。
 *
 * 除画布筛选需要的 nodeId / name / type 外，还回传 description 与 attributes ——
 * 否则前端刷新后拿不到这两个字段，卡片只能显示「列表接口未返回描述」，
 * 用户会以为自己的编辑没保存（实际已入库）。
 */
@Data
@AllArgsConstructor
public class PropertyListItemDto {

    private String nodeId;
    private String name;
    private String type;
    private String description;
    private Map<String, Object> attributes;
}