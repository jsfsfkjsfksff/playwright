package cn.edu.zut.aigcgal.controller;

import cn.edu.zut.aigcgal.DTO.StepRequest;
import cn.edu.zut.aigcgal.DTO.TrellisGraphDto;
import cn.edu.zut.aigcgal.DTO.WorldlineEdgeDto;
import cn.edu.zut.aigcgal.DTO.WorldlineNodeDto;
import cn.edu.zut.aigcgal.R.R;
import cn.edu.zut.aigcgal.R.ResultCodeEnum;
import cn.edu.zut.aigcgal.dao.node.Scene;
import cn.edu.zut.aigcgal.map.SceneRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
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
           sceneRepository.saveAll(scenes);
           return R.success();
        }
        @PostMapping("/plan/interpolate")
        public R<?> interpolateNodes(@RequestBody StepRequest request){
            Scene startScene = sceneRepository.findBySceneId(request.getStartSceneId());
            Scene endScene = sceneRepository.findBySceneId(request.getMustBeSceneId());
            if (startScene == null || endScene == null) {;
                return R.error(ResultCodeEnum.NOT_FOUND, "起点或终点场景不存在");
            }
            if (request.getIsStatic()) {
                startScene.addChoice(endScene, "静态场景收束", "NONE");
                sceneRepository.save(startScene);
                return R.success(startScene.getId());
            }

            // 1. 把最脏最累的算力任务，直接全部抛给 Python 端的 HTN 引擎
            List<WorldlineNodeDto> worldline = pythonClient.post()
                    .uri("/api/ai/generate-worldline")
                    .body(Map.of(
                            "startText", startScene.getText(),
                            "endText", endScene.getText(),
                            "outline", request.getOutline(),
                            "layers", request.getLayer()
//                            "maxActions", request.getMaxActions()
                    ))
                    .retrieve()
                    .body(new ParameterizedTypeReference<List<WorldlineNodeDto>>() {}); // 【关键修改】// 期望 Python 返回一个排好序的完整世界线数组

            // 2. 拿到 Python 算好的完整世界线，开始在 Java 里“串糖葫芦”
            Scene pointer = startScene; // 游标，初始指向起点

            for (WorldlineNodeDto nodeDto : worldline) {
                Scene newScene = new Scene();
                newScene.setSceneId("SCENE_WL_" + UUID.randomUUID().toString().substring(0, 5));
                newScene.setText(nodeDto.getText());
                newScene.setSpeaker(nodeDto.getSpeaker());
                newScene.setAudioUrl(nodeDto.getAudioUrl());

                // 将游标指向的节点，连接到新节点，并将游标前移
                pointer.addChoice(newScene, nodeDto.getAction(), "NONE");
                pointer = newScene;
            }

            // 3. 糖葫芦串完，将最后一个节点强行收束到终点锚点
            pointer.addChoice(endScene, "世界线收束", "NONE");

            // 4. 一键落盘，完美且连贯的单线拓扑入库
            sceneRepository.save(startScene);

            return R.success(startScene.getId()); // 返回起点节点，前端可以从这里开始遍历整个世界线
        }
        @RequestMapping("/plan/multinterpolate")
        public R<?> multiInterpolateNodes(@RequestBody List<StepRequest> request) {
            request.forEach(stepRequest -> {
                Scene startScene = sceneRepository.findBySceneId(stepRequest.getStartSceneId());
                Scene endScene = sceneRepository.findBySceneId(stepRequest.getMustBeSceneId());
                if (startScene == null || endScene == null) {
                    throw new RuntimeException("起点或终点场景不存在");
                }
                if (stepRequest.getIsStatic()) {
                    startScene.addChoice(endScene, "静态场景收束", "NONE");
                    sceneRepository.save(startScene);
                } else {
                    // 调用 Python 微服务进行多段插值
                    List<WorldlineNodeDto> worldline = pythonClient.post()
                            .uri("/api/ai/generate-worldline")
                            .body(Map.of(
                                    "startText", startScene.getText(),
                                    "endText", endScene.getText(),
                                    "outline", stepRequest.getOutline(),
                                    "layers", stepRequest.getLayer()
                            ))
                            .retrieve()
                            .body(new ParameterizedTypeReference<List<WorldlineNodeDto>>() {});

                    Scene pointer = startScene;
                    for (WorldlineNodeDto nodeDto : worldline) {
                        Scene newScene = new Scene();
                        newScene.setSceneId("SCENE_WL_" + UUID.randomUUID().toString().substring(0, 5));
                        newScene.setText(nodeDto.getText());
                        newScene.setSpeaker(nodeDto.getSpeaker());
                        newScene.setAudioUrl(nodeDto.getAudioUrl());

                        pointer.addChoice(newScene, nodeDto.getAction(), "NONE");
                        pointer = newScene;
                    }
                    pointer.addChoice(endScene, "世界线收束", "NONE");
                    sceneRepository.save(startScene);
                }
            });
            return R.success("多段插值功能");
        }

        @PostMapping("/plan/interpolate-dag")
        public R<?> interpolateNodesNew(@RequestBody StepRequest request) {
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

        // 1. 呼叫 Python 端的 HTN + DP 引擎（解开 maxActions 注释！）
        TrellisGraphDto trellis = pythonClient.post()
                .uri("/api/ai/generate-worldline")
                .body(Map.of(
                        "startText", startScene.getText(),
                        "endText", endScene.getText(),
                        "outline", request.getOutline(),
                        "layers", request.getLayer(),
                        "maxActions", request.getMaxActions() != null ? request.getMaxActions() : 2
                ))
                .retrieve()
                .body(TrellisGraphDto.class);

        if (trellis == null || trellis.getEdges() == null || trellis.getEdges().isEmpty()) {
            return R.error(ResultCodeEnum.INTERNAL_ERROR);
        }

        // 2. 先摆棋子：建立全局节点注册表，将虚拟占位符 "START" 和 "END" 指向真实的数据库锚点
        Map<String, Scene> sceneRegistry = new HashMap<>();
        sceneRegistry.put("START", startScene);
        sceneRegistry.put("END", endScene);

        for (WorldlineNodeDto nodeDto : trellis.getNodes()) {
            Scene newScene = new Scene();
            newScene.setSceneId(nodeDto.getSceneId());
            newScene.setText(nodeDto.getText());
            newScene.setSpeaker(nodeDto.getSpeaker());
            newScene.setAudioUrl(nodeDto.getAudioUrl());
            sceneRegistry.put(nodeDto.getSceneId(), newScene);
        }

        // 3. 再连红线：按照 DP 剪枝后的最优边集合，在内存中完成多对多网格缝合
        for (WorldlineEdgeDto edgeDto : trellis.getEdges()) {
            Scene fromNode = sceneRegistry.get(edgeDto.getFromSceneId());
            Scene toNode = sceneRegistry.get(edgeDto.getToSceneId());

            if (fromNode != null && toNode != null) {
                String cond = edgeDto.getCondition() != null ? edgeDto.getCondition() : "NONE";
                fromNode.addChoice(toNode, edgeDto.getAction(), cond);
            }
        }

        // 4. 一键级联落盘，整张有向无环剧情网 (DAG) 直接写入 Neo4j
        sceneRepository.save(startScene);

        return R.success(startScene.getId());
    }

    @PostMapping("/plan/interpolate-dag-multi")
    public R<?> interpolateNodesMulti(@RequestBody StepRequest request) {
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
                // 【核心关键】：提前把数据库里已有的 KEY_i 放进注册表，后面直接复用它连线！
                sceneRegistry.put(keyId, keyScene);

                Map<String, String> mNode = new HashMap<>();
                mNode.put("sceneId", keyScene.getSceneId());
                mNode.put("text", keyScene.getText() != null ? keyScene.getText() : "");
                mNode.put("speaker", keyScene.getSpeaker() != null ? keyScene.getSpeaker() : "旁白");
                mNode.put("goal", keyScene.getText() != null ? keyScene.getText() : "");
                mandatoryNodesPayload.add(mNode);
            }
        }

        // 2. 组装防空指针的请求体（彻底告别 Map.of 的 NullPointerException）
        Map<String, Object> payload = new HashMap<>();
        payload.put("startText", startScene.getText() != null ? startScene.getText() : "故事开始");
        payload.put("endText", endScene.getText() != null ? endScene.getText() : "故事结束");
        payload.put("outline", request.getOutline() != null ? request.getOutline() : "自然推进剧情");
        payload.put("layers", request.getLayer() != null && request.getLayer() > 0 ? request.getLayer() : 1);
        payload.put("maxActions", request.getMaxActions() != null && request.getMaxActions() > 0 ? request.getMaxActions() : 2);
        payload.put("mandatoryNodes", mandatoryNodesPayload); // 把必经节点序列发给 Python

        // 3. 呼叫 Python 端的多锚点 HTN + 状态空间 DP 引擎
        TrellisGraphDto trellis = pythonClient.post()
                .uri("/api/ai/generate-worldline")
                .body(payload)
                .retrieve()
                .body(TrellisGraphDto.class);

        if (trellis == null || trellis.getEdges() == null || trellis.getEdges().isEmpty()) {
            return R.error(ResultCodeEnum.INTERNAL_ERROR);
        }

        // 4. 实例化 AI 新生成的过渡节点（跳过已存在于 sceneRegistry 中的 KEY_i 锚点！）
        if (trellis.getNodes() != null) {
            for (WorldlineNodeDto nodeDto : trellis.getNodes()) {
                // 如果这个节点是 KEY_1/KEY_2，它已经在步骤 1 被放进 sceneRegistry 了，绝不重复 new！
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

        // 5. 再连红线：按照 DP 剪枝后的最优边集合，把 START -> 过渡层 -> KEY_1 -> 过渡层 -> END 缝合起来
        for (WorldlineEdgeDto edgeDto : trellis.getEdges()) {
            Scene fromNode = sceneRegistry.get(edgeDto.getFromSceneId());
            Scene toNode = sceneRegistry.get(edgeDto.getToSceneId());

            if (fromNode != null && toNode != null) {
                String cond = edgeDto.getCondition() != null ? edgeDto.getCondition() : "NONE";
                fromNode.addChoice(toNode, edgeDto.getAction(), cond);
            }
        }

        // 6. 一键级联落盘，整张多阶段有向无环图 (Multi-Segment DAG) 直接写入 Neo4j
        sceneRepository.save(startScene);

        return R.success(startScene.getId());
    }
        @RequestMapping("/plan/graph")
    public void test(@RequestBody StepRequest request) {
            Scene startScene = sceneRepository.findBySceneId(request.getStartSceneId());
            System.out.println(startScene.getText());

        }
}