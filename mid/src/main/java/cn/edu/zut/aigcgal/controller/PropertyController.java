package cn.edu.zut.aigcgal.controller;

import cn.edu.zut.aigcgal.DTO.PropertyListItemDto;
import cn.edu.zut.aigcgal.DTO.PropertyRequestDto;
import cn.edu.zut.aigcgal.DTO.RelationTargetDto;
import cn.edu.zut.aigcgal.R.R;
import cn.edu.zut.aigcgal.R.ResultCodeEnum;
import cn.edu.zut.aigcgal.dao.node.PropertyNode;
import cn.edu.zut.aigcgal.service.PropertyService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
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
    public R<?> savePropertyWithRelations(@RequestBody PropertyRequestDto req) {
        if (req.getName() == null || req.getName().isBlank()) {
            return R.error(ResultCodeEnum.BAD_REQUEST, "节点名称 name 不能为空");
        }

        // (a) 先按名称查询主节点，存在则复用，不存在则新建（防止重复建点）
        PropertyNode mainNode = propertyService.selectByName(req.getName().trim())
                .orElseGet(PropertyNode::new);

        mainNode.setName(req.getName().trim());
        mainNode.setType(req.getType() != null ? req.getType().toUpperCase() : "CHARACTER");
        mainNode.setDescription(req.getDescription() != null ? req.getDescription() : "");
        if (req.getAttributes() != null) {
            mainNode.setAttributes(req.getAttributes());
        }

        // (b) 处理原生图关系：遍历 relations，自动查找或创建目标节点，并调用 addDynamicRelation
        if (req.getRelations() != null) {
            for (RelationTargetDto relDto : req.getRelations()) {
                if (relDto.getTargetName() == null || relDto.getType() == null) continue;
                String targetName = relDto.getTargetName().trim();

                // 查找目标节点，如果库里还没有（比如还没建“复古立麦”），自动创建一个实体节点！
                PropertyNode targetNode = propertyService.selectByName(targetName)
                        .orElseGet(() -> {
                            PropertyNode newTarget = new PropertyNode();
                            newTarget.setName(targetName);
                            newTarget.setType(relDto.getTargetType() != null ? relDto.getTargetType().toUpperCase() : "ITEM");
                            newTarget.setDescription("由关系自动创建的关联实体");
                            return propertyService.create(newTarget);
                        });

                // 挂入 Map<String, List<PropertyNode>>，生成原生 Neo4j 关系边！
                mainNode.addDynamicRelation(relDto.getType(), targetNode);
            }
        }

        PropertyNode saved = propertyService.create(mainNode);
        return R.success(Map.of(
                "nodeId", saved.getId(),
                "status", "SAVED_WITH_NATIVE_RELATIONS"
        ));
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

    /** 1.3 删除图谱资源节点（命中则删除该节点及其发出的图关系） */
    @DeleteMapping("/properties/{nodeId}")
    public R<?> delete(@PathVariable String nodeId) {
        if (!propertyService.deleteByNodeId(nodeId)) {
            return R.error(ResultCodeEnum.NOT_FOUND, "资源不存在，可能已被删除");
        }
        return R.success();
    }
}