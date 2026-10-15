package cn.edu.zut.aigcgal;

import cn.edu.zut.aigcgal.map.SceneRepository;
import cn.edu.zut.aigcgal.dao.node.Scene;
import cn.edu.zut.aigcgal.service.AIService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class AigcGalApplicationTests {

    @Test
    void contextLoads() {
    }

    @Autowired
    private SceneRepository sceneRepository;

    @Autowired
    private AIService aiService;
    void testCreateSceneGraph() {
        // 1. 创作者编写：初始场景
        Scene sceneA = new Scene();
        sceneA.setSceneId("SCENE_START");
        sceneA.setText("夏日祭的夜晚，你在神社后山迷路了。前方出现了两条岔路。");

        // 2. 创作者编写：分支场景
        Scene sceneB = new Scene();
        sceneB.setSceneId("SCENE_LEFT");
        sceneB.setText("你向左走，遇到了一只戴着狐狸面具的神秘少女。");

        // 3. 核心机制：把选项变成连线！
        sceneA.addChoice(sceneB, "向左走", "无需条件");

        // 4. 一键入库（Spring 会自动帮你把 SceneA、SceneB 和那条线一起存进去）
        sceneRepository.save(sceneA);

        System.out.println("图谱生成完毕！快去 Neo4j Desktop 看看吧！");
    }
    @Test
    void fromToWorkflow(){
        //create initial scene
        Scene scene1 = new Scene();
        scene1.setSceneId("SCENE_START");
        scene1.setText("夏日祭的夜晚，你在神社后山迷路了。前方出现了两条岔路。");
        String playerAction = "向左走";
        //generate next scene text using AIService
        String nextText = aiService.generateText(scene1.getText(), playerAction);
        //create next scene
        Scene scene2 = new Scene();
        scene2.setSceneId("SCENE_LEFT");
        scene2.setText(nextText);
        //add choice to scene1
        scene1.addChoice(scene2, playerAction, "无需条件");
        //save both scenes
        sceneRepository.save(scene1);
        sceneRepository.save(scene2);

    }
}