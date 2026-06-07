# Media Dock 2.0.11

## 中文说明

本次发布主要刷新了桌面分享包，重点补强了本地媒体合并、主界面交互、自动更新和隐私打包边界。

## 包含内容

- `Media Dock-2.0.11-arm64-mac.zip`
- `Media Dock-2.0.11-win.zip`
- `Launch Media Dock.bat` Windows ZIP 根目录启动脚本
- `README-windows.txt`
- `Launch Media Dock.command` macOS ZIP 根目录启动脚本
- `README-mac.txt`
- `extensions/media-dock-cookie-exporter` MediaCookies 浏览器插件

## 主要更新

- 内置 MediaCookies 浏览器插件，可导出并导入 Media Dock 可读取的站点 Cookie ZIP
- MediaCookies 预览逻辑改为先扫描浏览器 Cookie，再按 yt-dlp 官方 supported sites 自动生成可导出来源
- MediaCookies 默认只导出匹配 yt-dlp 官方支持站点的 Cookie，同时提供“全部 Cookie”高级模式
- MediaCookies 支持预览后再执行全选 常用 清空，最后按当前选择导出 ZIP
- MediaCookies 内置常用默认改为更稳的 B 站和 YouTube；抖音/TikTok 仍可手动选择，但不会默认加入常用
- MediaCookies 支持把当前选择保存为常用配置，并可导入/导出只包含来源 ID 的 JSON 配置文件
- MediaCookies 切换默认/全部 Cookie 模式时会复用当前预览内存，不再要求重复点击预览；导出 ZIP 后会清除预览缓存
- MediaCookies 全部 Cookie 模式会压缩显示大量域名提示，避免整屏刷错误说明
- MediaCookies 新增“导出日志”，可生成不含 Cookie 值的预览诊断文本，方便跨 Windows / macOS 排查
- 多来源批量下载会按每条链接自动匹配 Cookie；若手动 Cookie 与链接来源不匹配，会自动回退到按链接匹配，避免 YouTube 被套用 B 站 Cookie
- 清空链接会同步清除手动 Cookie 选择，避免下一轮任务沿用旧来源 Cookie
- 抖音 `modal_id` 弹窗入口会自动转换为 `/video/{id}` 单条视频链接后再交给 yt-dlp
- TikTok `/foryou` 推荐流链接会提前提示复制具体视频页或分享短链，避免误判成 Cookie 问题
- 下载面板新增抖音/TikTok 链接检查，粘贴后会提前提示具体视频页、可转换入口或不适合下载的推荐流入口
- 抖音返回 fresh cookies 时会提示先在同一浏览器打开目标视频并完成验证，再重新导出 Cookie
- 修复多并发下载完成后不会自动补位启动后续任务的问题
- 下载任务显示改为“进行中 / 已完成 / 异常”三段切换，减少并发任务混在一起的问题
- 当前下载卡片增加任务编号，方便和上方 1 2 3 4 5 任务格对应
- 任务日志弹窗标题、复制按钮和导出按钮会显示“任务一/任务二”等具体任务号
- 任务日志导出文件名和文本头部会写明任务序号、状态、进度、退出码、链接和命令
- 任务日志弹窗增加一键复制和导出文本按钮，日志文件可直接用于排查
- 主日志区域增加导出文本按钮，方便保存完整运行日志
- 任务日志复制改为主进程直接写入系统剪贴板，避免不同系统换行读回导致误判失败
- 修复当前下载卡片里的任务编号文字对比度不足的问题
- 100% 但仍在合并/校验的任务会显示后处理状态，不再误导成已完成
- B 站 SSL/TLS 中断提示会说明可能留下有画面没声音的半成品文件
- B 站课程权限错误会提示检查购买状态、会员权限和具体 ep 链接
- 本地音视频合并增加扫描 配对 开始合并 完成合并日志，MOV 转码进度也能更及时显示
- 修复媒体工具嵌入主窗口后媒体处理事件仍发往旧独立窗口，导致 MOV 输出已完成但主界面无日志和进度的问题
- 本地音视频合并进度条会按当前配对数显示进度，而不是只有空转动画
- 默认对播放列表链接追加 `--no-playlist` 和 `--playlist-items 1`，避免 YouTube / B 站课程系列入口展开整个列表
- 修复停止全部和媒体工具停止不可靠的问题，Windows 端会连同子进程一起终止
- 每个下载任务都可以单独打开日志窗口，错误任务更容易定位原因和退出码
- 优化媒体工具右侧工具环境布局，刷新环境按钮和路径明细不再挤在一起
- 媒体工具改为主窗口内部工作区，不再从主界面弹出额外窗口
- 新增本地音视频单个配对合并和批量文件夹自动配对合并
- 多文件合并优先按照媒体流类型和时长配对，不再依赖文件名相似度
- 修复 B 站 / IDM 分离文件中 `_2.m4s` 这类尾号文件无法稳定识别配对的问题
- 合并页选择待识别文件后会立即刷新流信息，直接显示音频流或视频流
- 合并输出支持自定义文件名，批量任务会自动追加 01 02 序号避免覆盖
- Cookie 选择会提示过期和临期状态，减少误选失效登录态
- 默认下载、cookies、缓存、更新包和 Deno 自动安装都保存在同级 `Media Dock Data` 目录
- 刷新 3 号图标为新的桌面应用图标
- 压缩主界面实时信息区域，让日志和最近任务更靠上
- 修复长路径在顶部卡片和启动自检区域溢出重叠的问题
- 增加启动自动检查更新，发现旧版本时可直接下载最新 ZIP
- 增加 Deno 缺失时的一键自动下载和同级目录安装
- Windows 端检测到 Bandizip 的 `bz.exe` 时，会优先用于 zip 解压；未安装时自动回退 PowerShell
- Windows ZIP 根目录内置 `Launch Media Dock.bat`，核心运行文件放在 `core` 目录
- macOS ZIP 根目录内置 `Launch Media Dock.command`，核心运行文件放在 `core` 目录
- 标准分享包继续内置 `yt-dlp` `ffmpeg` `ffprobe` 和 `deno`

## 打包与隐私

- 分享包目标仍然是解压即用
- 打包脚本会在构建前删除旧版本目录，只保留当前最新版本
- 打包脚本会校验压缩包中不包含 cookies 历史记录 本地会话 字幕清理配置 API Key 等隐私文件
- 目前 macOS 与 Windows 版本都还是未签名状态，首次运行可能会看到系统安全提示

## English

## Summary

This release refreshes the shared desktop package with local media merge support, smoother in-window navigation, update checks, and stricter privacy packaging boundaries.

## Included artifacts

- `Media Dock-2.0.11-arm64-mac.zip`
- `Media Dock-2.0.11-win.zip`
- `Launch Media Dock.bat` at the Windows zip root
- `README-windows.txt`
- `Launch Media Dock.command` at the macOS zip root
- `README-mac.txt`
- `extensions/media-dock-cookie-exporter` bundled MediaCookies browser extension

## Highlights

- Bundled the MediaCookies browser extension for exporting and importing Media Dock compatible cookie ZIPs
- MediaCookies now scans browser cookies first, then generates exportable sources from the official yt-dlp supported sites list
- MediaCookies defaults to cookies matching yt-dlp supported sites, with an explicit advanced all-cookie mode
- MediaCookies now supports preview first, then Select All, Common, Clear, and export ZIP from the current selection
- MediaCookies built-in Common now stays conservative with Bilibili and YouTube; Douyin/TikTok remain manually selectable but are not selected by Common unless saved by the user
- MediaCookies can save the current selection as a Common profile and import/export a source-ID-only JSON profile
- MediaCookies now reuses the in-memory preview when switching between supported-only and all-cookie modes, then clears the preview cache after exporting ZIP
- MediaCookies now compacts large all-cookie warnings so domain-level notices do not flood the popup
- MediaCookies now exports a diagnostics log without cookie values for Windows / macOS troubleshooting
- Mixed-source download batches now match cookies per URL; mismatched manual cookies fall back to per-URL auto matching so YouTube is not forced to use Bilibili cookies
- Clearing links now also clears manual cookie selection so the next queue does not inherit a stale site cookie
- Douyin `modal_id` modal links are converted to `/video/{id}` before being passed to yt-dlp
- TikTok `/foryou` feed links now show an early hint to copy a concrete video URL or share shortlink instead of treating it as a cookie failure
- The download panel now checks Douyin/TikTok URLs as soon as they are pasted, flagging direct video links, convertible entries, and unsupported feed pages early
- Douyin fresh-cookie errors now explain that the target video should be opened and verified in the same browser before exporting cookies again
- Fixed concurrent download queues so later jobs start automatically when one active slot finishes
- Split download tasks into Active / Done / Issues tabs
- Added task numbers to active download cards so they match the 1 2 3 4 5 task tiles
- Per-task log titles, copy buttons, and export buttons now include the concrete task number
- Exported per-task logs now include task index, status, progress, exit code, URL, and command metadata
- Added one-click copy and text export to the per-task log dialog
- Added text export for the main log panel
- Made task log copy write directly through the main process clipboard path, avoiding false failures from platform newline readback differences
- Fixed poor contrast for task number badges in active download cards
- Running tasks at 100% now show a post-processing state while merging or verification continues
- Bilibili SSL/TLS interruption hints now explain that video-only partial files may be left behind
- Bilibili course permission errors now point users to purchase/member access, refreshed cookies, and concrete ep links
- Added scan, pairing, merge-start, and merge-finished logs for local media merge jobs, with better MOV transcode log refresh
- Fixed Media Tools events still being sent only to the old separate media window, which could hide MOV progress/logs in the embedded workspace
- Local media merge progress now reflects the current pair count instead of only showing an indeterminate animation
- Added `--no-playlist` and `--playlist-items 1` by default so YouTube playlists and Bilibili course-series entries do not expand into full lists
- Made Stop All and Media Tool cancellation terminate child processes reliably, including process trees on Windows
- Added per-download task log dialogs with error output and exit codes
- Improved the Media Tools runtime layout so refresh controls and path details no longer crowd each other
- Moved Media Tools into an in-window workspace instead of opening an extra window from the main UI
- Added single-pair and batch-folder local audio/video merge workflows
- Multi-file merge now pairs by stream type and duration instead of filename similarity
- Fixed unstable pairing for Bilibili / IDM separated files such as `_2.m4s`
- Refresh stream inspection immediately after choosing a merge input so audio/video detection is visible
- Merge output supports a custom base name, with 01 02 suffixes added automatically for batch jobs
- Cookie selection now warns about expired and soon-to-expire files to reduce bad login-state choices
- Default downloads, cookies, cache, update zips, and auto-installed Deno stay in the sibling `Media Dock Data` folder
- Refreshed the desktop app icon with option 3
- Tightened the main telemetry rail so logs and recent jobs stay higher on screen
- Fixed long runtime paths overflowing the hero status cards and startup self-check area
- Added startup update checks and direct latest zip download support
- Added one-click local Deno download and sibling-folder install when Deno is missing
- Windows uses Bandizip `bz.exe` for zip extraction when detected, falling back to PowerShell when it is not installed
- Added `Launch Media Dock.bat` at the Windows zip root, with runtime files kept in `core`
- Added `Launch Media Dock.command` at the macOS zip root, with runtime files kept in `core`
- Added `README-mac.txt` inside the macOS zip with first-run guidance
- Kept bundled `yt-dlp`, `ffmpeg`, `ffprobe`, and `deno` inside the standard shared builds

## Packaging and privacy

- Shared builds are intended to be unpack-and-run
- Packaging scripts now delete old version folders before building, leaving only the latest version
- Packaging scripts verify that cookies, history, local session files, subtitle cleanup configs, API keys, and similar private files are not included in release archives
- macOS and Windows builds are currently unsigned, so first-run security prompts are expected
