# YT-DLP Studio Releases

中文 | [English](#english)

## 下载入口

- [GitHub Releases 页面](https://github.com/Yifo98/YT-DLP-Studio/releases)
- [最新版本下载](https://github.com/Yifo98/YT-DLP-Studio/releases/latest)

## 推荐文案

你可以在 GitHub Releases 页面里使用下面这类表述：

### Windows

- Windows 压缩包：下载后解压即可使用
- Windows 便携包：下载后直接运行，无需安装

### macOS

- macOS 支持仍在持续完善中
- 后续版本会补齐 macOS 压缩包、`.dmg` 和 `.pkg` 安装包说明

## 依赖说明

默认目标是开盖即用，不要求用户自己部署 Conda、ffmpeg 或 yt-dlp。

只有在某个发布包明确写着以下情况时，才需要补环境：

- 未内置工具
- Lite 版本
- 仅界面包

这时候可以补一句：

> 如果当前发布包未内置 `yt-dlp`、`ffmpeg` 或 `ffprobe`，建议先用 Conda 创建环境并安装对应工具后再运行。

## 推荐发布模板

### 中文模板

```
YT-DLP Studio vX.Y.Z

- Windows 压缩包：解压即用
- Windows 便携包：下载即用
- macOS 压缩包：解压后使用
- macOS 安装包：按安装向导完成安装

默认情况下不需要额外部署 ffmpeg、ffprobe、yt-dlp 或 conda。
如果某个包标注为 Lite / 未内置工具，请按说明先准备对应环境。
```

### 发布页资产命名建议

- `YT-DLP-Studio-win-x64.zip`
- `YT-DLP-Studio-win-portable.exe`
- `YT-DLP-Studio-macos-universal.zip`
- `YT-DLP-Studio-macos.dmg`
- `YT-DLP-Studio-macos.pkg`

## English

## Download Links

- [GitHub Releases page](https://github.com/Yifo98/YT-DLP-Studio/releases)
- [Latest release](https://github.com/Yifo98/YT-DLP-Studio/releases/latest)

## Recommended Wording

Use release copy like this on the GitHub Releases page:

### Windows

- Windows zip: download and unzip to use
- Windows portable package: download and run, no installation required

### macOS

- macOS support is still in progress
- Upcoming releases will add clearer guidance for macOS zip, `.dmg`, and `.pkg` packages

## Dependency Note

The default expectation is plug-and-play. Users should not need to install Conda, `ffmpeg`, or `yt-dlp` by default.

Only mention extra setup when an asset is explicitly labeled as:

- tools not bundled
- Lite build
- UI-only build

Suggested fallback note:

> If this release asset does not bundle `yt-dlp`, `ffmpeg`, or `ffprobe`, create a Conda environment and install the required tools before launching the app.

## Recommended Release Template

### English Template

```text
YT-DLP Studio vX.Y.Z

- Windows zip: unzip and use
- Windows portable package: download and run
- macOS zip: unzip and use
- macOS installer: install and launch

No extra setup is required by default.
If an asset is labeled Lite or tools-not-bundled, please install the required tools first.
```
