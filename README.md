# YT-DLP Studio

![YT-DLP Studio icon](public/brand-icon.svg)

中文 | [English](#english)

YT-DLP Studio 是一个面向日常使用的桌面工具，把 `yt-dlp`、下载管理、cookies 选择和本地媒体后处理整理到一个更容易上手的界面里。

## 快速下载

- [前往 GitHub Releases 下载](https://github.com/Yifo98/YT-DLP-Studio/releases/latest)
- Windows 用户：优先下载 Win 压缩包或便携包
- macOS 用户：后续版本会持续完善 Mac 压缩包、`.dmg` 或 `.pkg` 安装包支持

开盖即用为默认目标。

只有当某个发布包明确写着“未内置工具”或“Lite”时，才需要额外准备 `ffmpeg`、`ffprobe`、`yt-dlp`，这种情况建议用 Conda 创建环境后再运行。

## 适合谁

- 想直接下载公开视频、课程视频、音频内容的人
- 需要导入 cookies 处理登录态或会员内容的人
- 想把下载和本地后处理分开管理的人

## 主要功能

- 桌面控制台：链接下载、格式选择、任务进度
- 媒体工具台：音轨分离、字幕轨导出、流信息查看
- Cookies 选择：支持导入本地 `cookies.txt` 文件

## Cookies 建议

如果目标网站需要登录态或会员权限，推荐先在浏览器里导出 `cookies.txt` 再放进项目的 `cookies/` 目录。

推荐浏览器扩展：

- [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)

## 发布说明

更详细的 Win / Mac 下载说明、包类型说明和依赖兜底方案，请看：

- [发布说明 / Release Notes Guide](docs/RELEASES.md)

## English

YT-DLP Studio is a desktop control room for `yt-dlp` that makes downloads, cookie selection, and local media post-processing easier to use from one interface.

## Download

- [Download from GitHub Releases](https://github.com/Yifo98/YT-DLP-Studio/releases/latest)
- Windows users: prefer the Windows zip or portable package
- macOS support will be improved in upcoming releases, including macOS zip, `.dmg`, and `.pkg` packaging

The default goal is plug-and-play.

Only use Conda or install `ffmpeg` / `ffprobe` / `yt-dlp` manually if a release asset is explicitly marked as not bundling those tools, or if it is labeled as a lightweight build.

## Best For

- People who want a cleaner desktop UI for video or audio downloads
- Users who need cookies for member-only or signed-in content
- Workflows that separate downloading from local media processing

## Highlights

- Desktop control room for link-based downloads and job tracking
- Media tools window for audio extraction, subtitle export, and stream inspection
- Local `cookies.txt` selection for protected content

## Cookies Recommendation

For sites that require a signed-in or member session, export `cookies.txt` from your browser first and place it into the local `cookies/` directory.

Recommended browser extension:

- [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)

## Release Guide

For package types, release wording, and dependency fallback notes, see:

- [Release Notes Guide](docs/RELEASES.md)
