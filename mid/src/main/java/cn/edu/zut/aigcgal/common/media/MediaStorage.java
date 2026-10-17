package cn.edu.zut.aigcgal.common.media;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * 媒体文件存储 —— Java 与 Python 读写的**同一份文件**所在处。
 *
 * 规矩（契约「服务地址与音频文件存储约定」）：
 *   Java 上传的 BGM、Python 生成的场景人声、导出混音成品，全部落在这个共享目录里；
 *   写出后拿到的是**相对路径**，交给 {@link MediaUrlResolver#url(String)} 拼成对外 URL。
 *
 * ⚠️ 本类签名已冻结：其余模块只允许 import 调用，不允许改行为。
 */
@Component
public class MediaStorage {

    private final String configuredRoot;

    public MediaStorage(@Value("${media.root:}") String configuredRoot) {
        this.configuredRoot = configuredRoot;
    }

    /**
     * 共享媒体根目录（绝对路径）。
     * 未配置时直接抛错，而不是"默默写到某个临时目录"—— 那会让 Java 与 Python 各写一份文件。
     */
    public Path root() {
        if (configuredRoot == null || configuredRoot.isBlank()) {
            throw new IllegalStateException("media.root 未配置：Java 与 Python 必须读写同一个共享媒体目录");
        }
        return Paths.get(configuredRoot).toAbsolutePath().normalize();
    }

    /**
     * 相对路径 → 共享目录下的绝对路径。
     * 目标必须仍在共享目录内，防止 `../` 之类把文件写到目录外。
     */
    public Path resolve(String relativePath) {
        String relative = normalizeRelative(relativePath);
        Path root = root();
        Path target = root.resolve(relative).normalize();

        if (!target.startsWith(root)) {
            throw new IllegalArgumentException("媒体路径越界（不允许写出共享目录）: " + relativePath);
        }
        return target;
    }

    /**
     * 把内容写进共享目录，返回**相对路径**（可直接交给 MediaUrlResolver 拼 URL）。
     * 同名文件会被直接覆盖 —— BGM 重新上传就走这条路。
     *
     * @param relativePath 如 bgm/global.mp3
     */
    public String write(String relativePath, byte[] content) {
        String relative = normalizeRelative(relativePath);
        Path target = resolve(relative);

        try {
            Files.createDirectories(target.getParent());
            Files.write(target, content);
        } catch (IOException e) {
            throw new IllegalStateException("媒体文件写入失败: " + target, e);
        }

        return relative;
    }

    /**
     * 统一成 URL 风格：去掉开头斜杠、反斜杠换正斜杠 ——
     * Windows 上直接用 `\` 拼 URL 会得到浏览器打不开的地址。
     */
    private static String normalizeRelative(String relativePath) {
        if (relativePath == null || relativePath.isBlank()) {
            throw new IllegalArgumentException("媒体相对路径不能为空");
        }

        String relative = relativePath.trim().replace('\\', '/');
        while (relative.startsWith("/")) {
            relative = relative.substring(1);
        }
        if (relative.isEmpty()) {
            throw new IllegalArgumentException("媒体相对路径不能为空");
        }
        return relative;
    }
}