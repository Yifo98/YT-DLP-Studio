# YT-DLP Studio 1.0.1

## 中文说明

本次发布主要刷新了桌面分享包，重点补强了下载流程、实时进度和运行态面板。

## 包含内容

- `YT-DLP Studio-1.0.1-arm64-mac.zip`
- `YT-DLP Studio-1.0.1-win.zip`
- `YT-DLP Studio 1.0.1.exe`
- `README-mac.txt`

## 主要更新

- 修复实时下载进度，让进行中的任务不再直接跳到 100%
- 重做下载面板布局，让高频操作按钮更容易够到
- 将实时信息拆成更清晰的队列总览和当前任务聚焦区域
- 标准分享包继续内置 `yt-dlp` `ffmpeg` `ffprobe` 和 `deno`
- 优化运行时刷新、cookies 指引与本地媒体工具整合体验

## 打包与隐私

- 分享包目标仍然是解压即用
- 打包脚本会在构建前自动清理旧平台产物
- 打包脚本会校验压缩包中不包含 cookies 历史记录 本地会话 字幕清理配置 API Key 等隐私文件
- 目前 macOS 与 Windows 版本都还是未签名状态，首次运行可能会看到系统安全提示

## English

## Summary

This release refreshes the shared desktop package with the latest download flow, real-time progress, and telemetry improvements.

## Included artifacts

- `YT-DLP Studio-1.0.1-arm64-mac.zip`
- `YT-DLP Studio-1.0.1-win.zip`
- `YT-DLP Studio 1.0.1.exe`
- `README-mac.txt`

## Highlights

- Fixed real-time download progress so active jobs no longer jump straight to 100 percent
- Reworked the download panel so the primary actions are easier to reach
- Split telemetry into clearer queue overview and active download focus sections
- Kept bundled `yt-dlp`, `ffmpeg`, `ffprobe`, and `deno` inside the standard shared builds
- Refined runtime refresh, cookies guidance, and local media tool integration

## Packaging and privacy

- Shared builds are intended to be unpack-and-run
- Packaging scripts now clear old platform artifacts before building new ones
- Packaging scripts verify that cookies, history, local session files, subtitle cleanup configs, API keys, and similar private files are not included in release archives
- macOS and Windows builds are currently unsigned, so first-run security prompts are expected
