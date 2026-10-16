package cn.edu.zut.aigcgal.controller;


import cn.edu.zut.aigcgal.DTO.AIResponseDto;
import cn.edu.zut.aigcgal.DTO.StepRequest;
import cn.edu.zut.aigcgal.dao.node.Scene;
import cn.edu.zut.aigcgal.map.SceneRepository;
import cn.edu.zut.aigcgal.service.AIService;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/engine")
public class EngineController  {

    final
    AIService aiService;
    final
    SceneRepository sceneRepository;

    public EngineController(AIService aiService, SceneRepository sceneRepository) {
        this.aiService = aiService;
        this.sceneRepository = sceneRepository;
    }

    @RequestMapping("/plan/anchor")
    public String firstTwo() {
        Scene Startscene = new Scene();
        Startscene.setSceneId("SCENE_START");
        Startscene.setText("夏日祭的夜晚，你在神社后山迷路了。前方出现了两条岔路。");
        Scene mustBeScene = new Scene();
        mustBeScene.setSceneId("SCENE_MUST_BE");
        mustBeScene.setText("你遇到了一只戴着狐狸面具的神秘少女。");
        sceneRepository.save(Startscene);
        sceneRepository.save(mustBeScene);
        return "Test scene graph created successfully!";
    }

    //

    @RequestMapping("/generate")
    public Scene generate(@RequestBody StepRequest stepRequest) {
        //get from request
        String startSceneId = stepRequest.getStartSceneId();
        String MustBeSceneId = stepRequest.getMustBeSceneId();
        Scene startScene = sceneRepository.findBySceneId(startSceneId);
        Scene MustBeScene = sceneRepository.findBySceneId(MustBeSceneId);
        Boolean isStatic = stepRequest.getIsStatic();
        String outline = stepRequest.getOutline();
        Integer layer = stepRequest.getLayer();
        Integer maxActions1 = stepRequest.getMaxActions();
        //ai api
        List<AIResponseDto> generated = aiService.insertText(startScene.getText(), MustBeScene.getText(), outline, layer, maxActions1);
        for(AIResponseDto dto : generated){
            Scene midScene = new Scene();
            midScene.setText(dto.getSceneText());
            midScene.setSceneId("SCENE_" + System.currentTimeMillis());
            midScene.setSpeaker("AI");
            //save to Neo4j
            startScene.addChoice(midScene, dto.getAction(), "无需条件");
            midScene.addChoice(MustBeScene, "继续", "无需条件");
        }
        sceneRepository.save(startScene);
        return startScene;
    }
}