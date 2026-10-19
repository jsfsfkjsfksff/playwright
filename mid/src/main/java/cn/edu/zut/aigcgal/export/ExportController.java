package cn.edu.zut.aigcgal.export;

import cn.edu.zut.aigcgal.R.BusinessCodeEnum;
import cn.edu.zut.aigcgal.R.R;
import cn.edu.zut.aigcgal.export.dto.ExportSegmentRequest;
import cn.edu.zut.aigcgal.export.service.ExportException;
import cn.edu.zut.aigcgal.export.service.ExportService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 导出域：把用户框选的一条世界线路径拼成一个可播放的音频文件。
 */
@RestController
@RequestMapping("/api/v1")
public class ExportController {

    private final ExportService exportService;

    public ExportController(ExportService exportService) {
        this.exportService = exportService;
    }

    @PostMapping("/plan/export-segment")
    public R<?> exportSegment(@RequestBody ExportSegmentRequest request) {
        List<String> sceneIds = request.getSceneIds();
        if (sceneIds == null || sceneIds.isEmpty()) {
            return R.conflict(BusinessCodeEnum.AUDIO_SEGMENT_EMPTY, "请先选择要导出的场景");
        }

        try {
            return R.success(exportService.export(sceneIds));
        } catch (ExportException e) {
            if (e.getBusinessCode() != null) {
                return R.conflict(e.getBusinessCode(), e.getMessage());
            }
            return R.error(e.getCode(), e.getMessage());
        }
    }
}
