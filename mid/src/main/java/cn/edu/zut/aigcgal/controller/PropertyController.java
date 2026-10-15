package cn.edu.zut.aigcgal.controller;

import cn.edu.zut.aigcgal.DTO.PropertyCreateRequest;
import cn.edu.zut.aigcgal.DTO.PropertyListItemDto;
import cn.edu.zut.aigcgal.R.R;
import cn.edu.zut.aigcgal.dao.node.PropertyNode;
import cn.edu.zut.aigcgal.service.PropertyService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 1. 属性配置域 (Properties)
 * 管理基础资源元素（角色、世界观规则、实体对象）。
 */
@RestController
@RequestMapping("/api/v1")
public class PropertyController {

    private final PropertyService propertyService;

    public PropertyController(PropertyService propertyService) {
        this.propertyService = propertyService;
    }

    /** 1.1 添加图谱资源节点 */
    @PostMapping("/properties")
    public R<Map<String, String>> create(@RequestBody PropertyCreateRequest request) {
        PropertyNode node = propertyService.create(request);
        return R.success(Map.of("nodeId", node.getNodeId(), "status", "CREATED"));
    }

    /** 1.2 查询资源列表（type 可选，不传则返回全部节点） */
    @GetMapping("/properties")
    public R<List<PropertyListItemDto>> list(@RequestParam(required = false) String type) {
        List<PropertyListItemDto> data = propertyService.list(type).stream()
                .map(node -> new PropertyListItemDto(
                        node.getNodeId(), node.getName(), node.getType()))
                .toList();
        return R.success(data);
    }
}