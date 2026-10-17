package cn.edu.zut.aigcgal.service;

import cn.edu.zut.aigcgal.DTO.PropertyRequestDto;
import cn.edu.zut.aigcgal.dao.node.PropertyNode;
import cn.edu.zut.aigcgal.map.PropertyRepository;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Optional;

/**
 * 属性配置域业务逻辑：资源节点的创建与查询。
 */
@Service
public class PropertyService {

    private final PropertyRepository propertyRepository;

    public PropertyService(PropertyRepository propertyRepository) {
        this.propertyRepository = propertyRepository;
    }

    /**
     * 注册新的资源节点，nodeId 按 PROP_1001 起递增分配。
     */
    //dto只能在controller层使用，service层使用实体类
    public PropertyNode create(PropertyNode node) {
        return propertyRepository.save(node);
    }

    public Optional<PropertyNode> selectByName(String name) {
        return propertyRepository.findByName(name);
    }

    /**
     * 全量查询，type 为空时返回宇宙中所有节点。
     */
    public List<PropertyNode> list(String type) {
        if (type == null || type.isBlank()) {
            return propertyRepository.findAll();
        }
        return propertyRepository.findByType(type);
    }

    /**
     * 按业务主键 nodeId 删除资源节点；返回 false 表示目标不存在。
     */
    public boolean deleteByNodeId(String nodeId) {
        PropertyNode node = propertyRepository.findByNodeId(nodeId);
        if (node == null) {
            return false;
        }
        propertyRepository.delete(node);
        return true;
    }

    private String nextNodeId() {
        long seq = propertyRepository.count() + 1001;
        String nodeId = "PROP_" + seq;
        // 节点被删除后 count 会回退，这里保证业务主键始终唯一
        while (propertyRepository.findByNodeId(nodeId) != null) {
            seq++;
            nodeId = "PROP_" + seq;
        }
        return nodeId;
    }
}