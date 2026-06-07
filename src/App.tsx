import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import MediaToolsView from './MediaToolsView'
import { appApi } from './services/appApi'
import { readJsonStorage, removeStorageItem, writeJsonStorage } from './services/localStore'
import { getThemeLabel, isTheme, THEME_OPTIONS, type Theme } from './themeOptions'

type Language = 'zh' | 'en'
type ActiveWorkspace = 'download' | 'media'
type JobView = 'active' | 'finished' | 'issues'
type DownloadConcurrency = 1 | 2 | 3
type ExtraPresetId =
  | 'noPlaylist'
  | 'embedMetadata'
  | 'writeSubs'
  | 'writeAutoSubs'
  | 'subtitleOnly'
  | 'splitAudioTrack'
  | 'embedThumbnail'
  | 'writeThumbnail'
  | 'writeDescription'
  | 'writeInfoJson'

type CookieTargetId =
  | 'bilibili'
  | 'youtube'
  | 'douyin'
  | 'tiktok'

type LinkInspectionSeverity = 'info' | 'warning' | 'error'

type LinkInspection = {
  url: string
  service: CookieTargetId | 'unknown'
  severity: LinkInspectionSeverity
  message: string
}

type HistoryItem = {
  id: string
  title: string
  urls: string[]
  mode: DownloadMode
  outputDir: string
  status: DownloadStatus
  outputPath?: string
  finishedAt: string
}

type ActiveQueueSnapshot = {
  mode: DownloadMode
  outputDir: string
}

type StoredPreferences = {
  outputDir: string
  mode: DownloadMode
  audioFormat: AudioFormat
  audioQuality: AudioQuality
  videoPreset: VideoPreset
  language: Language
  theme: Theme
  cookieFile: string
  enabledExtraPresets: ExtraPresetId[]
  concurrency: DownloadConcurrency
}

const STORAGE_KEY = 'yt-dlp-studio.preferences'
const HISTORY_KEY = 'yt-dlp-studio.history'
const YT_DLP_SUPPORTED_SITES_URL = 'https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md'

const DEFAULT_PREFS: StoredPreferences = {
  outputDir: '',
  mode: 'video',
  audioFormat: 'mp3',
  audioQuality: 'best',
  videoPreset: 'best',
  language: 'zh',
  theme: 'graphite',
  cookieFile: '',
  enabledExtraPresets: [],
  concurrency: 2,
}

const EXTRA_PRESETS: Record<Language, Record<ExtraPresetId, { label: string; desc: string; args: string[] }>> = {
  zh: {
    noPlaylist: { label: '只下当前视频', desc: '链接带播放列表时，只抓这一条。', args: ['--no-playlist'] },
    embedMetadata: { label: '写入元数据', desc: '把标题和作者写进文件。', args: ['--embed-metadata'] },
    writeSubs: { label: '字幕分离', desc: '把字幕单独下载成文件，适合后期整理。', args: ['--write-subs', '--sub-langs', 'all'] },
    writeAutoSubs: { label: '自动字幕', desc: '站点没有人工字幕时，尝试抓自动字幕。', args: ['--write-auto-subs', '--sub-langs', 'all'] },
    subtitleOnly: { label: '仅导出字幕', desc: '只拿字幕文件，不下载音视频本体。', args: ['--skip-download', '--write-subs', '--write-auto-subs', '--sub-langs', 'all'] },
    splitAudioTrack: { label: '音轨分离', desc: '保留视频的同时，额外导出一份 MP3 音频。', args: ['-k', '--extract-audio', '--audio-format', 'mp3', '--audio-quality', '0'] },
    embedThumbnail: { label: '嵌入封面', desc: '把封面写进媒体文件。', args: ['--embed-thumbnail'] },
    writeThumbnail: { label: '导出封面', desc: '把封面图片单独保存出来。', args: ['--write-thumbnail'] },
    writeDescription: { label: '导出简介', desc: '把视频简介或说明文字保存成文本。', args: ['--write-description'] },
    writeInfoJson: { label: '导出信息 JSON', desc: '把标题、作者、时长等详情导出成 JSON。', args: ['--write-info-json'] },
  },
  en: {
    noPlaylist: { label: 'Only current video', desc: 'Ignore playlist params and download only the current item.', args: ['--no-playlist'] },
    embedMetadata: { label: 'Embed metadata', desc: 'Write title and uploader info into the file.', args: ['--embed-metadata'] },
    writeSubs: { label: 'Subtitle split', desc: 'Download subtitle files separately for later use.', args: ['--write-subs', '--sub-langs', 'all'] },
    writeAutoSubs: { label: 'Auto subtitles', desc: 'Try auto-generated subtitles when manual ones are missing.', args: ['--write-auto-subs', '--sub-langs', 'all'] },
    subtitleOnly: { label: 'Subtitles only', desc: 'Export subtitle files without downloading the media itself.', args: ['--skip-download', '--write-subs', '--write-auto-subs', '--sub-langs', 'all'] },
    splitAudioTrack: { label: 'Split audio track', desc: 'Keep the video and export an extra MP3 audio copy.', args: ['-k', '--extract-audio', '--audio-format', 'mp3', '--audio-quality', '0'] },
    embedThumbnail: { label: 'Embed thumbnail', desc: 'Store the cover image in the file.', args: ['--embed-thumbnail'] },
    writeThumbnail: { label: 'Export thumbnail', desc: 'Save the cover image as a separate file.', args: ['--write-thumbnail'] },
    writeDescription: { label: 'Export description', desc: 'Save the video description or notes as text.', args: ['--write-description'] },
    writeInfoJson: { label: 'Export info JSON', desc: 'Save title, uploader, duration, and other metadata as JSON.', args: ['--write-info-json'] },
  },
}

const COOKIE_TARGETS: Array<{
  id: CookieTargetId
  zhName: string
  enName: string
  urlMarkers: string[]
  preferredMarkers: string[]
  relatedMarkers: string[]
}> = [
  {
    id: 'bilibili',
    zhName: 'B 站',
    enName: 'Bilibili',
    urlMarkers: ['bilibili.com', 'bilibili.cn', 'b23.tv', 'biligame.com'],
    preferredMarkers: ['by-service/bilibili-b-site.cookies.txt', 'bilibili-b-site.cookies.txt'],
    relatedMarkers: ['bilibili', 'biligame', 'b23.tv'],
  },
  {
    id: 'youtube',
    zhName: 'YouTube',
    enName: 'YouTube',
    urlMarkers: ['youtube.com', 'youtu.be', 'googlevideo.com'],
    preferredMarkers: ['by-service/youtube.cookies.txt', 'youtube.cookies.txt'],
    relatedMarkers: ['youtube.com', 'youtube', 'google.com'],
  },
  {
    id: 'douyin',
    zhName: '抖音',
    enName: 'Douyin',
    urlMarkers: ['douyin.com', 'iesdouyin.com'],
    preferredMarkers: ['by-service/douyin.cookies.txt', 'douyin.cookies.txt'],
    relatedMarkers: ['douyin.com', 'douyin', 'iesdouyin.com'],
  },
  {
    id: 'tiktok',
    zhName: 'TikTok',
    enName: 'TikTok',
    urlMarkers: ['tiktok.com', 'vm.tiktok.com'],
    preferredMarkers: ['by-service/tiktok.cookies.txt', 'tiktok.cookies.txt'],
    relatedMarkers: ['tiktok.com', 'tiktok'],
  },
]

function getText(language: Language) {
  return language === 'zh'
    ? {
        heroTitle: '媒体中枢。',
        heroCopy: '把链接采集、认证文件、合并和整理动作收进一个轻量工作台。',
        status: '状态',
        compatibility: '兼容性',
        refreshTools: '刷新环境',
        refreshingTools: '刷新中...',
        refreshedWithDeno: '环境已刷新，已检测到 Deno。',
        refreshedWithoutDeno: '环境已刷新，暂时还没检测到 Deno。',
        refreshFailed: '环境刷新失败。',
        checkUpdates: '检查更新',
        checkingUpdates: '检查中...',
        updateReady: '发现新版本',
        updateCurrent: '当前版本',
        updateLatest: '最新版本',
        updateNone: '当前已是最新版本。',
        updateUnknown: '还没有检查更新。',
        updateDownload: '下载更新',
        updateDownloading: '下载中...',
        updateDownloaded: '更新包已下载。',
        updateMissingAsset: '没有找到适合当前系统的更新包。',
        installDenoAuto: '自动安装 Deno',
        installingDeno: '安装中...',
        denoInstalled: 'Deno 已安装完成。',
        denoInstallAutoHint: '检测到 Deno 缺失时，可自动下载官方 Deno zip，并放入同级数据目录的 tools/bin。',
        workspace: '工作区',
        mediaTools: '媒体工具',
        engine: '核心工具',
        downloadCore: '下载核心',
        mediaCore: '媒体核心',
        mediaProbe: '媒体探测',
        authDir: '认证目录',
        loading: '加载中...',
        loadingPath: '正在读取核心工具路径...',
        basicMode: '基础模式',
        readyForYoutube: 'YouTube 已优化',
        denoReady: '已检测到 Deno，YouTube 解析更稳。',
        denoMissing: '未检测到 Deno，多数站点仍可用。',
        downloadPanel: '下载面板',
        downloadPanelHint: '一行一个链接，默认顺序下载。',
        urls: '链接列表',
        urlsPlaceholder: '每行一个链接',
        urlsHint: '支持一次粘贴多行链接，系统会自动拆成多条。',
        linkCheck: '链接检查',
        linkCheckHint: '抖音/TikTok 这类站点更依赖具体视频页；这里会提前提示明显不适合下载的入口。',
        addLink: '添加链接',
        clearLinks: '清空链接',
        outputFolder: '输出目录',
        browse: '选择目录',
        openCookiesDir: '打开 cookies 目录',
        openCookieExtension: '打开插件目录',
        importCookieZip: '导入 Cookie ZIP',
        importingCookieZip: '导入中...',
        cookieImportSuccess: '已导入 {count} 个 Cookie 文件。',
        cookieImportFailed: '导入 Cookie ZIP 失败。',
        mode: '下载模式',
        video: '视频',
        audio: '音频',
        sequentialHint: '按列表顺序排队；并发任务会同时处理前几条。',
        concurrency: '并发任务',
        concurrencyHint: '最多同时跑 3 个链接；站点风控敏感时可以降回 1。',
        videoPreset: '画质策略',
        videoPresetHint: '默认自动最佳；B 站 4K 取决于源片、登录态和账号权限。',
        best: '自动最佳',
        p2160: '最高 4K',
        p1080: '最高 1080p',
        p720: '最高 720p',
        p480: '最高 480p',
        audioFormat: '音频格式',
        audioQuality: '音频质量',
        audioQualityHint: '只在音频模式生效。',
        cookieFile: '认证文件',
        cookieAuto: '自动按链接匹配',
        cookieHint: '建议保持自动模式，软件会按每条链接匹配对应站点 Cookie；手动选择只适合同一来源批量任务。',
        cookieFallback: '插件安装好以后，在插件里预览并导出 Cookie ZIP，再回到这里点“导入 Cookie ZIP”。预览不会生成缓存文件。',
        supportedSitesLink: '查看 yt-dlp 官方支持站点',
        supportedSitesHint: '下载来源以 yt-dlp 官方 supported sites 为准；Cookie 推荐只保留当前更稳定的少数站点。官方支持不代表会员、验证码、加密或风控内容一定可下。',
        cookieAdvisor: 'Cookie 推荐',
        cookieAdvisorIdle: '粘贴链接后，这里会提示每个站点会自动使用哪些 Cookie。',
        cookieAdvisorUse: '使用推荐 Cookie',
        cookieAdvisorCurrent: '当前已选择推荐 Cookie。',
        cookieAdvisorNone: '这个链接暂时不需要专用 Cookie；遇到会员、登录态或 412/403 错误时，再选择目标站 Cookie。',
        cookieAdvisorDetected: '检测到 {service} 链接，自动模式会使用 {file}。这样可以排除其他不相关 Cookie。',
        cookieAdvisorMissing: '检测到 {service} 链接，但没有找到专用 Cookie。请用 MediaCookies 导出 ZIP 后在这里导入。',
        cookieAdvisorMismatch: '当前选择不像 {service} 专用 Cookie，可能会无效或带入过多无关登录态。',
        cookieMeta: '{count} 条 Cookie · {domains}',
        cookieExpiredWarning: '有 {count} 条 Cookie 已过期：{names}。登录态可能已失效，请重新导出 cookies.txt。',
        cookieExpiringSoonWarning: '有 {count} 条 Cookie 24 小时内将过期：{names}。',
        extraOptions: '下载附加项',
        extraOptionsHint: '可选。用于给链接下载追加字幕、封面、简介、仅当前视频等参数；不选就是默认下载。',
        extraOptionsSummary: '已启用参数',
        extraOptionsEmpty: '未启用附加项，下载会按默认参数执行。',
        advancedArgs: '高级附加参数',
        extraArgsPlaceholder: '例如：--restrict-filenames',
        rememberArgs: '记住高级附加参数',
        start: '开始',
        cancel: '停止全部',
        openFolder: '打开目录',
        telemetry: '实时信息',
        telemetryHint: '这里能看到总进度、单任务进度、速度和 ETA。',
        queueSummary: '任务总览',
        queueProgress: '队列进度',
        queueProgressHint: '总进度会把当前下载中的实时百分比也算进去，不再只看完成数。',
        taskList: '任务清单',
        taskListHint: '只显示待开始和正在下载的链接。',
        finishedTaskList: '已完成 / 异常',
        finishedTaskListHint: '完成、失败和取消的任务会移到这里。',
        taskListIdle: '粘贴链接后会生成任务格子。',
        taskTotal: '总数',
        liveDownload: '当前下载中',
        liveDownloadHint: '像 Claude 的状态面板一样，先盯住最关键的那条任务。',
        liveDownloadIdle: '还没有正在进行的下载任务。',
        waiting: '等待中',
        pending: '待开始',
        running: '进行中',
        done: '已完成',
        failed: '失败',
        cancelled: '已取消',
        activeJobs: '当前下载',
        activeJobsHint: '这里只保留正在下载的任务，完成后会移到下方。',
        finishedJobs: '已完成 / 异常',
        finishedJobsHint: '完成、失败或取消的任务可以在这里查看日志。',
        downloaded: '已下载',
        total: '总量',
        eta: '剩余',
        currentCommand: '当前命令',
        ffmpegPath: 'FFmpeg 路径',
        logs: '日志',
        logsHint: '保留最近 600 行输出。',
        noLogs: '还没有输出。',
        viewJobLog: '查看日志',
        copyLog: '复制日志',
        exportLog: '导出日志',
        exportedLog: '日志已导出：{path}',
        exportLogFailed: '导出日志失败。',
        copiedLog: '日志已复制。',
        copyLogFailed: '复制日志失败。',
        jobLogTitle: '任务日志',
        jobLogTitleForTask: '{task} · 日志',
        copyTaskLog: '复制日志',
        exportTaskLog: '导出日志',
        jobLogEmpty: '这个任务还没有单独日志。',
        cookieAutoFallback: '手动 Cookie 与部分链接不匹配，已改用按链接自动匹配。',
        activeJobView: '进行中',
        finishedJobView: '已完成',
        issueJobView: '异常',
        activeJobViewHint: '只保留待开始和正在下载的任务。',
        finishedJobViewHint: '下载完成的任务会移到这里。',
        issueJobViewHint: '失败、取消或需要重试的任务会放在这里。',
        taskNumber: '任务 {index}',
        postProcessing: '下载到 100%，正在合并或校验',
        postProcessingShort: '后处理',
        close: '关闭',
        recentJobs: '最近任务',
        recentJobsHint: '点卡片可回填链接和目录。',
        clearHistory: '清空记录',
        noHistory: '还没有历史任务。',
        audioExtract: '音频提取',
        videoDownload: '视频下载',
        language: '语言',
        theme: '背景',
        statusIdle: '待命',
        statusRunning: '运行中',
        statusDone: '完成',
        statusError: '错误',
        statusCancelled: '已取消',
        bootstrapError: 'window.appApi 不可用，preload 没有挂上。',
        startHint: '先粘贴至少一个链接吧。',
        queuePrepared: '已准备好 {count} 个下载链接。',
        currentCommandPlaceholder: '任务启动后，这里会显示最新命令。',
        openFile: '打开所在文件夹',
        copiedFromHistory: '已从历史记录回填。',
      }
    : {
        heroTitle: 'Media Hub.',
        heroCopy: 'A compact workspace for link capture, auth files, merges, and everyday media cleanup.',
        status: 'Status',
        compatibility: 'Compatibility',
        refreshTools: 'Refresh runtime',
        refreshingTools: 'Refreshing...',
        refreshedWithDeno: 'Runtime refreshed. Deno is now available.',
        refreshedWithoutDeno: 'Runtime refreshed. Deno is still missing.',
        refreshFailed: 'Failed to refresh runtime.',
        checkUpdates: 'Check updates',
        checkingUpdates: 'Checking...',
        updateReady: 'Update available',
        updateCurrent: 'Current version',
        updateLatest: 'Latest version',
        updateNone: 'You are on the latest version.',
        updateUnknown: 'Updates have not been checked yet.',
        updateDownload: 'Download update',
        updateDownloading: 'Downloading...',
        updateDownloaded: 'Update package downloaded.',
        updateMissingAsset: 'No update package matched this platform.',
        installDenoAuto: 'Install Deno automatically',
        installingDeno: 'Installing...',
        denoInstalled: 'Deno has been installed.',
        denoInstallAutoHint: 'When Deno is missing, download the official Deno zip and place it in the sibling data folder tools/bin.',
        workspace: 'Workspace',
        mediaTools: 'Media tools',
        engine: 'Core tools',
        downloadCore: 'Download core',
        mediaCore: 'Media core',
        mediaProbe: 'Media probe',
        authDir: 'Auth folder',
        loading: 'Loading...',
        loadingPath: 'Reading core tool path...',
        basicMode: 'Basic mode',
        readyForYoutube: 'Ready for YouTube',
        denoReady: 'Deno detected. YouTube support should be more stable.',
        denoMissing: 'Deno not found. Most sites still work.',
        downloadPanel: 'Download panel',
        downloadPanelHint: 'One URL per line. Downloads run sequentially by default.',
        urls: 'URL list',
        urlsPlaceholder: 'One URL per line',
        urlsHint: 'Paste multiple lines at once and they will be split into separate URLs.',
        linkCheck: 'Link check',
        linkCheckHint: 'Douyin/TikTok work best with direct video links. Obvious feed or landing-page links are flagged before download.',
        addLink: 'Add link',
        clearLinks: 'Clear links',
        outputFolder: 'Output folder',
        browse: 'Browse',
        openCookiesDir: 'Open cookies folder',
        openCookieExtension: 'Open extension folder',
        importCookieZip: 'Import cookie ZIP',
        importingCookieZip: 'Importing...',
        cookieImportSuccess: 'Imported {count} cookie file(s).',
        cookieImportFailed: 'Failed to import cookie ZIP.',
        mode: 'Mode',
        video: 'Video',
        audio: 'Audio',
        sequentialHint: 'Queued in list order; concurrent jobs start from the front of the list.',
        concurrency: 'Concurrent jobs',
        concurrencyHint: 'Run up to 3 links at once; lower this to 1 if a site throttles or flags requests.',
        videoPreset: 'Quality policy',
        videoPresetHint: 'Best available by default. Bilibili 4K still depends on the source, login state, and account permissions.',
        best: 'Best available',
        p2160: 'Up to 4K',
        p1080: 'Up to 1080p',
        p720: 'Up to 720p',
        p480: 'Up to 480p',
        audioFormat: 'Audio format',
        audioQuality: 'Audio quality',
        audioQualityHint: 'Only used in audio mode.',
        cookieFile: 'Auth file',
        cookieAuto: 'Auto match by URL',
        cookieHint: 'Auto mode is recommended. It matches a site cookie file for each URL; manual selection is best for same-site batches only.',
        cookieFallback: 'After installing the extension, preview and export a cookie ZIP there, then return here and click “Import cookie ZIP”. Preview does not create cache files.',
        supportedSitesLink: 'View yt-dlp supported sites',
        supportedSitesHint: 'Download source coverage follows the official yt-dlp supported sites list. Cookie suggestions only keep the currently steadier services; official extractor support does not guarantee member, captcha, encrypted, or risk-controlled content will download.',
        cookieAdvisor: 'Cookie suggestion',
        cookieAdvisorIdle: 'Paste links and this will show which cookie files auto mode will use.',
        cookieAdvisorUse: 'Use suggested cookie',
        cookieAdvisorCurrent: 'The suggested cookie file is selected.',
        cookieAdvisorNone: 'This link does not appear to need a dedicated cookie file. Use one when member access, login state, or 412/403 errors appear.',
        cookieAdvisorDetected: '{service} link detected. Auto mode will use {file}. This keeps unrelated cookies out.',
        cookieAdvisorMissing: '{service} link detected, but no dedicated cookie file was found. Export a ZIP with MediaCookies and import it here.',
        cookieAdvisorMismatch: 'The selected file does not look like a dedicated {service} cookie file.',
        cookieMeta: '{count} cookie(s) · {domains}',
        cookieExpiredWarning: '{count} cookie(s) already expired: {names}. The login session may be stale; export cookies.txt again.',
        cookieExpiringSoonWarning: '{count} cookie(s) expire within 24h: {names}.',
        extraOptions: 'Download add-ons',
        extraOptionsHint: 'Optional. Add subtitles, thumbnails, descriptions, current-video-only behavior, and similar link-download flags.',
        extraOptionsSummary: 'Enabled args',
        extraOptionsEmpty: 'No add-ons enabled. Downloads will use the default arguments.',
        advancedArgs: 'Advanced extra args',
        extraArgsPlaceholder: 'For example: --restrict-filenames',
        rememberArgs: 'Remember advanced extra args',
        start: 'Start',
        cancel: 'Stop all',
        openFolder: 'Open folder',
        telemetry: 'Telemetry',
        telemetryHint: 'See total progress, per-job progress, speed, and ETA.',
        queueSummary: 'Queue summary',
        queueProgress: 'Queue progress',
        queueProgressHint: 'Aggregate progress includes the live percent from the running job, not just completed items.',
        taskList: 'Task list',
        taskListHint: 'Only pending and active links stay here.',
        finishedTaskList: 'Finished / issues',
        finishedTaskListHint: 'Done, failed, and cancelled tasks move here.',
        taskListIdle: 'Paste links to create task tiles.',
        taskTotal: 'Total',
        liveDownload: 'Live download',
        liveDownloadHint: 'Keep the most important active job in focus, similar to Claude-style telemetry.',
        liveDownloadIdle: 'No active download job yet.',
        waiting: 'Waiting',
        pending: 'Pending',
        running: 'Running',
        done: 'Done',
        failed: 'Failed',
        cancelled: 'Cancelled',
        activeJobs: 'Active downloads',
        activeJobsHint: 'Only running tasks stay here. Finished tasks move below.',
        finishedJobs: 'Finished / issues',
        finishedJobsHint: 'Done, failed, or cancelled tasks stay here for log review.',
        downloaded: 'Downloaded',
        total: 'Total',
        eta: 'ETA',
        currentCommand: 'Current command',
        ffmpegPath: 'FFmpeg path',
        logs: 'Logs',
        logsHint: 'Keeps the latest 600 lines.',
        noLogs: 'No output yet.',
        viewJobLog: 'View log',
        copyLog: 'Copy log',
        exportLog: 'Export log',
        exportedLog: 'Log exported: {path}',
        exportLogFailed: 'Failed to export log.',
        copiedLog: 'Log copied.',
        copyLogFailed: 'Failed to copy log.',
        jobLogTitle: 'Job log',
        jobLogTitleForTask: '{task} · Log',
        copyTaskLog: 'Copy log',
        exportTaskLog: 'Export log',
        jobLogEmpty: 'No per-job log yet.',
        cookieAutoFallback: 'Manual cookie did not match every URL, so per-URL auto matching is being used.',
        activeJobView: 'Active',
        finishedJobView: 'Done',
        issueJobView: 'Issues',
        activeJobViewHint: 'Only pending and active jobs stay here.',
        finishedJobViewHint: 'Completed jobs move here.',
        issueJobViewHint: 'Failed, cancelled, or retry-needed jobs stay here.',
        taskNumber: 'Task {index}',
        postProcessing: 'Download reached 100%; merging or verifying',
        postProcessingShort: 'Post',
        close: 'Close',
        recentJobs: 'Recent jobs',
        recentJobsHint: 'Click a card to refill URLs and folder.',
        clearHistory: 'Clear history',
        noHistory: 'No history yet.',
        audioExtract: 'Audio extract',
        videoDownload: 'Video download',
        language: 'Language',
        theme: 'Theme',
        statusIdle: 'Idle',
        statusRunning: 'Running',
        statusDone: 'Done',
        statusError: 'Error',
        statusCancelled: 'Cancelled',
        bootstrapError: 'window.appApi is unavailable. Preload did not attach.',
        startHint: 'Paste at least one URL to begin.',
        queuePrepared: '{count} URL(s) queued and ready.',
        currentCommandPlaceholder: 'The latest command will appear here after a job starts.',
        openFile: 'Show in folder',
        copiedFromHistory: 'Refilled from history.',
      }
}

function normalizeConcurrency(value: unknown): DownloadConcurrency {
  const parsed = Number(value)
  return parsed === 1 || parsed === 2 || parsed === 3 ? parsed : DEFAULT_PREFS.concurrency
}

function readPreferences(): StoredPreferences {
  const parsed = readJsonStorage<Partial<StoredPreferences> & { concurrency?: number; extraArgs?: string; rememberExtraArgs?: boolean }>(STORAGE_KEY, {})
  const enabledExtraPresets = Array.isArray(parsed.enabledExtraPresets)
    ? parsed.enabledExtraPresets.filter(
        (value): value is ExtraPresetId =>
          [
            'noPlaylist',
            'embedMetadata',
            'writeSubs',
            'writeAutoSubs',
            'subtitleOnly',
            'splitAudioTrack',
            'embedThumbnail',
            'writeThumbnail',
            'writeDescription',
            'writeInfoJson',
          ].includes(String(value)),
      )
    : []
  const theme = isTheme(parsed.theme) ? parsed.theme : DEFAULT_PREFS.theme
  const concurrency = normalizeConcurrency(parsed.concurrency)
  return { ...DEFAULT_PREFS, ...parsed, theme, videoPreset: 'best', enabledExtraPresets, concurrency }
}

function readHistory(): HistoryItem[] {
  const parsed = readJsonStorage<Array<Partial<HistoryItem> & { url?: string }>>(HISTORY_KEY, [])
  const normalized: HistoryItem[] = []
  parsed.forEach((item, index) => {
    const urls = Array.isArray(item.urls)
      ? item.urls.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : typeof item.url === 'string' && item.url.trim().length > 0
        ? [item.url.trim()]
        : []
    if (urls.length === 0) return
    normalized.push({
      id: typeof item.id === 'string' && item.id.trim().length > 0 ? item.id : `history-${index}`,
      title: typeof item.title === 'string' && item.title.trim().length > 0 ? item.title.trim() : urls[0],
      urls,
      mode: item.mode === 'audio' ? 'audio' : 'video',
      outputDir: typeof item.outputDir === 'string' && item.outputDir.trim().length > 0 ? item.outputDir : DEFAULT_PREFS.outputDir,
      status: item.status === 'running' || item.status === 'success' || item.status === 'error' || item.status === 'cancelled' ? item.status : 'idle',
      outputPath: typeof item.outputPath === 'string' ? item.outputPath : undefined,
      finishedAt: typeof item.finishedAt === 'string' && item.finishedAt.trim().length > 0 ? item.finishedAt : new Date().toISOString(),
    })
  })
  return normalized
}

function statusLabel(status: DownloadStatus, text: ReturnType<typeof getText>) {
  if (status === 'running') return text.statusRunning
  if (status === 'success') return text.statusDone
  if (status === 'error') return text.statusError
  if (status === 'cancelled') return text.statusCancelled
  return text.statusIdle
}

function taskTileStatusLabel(status: DownloadStatus | 'pending', text: ReturnType<typeof getText>) {
  if (status === 'pending') return text.pending
  return statusLabel(status, text)
}

function getTaskTileText(tile: { status: DownloadStatus | 'pending'; percent: number | null }, text: ReturnType<typeof getText>) {
  if (tile.status === 'running' && tile.percent !== null && tile.percent >= 99.9) {
    return text.postProcessingShort
  }
  return tile.percent !== null && tile.status === 'running' ? `${tile.percent.toFixed(0)}%` : taskTileStatusLabel(tile.status, text)
}

function getJobProgressText(job: JobSnapshot, text: ReturnType<typeof getText>) {
  if (job.status === 'running' && job.percent !== null && job.percent >= 99.9 && !job.outputPath) {
    return text.postProcessing
  }
  return job.percent !== null ? `${job.percent.toFixed(1)}%` : text.waiting
}

function getCookieTargetName(target: (typeof COOKIE_TARGETS)[number], language: Language) {
  return language === 'zh' ? target.zhName : target.enName
}

function normalizeCookieText(value: string) {
  return value.replace(/\\/g, '/').toLowerCase()
}

function cookieSearchText(item: CookieFileInfo) {
  return `${item.label} ${item.path} ${item.domains.join(' ')}`.replace(/\\/g, '/').toLowerCase()
}

function detectCookieTargetForUrl(url: string) {
  const normalized = url.toLowerCase()
  if (!normalized) return null
  return COOKIE_TARGETS.find((target) => target.urlMarkers.some((marker) => normalized.includes(marker))) ?? null
}

function detectCookieTargetsForUrls(urls: string[]) {
  const targets = new Map<CookieTargetId, (typeof COOKIE_TARGETS)[number]>()
  urls.forEach((url) => {
    const target = detectCookieTargetForUrl(url)
    if (target) {
      targets.set(target.id, target)
    }
  })
  return [...targets.values()]
}

function inspectDownloadLink(url: string, language: Language): LinkInspection | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  const hostname = parsed.hostname.toLowerCase()
  const pathname = parsed.pathname.toLowerCase()
  const isDouyin = hostname === 'douyin.com' || hostname.endsWith('.douyin.com') || hostname === 'iesdouyin.com' || hostname.endsWith('.iesdouyin.com')
  const isTikTok = hostname === 'tiktok.com' || hostname.endsWith('.tiktok.com')

  if (isDouyin) {
    const modalId = parsed.searchParams.get('modal_id')?.trim()
    if (/^\/video\/\d+/.test(pathname)) {
      return {
        url,
        service: 'douyin',
        severity: 'info',
        message: language === 'zh'
          ? '抖音单条视频链接，可以继续。若提示 fresh cookies，请先在同一浏览器打开该视频并重新导出 Cookie。'
          : 'Douyin direct video link detected. If fresh cookies are requested, open this video in the same browser and export cookies again.',
      }
    }
    if (modalId && /^\d{10,}$/.test(modalId)) {
      return {
        url,
        service: 'douyin',
        severity: 'warning',
        message: language === 'zh'
          ? `抖音弹窗/精选入口会在启动时尝试转成 /video/${modalId}；如果仍失败，请打开作品页后复制具体视频链接。`
          : `Douyin modal link will be converted to /video/${modalId} before download. If it still fails, open the post page and copy the direct video URL.`,
      }
    }
    return {
      url,
      service: 'douyin',
      severity: 'warning',
      message: language === 'zh'
        ? '这个抖音链接看起来不是单条视频页。yt-dlp 官方主要支持 /video/数字ID，推荐先复制具体作品链接。'
        : 'This Douyin URL does not look like a direct video page. yt-dlp mainly supports /video/{id}; copy the exact post URL first.',
    }
  }

  if (isTikTok) {
    if (pathname.startsWith('/foryou')) {
      return {
        url,
        service: 'tiktok',
        severity: 'error',
        message: language === 'zh'
          ? 'TikTok /foryou 是推荐流入口，不是具体视频。请复制 @用户名/video/数字ID，或 vm.tiktok.com / vt.tiktok.com 分享短链。'
          : 'TikTok /foryou is a feed, not a target video. Copy an @user/video/{id} URL or a vm.tiktok.com / vt.tiktok.com share link.',
      }
    }
    if (hostname === 'vm.tiktok.com' || hostname === 'vt.tiktok.com' || /^\/t\//.test(pathname)) {
      return {
        url,
        service: 'tiktok',
        severity: 'info',
        message: language === 'zh'
          ? 'TikTok 分享短链，可以继续；如果地区、验证码或 TLS 报错，先在浏览器完成验证或换网络环境。'
          : 'TikTok share link detected. Continue; if region, captcha, or TLS errors appear, complete browser verification or change network.',
      }
    }
    if (/^\/@[^/]+\/video\/\d+/.test(pathname)) {
      return {
        url,
        service: 'tiktok',
        severity: 'info',
        message: language === 'zh'
          ? 'TikTok 单条视频链接，可以继续。'
          : 'TikTok direct video link detected.',
      }
    }
    if (/^\/@[^/]+(?:\/live|\/collection\/|$)/.test(pathname)) {
      return {
        url,
        service: 'tiktok',
        severity: 'warning',
        message: language === 'zh'
          ? '这个 TikTok 链接可能是用户页、直播或合集入口。若只想下载一条，请打开目标视频后复制 @用户名/video/数字ID。'
          : 'This TikTok URL may be a user, live, or collection page. For one item, open the target video and copy @user/video/{id}.',
      }
    }
    return {
      url,
      service: 'tiktok',
      severity: 'warning',
      message: language === 'zh'
        ? '这个 TikTok 链接不像官方支持的具体视频/短链。推荐换成 @用户名/video/数字ID 或 vm/vt 分享短链。'
        : 'This TikTok URL does not look like a supported direct video/share URL. Prefer @user/video/{id} or vm/vt share links.',
    }
  }

  return null
}

function inspectDownloadLinks(urls: string[], language: Language) {
  return urls
    .map((url) => inspectDownloadLink(url, language))
    .filter((item): item is LinkInspection => Boolean(item))
}

function scoreCookieForTarget(item: CookieFileInfo, target: (typeof COOKIE_TARGETS)[number]) {
  const labelText = normalizeCookieText(item.label)
  const fullText = cookieSearchText(item)
  const hasPreferredName = target.preferredMarkers.some((marker) => labelText.includes(marker))
  const hasRelatedName = target.relatedMarkers.some((marker) => labelText.includes(marker))
  const hasRelatedDomain = target.relatedMarkers.some((marker) => item.domains.some((domain) => domain.includes(marker.replace(/^by-domain\//, '').replace(/\.cookies\.txt$/, ''))))
  const isServiceFile = labelText.includes('by-service/')
  const isDomainFile = labelText.includes('by-domain/')
  const isLikelyRaw = !isServiceFile && !isDomainFile
  const hasOtherPreferredServiceName = COOKIE_TARGETS
    .filter((otherTarget) => otherTarget.id !== target.id)
    .some((otherTarget) => otherTarget.preferredMarkers.some((marker) => labelText.includes(marker)))

  if (hasOtherPreferredServiceName && !hasPreferredName) return 0

  if (hasPreferredName && hasRelatedDomain) return 120
  if (hasPreferredName) return 110
  if (hasRelatedDomain && isServiceFile) return 100
  if (hasRelatedDomain && isDomainFile) return 82
  if (hasRelatedName && isServiceFile) return 78
  if (hasRelatedName || hasRelatedDomain || target.relatedMarkers.some((marker) => fullText.includes(marker))) {
    return isLikelyRaw ? 46 : 62
  }
  return 0
}

function findRecommendedCookieFile(items: CookieFileInfo[], target: (typeof COOKIE_TARGETS)[number] | null) {
  if (!target) return null
  return [...items]
    .map((item) => ({ item, score: scoreCookieForTarget(item, target) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.item.cookieCount - right.item.cookieCount || left.item.label.localeCompare(right.item.label))[0]?.item ?? null
}

function cookieFileMatchesTarget(item: CookieFileInfo | null | undefined, target: (typeof COOKIE_TARGETS)[number] | null) {
  if (!item || !target) {
    return false
  }
  return scoreCookieForTarget(item, target) > 0
}

function shouldUseManualCookieForUrls(item: CookieFileInfo | null | undefined, urls: string[]) {
  if (!item) {
    return false
  }
  const detectedTargets = urls
    .map((url) => detectCookieTargetForUrl(url))
    .filter((target): target is (typeof COOKIE_TARGETS)[number] => Boolean(target))

  return detectedTargets.length === 0 || detectedTargets.every((target) => cookieFileMatchesTarget(item, target))
}

function formatTimestampForFile(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

function formatChineseNumber(value: number) {
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  if (!Number.isFinite(value) || value <= 0 || value >= 100) {
    return String(value)
  }
  if (value < 10) {
    return digits[value]
  }
  if (value === 10) {
    return '十'
  }
  if (value < 20) {
    return `十${digits[value % 10]}`
  }
  const tens = Math.floor(value / 10)
  const ones = value % 10
  return ones === 0 ? `${digits[tens]}十` : `${digits[tens]}十${digits[ones]}`
}

function formatTaskLabel(index: number, language: Language) {
  return language === 'zh' ? `任务${formatChineseNumber(index)}` : `Task ${index}`
}

function formatCookieMeta(item: CookieFileInfo, language: Language, text: ReturnType<typeof getText>) {
  const domains = item.domains.slice(0, 3).join(', ') || (language === 'zh' ? '未识别域名' : 'No domains detected')
  const suffix = item.domains.length > 3 ? ` +${item.domains.length - 3}` : ''
  return text.cookieMeta
    .replace('{count}', String(item.cookieCount))
    .replace('{domains}', `${domains}${suffix}`)
}

function formatCookieNames(names: string[], language: Language) {
  if (names.length === 0) return language === 'zh' ? '未识别名称' : 'unknown names'
  return names.join(', ')
}

function formatCookieHealth(item: CookieFileInfo, language: Language, text: ReturnType<typeof getText>) {
  if (item.expiredCookieCount > 0) {
    return text.cookieExpiredWarning
      .replace('{count}', String(item.expiredCookieCount))
      .replace('{names}', formatCookieNames(item.expiredCookieNames, language))
  }
  if (item.expiringSoonCookieCount > 0) {
    return text.cookieExpiringSoonWarning
      .replace('{count}', String(item.expiringSoonCookieCount))
      .replace('{names}', formatCookieNames(item.expiringSoonCookieNames, language))
  }
  return ''
}

function summarizeAutoCookieMatches(urls: string[], cookieFiles: CookieFileInfo[]) {
  const matched = new Map<string, {
    target: (typeof COOKIE_TARGETS)[number]
    cookieFile: CookieFileInfo
    count: number
  }>()
  let unmatchedCount = 0

  urls.forEach((url) => {
    const target = detectCookieTargetForUrl(url)
    const cookieFile = findRecommendedCookieFile(cookieFiles, target)
    if (!target || !cookieFile) {
      unmatchedCount += 1
      return
    }

    const current = matched.get(target.id)
    if (current) {
      current.count += 1
    } else {
      matched.set(target.id, { target, cookieFile, count: 1 })
    }
  })

  return {
    matches: [...matched.values()],
    unmatchedCount,
  }
}

function classifyCookieFile(item: CookieFileInfo, language: Language) {
  const normalized = normalizeCookieText(item.label)
  const matchedTarget = COOKIE_TARGETS
    .map((target) => ({ target, score: scoreCookieForTarget(item, target) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)[0]

  if (matchedTarget && matchedTarget.score >= 90) {
    const name = getCookieTargetName(matchedTarget.target, language)
    return {
      rank: 0,
      label: `[${name}推荐] ${item.label}`,
      note: language === 'zh' ? `${name} 专用 Cookie，优先选择这个。` : `Dedicated ${name} cookie file. Prefer this one.`,
    }
  }

  if (matchedTarget) {
    const name = getCookieTargetName(matchedTarget.target, language)
    return {
      rank: 1,
      label: `[${name}相关] ${item.label}`,
      note: language === 'zh' ? `包含 ${name} 相关域名，可用但不一定最干净。` : `Contains ${name}-related domains, but may not be the cleanest file.`,
    }
  }

  if (normalized.includes('by-service/')) {
    return {
      rank: 2,
      label: `${language === 'zh' ? '[站点专用]' : '[Service]'} ${item.label}`,
      note: language === 'zh' ? '按站点整理的 Cookie 文件。' : 'Service-specific cookie file.',
    }
  }

  if (normalized.includes('by-domain/')) {
    return {
      rank: 3,
      label: `${language === 'zh' ? '[按域名]' : '[Domain]'} ${item.label}`,
      note: language === 'zh' ? '按单个域名拆出的 Cookie 文件。' : 'Domain-specific cookie file.',
    }
  }

  return {
    rank: 4,
    label: `${language === 'zh' ? '[原始导出]' : '[Raw export]'} ${item.label}`,
    note: language === 'zh' ? '原始导出文件，常常混着很多站点登录态。' : 'Raw export with many site cookies.',
  }
}

function mergeExtraArgs(presets: ExtraPresetId[]) {
  const presetArgs = presets.flatMap((preset) => EXTRA_PRESETS.zh[preset].args)
  return presetArgs.join(' ').trim()
}

function sortCookieFiles(items: CookieFileInfo[], language: Language) {
  return [...items].sort((left, right) => {
    const a = classifyCookieFile(left, language)
    const b = classifyCookieFile(right, language)
    return a.rank !== b.rank ? a.rank - b.rank : left.label.localeCompare(right.label)
  })
}

function clampPercent(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0
  }
  return Math.min(100, Math.max(0, value))
}

function compactPath(value: string | null | undefined, maxLength = 96) {
  const normalized = value?.replace(/\s+/g, ' ').trim() ?? ''
  if (!normalized || normalized.length <= maxLength) {
    return normalized
  }

  const headLength = Math.max(24, Math.floor(maxLength * 0.42))
  const tailLength = Math.max(30, maxLength - headLength - 1)
  return `${normalized.slice(0, headLength)}…${normalized.slice(-tailLength)}`
}

function selfCheckDisplayLabel(item: SelfCheckItem, text: ReturnType<typeof getText>) {
  if (item.key === 'yt-dlp') return text.downloadCore
  if (item.key === 'ffmpeg') return text.mediaCore
  if (item.key === 'ffprobe') return text.mediaProbe
  if (item.key === 'cookies') return text.authDir
  return item.label
}

function upsertHistoryItem(currentHistory: HistoryItem[], nextItem: HistoryItem) {
  const nextUrlsKey = nextItem.urls.join('\n')
  const filtered = currentHistory.filter((item) => {
    const currentUrlsKey = item.urls.join('\n')
    return !(currentUrlsKey === nextUrlsKey && item.mode === nextItem.mode && item.outputDir === nextItem.outputDir)
  })
  return [nextItem, ...filtered].slice(0, 20)
}

function App() {
  const initialPreferences = useMemo(() => readPreferences(), [])
  const initialOutputDirRef = useRef(initialPreferences.outputDir)
  const initialCookieFileRef = useRef(initialPreferences.cookieFile)
  const initialLanguageRef = useRef(initialPreferences.language)
  const [paths, setPaths] = useState<AppPaths | null>(null)
  const [cookieFiles, setCookieFiles] = useState<CookieFileInfo[]>([])
  const [linkInputs, setLinkInputs] = useState<string[]>([''])
  const [outputDir, setOutputDir] = useState(initialPreferences.outputDir)
  const [mode, setMode] = useState<DownloadMode>(initialPreferences.mode)
  const [audioFormat, setAudioFormat] = useState<AudioFormat>(initialPreferences.audioFormat)
  const [audioQuality, setAudioQuality] = useState<AudioQuality>(initialPreferences.audioQuality)
  const [videoPreset, setVideoPreset] = useState<VideoPreset>(initialPreferences.videoPreset)
  const [language, setLanguage] = useState<Language>(initialPreferences.language)
  const [theme, setTheme] = useState<Theme>(initialPreferences.theme)
  const [cookieFile, setCookieFile] = useState(initialPreferences.cookieFile)
  const [enabledExtraPresets, setEnabledExtraPresets] = useState<ExtraPresetId[]>(initialPreferences.enabledExtraPresets)
  const [concurrency, setConcurrency] = useState<DownloadConcurrency>(initialPreferences.concurrency)
  const [logs, setLogs] = useState<string[]>([])
  const [jobLogs, setJobLogs] = useState<Record<string, string[]>>({})
  const [selectedLogJobId, setSelectedLogJobId] = useState<string | null>(null)
  const [jobView, setJobView] = useState<JobView>('active')
  const [queue, setQueue] = useState<QueueSnapshot>({ total: 0, pending: 0, running: 0, completed: 0, failed: 0, cancelled: 0, concurrency: initialPreferences.concurrency })
  const [jobs, setJobs] = useState<Record<string, JobSnapshot>>({})
  const [jobOrder, setJobOrder] = useState<string[]>([])
  const [status, setStatus] = useState<DownloadStatus>('idle')
  const [statusMessage, setStatusMessage] = useState(getText(initialPreferences.language).startHint)
  const [activeCommand, setActiveCommand] = useState('')
  const [history, setHistory] = useState<HistoryItem[]>(() => readHistory())
  const [selfCheckItems, setSelfCheckItems] = useState<SelfCheckItem[]>([])
  const [toolsSource, setToolsSource] = useState<'bundled' | 'external'>('external')
  const [runtimeRefreshing, setRuntimeRefreshing] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null)
  const [updateChecking, setUpdateChecking] = useState(false)
  const [updateDownloading, setUpdateDownloading] = useState(false)
  const [denoInstalling, setDenoInstalling] = useState(false)
  const [cookieImporting, setCookieImporting] = useState(false)
  const [activeWorkspace, setActiveWorkspace] = useState<ActiveWorkspace>('download')
  const activeQueueSnapshotRef = useRef<ActiveQueueSnapshot>({
    mode: initialPreferences.mode,
    outputDir: initialPreferences.outputDir,
  })
  const logViewerRef = useRef<HTMLDivElement | null>(null)
  const text = getText(language)
  const normalizedHeroTitle = text.heroTitle.replace(/[。.]$/, '')
  const cookiesPluginLabel = language === 'zh' ? '内置插件：MediaCookies' : 'Bundled extension: MediaCookies'
  const cookiesPluginHint =
    language === 'zh'
      ? '步骤：打开插件目录 -> 浏览器扩展页打开开发者模式 -> 加载已解压的扩展程序 -> 选择 media-dock-cookie-exporter 文件夹。'
      : 'Steps: open the extension folder -> enable Developer mode on the browser extensions page -> Load unpacked -> select the media-dock-cookie-exporter folder.'
  const updateSummary = updateInfo
    ? updateInfo.updateAvailable
      ? `${text.updateReady}: ${updateInfo.currentVersion} -> ${updateInfo.latestVersion ?? '--'}`
      : `${text.updateCurrent}: ${updateInfo.currentVersion} · ${text.updateNone}`
    : text.updateUnknown
  const presetCopy = EXTRA_PRESETS[language]

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    if (!appApi) return
    void (async () => {
      setRuntimeRefreshing(true)
      try {
        const [nextPaths, selfCheckPayload, cookieItems] = await Promise.all([
          appApi.getPaths(),
          appApi.getSelfCheck(),
          appApi.listCookieFiles(),
        ])

        setPaths(nextPaths)
        setSelfCheckItems(selfCheckPayload.items)
        setToolsSource(selfCheckPayload.toolsSource)
        setCookieFiles(sortCookieFiles(cookieItems, initialLanguageRef.current))
        if (initialOutputDirRef.current === DEFAULT_PREFS.outputDir) {
          setOutputDir((current) => (current === DEFAULT_PREFS.outputDir ? nextPaths.defaultDownloadDir : current))
        }
        if (initialCookieFileRef.current && !cookieItems.some((item) => item.path === initialCookieFileRef.current)) {
          setCookieFile('')
        }
        void appApi.checkForUpdates()
          .then((result) => {
            setUpdateInfo(result)
            if (result.updateAvailable) {
              setStatus('success')
              setStatusMessage(`${getText(initialLanguageRef.current).updateReady}: ${result.currentVersion} -> ${result.latestVersion ?? '--'}`)
            }
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : 'Update check failed.'
            setLogs((current) => [...current, `[update] ${message}`].slice(-600))
          })
      } finally {
        setRuntimeRefreshing(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (!appApi) return

    const unsubscribe = appApi.onDownloadUpdate((event) => {
      if (event.type === 'log') {
        const prefix = event.jobId ? `[${event.jobId}] ` : ''
        setLogs((current) => [...current, `${prefix}${event.line}`].slice(-600))
        const jobId = event.jobId
        if (jobId) {
          const streamPrefix = event.stream === 'system' ? 'system' : event.stream
          setJobLogs((current) => ({
            ...current,
            [jobId]: [...(current[jobId] ?? []), `[${streamPrefix}] ${event.line}`].slice(-300),
          }))
        }
        return
      }
      if (event.type === 'queue') {
        setQueue(event.queue)
        if (event.message) {
          setStatusMessage(event.message)
          if (event.queue.running > 0 || event.queue.pending > 0) setStatus('running')
          else if (event.queue.failed > 0) setStatus('error')
          else if (event.queue.cancelled > 0 && event.queue.completed === 0) setStatus('cancelled')
          else if (event.queue.completed > 0) setStatus('success')
          else setStatus('idle')
        }
        return
      }
      const nextJob = event.job
      setJobs((current) => {
        const previous = current[nextJob.jobId]
        const next = { ...current, [nextJob.jobId]: nextJob }
        if (!previous) {
          setJobOrder((order) => (order.includes(nextJob.jobId) ? order : [...order, nextJob.jobId]))
        }
        if (['success', 'error', 'cancelled'].includes(nextJob.status) && (!previous || previous.status !== nextJob.status)) {
          setHistory((currentHistory) => {
            const queueSnapshot = activeQueueSnapshotRef.current
            const item: HistoryItem = {
              id: `${Date.now()}-${nextJob.jobId}`,
              title: nextJob.title || nextJob.url,
              urls: [nextJob.url],
              mode: queueSnapshot.mode,
              outputDir: queueSnapshot.outputDir,
              status: nextJob.status,
              outputPath: nextJob.outputPath,
              finishedAt: new Date().toISOString(),
            }
            const updated = upsertHistoryItem(currentHistory, item)
            writeJsonStorage(HISTORY_KEY, updated)
            return updated
          })
        }
        return next
      })
      if (nextJob.command) setActiveCommand(nextJob.command)
      if (nextJob.message) setStatusMessage(nextJob.message)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    setCookieFiles((current) => sortCookieFiles(current, language))
  }, [language])

  useEffect(() => {
    const prefs: StoredPreferences = { outputDir, mode, audioFormat, audioQuality, videoPreset, language, theme, cookieFile, enabledExtraPresets, concurrency }
    writeJsonStorage(STORAGE_KEY, prefs)
  }, [audioFormat, audioQuality, concurrency, cookieFile, enabledExtraPresets, language, mode, outputDir, theme, videoPreset])

  useEffect(() => {
    const container = logViewerRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [logs])

  const urls = useMemo(() => {
    const seen = new Set<string>()
    return linkInputs
      .map((item) => item.trim())
      .filter((item) => {
        if (!item || seen.has(item)) {
          return false
        }
        seen.add(item)
        return true
      })
  }, [linkInputs])
  const cookieTargets = useMemo(() => detectCookieTargetsForUrls(urls), [urls])
  const linkInspections = useMemo(() => inspectDownloadLinks(urls, language), [language, urls])
  const blockingLinkInspections = linkInspections.filter((item) => item.severity === 'error')
  const cookieTarget = cookieTargets.length === 1 ? cookieTargets[0] : null
  const recommendedCookieFile = useMemo(() => findRecommendedCookieFile(cookieFiles, cookieTarget), [cookieFiles, cookieTarget])
  const canStart = urls.length > 0 && outputDir.trim().length > 0 && queue.running === 0 && queue.pending === 0 && blockingLinkInspections.length === 0
  const bootstrapError = !appApi ? text.bootstrapError : null
  const effectiveStatus = bootstrapError ? 'error' : status
  const effectiveMessage = bootstrapError ?? statusMessage
  const visibleLogs = bootstrapError ? ['[bootstrap] window.appApi is unavailable'] : logs
  const denoHint = paths?.denoPath ? text.denoReady : text.denoMissing
  const cookieExtensionPath = paths?.cookieExtensionDir ?? ''
  const sortedJobs = jobOrder.map((jobId) => jobs[jobId]).filter(Boolean)
  const activeDownloadJobs = sortedJobs.filter((job) => job.status === 'running')
  const finishedDownloadJobs = sortedJobs.filter((job) => job.status === 'success')
  const issueDownloadJobs = sortedJobs.filter((job) => job.status === 'error' || job.status === 'cancelled')
  const selectedLogJob = selectedLogJobId ? jobs[selectedLogJobId] : null
  const selectedLogLines = selectedLogJobId ? (jobLogs[selectedLogJobId] ?? []) : []
  const selectedTaskLabel = selectedLogJob ? formatTaskLabel(selectedLogJob.index, language) : text.jobLogTitle
  const selectedTaskLogTitle = selectedLogJob ? text.jobLogTitleForTask.replace('{task}', selectedTaskLabel) : text.jobLogTitle
  const selectedCopyLogLabel = selectedLogJob ? text.copyTaskLog.replace('{task}', selectedTaskLabel) : text.copyLog
  const selectedExportLogLabel = selectedLogJob ? text.exportTaskLog.replace('{task}', selectedTaskLabel) : text.exportLog
  const selectedLogExportText = selectedLogJob
    ? [
        `# ${selectedTaskLogTitle}`,
        language === 'zh'
          ? `${selectedTaskLabel}：${selectedLogJob.title || selectedLogJob.url}`
          : `${selectedTaskLabel}: ${selectedLogJob.title || selectedLogJob.url}`,
        `${language === 'zh' ? '序号' : 'Index'}: ${selectedLogJob.index}/${selectedLogJob.totalJobs}`,
        `${text.status}: ${statusLabel(selectedLogJob.status, text)}`,
        `${language === 'zh' ? '进度' : 'Progress'}: ${selectedLogJob.percent !== null ? `${selectedLogJob.percent.toFixed(1)}%` : text.waiting}`,
        selectedLogJob.exitCode !== undefined ? `${language === 'zh' ? '退出码' : 'Exit code'}: ${selectedLogJob.exitCode ?? 'unknown'}` : '',
        `${language === 'zh' ? '链接' : 'URL'}: ${selectedLogJob.url}`,
        selectedLogJob.outputPath ? `${language === 'zh' ? '输出文件' : 'Output file'}: ${selectedLogJob.outputPath}` : '',
        selectedLogJob.command ? `${text.currentCommand}:\n> ${selectedLogJob.command}` : '',
        '',
        `[${text.logs}]`,
        ...selectedLogLines,
      ].filter(Boolean).join('\n')
    : selectedLogLines.join('\n')
  const aggregateProgressPercent = useMemo(() => {
    if (queue.total <= 0) {
      return 0
    }

    const processedUnits = sortedJobs.reduce((totalUnits, job) => {
      if (job.status === 'success' || job.status === 'error' || job.status === 'cancelled') {
        return totalUnits + 100
      }
      if (job.status === 'running') {
        return totalUnits + clampPercent(job.percent)
      }
      return totalUnits
    }, 0)

    return Math.min(100, Math.max(0, processedUnits / queue.total))
  }, [queue.total, sortedJobs])
  const taskTiles = useMemo(() => {
    const total = Math.max(queue.total, urls.length)
    return Array.from({ length: total }, (_, index) => {
      const taskIndex = index + 1
      const job = sortedJobs.find((item) => item.index === taskIndex)
      const status: DownloadStatus | 'pending' = job?.status ?? (queue.total > 0 ? 'pending' : 'idle')
      return {
        index: taskIndex,
        status,
        title: job?.title || urls[index] || '',
        percent: job?.percent ?? null,
      }
    })
  }, [queue.total, sortedJobs, urls])
  const activeTaskTiles = taskTiles.filter((tile) => tile.status === 'pending' || tile.status === 'running')
  const finishedTaskTiles = taskTiles.filter((tile) => tile.status === 'success')
  const issueTaskTiles = taskTiles.filter((tile) => tile.status === 'error' || tile.status === 'cancelled')
  const currentTaskTiles = jobView === 'active' ? activeTaskTiles : jobView === 'finished' ? finishedTaskTiles : issueTaskTiles
  const currentDownloadJobs = jobView === 'active' ? activeDownloadJobs : jobView === 'finished' ? finishedDownloadJobs : issueDownloadJobs
  const currentJobViewTitle = jobView === 'active' ? text.activeJobView : jobView === 'finished' ? text.finishedJobView : text.issueJobView
  const currentJobViewHint = jobView === 'active' ? text.activeJobViewHint : jobView === 'finished' ? text.finishedJobViewHint : text.issueJobViewHint
  const currentJobViewCount = jobView === 'active' ? queue.running + queue.pending : jobView === 'finished' ? queue.completed : queue.failed + queue.cancelled
  const aggregateProgressLabel = queue.total > 0 ? `${aggregateProgressPercent.toFixed(1)}%` : text.waiting
  const combinedExtraArgs = mergeExtraArgs(enabledExtraPresets)
  const autoCookieFiles = useMemo(
    () => urls.map((url) => findRecommendedCookieFile(cookieFiles, detectCookieTargetForUrl(url))?.path ?? null),
    [cookieFiles, urls],
  )
  const autoCookieSummary = useMemo(() => summarizeAutoCookieMatches(urls, cookieFiles), [cookieFiles, urls])
  const selectedCookieMeta = cookieFile ? cookieFiles.find((item) => item.path === cookieFile) : null
  const manualCookieAppliesToUrls = useMemo(
    () => shouldUseManualCookieForUrls(selectedCookieMeta, urls),
    [selectedCookieMeta, urls],
  )
  const selectedCookieScore = cookieTarget && selectedCookieMeta ? scoreCookieForTarget(selectedCookieMeta, cookieTarget) : 0
  const cookieTargetName = cookieTarget ? getCookieTargetName(cookieTarget, language) : ''
  const cookieAdvisorMessage = cookieFile && selectedCookieMeta
    ? language === 'zh'
      ? `已手动选择 ${classifyCookieFile(selectedCookieMeta, language).label}，所有链接都会使用这一个 Cookie 文件。`
      : `Manual file selected: ${classifyCookieFile(selectedCookieMeta, language).label}. Every URL will use this cookie file.`
    : autoCookieSummary.matches.length > 0
      ? language === 'zh'
        ? `自动模式会按链接分别使用：${autoCookieSummary.matches.map((match) => `${getCookieTargetName(match.target, language)} x${match.count}`).join('，')}${autoCookieSummary.unmatchedCount > 0 ? `；另有 ${autoCookieSummary.unmatchedCount} 条链接暂未匹配到专用 Cookie` : ''}。`
        : `Auto mode will use per-URL cookies for: ${autoCookieSummary.matches.map((match) => `${getCookieTargetName(match.target, language)} x${match.count}`).join(', ')}${autoCookieSummary.unmatchedCount > 0 ? `; ${autoCookieSummary.unmatchedCount} URL(s) have no dedicated cookie match yet` : ''}.`
      : cookieTarget
        ? recommendedCookieFile
          ? text.cookieAdvisorDetected
              .replace('{service}', cookieTargetName)
              .replace('{file}', classifyCookieFile(recommendedCookieFile, language).label)
          : text.cookieAdvisorMissing.replace('{service}', cookieTargetName)
    : urls.length > 0
      ? text.cookieAdvisorNone
      : text.cookieAdvisorIdle
  const selectedCookieHelp = selectedCookieMeta
    ? [
        classifyCookieFile(selectedCookieMeta, language).note,
        formatCookieMeta(selectedCookieMeta, language, text),
        formatCookieHealth(selectedCookieMeta, language, text),
        cookieTarget && selectedCookieScore === 0 ? text.cookieAdvisorMismatch.replace('{service}', cookieTargetName) : '',
      ].filter(Boolean).join(' ')
    : text.cookieHint
  const recommendedCookieHealth = recommendedCookieFile ? formatCookieHealth(recommendedCookieFile, language, text) : ''
  const canClearLinks = linkInputs.some((item) => item.trim().length > 0) || linkInputs.length > 1

  useEffect(() => {
    if (!cookieFile || urls.length === 0 || !selectedCookieMeta) {
      return
    }
    if (!manualCookieAppliesToUrls) {
      setCookieFile('')
    }
  }, [cookieFile, manualCookieAppliesToUrls, selectedCookieMeta, urls.length])

  async function refreshRuntimeState() {
    if (!appApi) return

    setRuntimeRefreshing(true)
    try {
      const [nextPaths, selfCheckPayload, cookieItems] = await Promise.all([
        appApi.getPaths(),
        appApi.getSelfCheck(),
        appApi.listCookieFiles(),
      ])

      setPaths(nextPaths)
      setSelfCheckItems(selfCheckPayload.items)
      setToolsSource(selfCheckPayload.toolsSource)
      setCookieFiles(sortCookieFiles(cookieItems, language))
      if (initialOutputDirRef.current === DEFAULT_PREFS.outputDir) {
        setOutputDir((current) => (current === DEFAULT_PREFS.outputDir ? nextPaths.defaultDownloadDir : current))
      }
      if (cookieFile && !cookieItems.some((item) => item.path === cookieFile)) {
        setCookieFile('')
      }
      setStatus('idle')
      setStatusMessage(nextPaths.denoPath ? text.refreshedWithDeno : text.refreshedWithoutDeno)
    } catch (error) {
      const message = error instanceof Error ? error.message : text.refreshFailed
      setStatus('error')
      setStatusMessage(message)
      setLogs((current) => [...current, `[ui] ${message}`].slice(-600))
    } finally {
      setRuntimeRefreshing(false)
    }
  }

  async function checkForUpdates(silent = false) {
    if (!appApi) return

    setUpdateChecking(true)
    try {
      const result = await appApi.checkForUpdates()
      setUpdateInfo(result)
      if (!silent || result.updateAvailable) {
        setStatus(result.updateAvailable ? 'success' : 'idle')
        setStatusMessage(
          result.updateAvailable
            ? `${text.updateReady}: ${result.currentVersion} -> ${result.latestVersion ?? '--'}`
            : text.updateNone,
        )
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Update check failed.'
      if (!silent) {
        setStatus('error')
        setStatusMessage(message)
      }
      setLogs((current) => [...current, `[update] ${message}`].slice(-600))
    } finally {
      setUpdateChecking(false)
    }
  }

  async function downloadLatestUpdate() {
    if (!appApi) return

    setUpdateDownloading(true)
    try {
      const result = await appApi.downloadLatestUpdate()
      setStatus('success')
      setStatusMessage(`${text.updateDownloaded} ${result.filePath}`)
      setLogs((current) => [...current, `[update] ${result.assetName} -> ${result.filePath}`].slice(-600))
    } catch (error) {
      const message = error instanceof Error ? error.message : text.updateMissingAsset
      setStatus('error')
      setStatusMessage(message)
      setLogs((current) => [...current, `[update] ${message}`].slice(-600))
    } finally {
      setUpdateDownloading(false)
    }
  }

  async function installDenoRuntime() {
    if (!appApi) return

    setDenoInstalling(true)
    try {
      const result = await appApi.installDenoRuntime()
      setStatus('success')
      setStatusMessage(`${text.denoInstalled} ${result.path}`)
      setLogs((current) => [...current, `[runtime] deno ${result.version} -> ${result.path}`].slice(-600))
      await refreshRuntimeState()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Deno install failed.'
      setStatus('error')
      setStatusMessage(message)
      setLogs((current) => [...current, `[runtime] ${message}`].slice(-600))
    } finally {
      setDenoInstalling(false)
    }
  }

  async function handleImportCookieZip() {
    if (!appApi) return

    setCookieImporting(true)
    try {
      const result = await appApi.importCookieZip()
      if (!result) {
        return
      }

      const sortedCookies = sortCookieFiles(result.cookieFiles, language)
      setCookieFiles(sortedCookies)
      if (cookieFile && !result.cookieFiles.some((item) => item.path === cookieFile)) {
        setCookieFile('')
      }
      setStatus('success')
      setStatusMessage(text.cookieImportSuccess.replace('{count}', String(result.importedFiles.length)))
      setLogs((current) => [
        ...current,
        `[cookies] imported ${result.importedFiles.length} file(s) -> ${result.importedDir}`,
      ].slice(-600))
    } catch (error) {
      const message = error instanceof Error ? error.message : text.cookieImportFailed
      setStatus('error')
      setStatusMessage(`${text.cookieImportFailed} ${message}`)
      setLogs((current) => [...current, `[cookies] ${message}`].slice(-600))
    } finally {
      setCookieImporting(false)
    }
  }

  async function handlePickFolder() {
    const folder = await appApi.pickDirectory(outputDir)
    if (folder) setOutputDir(folder)
  }

  async function handleStartDownload() {
    if (blockingLinkInspections.length > 0) {
      const message = blockingLinkInspections[0].message
      setStatus('error')
      setStatusMessage(message)
      setLogs((current) => [...current, `[ui] ${message}`].slice(-600))
      return
    }

    const shouldUseManualCookie = Boolean(cookieFile && shouldUseManualCookieForUrls(selectedCookieMeta, urls))
    const shouldAutoFallbackCookie = Boolean(cookieFile && !shouldUseManualCookie)
    const effectiveCookieFile = shouldUseManualCookie ? cookieFile : null
    const effectiveUrlCookieFiles = autoCookieFiles
    const initialLogs = shouldAutoFallbackCookie ? [`[ui] ${text.cookieAutoFallback}`] : []
    setLogs([])
    setJobs({})
    setJobOrder([])
    setActiveCommand('')
    activeQueueSnapshotRef.current = {
      mode,
      outputDir,
    }
    setQueue({ total: urls.length, pending: urls.length, running: 0, completed: 0, failed: 0, cancelled: 0, concurrency })
    setJobLogs({})
    setSelectedLogJobId(null)
    setJobView('active')
    setStatus('running')
    setStatusMessage(shouldAutoFallbackCookie ? text.cookieAutoFallback : text.queuePrepared.replace('{count}', String(urls.length)))
    if (initialLogs.length > 0) {
      setLogs(initialLogs)
    }
    try {
      await appApi.startDownload({
        urls,
        outputDir,
        mode,
        audioFormat,
        audioQuality,
        videoPreset,
        extraArgs: combinedExtraArgs,
        cookieFile: effectiveCookieFile,
        urlCookieFiles: effectiveUrlCookieFiles,
        concurrency,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start queue.'
      setStatus('error')
      setStatusMessage(message)
      setLogs((current) => [...current, `[ui] ${message}`])
    }
  }

  async function copySelectedJobLog() {
    if (!selectedLogExportText.trim()) {
      setStatusMessage(text.jobLogEmpty)
      return
    }

    try {
      const copied = await appApi.copyText(selectedLogExportText)
      setStatusMessage(copied ? text.copiedLog : text.copyLogFailed)
    } catch (error) {
      const message = error instanceof Error ? error.message : text.copyLogFailed
      setStatusMessage(message || text.copyLogFailed)
    }
  }

  async function exportTextLog(defaultName: string, content: string) {
    const trimmedContent = content.trim()
    if (!trimmedContent) {
      setStatusMessage(text.jobLogEmpty)
      return
    }

    try {
      const savedPath = await appApi.exportTextLog(defaultName, trimmedContent)
      if (savedPath) {
        setStatusMessage(text.exportedLog.replace('{path}', savedPath))
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : text.exportLogFailed
      setStatusMessage(message || text.exportLogFailed)
    }
  }

  function buildAllLogsExportText() {
    const header = [
      `Media Dock ${text.logs}`,
      new Date().toISOString(),
      `${text.status}: ${statusLabel(effectiveStatus, text)} · ${effectiveMessage}`,
      `${text.queueProgress}: ${aggregateProgressLabel} · ${text.taskTotal}: ${queue.total} · ${text.running}: ${queue.running} · ${text.done}: ${queue.completed} · ${text.failed}: ${queue.failed} · ${text.cancelled}: ${queue.cancelled}`,
      activeCommand ? `${text.currentCommand}: ${activeCommand}` : '',
    ].filter(Boolean)
    const jobsText = sortedJobs.length > 0
      ? [
          '',
          `[${text.taskList}]`,
          ...sortedJobs.map((job) => {
            const taskLabel = formatTaskLabel(job.index, language)
            return language === 'zh'
              ? `${taskLabel}：${statusLabel(job.status, text)} · ${job.title || job.url}`
              : `${taskLabel}: ${statusLabel(job.status, text)} · ${job.title || job.url}`
          }),
        ]
      : []
    const logText = visibleLogs.length > 0 ? ['', `[${text.logs}]`, ...visibleLogs] : ['', `[${text.logs}]`, text.noLogs]
    return [...header, ...jobsText, ...logText].join('\n')
  }

  async function exportAllLogs() {
    await exportTextLog(`media-dock-logs-${formatTimestampForFile()}.txt`, buildAllLogsExportText())
  }

  async function exportSelectedJobLog() {
    const jobIndex = selectedLogJob?.index ? `task-${String(selectedLogJob.index).padStart(2, '0')}` : 'task'
    await exportTextLog(`media-dock-${jobIndex}-log-${formatTimestampForFile()}.txt`, selectedLogExportText)
  }

  function updateLinkInput(index: number, value: string) {
    if (value.includes('\n')) {
      const nextUrls = value
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean)
      setLinkInputs((current) => {
        const before = current.slice(0, index)
        const after = current.slice(index + 1)
        const merged = [...before, ...(nextUrls.length > 0 ? nextUrls : ['']), ...after]
        return merged.length > 0 ? merged : ['']
      })
      return
    }
    setLinkInputs((current) => current.map((item, itemIndex) => (itemIndex === index ? value : item)))
  }

  function addLinkInput() {
    setLinkInputs((current) => [...current, ''])
  }

  function removeLinkInput(index: number) {
    setLinkInputs((current) => {
      if (current.length === 1) {
        return ['']
      }
      return current.filter((_, itemIndex) => itemIndex !== index)
    })
  }

  function clearLinkInputs() {
    setLinkInputs([''])
    setCookieFile('')
  }

  function togglePreset(preset: ExtraPresetId) {
    setEnabledExtraPresets((current) => current.includes(preset) ? current.filter((item) => item !== preset) : [...current, preset])
  }

  async function handleExportConfig() {
    const config = {
      outputDir,
      mode,
      audioFormat,
      audioQuality,
      videoPreset,
      language,
      theme,
      enabledExtraPresets,
      concurrency,
    }
    const savedPath = await appApi.exportConfig(config)
    if (savedPath) {
      setStatusMessage(`Config exported: ${savedPath}`)
    }
  }

  async function handleImportConfig() {
    const imported = await appApi.importConfig()
    if (!imported || typeof imported !== 'object') return
    const data = imported as Partial<StoredPreferences>
    if (typeof data.outputDir === 'string') setOutputDir(data.outputDir)
    if (data.mode === 'video' || data.mode === 'audio') setMode(data.mode)
    if (data.audioFormat === 'mp3' || data.audioFormat === 'm4a' || data.audioFormat === 'wav' || data.audioFormat === 'opus') setAudioFormat(data.audioFormat)
    if (data.audioQuality === 'best' || data.audioQuality === '320k' || data.audioQuality === '192k' || data.audioQuality === '128k') setAudioQuality(data.audioQuality)
    setVideoPreset('best')
    if (data.language === 'zh' || data.language === 'en') setLanguage(data.language)
    if (isTheme(data.theme)) setTheme(data.theme)
    setConcurrency(normalizeConcurrency(data.concurrency))
    if (Array.isArray(data.enabledExtraPresets)) {
      setEnabledExtraPresets(
        data.enabledExtraPresets.filter(
          (value): value is ExtraPresetId =>
            [
              'noPlaylist',
              'embedMetadata',
              'writeSubs',
              'writeAutoSubs',
              'subtitleOnly',
              'splitAudioTrack',
              'embedThumbnail',
              'writeThumbnail',
              'writeDescription',
              'writeInfoJson',
            ].includes(String(value)),
        ),
      )
    }
    setCookieFile('')
    setStatusMessage(language === 'zh' ? '配置已导入，cookies 已按安全要求清空。' : 'Config imported. Cookie selection was cleared for safety.')
  }

  return (
    <div className="shell">
      <div className="shell__glow shell__glow--left" />
      <div className="shell__glow shell__glow--right" />
      <section className="hero panel">
        <div className="hero__toolbar">
          <div className="hero-brand">
            <div className="eyebrow">MEDIA DOCK</div>
            <div className="eyebrow brand-signature">LOCAL</div>
          </div>
          <div className="toolbar-group">
            <div className="toolbar-block">
              <span>{language === 'zh' ? '配置' : 'Config'}</span>
              <div className="segmented">
                <button className="segmented__item" type="button" onClick={() => void handleImportConfig()}>{language === 'zh' ? '导入' : 'Import'}</button>
                <button className="segmented__item" type="button" onClick={() => void handleExportConfig()}>{language === 'zh' ? '导出' : 'Export'}</button>
              </div>
            </div>
            <div className="toolbar-block">
              <span>{text.workspace}</span>
              <div className="segmented">
                <button
                  className={activeWorkspace === 'download' ? 'segmented__item active' : 'segmented__item'}
                  type="button"
                  onClick={() => setActiveWorkspace('download')}
                >
                  {text.downloadPanel}
                </button>
                <button
                  className={activeWorkspace === 'media' ? 'segmented__item active' : 'segmented__item'}
                  type="button"
                  onClick={() => setActiveWorkspace('media')}
                >
                  {text.mediaTools}
                </button>
              </div>
            </div>
            <div className="toolbar-block">
              <span>{text.language}</span>
              <div className="segmented">
                <button className={language === 'zh' ? 'segmented__item active' : 'segmented__item'} type="button" onClick={() => setLanguage('zh')}>中文</button>
                <button className={language === 'en' ? 'segmented__item active' : 'segmented__item'} type="button" onClick={() => setLanguage('en')}>EN</button>
              </div>
            </div>
            <div className="toolbar-block">
              <span>{text.theme}</span>
              <div className="theme-swatch-group" role="list" aria-label={text.theme}>
                {THEME_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    className={theme === option.id ? 'theme-swatch active' : 'theme-swatch'}
                    type="button"
                    data-theme-option={option.id}
                    aria-pressed={theme === option.id}
                    onClick={() => setTheme(option.id)}
                  >
                    <span className="theme-swatch__dot" aria-hidden="true" />
                    <span>{getThemeLabel(option, language)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <h1>{normalizedHeroTitle}</h1>
        <p className="hero__copy">{text.heroCopy}</p>
        <div className="hero__status-grid">
          <div className="status-card"><span className="status-card__label">{text.status}</span><strong>{statusLabel(effectiveStatus, text)}</strong><p>{effectiveMessage}</p></div>
          <div className="status-card">
            <span className="status-card__label">{text.engine}</span>
            <strong>{paths?.envName ?? text.loading}</strong>
            <p title={paths?.ytDlpPath}>{paths?.ytDlpPath ? compactPath(paths.ytDlpPath, 86) : text.loadingPath}</p>
          </div>
          <div className="status-card">
            <span className="status-card__label">{text.compatibility}</span>
            <strong>{paths?.denoPath ? text.readyForYoutube : text.basicMode}</strong>
            <p>{denoHint}</p>
            {!paths?.denoPath ? (
              <div className="status-card__actions">
                <button
                  className="ghost-button ghost-button--small"
                  type="button"
                  disabled={denoInstalling || queue.running > 0 || queue.pending > 0}
                  onClick={() => void installDenoRuntime()}
                >
                  {denoInstalling ? text.installingDeno : text.installDenoAuto}
                </button>
                <small>{text.denoInstallAutoHint}</small>
              </div>
            ) : null}
          </div>
        </div>
        <div className="command-box hero-checks">
          <span>{language === 'zh' ? '启动自检' : 'Startup self-check'}</span>
          <code>
            {(selfCheckItems.length > 0 ? selfCheckItems : [
              { key: 'loading', label: language === 'zh' ? '检查中' : 'Checking', ok: true, detail: text.loading },
            ])
              .map((item) => `${item.ok ? 'OK' : 'MISS'} ${selfCheckDisplayLabel(item, text)}: ${compactPath(item.detail, 124)}`)
              .join('\n')}
          </code>
          <div className="section-actions">
            <button className="ghost-button ghost-button--small" type="button" disabled={runtimeRefreshing || queue.running > 0 || queue.pending > 0} onClick={() => void refreshRuntimeState()}>
              {runtimeRefreshing ? text.refreshingTools : text.refreshTools}
            </button>
            <button className="ghost-button ghost-button--small" type="button" disabled={updateChecking} onClick={() => void checkForUpdates(false)}>
              {updateChecking ? text.checkingUpdates : text.checkUpdates}
            </button>
            {updateInfo?.updateAvailable ? (
              <button className="ghost-button ghost-button--small" type="button" disabled={updateDownloading || !updateInfo.assetUrl} onClick={() => void downloadLatestUpdate()}>
                {updateDownloading ? text.updateDownloading : text.updateDownload}
              </button>
            ) : null}
          </div>
          <div className="progress-meta progress-meta--wrap">
            <span>{language === 'zh' ? '工具来源' : 'Tool source'}: {toolsSource === 'bundled' ? (language === 'zh' ? '分享包内置' : 'Bundled') : (language === 'zh' ? '系统环境' : 'System')}</span>
            <span>{updateSummary}</span>
            {updateInfo?.assetName ? <span>{text.updateLatest}: {updateInfo.latestVersion ?? '--'}</span> : null}
          </div>
        </div>
      </section>
      {activeWorkspace === 'media' ? (
        <MediaToolsView embedded onBack={() => setActiveWorkspace('download')} />
      ) : (
      <main className="workspace">
        <section className="panel control-room">
          <div className="section-title"><span>{text.downloadPanel}</span><small>{text.downloadPanelHint}</small></div>
          <div className="control-room__quickbar">
            <div className="control-room__stats">
              <div className="control-room__stat"><strong>{urls.length}</strong><span>{text.urls}</span></div>
              <div className="control-room__stat"><strong>{mode === 'video' ? text.video : text.audio}</strong><span>{text.mode}</span></div>
              <div className="control-room__stat"><strong>{queue.running > 0 || queue.pending > 0 ? statusLabel('running', text) : statusLabel(effectiveStatus, text)}</strong><span>{text.status}</span></div>
            </div>
            <div className="action-row action-row--top">
              <button className="primary-button" type="button" disabled={!canStart} onClick={handleStartDownload}>{text.start}</button>
              <button className="ghost-button" type="button" disabled={queue.running === 0 && queue.pending === 0} onClick={() => void appApi.cancelDownload()}>{text.cancel}</button>
              <button className="ghost-button" type="button" onClick={() => void appApi.openPath(outputDir)}>{text.openFolder}</button>
            </div>
          </div>
          <div className="field">
            <span>{text.urls}</span>
            <div className="link-list">
              {linkInputs.map((value, index) => (
                <div className="link-row" key={`link-${index}`}>
                  <input
                    className="link-row__input"
                    value={value}
                    onChange={(event) => updateLinkInput(index, event.target.value)}
                    placeholder={`${text.urlsPlaceholder} ${index + 1}`}
                  />
                  <button className="ghost-button ghost-button--icon" type="button" onClick={() => removeLinkInput(index)}>
                    -
                  </button>
                </div>
              ))}
            </div>
            <small className="field-help">{text.urlsHint}</small>
            {linkInspections.length > 0 ? (
              <div className="link-advisor">
                <div className="link-advisor__title">
                  <span>{text.linkCheck}</span>
                  <small>{text.linkCheckHint}</small>
                </div>
                <div className="link-advisor__items">
                  {linkInspections.map((item, index) => (
                    <div className={`link-advisor__item link-advisor__item--${item.severity}`} key={`${item.url}-${index}`}>
                      <strong>{index + 1}</strong>
                      <p>{item.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="section-actions">
              <button className="ghost-button ghost-button--small" type="button" onClick={addLinkInput}>
                + {text.addLink}
              </button>
              <button className="ghost-button ghost-button--small" type="button" disabled={!canClearLinks} onClick={clearLinkInputs}>
                {text.clearLinks}
              </button>
            </div>
          </div>
          <div className="field-group path-picker-group">
            <label className="field field--grow path-picker-field">
              <span>{text.outputFolder}</span>
              <input value={outputDir} onChange={(event) => setOutputDir(event.target.value)} />
            </label>
            <div className="field path-picker-action">
              <span className="path-picker-label" aria-hidden="true">{text.outputFolder}</span>
              <div className="path-picker-action-row">
                <button className="ghost-button path-picker-button" type="button" onClick={handlePickFolder}>{text.browse}</button>
              </div>
            </div>
          </div>
          <div className="field-grid field-grid--2">
            <label className="field">
              <span>{text.mode}</span>
              <div className="toggle-grid">
                <button className={mode === 'video' ? 'mode-pill active' : 'mode-pill'} type="button" onClick={() => setMode('video')}>{text.video}</button>
                <button className={mode === 'audio' ? 'mode-pill active' : 'mode-pill'} type="button" onClick={() => setMode('audio')}>{text.audio}</button>
              </div>
              <small className="field-help">{text.sequentialHint}</small>
            </label>
            {mode === 'video' ? (
              <div className="quality-card">
                <span>{text.videoPreset}</span>
                <strong>{text.best}</strong>
                <small className="field-help">{text.videoPresetHint}</small>
              </div>
            ) : (
              <div className="field-grid field-grid--2">
                <label className="field">
                  <span>{text.audioFormat}</span>
                  <select value={audioFormat} onChange={(event) => setAudioFormat(event.target.value as AudioFormat)}>
                    <option value="mp3">MP3</option><option value="m4a">M4A</option><option value="wav">WAV</option><option value="opus">OPUS</option>
                  </select>
                </label>
                <label className="field">
                  <span>{text.audioQuality}</span>
                  <select value={audioQuality} onChange={(event) => setAudioQuality(event.target.value as AudioQuality)}>
                    <option value="best">Best available</option><option value="320k">320 kbps</option><option value="192k">192 kbps</option><option value="128k">128 kbps</option>
                  </select>
                  <small className="field-help">{text.audioQualityHint}</small>
                </label>
              </div>
            )}
          </div>
          <label className="field concurrency-field">
            <span>{text.concurrency}</span>
            <select
              value={concurrency}
              disabled={queue.running > 0 || queue.pending > 0}
              onChange={(event) => setConcurrency(normalizeConcurrency(event.target.value))}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
            <small className="field-help">{text.concurrencyHint}</small>
          </label>
          <div className="field-grid field-grid--2">
            <label className="field">
              <span>{text.cookieFile}</span>
              <select value={cookieFile} onChange={(event) => setCookieFile(event.target.value)}>
                <option value="">{text.cookieAuto}</option>
                {cookieFiles.map((item) => {
                  const meta = classifyCookieFile(item, language)
                  return <option key={item.path} value={item.path}>{meta.label}</option>
                })}
              </select>
              <small className="field-help">{selectedCookieHelp}</small>
            </label>
            <label className="field field--button">
              <span>Cookies</span>
              <div className="cookie-helper-actions">
                <button className="ghost-button ghost-button--full" type="button" disabled={!cookieExtensionPath} onClick={() => void appApi.openPath(cookieExtensionPath)}>{text.openCookieExtension}</button>
                <button className="ghost-button ghost-button--full" type="button" disabled={cookieImporting} onClick={() => void handleImportCookieZip()}>{cookieImporting ? text.importingCookieZip : text.importCookieZip}</button>
                <button className="ghost-button ghost-button--full" type="button" onClick={() => void appApi.openPath(paths?.cookiesDir ?? '')}>{text.openCookiesDir}</button>
              </div>
              <small className="field-help">{cookiesPluginLabel}</small>
              <small className="field-help">{cookiesPluginHint}</small>
              <small className="field-help">{text.cookieFallback}</small>
              <div className="supported-sites-link">
                <button
                  className="link-button"
                  type="button"
                  onClick={() => void appApi.openExternal(YT_DLP_SUPPORTED_SITES_URL)}
                >
                  {text.supportedSitesLink}
                </button>
                <small className="field-help">{text.supportedSitesHint}</small>
              </div>
            </label>
          </div>
          <div className={[
            'cookie-advisor',
            recommendedCookieFile ? 'cookie-advisor--active' : '',
            recommendedCookieHealth ? 'cookie-advisor--warning' : '',
          ].filter(Boolean).join(' ')}>
            <div>
              <span>{text.cookieAdvisor}</span>
              <p>{cookieAdvisorMessage}</p>
              {recommendedCookieFile ? <small>{formatCookieMeta(recommendedCookieFile, language, text)}</small> : null}
              {recommendedCookieHealth ? <small>{recommendedCookieHealth}</small> : null}
            </div>
            {recommendedCookieFile ? (
              <button
                className="ghost-button ghost-button--small"
                type="button"
                disabled={cookieFile === recommendedCookieFile.path}
                onClick={() => setCookieFile(recommendedCookieFile.path)}
              >
                {cookieFile === recommendedCookieFile.path ? text.cookieAdvisorCurrent : text.cookieAdvisorUse}
              </button>
            ) : null}
          </div>
          <div className="field">
            <span>{text.extraOptions}</span>
            <div className="preset-list">
              {(Object.keys(presetCopy) as ExtraPresetId[]).map((presetId) => {
                const preset = presetCopy[presetId]
                const active = enabledExtraPresets.includes(presetId)
                return <button key={presetId} className={active ? 'preset-chip active' : 'preset-chip'} type="button" onClick={() => togglePreset(presetId)}><strong>{preset.label}</strong><span>{preset.desc}</span></button>
              })}
            </div>
            <small className="field-help">{text.extraOptionsHint}</small>
          </div>
          <div className="command-box command-box--subtle"><span>{text.extraOptionsSummary}</span><code>{combinedExtraArgs || text.extraOptionsEmpty}</code></div>
        </section>
        <aside className="right-rail">
          <section className="panel telemetry">
            <div className="section-title"><span>{text.telemetry}</span><small>{text.telemetryHint}</small></div>
            <div className="telemetry-stack">
              <div className="progress-shell progress-shell--overview">
                <div className="progress-shell__header"><strong>{aggregateProgressLabel}</strong><span>{text.queueProgress}</span></div>
                <div className="progress-bar"><div className="progress-bar__fill" style={{ width: `${queue.total > 0 ? aggregateProgressPercent : 0}%` }} /></div>
                <div className="progress-meta progress-meta--wrap"><span>{text.pending}: {queue.pending}</span><span>{text.running}: {queue.running}</span><span>{text.done}: {queue.completed}</span><span>{text.failed}: {queue.failed}</span><span>{text.cancelled}: {queue.cancelled}</span></div>
              </div>
              <div className="job-view-tabs segmented" role="tablist" aria-label={text.taskList}>
                <button className={`segmented__item ${jobView === 'active' ? 'active' : ''}`} type="button" onClick={() => setJobView('active')}>
                  {text.activeJobView}<span>{queue.pending + queue.running}</span>
                </button>
                <button className={`segmented__item ${jobView === 'finished' ? 'active' : ''}`} type="button" onClick={() => setJobView('finished')}>
                  {text.finishedJobView}<span>{queue.completed}</span>
                </button>
                <button className={`segmented__item ${jobView === 'issues' ? 'active' : ''}`} type="button" onClick={() => setJobView('issues')}>
                  {text.issueJobView}<span>{queue.failed + queue.cancelled}</span>
                </button>
              </div>
              <div className={`task-map task-map--${jobView}`}>
                <div className="task-map__header">
                  <div>
                    <strong>{currentJobViewTitle}</strong>
                    <small>{currentJobViewHint}</small>
                  </div>
                  <span>{text.taskTotal}: {taskTiles.length} · {currentJobViewTitle}: {currentJobViewCount}</span>
                </div>
                {currentTaskTiles.length > 0 ? (
                  <div className="task-map__grid" aria-label={currentJobViewTitle}>
                    {currentTaskTiles.map((tile) => (
                      <button
                        className={`task-tile task-tile--${tile.status}`}
                        key={`${jobView}-task-tile-${tile.index}`}
                        title={`${tile.index}. ${tile.title || taskTileStatusLabel(tile.status, text)} · ${taskTileStatusLabel(tile.status, text)}`}
                        type="button"
                        disabled={!sortedJobs.find((item) => item.index === tile.index)}
                        onClick={() => {
                          const job = sortedJobs.find((item) => item.index === tile.index)
                          if (job) setSelectedLogJobId(job.jobId)
                        }}
                      >
                        <strong>{tile.index}</strong>
                        <span>{getTaskTileText(tile, text)}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="job-empty job-empty--compact">{jobView === 'active' ? text.taskListIdle : currentJobViewHint}</div>
                )}
              </div>
            </div>
            <div className={`job-grid job-grid--${jobView}`}>
              <div className="section-title section-title--tight"><span>{currentJobViewTitle}</span><small>{currentJobViewHint}</small></div>
              {currentDownloadJobs.length > 0 ? (
                currentDownloadJobs.map((job) => (
                  <div className={`job-card job-card--${job.status}`} key={job.jobId}>
                    <div className="job-card__header">
                      <div className="job-card__title">
                        <span className="job-card__index">{text.taskNumber.replace('{index}', String(job.index))}</span>
                        <strong>{job.title}</strong>
                      </div>
                      <span>{statusLabel(job.status, text)}</span>
                    </div>
                    <p className="job-card__url">{job.url}</p>
                    <div className="progress-bar progress-bar--small"><div className="progress-bar__fill" style={{ width: `${job.percent === null ? 0 : clampPercent(job.percent)}%` }} /></div>
                    <div className="progress-meta progress-meta--wrap"><span>{getJobProgressText(job, text)}</span><span>{text.downloaded}: {job.downloaded}</span><span>{text.total}: {job.total}</span><span>{text.eta}: {job.eta}</span><span>{job.speed}</span></div>
                    <button className="ghost-button ghost-button--full" type="button" onClick={() => setSelectedLogJobId(job.jobId)}>{text.viewJobLog}</button>
                    {job.outputPath ? <button className="ghost-button ghost-button--full" type="button" onClick={() => void appApi.showItemInFolder(job.outputPath ?? '')}>{text.openFile}</button> : null}
                  </div>
                ))
              ) : (
                <div className="job-empty job-empty--compact">{currentJobViewHint}</div>
              )}
            </div>
            {activeCommand ? (
              <div className="telemetry-meta-grid">
                <div className="command-box"><span>{text.currentCommand}</span><code>{activeCommand}</code></div>
              </div>
            ) : null}
          </section>
          <section className="panel history">
            <div className="section-title"><span>{text.recentJobs}</span><div className="section-actions"><small>{text.recentJobsHint}</small><button className="ghost-button ghost-button--small" type="button" onClick={() => { setHistory([]); removeStorageItem(HISTORY_KEY) }}>{text.clearHistory}</button></div></div>
            <div className="history-list">
              {history.length === 0 ? <div className="history-empty">{text.noHistory}</div> : history.map((item) => (
                <button className="history-item" key={item.id} type="button" onClick={() => { setLinkInputs(Array.isArray(item.urls) && item.urls.length > 0 ? item.urls : ['']); setOutputDir(item.outputDir); setMode(item.mode); setStatusMessage(text.copiedFromHistory) }}>
                  <div className="history-item__content">
                    <strong>{item.title || (item.mode === 'audio' ? text.audioExtract : text.videoDownload)}</strong>
                    <p>{(Array.isArray(item.urls) ? item.urls : []).join(' | ')}</p>
                  </div>
                  <div className={`history-badge history-badge--${item.status}`}>{statusLabel(item.status, text)}</div>
                </button>
              ))}
            </div>
          </section>
          <section className="panel logs">
            <div className="section-title">
              <span>{text.logs}</span>
              <div className="section-actions">
                <small>{text.logsHint}</small>
                <button className="ghost-button ghost-button--small" type="button" onClick={() => void exportAllLogs()}>{text.exportLog}</button>
              </div>
            </div>
            <div className="log-viewer" ref={logViewerRef}>{visibleLogs.length === 0 ? <div className="log-placeholder">{text.noLogs}</div> : visibleLogs.map((line, index) => <div className="log-line" key={`${line}-${index}`}>{line}</div>)}</div>
          </section>
        </aside>
      </main>
      )}
      {selectedLogJobId ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setSelectedLogJobId(null)}>
          <section className="job-log-modal" role="dialog" aria-modal="true" aria-label={selectedTaskLogTitle} onClick={(event) => event.stopPropagation()}>
            <div className="section-title">
              <div>
                <span>{selectedTaskLogTitle}</span>
                <small>{selectedLogJob?.title || selectedLogJob?.url || selectedLogJobId}</small>
              </div>
              <div className="section-actions">
                <button className="ghost-button ghost-button--small" type="button" onClick={() => void copySelectedJobLog()}>{selectedCopyLogLabel}</button>
                <button className="ghost-button ghost-button--small" type="button" onClick={() => void exportSelectedJobLog()}>{selectedExportLogLabel}</button>
                <button className="ghost-button ghost-button--small" type="button" onClick={() => setSelectedLogJobId(null)}>{text.close}</button>
              </div>
            </div>
            <div className="job-log-meta">
              {selectedLogJob ? (
                <>
                  <span>{statusLabel(selectedLogJob.status, text)}</span>
                  <span>{selectedLogJob.percent !== null ? `${selectedLogJob.percent.toFixed(1)}%` : text.waiting}</span>
                  {selectedLogJob.exitCode !== undefined ? <span>exit: {selectedLogJob.exitCode ?? 'unknown'}</span> : null}
                </>
              ) : null}
            </div>
            <div className="job-log-viewer">
              {selectedLogLines.length === 0 ? (
                <div className="log-placeholder">{text.jobLogEmpty}</div>
              ) : selectedLogLines.map((line, index) => (
                <div className="log-line" key={`${selectedLogJobId}-${index}-${line}`}>{line}</div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}

export default App
