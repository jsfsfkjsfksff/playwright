package cn.edu.zut.aigcgal.DTO;

import lombok.Data;

import java.util.List;

@Data
public class StepRequest {
    private String startSceneId;
    private String MustBeSceneId;
    //isStatic表示是否是静态场景，如果是静态场景，则不需要生成新的场景，直接使用MustBeSceneId指定的场景即可
    private Boolean isStatic;
    private String outline;
    private Integer layer;
    private Integer maxActions;

    // 【新增】：有序的必经节点 sceneId 列表，例如 ["KEY_1", "KEY_2", "KEY_3"]
    private List<String> mandatorySceneIds;
}