# YT-DLP Studio 2.0.1

## 可直接复制的发布文案

```text
YT-DLP Studio 2.0.1

这是一次面向 Windows 分享包的稳定性修复更新，重点把便携版体验补完整。

更新内容：
- 修复 Windows 下载面板中文标题乱码，任务卡和实时信息会正常显示视频名称
- 修复 Windows 便携版 cookies 目录，改为程序目录下的 cookies 文件夹，方便直接管理和迁移
- 保持 macOS 与 Windows 分享包的解压即用体验，继续内置 yt-dlp、ffmpeg、ffprobe、deno

使用提示：
- macOS 首次打开未签名应用时，请右键选择“打开”
- Windows 首次运行如果看到 SmartScreen 提示，请点“更多信息”后选择“仍要运行”
```

## 更新内容拆分版

### Windows 热修复

- 修复下载标题在 Windows 控制台编码下显示乱码
- 修复便携版 cookies 路径落到 AppData，而不是程序目录的问题

### 发行与打包

- 保持 Windows zip、Windows 便携 exe、macOS arm64 zip 的统一发布形态
- 继续在打包时清理 cookies、用户数据和本地模型配置

### 桌面能力

- 保留实时进度、任务队列、环境刷新和媒体工具台能力
- 与 2.0.0 相比，本次更偏向稳定性和便携性修复

## 版本升级规则

- 小改动或修复 bug：升级 `patch`
- 功能增强但不改产品主形态：升级 `minor`
- 桌面架构、交互层级或打包形态发生明显代际变化：升级 `major`
