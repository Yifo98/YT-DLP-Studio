# YT-DLP Studio

![YT-DLP Studio icon](public/brand-icon.svg)

中文 | [English](#english)

YT-DLP Studio 是一个给 `yt-dlp` 准备的桌面控制台，把链接下载、`cookies.txt` 选择和本地媒体后处理整理到同一个界面里。

## 下载

- [前往 GitHub Releases 下载](https://github.com/Yifo98/YT-DLP-Studio/releases/latest)
- Windows：优先下载 `YT-DLP-Studio-win-x64.zip`
- macOS：当前已支持通过系统环境运行，发布包会继续完善

默认目标是开盖即用。

只有当某个发布包明确标注为 `Lite`、`tools not bundled` 或 `UI-only` 时，才需要额外准备 `yt-dlp`、`ffmpeg`、`ffprobe`。macOS 下可以优先用 Homebrew，或者使用 Conda 创建环境后再运行。

## macOS 使用说明

macOS 版本现在支持两种方式找工具：

1. 应用包内自带 `tools/`
2. 系统环境里已安装的 `yt-dlp`、`ffmpeg`、`ffprobe`、`deno`

如果你准备先在本机直接运行开发版或 UI-only 版本，推荐先安装：

```bash
brew install yt-dlp ffmpeg deno
```

如果你更习惯 Conda，也可以把这些工具放进同一个环境里，应用会自动尝试从该环境的 `bin/` 目录读取。

## 功能概览

- 桌面控制台：批量链接下载、格式选择、实时进度
- 媒体工具台：音轨分离、字幕导出、流信息查看
- Cookies 管理：导入本地 `cookies.txt` 处理登录态或会员内容

## Cookies 推荐

如果目标站点需要登录态或会员权限，推荐先在浏览器导出 `cookies.txt` 再放进本地 `cookies/` 目录。

推荐浏览器扩展：

- [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)

## Windows 首次运行提示

当前 Windows 发布包还没有做代码签名，第一次在其他电脑上运行时，可能会看到 SmartScreen 的“Windows 已保护你的电脑”提示。

这时候点击：

1. `更多信息`
2. `仍要运行`

就可以继续启动。

后续会继续完善签名和发布体验。

## 发布说明

更详细的 Win / Mac 发布文案、下载资产命名和环境兜底说明，请看：

- [发布说明 / Release Guide](docs/RELEASES.md)

## English

YT-DLP Studio is a desktop control room for `yt-dlp`, combining downloads, `cookies.txt` selection, and local media post-processing in one interface.

## Download

- [Download from GitHub Releases](https://github.com/Yifo98/YT-DLP-Studio/releases/latest)
- Windows: prefer `YT-DLP-Studio-win-x64.zip`
- macOS can already run against tools available in the system environment, and bundled assets will keep improving

The default goal is plug-and-play.

Only install `yt-dlp`, `ffmpeg`, and `ffprobe` manually when a release asset is explicitly labeled as `Lite`, `tools not bundled`, or `UI-only`. On macOS, Homebrew is the quickest path. Conda remains a good fallback.

## macOS Notes

The app now looks for tools in either:

1. A bundled `tools/` directory
2. Your system environment, including Homebrew and Conda locations

For local development or a UI-only build on macOS, the recommended setup is:

```bash
brew install yt-dlp ffmpeg deno
```

## Highlights

- Desktop control room for link-based downloads and job tracking
- Media tools window for audio extraction, subtitle export, and stream inspection
- Local `cookies.txt` support for signed-in or member-only content

## Cookies Recommendation

If a target site requires a signed-in or member session, export `cookies.txt` from your browser and place it into the local `cookies/` directory first.

Recommended browser extension:

- [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)

## Windows First-Run Note

The current Windows builds are not code-signed yet, so SmartScreen may show a warning the first time the app is launched on another PC.

If that happens, click:

1. `More info`
2. `Run anyway`

The app should then start normally.

## Release Guide

For release wording, asset naming, and dependency fallback notes, see:

- [Release Guide](docs/RELEASES.md)
