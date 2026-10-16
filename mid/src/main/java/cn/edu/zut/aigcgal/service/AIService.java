package cn.edu.zut.aigcgal.service;

import cn.edu.zut.aigcgal.DTO.AIResponseDto;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.Map;

@Service
public class AIService {
    @Value("${ai.api.url}")
    private String apiUrl;
    @Value("${ai.api.key}")
    private String apiKey;
    @Value("${ai.api.model}")
    private String model;

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    public AIService() {
        this.restClient = RestClient.create();
        this.objectMapper = new ObjectMapper();
    }

    public List<AIResponseDto> insertText(String startText, String endText, String outline, Integer layer, Integer playerAction) {

//        String prompt = String.format(
//                "你是一个Galgame剧本引擎。当前场景：【%s】。玩家做出的行动是：【%s】。请只输出下一步发生的剧情文本，不要任何多余的解释或格式。",
//                currentSceneText, playerAction
//        );
//        String prompt = String.format(
//                "你是一个Galgame剧本逻辑架构师。当前有两个孤立的场景：\n" +
//                        "【起点场景】：%s\n" +
//                        "【终点场景】：%s\n" +
//                        "创作者给出的过渡大纲约束是：【%s】\n" +
//                        "请生成【唯一一个】中间过渡场景的具体台词或描述，要求能完美承接起点，并合理导向终点。直接输出剧本内容，不要任何废话。",
//                startText, endText, outline
//        );
        String prompt = String.format(
                "当前起点：【%s】。终点：【%s】。\n" +
                        "大纲约束：【%s】\n" +
                        "请根据当前起点，推演出最多%d 个不同的玩家行动(action)，并生成对应的中间场景。\n" +
                        "【强制要求】必须严格以以下 JSON 格式输出，不要返回任何多余文字：\n" +
                        "[\n" +
                        "  {\"action\": \"玩家的动作1\", \"sceneText\": \"该动作导致的场景描述...\"},\n" +
                        "  {\"action\": \"玩家的动作2\", \"sceneText\": \"...\"}\n" +
                        "]",
                startText, endText, outline, playerAction
        );

        Map<String, Object> requestBody = Map.of(
                "model", model,
                "messages", List.of( // 1. 键名必须为复数 messages
                        Map.of(      // 2. 内部必须是一个 Map，不能直接放裸字符串
                                "role", "user",
                                "content", prompt
                        )
                ),
                "temperature", 0.7
        );

        try {
            // 3. 发射请求并获取响应字符串
            String rawResponse = restClient.post()
                    .uri(apiUrl)
                    .header("Authorization", "Bearer " + apiKey) // 【关键：因 HTTP 鉴权规范，必须补全 Bearer 前缀】
                    .header("Content-Type", "application/json")
                    .body(requestBody)
                    .retrieve()
                    .body(String.class);

            // 4. 解析嵌套的 JSON 树
//            JsonNode rootNode = objectMapper.readTree(rawResponse);
            String aiText = objectMapper.readTree(rawResponse).path("choices").get(0).path("message").path("content").asText();
            int startIndex = aiText.indexOf('[');
            int endIndex = aiText.lastIndexOf(']');
            if (startIndex != -1 && endIndex != -1) {
                aiText = aiText.substring(startIndex, endIndex + 1);
            }
            return objectMapper.readValue(aiText, new TypeReference<List<AIResponseDto>>() {});
//            return rootNode.path("choices").get(0).path("message").path("content").asText();

        } catch (Exception e) {
            throw new RuntimeException("大模型 API 调用链路断裂：" + e.getMessage());
        }
    }
    public String generateText(String currentSceneText, String playerAction) {
        String prompt = String.format(
                "你是一个Galgame剧本引擎。当前场景：【%s】。玩家做出的行动是：【%s】。请只输出下一步发生的剧情文本，不要任何多余的解释或格式。",
                currentSceneText, playerAction
        );

        Map<String, Object> requestBody = Map.of(
                "model", model,
                "messages", List.of(
                        Map.of(
                                "role", "user",
                                "content", prompt
                        )
                ),
                "temperature", 0.7
        );

        try {
            String rawResponse = restClient.post()
                    .uri(apiUrl)
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    .body(requestBody)
                    .retrieve()
                    .body(String.class);

            JsonNode rootNode = objectMapper.readTree(rawResponse);
            return rootNode.path("choices").get(0).path("message").path("content").asText();

        } catch (Exception e) {
            throw new RuntimeException("大模型 API 调用链路断裂：" + e.getMessage());
        }
    }
}