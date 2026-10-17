package cn.edu.zut.aigcgal.controller;

import cn.edu.zut.aigcgal.DTO.StepRequest;
import cn.edu.zut.aigcgal.DTO.TrellisGraphDto;
import cn.edu.zut.aigcgal.DTO.WorldlineEdgeDto;
import cn.edu.zut.aigcgal.DTO.WorldlineNodeDto;
import cn.edu.zut.aigcgal.R.R;
import cn.edu.zut.aigcgal.R.ResultCodeEnum;
import cn.edu.zut.aigcgal.dao.node.PropertyNode;
import cn.edu.zut.aigcgal.dao.node.Scene;
import cn.edu.zut.aigcgal.map.PropertyRepository;
import cn.edu.zut.aigcgal.map.SceneRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.*;

@RestController
    @RequestMapping("/api/v1")
    public class PEngineController {

        @Autowired
        private SceneRepository sceneRepository;
        @Autowired
        private PropertyRepository propertyRepository;

        // 初始化一个专门呼叫 Python 微服务的 Http 客户端
        private final RestClient pythonClient = createPythonClient();

        private static RestClient createPythonClient() {
          SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
          factory.setConnectTimeout(Duration.ofSeconds(10)); // 连接超时 10 秒
          factory.setReadTimeout(Duration.ofSeconds(180));   // 【关键】：等待 Python 算题超时设为 180 秒！

          return RestClient.builder()
                .baseUrl("http://localhost:8000") // 你的 Python 地址
                .requestFactory(factory)
                .build();
        }

        @RequestMapping("/plan/anchors")
        public R<?> firstTwo(@RequestBody List<Scene> scenes) {
           // 同一 sceneId 只允许保留一个节点：
           // 过滤掉库里已存在的 sceneId，以及本批次内重复的 sceneId，避免重复落点。
           Set<String> seenSceneIds = new HashSet<>();
           List<Scene> newScenes = new ArrayList<>();
           for (Scene scene : scenes) {
               String sceneId = scene.getSceneId();
               if (seenSceneIds.contains(sceneId) || sceneRepository.findBySceneId(sceneId) != null) {
                   continue;
               }
               seenSceneIds.add(sceneId);
               newScenes.add(scene);
           }
           sceneRepository.saveAll(newScenes);
           return R.success();
        }

    @PostMapping("/plan/interpolate")
    public R<?> interpolateNodesNewMulti(@RequestBody StepRequest request) {
        Scene startScene = sceneRepository.findBySceneId(request.getStartSceneId());
        Scene endScene = sceneRepository.findBySceneId(request.getMustBeSceneId());
        if (startScene == null || endScene == null) {
            return R.error(ResultCodeEnum.NOT_FOUND, "起点或终点场景不存在");
        }
        if (Boolean.TRUE.equals(request.getIsStatic())) {
            startScene.addChoice(endScene, "静态场景收束", "NONE");
            sceneRepository.save(startScene);
            return R.success(startScene.getId());
        }

        // 1. 先摆好固定铁锚：建立全局节点注册表，把起点、终点和所有必经节点 (KEY_i) 提前装入内存
        Map<String, Scene> sceneRegistry = new HashMap<>();
        sceneRegistry.put("START", startScene);
        sceneRegistry.put("END", endScene);

        List<Map<String, String>> mandatoryNodesPayload = new ArrayList<>();
        if (request.getMandatorySceneIds() != null && !request.getMandatorySceneIds().isEmpty()) {
            for (String keyId : request.getMandatorySceneIds()) {
                Scene keyScene = sceneRepository.findBySceneId(keyId);
                if (keyScene == null) {
                    return R.error(ResultCodeEnum.NOT_FOUND, "必经节点不存在: " + keyId);
                }
                sceneRegistry.put(keyId, keyScene);

                Map<String, String> mNode = new HashMap<>();
                mNode.put("sceneId", keyScene.getSceneId());
                mNode.put("text", keyScene.getText() != null ? keyScene.getText() : "");
                mNode.put("speaker", keyScene.getSpeaker() != null ? keyScene.getSpeaker() : "旁白");
                mNode.put("goal", keyScene.getText() != null ? keyScene.getText() : "");
                mandatoryNodesPayload.add(mNode);
            }
        }

        // 2. 读取 Neo4j 中的所有 properties，并使用 unwrapNeo4jAttributes 剥掉驱动层包装壳，防止序列化报错
        // 在 PEngineController.java 的 interpolateNodesNew 方法中组装 properties 与 relations：
        List<Map<String, Object>> propertiesPayload = new ArrayList<>();
        List<Map<String, String>> relationsPayload = new ArrayList<>();

        for (PropertyNode prop : propertyRepository.findAll()) {
            Map<String, Object> cleanAttrs = unwrapNeo4jAttributes(prop.getAttributes());

            // 如果你在 POST /properties 中存了显式的 RELATION 类型节点：
            // 例如 {"type": "RELATION", "name": "HOLDS", "attributes": {"subject": "alice", "object": "储物柜钥匙"}}
            if ("RELATION".equalsIgnoreCase(prop.getType())) {
                Map<String, String> relMap = new HashMap<>();
                relMap.put("type", prop.getName()); // 如 "HOLDS", "ENEMY_OF"
                relMap.put("subject", String.valueOf(cleanAttrs.getOrDefault("subject", "")));
                relMap.put("object", String.valueOf(cleanAttrs.getOrDefault("object", "")));
                relationsPayload.add(relMap);
            } else {
                Map<String, Object> pMap = new HashMap<>();
                pMap.put("type", prop.getType());
                pMap.put("name", prop.getName());
                pMap.put("description", prop.getDescription() != null ? prop.getDescription() : "");
                //嵌套
                pMap.put("attributes", cleanAttrs);
                propertiesPayload.add(pMap);
            }
        }

        // 3. 组装发往 Python 的最终 payload
        Map<String, Object> payload = new HashMap<>();
        payload.put("startText", startScene.getText() != null ? startScene.getText() : "故事开始");
        payload.put("endText", endScene.getText() != null ? endScene.getText() : "故事结束");
        payload.put("outline", request.getOutline() != null ? request.getOutline() : "自然推进剧情");
        payload.put("layers", request.getLayer() != null && request.getLayer() > 0 ? request.getLayer() : 1);
        payload.put("maxActions", request.getMaxActions() != null && request.getMaxActions() > 0 ? request.getMaxActions() : 2);
        payload.put("mandatoryNodes", mandatoryNodesPayload);
        payload.put("properties", propertiesPayload);
        payload.put("relations", relationsPayload);
        // 4. 呼叫 Python 端的多锚点 HTN + 状态空间 DP 引擎
        TrellisGraphDto trellis = pythonClient.post()
                .uri("/api/ai/generate-worldline")
                .body(payload)
                .retrieve()
                .body(TrellisGraphDto.class);

        if (trellis == null || trellis.getEdges() == null || trellis.getEdges().isEmpty()) {
            return R.error(ResultCodeEnum.INTERNAL_ERROR);
        }

        // 5. 实例化 AI 新生成的过渡节点
        if (trellis.getNodes() != null) {
            for (WorldlineNodeDto nodeDto : trellis.getNodes()) {
                if (!sceneRegistry.containsKey(nodeDto.getSceneId())) {
                    Scene newScene = new Scene();
                    newScene.setSceneId(nodeDto.getSceneId());
                    newScene.setText(nodeDto.getText());
                    newScene.setSpeaker(nodeDto.getSpeaker());
                    newScene.setAudioUrl(nodeDto.getAudioUrl());
                    sceneRegistry.put(nodeDto.getSceneId(), newScene);
                }
            }
        }

        // 6. 缝合网格边并落盘
        for (WorldlineEdgeDto edgeDto : trellis.getEdges()) {
            Scene fromNode = sceneRegistry.get(edgeDto.getFromSceneId());
            Scene toNode = sceneRegistry.get(edgeDto.getToSceneId());

            if (fromNode != null && toNode != null) {
                String cond = edgeDto.getCondition() != null ? edgeDto.getCondition() : "NONE";
                fromNode.addChoice(toNode, edgeDto.getAction(), cond);
            }
        }

        sceneRepository.save(startScene);
        return R.success(startScene.getId());
    }

    /** 删除剧情场景节点（sceneId 命中则删除该节点及其 TRANSITION_TO 边） */
    @DeleteMapping("/scenes/{sceneId}")
    public R<?> deleteScene(@PathVariable String sceneId) {
        Scene scene = sceneRepository.findBySceneId(sceneId);
        if (scene == null) {
            return R.error(ResultCodeEnum.NOT_FOUND, "场景不存在: " + sceneId);
        }
        sceneRepository.delete(scene);
        return R.success();
    }

    /**
     * 核心净化方法：剥离 Neo4j 驱动底层的 Value 包装类（如 BooleanValue），杜绝 BOOLEAN is not iterable 异常
     */
    private Map<String, Object> unwrapNeo4jAttributes(Map<String, Object> rawAttrs) {
        Map<String, Object> cleanMap = new HashMap<>();
        if (rawAttrs == null) return cleanMap;

        for (Map.Entry<String, Object> entry : rawAttrs.entrySet()) {
            Object val = entry.getValue();
            if (val instanceof org.neo4j.driver.Value neo4jVal) {
                cleanMap.put(entry.getKey(), neo4jVal.asObject());
            } else {
                cleanMap.put(entry.getKey(), val);
            }
        }
        return cleanMap;
    }

}