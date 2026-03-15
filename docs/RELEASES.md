# YT-DLP Studio Releases

中文 | [English](#english)

## 下载入口

- [GitHub Releases 页面](https://github.com/Yifo98/YT-DLP-Studio/releases)
- [最新版本下载](https://github.com/Yifo98/YT-DLP-Studio/releases/latest)

## 当前推荐资产

- `YT-DLP-Studio-win-x64.zip`
  说明：Windows 推荐下载，解压后运行 `YT-DLP Studio.exe`
- macOS 资产
  说明：可发布 `dmg` / `zip`，未内置工具时建议同时注明依赖系统环境

## 1.0.1 更新摘要

- macOS 支持升级为真正的“解压即用”，应用内已内置 `yt-dlp`、`ffmpeg`、`ffprobe`、`deno`
- 新增 Windows 便携版与 zip 分享包，支持在其他 Windows 电脑上解压或双击即用
- 打包流程会剔除 cookies、用户配置和字幕整理 API 配置，避免把本机敏感信息带进分享包
- 本地媒体工具台新增字幕整理能力，支持 OpenAI-compatible 接口、模型拉取、连接测试、批量清洗和停止任务
- 桌面控制台与媒体工具台补齐环境刷新、批量进度、链接去重/清空、4K 画质上限和界面排版优化
- 新增根目录单一启动器，移除 `daily-use` 里的重复启动脚本

## 推荐发布文案

### 中文模板

```text
YT-DLP Studio vX.Y.Z

- Windows 压缩包：解压即用
- macOS：支持从系统环境读取 yt-dlp / ffmpeg / ffprobe / deno

默认情况下不需要额外安装 ffmpeg、ffprobe、yt-dlp 或 Conda。
如果某个资产明确标注为 Lite、tools not bundled 或 UI-only，请按说明先准备对应环境。

Windows 首次运行时，可能会看到系统安全提示。
点击“更多信息”后选择“仍要运行”即可继续启动。
```

## 环境兜底说明

默认目标是开盖即用，不要求用户先手动部署 Conda、`ffmpeg`、`ffprobe` 或 `yt-dlp`。

只有在某个发布包明确标注以下情况时，才需要补环境：

- `Lite`
- `tools not bundled`
- `UI-only`

这时可以补一句：

> 如果当前发布资产未内置 `yt-dlp`、`ffmpeg` 或 `ffprobe`，建议先使用 Conda 创建环境并安装对应工具后再运行。

## Windows 首次运行提示

当前 Windows 版本还没有代码签名，因此在其他电脑上第一次运行时，可能会触发 SmartScreen 的安全提示。

给用户的推荐说法：

> 如果首次启动看到“Windows 已保护你的电脑”，点击“更多信息”后选择“仍要运行”即可。

## 资产命名建议

- `YT-DLP-Studio-win-x64.zip`
- `YT-DLP-Studio-win-portable.exe`
- `YT-DLP-Studio-macos.zip`
- `YT-DLP-Studio-macos.dmg`
- `YT-DLP-Studio-macos.pkg`

## English

## Download Links

- [GitHub Releases page](https://github.com/Yifo98/YT-DLP-Studio/releases)
- [Latest release](https://github.com/Yifo98/YT-DLP-Studio/releases/latest)

## Recommended Asset

- `YT-DLP-Studio-win-x64.zip`
  Notes: recommended Windows build, unzip and run `YT-DLP Studio.exe`
- macOS assets
  Notes: `dmg` / `zip` builds are supported; mention system-tool fallback when tools are not bundled

## Recommended Release Copy

### English Template

```text
YT-DLP Studio vX.Y.Z

- Windows zip: unzip and use
- macOS: can use yt-dlp / ffmpeg / ffprobe / deno from the system environment

No extra setup is required by default.
If an asset is labeled Lite, tools-not-bundled, or UI-only, please install the required tools first.

Windows may show a first-run security prompt on unsigned builds.
Click "More info" and then "Run anyway" to continue.
```

## Dependency Fallback

The default expectation is plug-and-play. Users should not need to install Conda, `ffmpeg`, `ffprobe`, or `yt-dlp` for the standard release asset.

Only mention extra setup when an asset is explicitly labeled as:

- `Lite`
- `tools not bundled`
- `UI-only`

Suggested fallback note:

> If this release asset does not bundle `yt-dlp`, `ffmpeg`, or `ffprobe`, create a Conda environment and install the required tools before launching the app.

## Windows First-Run Note

The current Windows release is not code-signed yet, so SmartScreen may warn users on first launch on another PC.

Recommended wording:

> If Windows shows a security warning on first launch, click "More info" and then "Run anyway" to continue.
