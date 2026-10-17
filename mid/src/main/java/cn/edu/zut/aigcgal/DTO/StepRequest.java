package cn.edu.zut.aigcgal.DTO;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.util.List;

@Data
public class StepRequest {
    @JsonProperty("startSceneId")
    private String startSceneId;

    /**
     * 必须经过的场景 id。
     * 显式声明 JSON 键名为 mustBeSceneId：字段本身以大写 M 开头，
     * 不写注解时 Jackson 只能从 getMustBeSceneId 推导出 mustBeSceneId，
     * 前端很容易误传 MustBeSceneId 而静默拿到 null。
     */
    @JsonProperty("mustBeSceneId")
    private String MustBeSceneId;

    //isStatic表示是否是静态场景，如果是静态场景，则不需要生成新的场景，直接使用MustBeSceneId指定的场景即可
    @JsonProperty("isStatic")
    private Boolean isStatic;

    private String outline;
    private Integer layer;
    private Integer maxActions;

    // 【新增】：有序的必经节点 sceneId 列表，例如 ["KEY_1", "KEY_2", "KEY_3"]
    private List<String> mandatorySceneIds;
}