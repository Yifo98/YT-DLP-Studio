import { useEffect, useMemo, useState } from 'react'
import { appApi } from './services/appApi'
import { readJsonStorage, writeJsonStorage } from './services/localStore'
import { getThemeLabel, isTheme, THEME_OPTIONS, type Theme } from './themeOptions'

type Language = 'zh' | 'en'
type MediaToolAction = 'extractAudio' | 'extractSubtitles'
type MediaAudioExportFormat = 'mp3' | 'wav' | 'flac' | 'm4a'
type MediaSubtitleExportFormat = 'srt' | 'ass' | 'vtt'
type MediaMergeMode = 'selection' | 'folder'
type MediaMergeOutputFormat = 'mp4' | 'mkv' | 'mov'
type CleanupConnectionState = 'idle' | 'success' | 'error'
type CleanupBaseUrlPresetId = string | 'custom'
type CleanupBaseUrlPreset = {
  id: string
  label: string
  url: string
  source: 'builtin' | 'custom'
}

type MediaToolsViewProps = {
  embedded?: boolean
  onBack?: () => void
}

const STORAGE_KEY = 'yt-dlp-studio.preferences'

type UiPrefs = {
  language: Language
  theme: Theme
}

function readUiPrefs(): UiPrefs {
  const parsed = readJsonStorage<Partial<UiPrefs>>(STORAGE_KEY, {})
  return {
    language: parsed.language === 'en' ? 'en' : 'zh',
    theme: isTheme(parsed.theme) ? parsed.theme : 'graphite',
  }
}

function persistUiPrefs(next: Partial<UiPrefs>) {
  const current = readUiPrefs()
  writeJsonStorage(STORAGE_KEY, { ...current, ...next })
}

function getDirectoryFromPath(filePath: string) {
  const normalized = filePath.trim()
  if (!normalized) return ''
  const separatorIndex = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  if (separatorIndex < 0) return normalized
  return normalized.slice(0, separatorIndex)
}

function formatDuration(seconds: number | null, language: Language) {
  if (seconds === null) return language === 'zh' ? '未知' : 'Unknown'
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return [h, m, s].map((part) => String(part).padStart(2, '0')).join(':')
}

function formatBytes(bytes: number | null, language: Language) {
  if (bytes === null) return language === 'zh' ? '未知' : 'Unknown'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${units[unitIndex]}`
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

function getPathBaseName(filePath: string) {
  const normalized = filePath.trim().replace(/\\/g, '/')
  if (!normalized) return ''
  return normalized.split('/').filter(Boolean).at(-1) ?? normalized
}

function getPathStem(filePath: string) {
  const baseName = getPathBaseName(filePath)
  const dotIndex = baseName.lastIndexOf('.')
  return dotIndex > 0 ? baseName.slice(0, dotIndex) : baseName
}

function sanitizePreviewBaseName(value: string) {
  return value
    .trim()
    .split('')
    .map((char) => (char.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(char) ? ' ' : char))
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .slice(0, 140)
    .trim()
}

function getDefaultCleanupConfig(): SubtitleCleanupConfig {
  return {
    baseUrl: '',
    apiKey: '',
    model: '',
    prompt: '',
    thinkingMode: 'default',
    customPresets: [],
    providerProfiles: {},
  }
}

function mergeModelOptions(current: string[], selectedModel: string) {
  return [...new Set([...current, selectedModel].filter(Boolean))].sort((left, right) => left.localeCompare(right))
}

function getCleanupBaseUrlPresets(language: Language): CleanupBaseUrlPreset[] {
  return [
    {
      id: 'openai',
      label: language === 'zh' ? 'OpenAI 官方' : 'OpenAI',
      url: 'https://api.openai.com',
      source: 'builtin',
    },
    {
      id: 'openrouter',
      label: 'OpenRouter',
      url: 'https://openrouter.ai/api',
      source: 'builtin',
    },
    {
      id: 'deepseek',
      label: 'DeepSeek',
      url: 'https://api.deepseek.com',
      source: 'builtin',
    },
    {
      id: 'siliconflow',
      label: 'SiliconFlow',
      url: 'https://api.siliconflow.cn',
      source: 'builtin',
    },
    {
      id: 'ark',
      label: language === 'zh' ? '火山方舟 Ark' : 'Volcengine Ark',
      url: 'https://ark.cn-beijing.volces.com/api/v3',
      source: 'builtin',
    },
    {
      id: 'dashscope',
      label: language === 'zh' ? '阿里云百炼 DashScope' : 'DashScope',
      url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      source: 'builtin',
    },
  ]
}

function getSavedCleanupBaseUrlPresets(customPresets: SubtitleCleanupCustomPreset[]): CleanupBaseUrlPreset[] {
  return customPresets.map((item) => ({
    ...item,
    source: 'custom',
  }))
}

function getCleanupBaseUrlPresetId(presets: CleanupBaseUrlPreset[], baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, '')
  if (!normalized) {
    return 'custom'
  }

  const matched = presets.find((item) => item.url.replace(/\/+$/, '') === normalized)
  return matched?.id ?? 'custom'
}

function buildCleanupProviderProfile(input?: Partial<SubtitleCleanupProviderProfile> | null): SubtitleCleanupProviderProfile {
  return {
    baseUrl: input?.baseUrl?.trim() ?? '',
    apiKey: input?.apiKey?.trim() ?? '',
    model: input?.model?.trim() ?? '',
  }
}

function getDefaultCleanupProviderProfile(
  presetId: CleanupBaseUrlPresetId,
  presets: CleanupBaseUrlPreset[],
): SubtitleCleanupProviderProfile {
  const matchedPreset = presets.find((item) => item.id === presetId)
  return buildCleanupProviderProfile({
    baseUrl: matchedPreset?.url ?? '',
    apiKey: '',
    model: '',
  })
}

const SUBTITLE_EDIT_RELEASES_URL = 'https://github.com/SubtitleEdit/subtitleedit/releases'

function getCopy(language: Language) {
  return language === 'zh'
    ? {
        eyebrow: 'TOOLS',
        title: '本地媒体。',
        copy: '处理电脑里已有的文件：音视频合并、音轨整理、字幕导出和字幕清洗都在这里完成。',
        language: '语言',
        theme: '背景',
        inputFile: '输入文件',
        outputDir: '输出目录',
        pickFile: '选择媒体文件',
        pickOutput: '选择输出目录',
        inspect: '读取媒体信息',
        refresh: '重新识别',
        openFolder: '打开输出目录',
        closeWindow: '关闭窗口',
        backToDownload: '返回下载面板',
        tools: '处理动作',
        toolsHint: '先勾选动作，再统一点开始。支持单选，也支持多选顺序执行。',
        toolsNavigator: '功能选择',
        toolsNavigatorHint: '先在这里切换功能区，就不用反复往下翻。',
        toolsNavigatorMedia: '媒体处理',
        toolsNavigatorMerge: '音视频合并',
        toolsNavigatorCleanup: '字幕整理',
        extractAudio: '音轨分离',
        extractAudioDesc: '把本地视频里的音频导出成单独文件，适合剪辑、播客或调音。',
        extractSubtitles: '字幕分离',
        extractSubtitlesDesc: '把文件里已有的字幕轨单独导出来。只有源文件本身带字幕流时才做得了。',
        mergeTitle: '分离文件合并',
        mergeHint: '一次选择多个分离文件，或直接选择整个文件夹；系统按流类型和时长差配对，不再依赖文件名相似度。',
        mergeMode: '选择范围',
        mergeModeSingle: '多选文件',
        mergeModeBatch: '整个文件夹',
        mergeVideoFile: '已选文件',
        mergeAudioFile: '音轨来源',
        mergeInputFolder: '待识别文件夹',
        mergePickVideo: '选择多个文件',
        mergePickAudio: '自动识别音轨',
        mergePickFolder: '选择文件夹',
        mergeOutputFormat: '输出封装',
        mergeFormatHint: 'MP4 通用，MKV 容错；MOV 会转成 ProRes 422 + PCM，适合达芬奇后期但文件更大。',
        mergeOutputName: '输出名称',
        mergeOutputNamePlaceholder: '留空则按视频文件名自动命名',
        mergeOutputNameHint: '只有一组配对时会直接使用这个名称；多组配对会自动追加 01、02，避免互相覆盖。',
        mergeOutputPreview: '名称预览',
        mergeOutputPreviewDefault: '未填写自定义名称：{name}',
        mergeOutputPreviewCustom: '当前输出示例：{name}',
        mergeOutputPreviewMissing: '选择文件或文件夹后会显示更贴近实际的文件名。',
        mergeOutputHint: '配对只按视频和音轨的时长差判断；MP4/MKV 优先无损复制，MOV 会转成 ProRes 422 + PCM。',
        mergePreviewTitle: '合并预览',
        mergePreviewHint: '这里会显示识别到的流、预计配对、大小和时长。',
        mergePreviewLoading: '正在读取媒体流...',
        mergePreviewEmpty: '选择文件或文件夹后会自动预览。',
        mergePreviewInputCount: '候选文件',
        mergePreviewVideoCount: '视频流',
        mergePreviewAudioCount: '音轨流',
        mergePreviewPairCount: '可合并',
        mergePreviewSize: '预计大小',
        mergePreviewDuration: '预计时长',
        mergePreviewTotalDuration: '全部合计',
        mergePreviewPairs: '预计配对',
        mergePreviewNoPairs: '还没有找到可合并的视频/音轨配对。',
        mergePreviewReady: '合并预览已生成，确认后再点击合并已选配对。',
        mergePreviewDiff: '时长差',
        mergePreviewTracks: '视频内音轨 {video} · 外部音轨 {audio}',
        mergePreviewOutput: '输出',
        mergePreviewUnmatched: '未配对：视频 {video}，音轨 {audio}',
        mergePreviewSkipped: '已跳过 {count} 个不可用文件。',
        mergeRunSingle: '合并已选配对',
        mergeRunBatch: '合并文件夹配对',
        mergeMissingVideo: '先选择至少一个分离媒体文件。',
        mergeMissingAudio: '系统会自动识别哪些是视频、哪些是音轨。',
        mergeMissingFolder: '先选择一个待识别文件夹。',
        mergeMissingOutput: '先选择输出目录。',
        mergeRunningSingle: '正在扫描并合并已选文件。',
        mergeRunningBatch: '正在扫描并合并文件夹内的分离文件。',
        mergeFinished: '已完成 {count} 个音视频合并任务。',
        subtitleUnavailable: '当前文件没有检测到字幕流，这项现在不能做。',
        subtitleExternalHint: '如果这是硬字幕或根本没有内封字幕，建议改用 Subtitle Edit 这类 OCR 工具来识别字幕。',
        subtitleExternalAction: '打开 Subtitle Edit',
        audioFormat: '音频导出格式',
        subtitleFormat: '字幕导出格式',
        audioFormatHint: 'WAV / FLAC 更适合后期，MP3 / M4A 更适合轻量整理和分享。',
        subtitleFormatHint: 'SRT 最通用，ASS 适合保留样式，VTT 更偏网页和平台场景。',
        subtitleTracks: '字幕轨选择',
        subtitleTracksHint: '只会导出你勾选的字幕轨。空着不选时，默认导出全部字幕轨。',
        noSubtitleTracks: '当前文件没有可选字幕轨。',
        selectedActions: '已选动作',
        noneSelected: '还没有勾选任何动作。',
        run: '开始处理',
        cancel: '停止处理',
        streams: '流信息',
        streamsHint: '这里会告诉你这个文件到底有没有视频流、音频流、字幕流。',
        summary: '怎么理解这些功能',
        summaryItems: [
          '网页下载窗口: 负责从链接抓视频、字幕、封面、简介。',
          '本地媒体工具: 负责对已经下载好的文件做音轨分离、音视频合并、字幕分离、字幕清洗。',
          '字幕分离不是“识别字幕”，而是“提取已有字幕轨”。',
        ],
        status: '状态',
        waiting: '还没有选择文件。',
        fileReady: '媒体信息读取完成。',
        chooseFirst: '先选一个本地媒体文件。',
        chooseAction: '先勾选至少一个处理动作。',
        subtitleMissingError: '这个文件没有字幕流，所以“字幕分离”现在做不了。先看右侧流信息里有没有 subtitle。',
        runPlan: '本次会按顺序执行你勾选的动作。',
        logs: '处理日志',
        noLogs: '这里会显示 ffmpeg / ffprobe / 模型请求日志。',
        command: '当前命令',
        outputFiles: '输出文件',
        progress: '任务进度',
        progressHint: '这里显示当前正在跑什么，以及目前产出的文件数量。',
        activeTask: '当前任务',
        activeTaskIdle: '还没有开始处理。',
        progressOutputs: '已输出文件',
        progressLogs: '日志行数',
        progressTracks: '字幕轨数',
        progressFiles: '批量进度',
        progressCurrentFile: '当前文件',
        progressReady: '准备就绪',
        progressRunning: '处理中',
        progressFinished: '处理完成',
        progressStopped: '已停止',
        runtimeTitle: '工具环境',
        runtimeHint: '这里会显示当前识别到的媒体核心、下载核心和 Deno 状态。',
        runtimePathDetails: '路径明细',
        runtimeDownloadCore: '下载核心',
        runtimeRefresh: '刷新环境',
        runtimeRefreshing: '刷新中...',
        runtimeSource: '工具来源',
        runtimeDenoReady: '已检测到 Deno',
        runtimeDenoMissing: '未检测到 Deno',
        runtimeRefreshedReady: '环境已刷新，Deno 已就绪。',
        runtimeRefreshedMissing: '环境已刷新，暂时还没检测到 Deno。',
        runtimeRefreshFailed: '环境刷新失败。',
        statusIdle: '待命',
        statusRunning: '处理中',
        statusSuccess: '完成',
        statusError: '错误',
        statusCancelled: '已取消',
        video: '视频',
        audio: '音频',
        subtitle: '字幕',
        other: '其他',
        notFound: '没有检测到相关流。',
        trackLabel: '轨道',
        languageLabel: '语言',
        titleLabel: '标题',
        cleanupTitle: '字幕整理',
        cleanupHint: '处理本地字幕文件，把时间戳、编号、样式噪音整理成适合阅读的纯文本。',
        cleanupMode: '处理模式',
        cleanupModeSingle: '单个文件',
        cleanupModeBatch: '批量文件夹',
        cleanupSingleInput: '字幕文件',
        cleanupBatchInput: '字幕文件夹',
        cleanupPickFile: '选择字幕文件',
        cleanupPickFolder: '选择字幕文件夹',
        cleanupOutputDir: '整理输出目录',
        cleanupPickOutput: '选择整理输出目录',
        cleanupOutputHint: '字幕整理会优先写到这里，不再强行跟媒体导出共用一个目录。',
        cleanupSkipExisting: '跳过已存在输出文件',
        cleanupSkipExistingHint: '如果目标目录里已经有同名 `.cleaned.txt`，批量时就直接跳过，避免重复覆盖。',
        cleanupApiTitle: '模型连接',
        cleanupApiHint: '先填 Base URL 和 API Key，再拉取模型列表。选好模型后再做连接测试。',
        cleanupBaseUrlPreset: '常用服务商',
        cleanupBaseUrlPresetHint: '可以先选常用 URL 预设，再补 API Key；如果不在列表里，直接切到“自定义”。',
        cleanupBaseUrlCustom: '自定义',
        cleanupCustomPresetName: '自定义名称',
        cleanupCustomPresetNameHint: '给这套自定义接口起个名字，保存后下次就能直接选。',
        cleanupSaveCustomPreset: '保存为自定义',
        cleanupUpdateCustomPreset: '更新当前自定义',
        cleanupDeleteCustomPreset: '删除当前自定义',
        cleanupSavedPresets: '我的自定义服务',
        cleanupBuiltinPresets: '内置服务商',
        cleanupCustomPresetSaved: '当前自定义接口已保存。',
        cleanupCustomPresetUpdated: '当前自定义接口已更新。',
        cleanupCustomPresetDeleted: '当前自定义接口已删除。',
        cleanupCustomPresetMissingName: '先给这套自定义接口起个名字。',
        cleanupCustomPresetMissingUrl: '先填一个可用的 Base URL，再保存自定义。',
        cleanupCustomPresetDeleteHint: '只有你选中了某个已保存的自定义服务时，这个按钮才会生效。',
        cleanupBaseUrl: 'Base URL',
        cleanupApiKey: 'API Key',
        cleanupModel: '模型',
        cleanupPrompt: '整理提示词',
        cleanupPromptHint: '默认提示词已经尽量保守，不摘要、不删案例。你可以按需要继续微调。',
        cleanupThinkingMode: '推理模式',
        cleanupThinkingModeHint: '纯文本整理建议优先走快模式。对支持的服务商会自动尝试关闭思考；DeepSeek 建议直接选 chat 模型。',
        cleanupThinkingModeDefault: '按服务商默认',
        cleanupThinkingModeDisabled: '更快（尽量关闭思考）',
        cleanupThinkingHintDeepSeek: 'DeepSeek 做字幕整理建议优先选 deepseek-chat；deepseek-reasoner 会明显更慢。',
        cleanupThinkingHintBigModel: '智谱这类默认带思考的模型，开启“更快”后会自动尝试关闭 thinking。',
        cleanupFetchModels: '拉取模型列表',
        cleanupFetchModelsLoading: '拉取中...',
        cleanupTest: '连接测试',
        cleanupTesting: '测试中...',
        cleanupRunSingle: '整理当前字幕',
        cleanupRunBatch: '批量整理文件夹',
        cleanupCancel: '停止整理',
        cleanupConnectionIdle: '还没有做连接测试。',
        cleanupModelPlaceholder: '先拉取模型，再从这里选一个',
        cleanupModelHint: '支持 OpenAI-compatible 的 `/v1/models` 与 `/v1/chat/completions`。',
        cleanupMissingSingle: '先选择一个字幕文件。',
        cleanupMissingBatch: '先选择一个字幕文件夹。',
        cleanupMissingModel: '先填好 Base URL、API Key，并选一个模型。',
      }
    : {
        eyebrow: 'TOOLS',
        title: 'Local Media.',
        copy: 'Work on files already on your machine: merge tracks, prepare audio, export subtitles, and clean text.',
        language: 'Language',
        theme: 'Theme',
        inputFile: 'Input file',
        outputDir: 'Output folder',
        pickFile: 'Choose media file',
        pickOutput: 'Choose output folder',
        inspect: 'Inspect media',
        refresh: 'Refresh',
        openFolder: 'Open output folder',
        closeWindow: 'Close window',
        backToDownload: 'Back to downloads',
        tools: 'Actions',
        toolsHint: 'Select one or more actions first, then press start once.',
        toolsNavigator: 'Feature switch',
        toolsNavigatorHint: 'Switch between work areas here instead of scrolling through the whole page every time.',
        toolsNavigatorMedia: 'Media tools',
        toolsNavigatorMerge: 'Merge tracks',
        toolsNavigatorCleanup: 'Subtitle cleanup',
        extractAudio: 'Extract audio',
        extractAudioDesc: 'Export the local video audio as a separate file for editing or cleanup.',
        extractSubtitles: 'Extract subtitles',
        extractSubtitlesDesc: 'Export subtitle streams already embedded in the file.',
        mergeTitle: 'Merge separated files',
        mergeHint: 'Select multiple separated files or a whole folder. The app pairs by stream type and duration difference, not name similarity.',
        mergeMode: 'Selection scope',
        mergeModeSingle: 'Multiple files',
        mergeModeBatch: 'Whole folder',
        mergeVideoFile: 'Selected files',
        mergeAudioFile: 'Audio source',
        mergeInputFolder: 'Folder to detect',
        mergePickVideo: 'Choose files',
        mergePickAudio: 'Auto-detect audio',
        mergePickFolder: 'Choose folder',
        mergeOutputFormat: 'Output container',
        mergeFormatHint: 'MP4 is universal; MKV is tolerant. MOV transcodes to ProRes 422 + PCM for DaVinci Resolve and creates larger files.',
        mergeOutputName: 'Output name',
        mergeOutputNamePlaceholder: 'Leave empty to use the video file name',
        mergeOutputNameHint: 'One pair uses this name directly. Multiple pairs append 01, 02, and so on to avoid overwrites.',
        mergeOutputPreview: 'Name preview',
        mergeOutputPreviewDefault: 'Without a custom name: {name}',
        mergeOutputPreviewCustom: 'Current output example: {name}',
        mergeOutputPreviewMissing: 'Choose files or a folder to see a more realistic name.',
        mergeOutputHint: 'Pairing only uses video/audio duration difference. MP4/MKV use stream copy first; MOV transcodes to ProRes 422 + PCM.',
        mergePreviewTitle: 'Merge preview',
        mergePreviewHint: 'Shows detected streams, planned pairs, estimated size, and duration.',
        mergePreviewLoading: 'Reading media streams...',
        mergePreviewEmpty: 'Choose files or a folder to preview the merge plan.',
        mergePreviewInputCount: 'Candidates',
        mergePreviewVideoCount: 'Video streams',
        mergePreviewAudioCount: 'Audio streams',
        mergePreviewPairCount: 'Mergeable',
        mergePreviewSize: 'Est. size',
        mergePreviewDuration: 'Est. duration',
        mergePreviewTotalDuration: 'Total duration',
        mergePreviewPairs: 'Planned pairs',
        mergePreviewNoPairs: 'No mergeable video/audio pairs found yet.',
        mergePreviewReady: 'Merge preview is ready. Click merge selected pairs when you are ready.',
        mergePreviewDiff: 'Duration diff',
        mergePreviewTracks: 'video audio {video} · external audio {audio}',
        mergePreviewOutput: 'Output',
        mergePreviewUnmatched: 'Unmatched: video {video}, audio {audio}',
        mergePreviewSkipped: 'Skipped {count} unusable file(s).',
        mergeRunSingle: 'Merge selected pairs',
        mergeRunBatch: 'Merge folder pairs',
        mergeMissingVideo: 'Choose at least one separated media file first.',
        mergeMissingAudio: 'The app automatically detects video files and audio files.',
        mergeMissingFolder: 'Choose a folder to scan first.',
        mergeMissingOutput: 'Choose an output folder first.',
        mergeRunningSingle: 'Scanning and merging selected files.',
        mergeRunningBatch: 'Scanning and merging separated files in the folder.',
        mergeFinished: 'Finished {count} media merge task(s).',
        subtitleUnavailable: 'No subtitle stream was detected in this file.',
        subtitleExternalHint: 'If this is hardsubbed video or the file has no embedded subtitle track, use an OCR tool like Subtitle Edit instead.',
        subtitleExternalAction: 'Open Subtitle Edit',
        audioFormat: 'Audio export format',
        subtitleFormat: 'Subtitle export format',
        audioFormatHint: 'WAV / FLAC are better for post-production. MP3 / M4A are lighter and easier to share.',
        subtitleFormatHint: 'SRT is the most universal. ASS keeps styling. VTT is better for web workflows.',
        subtitleTracks: 'Subtitle track selection',
        subtitleTracksHint: 'Only the checked subtitle tracks will be exported. If none are checked, all subtitle tracks are exported.',
        noSubtitleTracks: 'No subtitle tracks available in this file.',
        selectedActions: 'Selected actions',
        noneSelected: 'No action selected yet.',
        run: 'Start processing',
        cancel: 'Cancel',
        streams: 'Stream info',
        streamsHint: 'This tells you whether the file actually contains video, audio, or subtitle streams.',
        summary: 'How to read these tools',
        summaryItems: [
          'The web download window fetches video, subtitles, thumbnails, and descriptions from links.',
          'Local media tools work on files you already downloaded, including audio/video merge and subtitle cleanup.',
          'Subtitle extraction does not create subtitles. It only exports subtitle tracks that already exist.',
        ],
        status: 'Status',
        waiting: 'No file selected yet.',
        fileReady: 'Media inspection finished.',
        chooseFirst: 'Pick a local media file first.',
        chooseAction: 'Select at least one action first.',
        subtitleMissingError: 'This file does not contain subtitle streams, so subtitle extraction cannot run.',
        runPlan: 'The selected actions will run one by one in order.',
        logs: 'Tool logs',
        noLogs: 'ffmpeg / ffprobe / model logs will appear here.',
        command: 'Current command',
        outputFiles: 'Output files',
        progress: 'Task progress',
        progressHint: 'Shows what is currently running and how many outputs have already been produced.',
        activeTask: 'Active task',
        activeTaskIdle: 'Nothing is running yet.',
        progressOutputs: 'Outputs',
        progressLogs: 'Log lines',
        progressTracks: 'Subtitle tracks',
        progressFiles: 'Batch progress',
        progressCurrentFile: 'Current file',
        progressReady: 'Ready',
        progressRunning: 'Running',
        progressFinished: 'Finished',
        progressStopped: 'Stopped',
        runtimeTitle: 'Runtime',
        runtimeHint: 'Shows the currently detected media core, download core, and Deno runtime state.',
        runtimePathDetails: 'Path details',
        runtimeDownloadCore: 'Download core',
        runtimeRefresh: 'Refresh runtime',
        runtimeRefreshing: 'Refreshing...',
        runtimeSource: 'Tool source',
        runtimeDenoReady: 'Deno detected',
        runtimeDenoMissing: 'Deno missing',
        runtimeRefreshedReady: 'Runtime refreshed. Deno is available.',
        runtimeRefreshedMissing: 'Runtime refreshed. Deno is still missing.',
        runtimeRefreshFailed: 'Failed to refresh runtime.',
        statusIdle: 'Idle',
        statusRunning: 'Running',
        statusSuccess: 'Done',
        statusError: 'Error',
        statusCancelled: 'Cancelled',
        video: 'Video',
        audio: 'Audio',
        subtitle: 'Subtitle',
        other: 'Other',
        notFound: 'No matching streams found.',
        trackLabel: 'Track',
        languageLabel: 'Language',
        titleLabel: 'Title',
        cleanupTitle: 'Subtitle cleanup',
        cleanupHint: 'Turn local subtitle files into readable plain text by removing timestamps, indexes, and style noise.',
        cleanupMode: 'Cleanup mode',
        cleanupModeSingle: 'Single file',
        cleanupModeBatch: 'Batch folder',
        cleanupSingleInput: 'Subtitle file',
        cleanupBatchInput: 'Subtitle folder',
        cleanupPickFile: 'Choose subtitle file',
        cleanupPickFolder: 'Choose subtitle folder',
        cleanupOutputDir: 'Cleanup output folder',
        cleanupPickOutput: 'Choose cleanup output folder',
        cleanupOutputHint: 'Subtitle cleanup writes here first instead of forcing the main media output folder.',
        cleanupSkipExisting: 'Skip existing output files',
        cleanupSkipExistingHint: 'When a matching `.cleaned.txt` already exists in the output folder, batch cleanup will skip it instead of overwriting it.',
        cleanupApiTitle: 'Model connection',
        cleanupApiHint: 'Fill Base URL and API key first, load the model list, then test the selected model.',
        cleanupBaseUrlPreset: 'Common provider',
        cleanupBaseUrlPresetHint: 'Pick a common URL preset first, then fill the API key. Switch to Custom anytime.',
        cleanupBaseUrlCustom: 'Custom',
        cleanupCustomPresetName: 'Custom name',
        cleanupCustomPresetNameHint: 'Give this custom endpoint a name so you can reuse it later.',
        cleanupSaveCustomPreset: 'Save custom preset',
        cleanupUpdateCustomPreset: 'Update current custom',
        cleanupDeleteCustomPreset: 'Delete current custom',
        cleanupSavedPresets: 'My custom presets',
        cleanupBuiltinPresets: 'Built-in providers',
        cleanupCustomPresetSaved: 'Current custom endpoint has been saved.',
        cleanupCustomPresetUpdated: 'Current custom endpoint has been updated.',
        cleanupCustomPresetDeleted: 'Current custom endpoint has been deleted.',
        cleanupCustomPresetMissingName: 'Enter a name for this custom endpoint first.',
        cleanupCustomPresetMissingUrl: 'Enter a valid Base URL before saving this custom preset.',
        cleanupCustomPresetDeleteHint: 'This is only enabled when a saved custom preset is currently selected.',
        cleanupBaseUrl: 'Base URL',
        cleanupApiKey: 'API Key',
        cleanupModel: 'Model',
        cleanupPrompt: 'Cleanup prompt',
        cleanupPromptHint: 'The default prompt aims to preserve everything and avoid summarizing. Tune it only when needed.',
        cleanupThinkingMode: 'Reasoning mode',
        cleanupThinkingModeHint: 'For plain text cleanup, fast mode is usually better. Supported providers will try to disable thinking automatically; for DeepSeek, prefer the chat model.',
        cleanupThinkingModeDefault: 'Provider default',
        cleanupThinkingModeDisabled: 'Faster (prefer no thinking)',
        cleanupThinkingHintDeepSeek: 'For subtitle cleanup, DeepSeek works best with deepseek-chat. The reasoner model will be noticeably slower.',
        cleanupThinkingHintBigModel: 'For BigModel / Zhipu-style providers, fast mode will try to disable thinking automatically.',
        cleanupFetchModels: 'Load models',
        cleanupFetchModelsLoading: 'Loading...',
        cleanupTest: 'Test connection',
        cleanupTesting: 'Testing...',
        cleanupRunSingle: 'Clean current subtitle',
        cleanupRunBatch: 'Clean subtitle folder',
        cleanupCancel: 'Stop cleanup',
        cleanupConnectionIdle: 'Connection test has not been run yet.',
        cleanupModelPlaceholder: 'Load models first, then pick one here',
        cleanupModelHint: 'Uses OpenAI-compatible `/v1/models` and `/v1/chat/completions`.',
        cleanupMissingSingle: 'Choose a subtitle file first.',
        cleanupMissingBatch: 'Choose a subtitle folder first.',
        cleanupMissingModel: 'Fill Base URL, API key, and select a model first.',
      }
}

function classifyStream(stream: MediaStreamInfo, copy: ReturnType<typeof getCopy>) {
  if (stream.codecType === 'video') return copy.video
  if (stream.codecType === 'audio') return copy.audio
  if (stream.codecType === 'subtitle') return copy.subtitle
  return copy.other
}

function statusLabel(status: DownloadStatus, copy: ReturnType<typeof getCopy>) {
  if (status === 'running') return copy.statusRunning
  if (status === 'success') return copy.statusSuccess
  if (status === 'error') return copy.statusError
  if (status === 'cancelled') return copy.statusCancelled
  return copy.statusIdle
}

export default function MediaToolsView({ embedded = false, onBack }: MediaToolsViewProps = {}) {
  const initialUi = useMemo(() => readUiPrefs(), [])
  const [language, setLanguage] = useState<Language>(initialUi.language)
  const [theme, setTheme] = useState<Theme>(initialUi.theme)
  const [inputPath, setInputPath] = useState('')
  const [outputDir, setOutputDir] = useState('')
  const [inspection, setInspection] = useState<MediaInspection | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [status, setStatus] = useState<DownloadStatus>('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [currentCommand, setCurrentCommand] = useState('')
  const [outputs, setOutputs] = useState<string[]>([])
  const [selectedActions, setSelectedActions] = useState<MediaToolAction[]>([])
  const [runningTaskLabel, setRunningTaskLabel] = useState('')
  const [audioFormat, setAudioFormat] = useState<MediaAudioExportFormat>('wav')
  const [subtitleFormat, setSubtitleFormat] = useState<MediaSubtitleExportFormat>('srt')
  const [selectedSubtitleTracks, setSelectedSubtitleTracks] = useState<number[]>([])
  const [mergeMode, setMergeMode] = useState<MediaMergeMode>('selection')
  const [mergeInputPaths, setMergeInputPaths] = useState<string[]>([])
  const [mergeInputDir, setMergeInputDir] = useState('')
  const [mergeOutputFormat, setMergeOutputFormat] = useState<MediaMergeOutputFormat>('mp4')
  const [mergeOutputName, setMergeOutputName] = useState('')
  const [mergePreview, setMergePreview] = useState<MediaMergePreviewResult | null>(null)
  const [mergePreviewKey, setMergePreviewKey] = useState('')
  const [mergePreviewLoading, setMergePreviewLoading] = useState(false)
  const [mergePreviewError, setMergePreviewError] = useState('')
  const [cleanupMode, setCleanupMode] = useState<SubtitleCleanupMode>('single')
  const [cleanupInputPath, setCleanupInputPath] = useState('')
  const [cleanupInputDir, setCleanupInputDir] = useState('')
  const [cleanupOutputDir, setCleanupOutputDir] = useState('')
  const [cleanupSkipExistingOutputs, setCleanupSkipExistingOutputs] = useState(true)
  const [cleanupConfig, setCleanupConfig] = useState<SubtitleCleanupConfig>(getDefaultCleanupConfig())
  const [cleanupConfigHydrated, setCleanupConfigHydrated] = useState(false)
  const [cleanupModelOptions, setCleanupModelOptions] = useState<string[]>([])
  const [cleanupModelsLoading, setCleanupModelsLoading] = useState(false)
  const [cleanupTesting, setCleanupTesting] = useState(false)
  const [cleanupConnectionState, setCleanupConnectionState] = useState<CleanupConnectionState>('idle')
  const [cleanupConnectionMessage, setCleanupConnectionMessage] = useState('')
  const [cleanupBaseUrlPresetSelection, setCleanupBaseUrlPresetSelection] = useState<CleanupBaseUrlPresetId>('custom')
  const [cleanupCustomPresetName, setCleanupCustomPresetName] = useState('')
  const [selectedToolSection, setSelectedToolSection] = useState<'media' | 'merge' | 'cleanup'>('media')
  const [taskProgress, setTaskProgress] = useState<{ current: number; total: number; currentPath: string } | null>(null)
  const [runtimePaths, setRuntimePaths] = useState<AppPaths | null>(null)
  const [runtimeToolsSource, setRuntimeToolsSource] = useState<'bundled' | 'external'>('external')
  const [runtimeRefreshing, setRuntimeRefreshing] = useState(false)
  const copy = getCopy(language)
  const builtinCleanupBaseUrlPresets = useMemo(() => getCleanupBaseUrlPresets(language), [language])
  const savedCleanupBaseUrlPresets = useMemo(() => getSavedCleanupBaseUrlPresets(cleanupConfig.customPresets), [cleanupConfig.customPresets])
  const cleanupBaseUrlPresets = useMemo(
    () => [...builtinCleanupBaseUrlPresets, ...savedCleanupBaseUrlPresets],
    [builtinCleanupBaseUrlPresets, savedCleanupBaseUrlPresets],
  )
  const normalizedTitle = copy.title.replace(/[。.]$/, '')
  const subtitleStreams = inspection?.streams.filter((stream) => stream.codecType === 'subtitle') ?? []
  const hasSubtitleStream = subtitleStreams.length > 0
  const progressValue = status === 'running'
    ? taskProgress && taskProgress.total > 0
      ? Math.max(8, Math.min(96, (taskProgress.current / taskProgress.total) * 100))
      : 58
    : status === 'success'
      ? 100
      : status === 'error' || status === 'cancelled'
        ? 100
        : 0
  const progressStatusLabel = status === 'running'
    ? copy.progressRunning
    : status === 'success'
      ? copy.progressFinished
      : status === 'error' || status === 'cancelled'
        ? copy.progressStopped
        : copy.progressReady
  const activeTaskText = runningTaskLabel || currentCommand || copy.activeTaskIdle
  const progressFileLabel = taskProgress && taskProgress.total > 0 ? `${taskProgress.current}/${taskProgress.total}` : null
  const selectedCustomPreset = savedCleanupBaseUrlPresets.find((item) => item.id === cleanupBaseUrlPresetSelection) ?? null
  const showCustomPresetEditor = cleanupBaseUrlPresetSelection === 'custom' || Boolean(selectedCustomPreset)
  const normalizedCleanupBaseUrl = cleanupConfig.baseUrl.trim().toLowerCase()
  const isDeepSeekCleanupProvider = normalizedCleanupBaseUrl.includes('deepseek.com')
  const isBigModelCleanupProvider = normalizedCleanupBaseUrl.includes('bigmodel.cn') || normalizedCleanupBaseUrl.includes('z.ai')
  const mergeCustomBaseName = sanitizePreviewBaseName(mergeOutputName)
  const mergePreviewRequestKey = useMemo(
    () => JSON.stringify({
      mode: mergeMode,
      inputPaths: mergeMode === 'selection' ? mergeInputPaths : [],
      inputDir: mergeMode === 'folder' ? mergeInputDir : '',
      outputDir,
      outputFormat: mergeOutputFormat,
      outputName: mergeOutputName.trim(),
    }),
    [mergeInputDir, mergeInputPaths, mergeMode, mergeOutputFormat, mergeOutputName, outputDir],
  )
  const mergeFirstPreviewPath = mergePreview?.pairs[0]?.videoPath ?? mergeInputPaths[0] ?? ''
  const mergeDefaultStem = mergeFirstPreviewPath
    ? getPathStem(mergeFirstPreviewPath)
    : language === 'zh' ? '视频文件名' : 'video-file-name'
  const mergePairCount = mergePreview?.pairCount ?? 0
  const mergePreviewName = mergeCustomBaseName
    ? `${mergeCustomBaseName}${mergePairCount > 1 ? ' 01' : ''}.${mergeOutputFormat}`
    : `${mergeDefaultStem} - merged.${mergeOutputFormat}`
  const mergePreviewCaption = (mergeCustomBaseName ? copy.mergeOutputPreviewCustom : copy.mergeOutputPreviewDefault).replace('{name}', mergePreviewName)
  const mergeSelectedSummary = mergeInputPaths.length > 0
    ? `${mergeInputPaths.length} ${language === 'zh' ? '个文件' : mergeInputPaths.length === 1 ? 'file' : 'files'}`
    : copy.waiting
  const mergeSourceReady = mergeMode === 'selection' ? mergeInputPaths.length > 0 : Boolean(mergeInputDir)
  const mergeCanRun = status !== 'running'
    && mergeSourceReady
    && Boolean(outputDir)
    && !mergePreviewLoading
    && Boolean(mergePreview)
    && mergePreviewKey === mergePreviewRequestKey
    && !mergePreviewError
    && (mergePreview?.pairCount ?? 0) > 0
  const mergePreviewPrimaryDuration = mergePreview && mergePreview.pairCount > 1
    ? mergePreview.longestDurationSeconds
    : mergePreview?.estimatedDurationSeconds ?? null
  const runtimeSourceLabel = runtimeToolsSource === 'bundled'
    ? (language === 'zh' ? '分享包内置' : 'Bundled')
    : (language === 'zh' ? '系统环境' : 'System')
  const runtimeDenoLabel = runtimePaths?.denoPath ? copy.runtimeDenoReady : copy.runtimeDenoMissing
  const runtimeSummary = runtimePaths
    ? [
        `FFmpeg: ${compactPath(runtimePaths.ffmpegPath, 72)}`,
        `Deno: ${runtimePaths.denoPath ? compactPath(runtimePaths.denoPath, 72) : copy.runtimeDenoMissing}`,
      ].join('\n')
    : copy.waiting

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    persistUiPrefs({ theme })
  }, [theme])

  useEffect(() => {
    persistUiPrefs({ language })
  }, [language])

  useEffect(() => {
    if (!appApi) return
    if (!mergeSourceReady) {
      setMergePreview(null)
      setMergePreviewKey('')
      setMergePreviewError('')
      setMergePreviewLoading(false)
      return
    }

    let active = true
    const requestKey = mergePreviewRequestKey
    setMergePreviewKey('')
    const timer = window.setTimeout(() => {
      setMergePreviewLoading(true)
      setMergePreviewError('')
      void appApi.previewMediaMerge({
        mode: mergeMode,
        inputPaths: mergeMode === 'selection' ? mergeInputPaths : [],
        inputDir: mergeMode === 'folder' ? mergeInputDir : null,
        outputDir,
        outputFormat: mergeOutputFormat,
        outputName: mergeOutputName.trim() || null,
      })
        .then((preview) => {
          if (!active) return
          setMergePreview(preview)
          setMergePreviewKey(requestKey)
          setStatus('idle')
          setStatusMessage(preview.pairCount > 0 ? copy.mergePreviewReady : copy.mergePreviewNoPairs)
        })
        .catch((error) => {
          if (!active) return
          setMergePreview(null)
          setMergePreviewKey('')
          const message = error instanceof Error ? error.message : 'Preview failed.'
          setMergePreviewError(message)
          setStatus('error')
          setStatusMessage(message)
        })
        .finally(() => {
          if (!active) return
          setMergePreviewLoading(false)
        })
    }, 280)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [copy.mergePreviewNoPairs, copy.mergePreviewReady, mergeInputDir, mergeInputPaths, mergeMode, mergeOutputFormat, mergeOutputName, mergePreviewRequestKey, mergeSourceReady, outputDir])

  async function refreshRuntimeState() {
    if (!appApi) return

    setRuntimeRefreshing(true)
    try {
      const [nextPaths, selfCheckPayload] = await Promise.all([
        appApi.getPaths(),
        appApi.getSelfCheck(),
      ])
      setRuntimePaths(nextPaths)
      setRuntimeToolsSource(selfCheckPayload.toolsSource)
      setOutputDir((current) => current || nextPaths.defaultDownloadDir)
      setStatus('idle')
      setStatusMessage(nextPaths.denoPath ? copy.runtimeRefreshedReady : copy.runtimeRefreshedMissing)
    } catch (error) {
      const message = error instanceof Error ? error.message : copy.runtimeRefreshFailed
      setStatus('error')
      setStatusMessage(message)
      setLogs((current) => [...current, `[ui] ${message}`].slice(-500))
    } finally {
      setRuntimeRefreshing(false)
    }
  }

  useEffect(() => {
    if (!appApi) return

    const unsubscribe = appApi.onMediaToolsUpdate((payload) => {
      if (payload.type === 'clear') {
        setLogs([])
        setOutputs([])
        setCurrentCommand('')
        setTaskProgress(null)
        return
      }
      if (payload.type === 'command') {
        setCurrentCommand(payload.command)
        return
      }
      if (payload.type === 'log') {
        setLogs((current) => [...current, payload.line].slice(-500))
        return
      }
      if (payload.type === 'status') {
        setStatus(payload.status)
        setStatusMessage(payload.message)
        if (payload.progress) {
          setTaskProgress({
            current: payload.progress.current,
            total: payload.progress.total,
            currentPath: payload.progress.currentPath ?? '',
          })
        } else {
          setTaskProgress(null)
        }
        if (payload.outputs) {
          const nextOutputs = payload.outputs
          setOutputs((current) => [...current, ...nextOutputs.filter((item) => !current.includes(item))])
        }
        if (payload.status !== 'running') {
          setRunningTaskLabel('')
        }
      }
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!appApi) return
    void (async () => {
      setRuntimeRefreshing(true)
      try {
        const [nextPaths, selfCheckPayload] = await Promise.all([
          appApi.getPaths(),
          appApi.getSelfCheck(),
        ])
        setRuntimePaths(nextPaths)
        setRuntimeToolsSource(selfCheckPayload.toolsSource)
        setOutputDir((current) => current || nextPaths.defaultDownloadDir)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to refresh runtime.'
        setLogs((current) => [...current, `[ui] ${message}`].slice(-500))
      } finally {
        setRuntimeRefreshing(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (!appApi) return

    void appApi.getSubtitleCleanupConfig().then((config) => {
      setCleanupConfig(config)
      setCleanupModelOptions((current) => mergeModelOptions(current, config.model))
      const initialPresets = [...getCleanupBaseUrlPresets(initialUi.language), ...getSavedCleanupBaseUrlPresets(config.customPresets)]
      const matchedPresetId = getCleanupBaseUrlPresetId(initialPresets, config.baseUrl)
      setCleanupBaseUrlPresetSelection(matchedPresetId)
      if (matchedPresetId !== 'custom') {
        const matchedPreset = initialPresets.find((item) => item.id === matchedPresetId)
        if (matchedPreset?.source === 'custom') {
          setCleanupCustomPresetName(matchedPreset.label)
        }
      }
      setCleanupConfigHydrated(true)
    })
  }, [initialUi.language])

  useEffect(() => {
    if (!cleanupConfigHydrated) {
      return
    }
    void appApi.saveSubtitleCleanupConfig(cleanupConfig)
  }, [cleanupConfig, cleanupConfigHydrated])

  function updateCleanupConfig(next: Partial<SubtitleCleanupConfig>) {
    setCleanupConfig((current) => {
      const nextConfig = {
        ...current,
        ...next,
        providerProfiles: {
          ...current.providerProfiles,
          ...next.providerProfiles,
        },
      }
      if ('baseUrl' in next || 'apiKey' in next || 'model' in next) {
        nextConfig.providerProfiles = {
          ...nextConfig.providerProfiles,
          [cleanupBaseUrlPresetSelection]: buildCleanupProviderProfile({
            baseUrl: nextConfig.baseUrl,
            apiKey: nextConfig.apiKey,
            model: nextConfig.model,
          }),
        }
      }
      return nextConfig
    })
    if ('baseUrl' in next || 'apiKey' in next) {
      setCleanupConnectionState('idle')
      setCleanupConnectionMessage('')
    }
    if ('baseUrl' in next && typeof next.baseUrl === 'string') {
      const matchedPresetId = getCleanupBaseUrlPresetId(cleanupBaseUrlPresets, next.baseUrl)
      setCleanupBaseUrlPresetSelection(matchedPresetId)
      if (matchedPresetId === 'custom') {
        setCleanupCustomPresetName('')
      } else {
        const matchedPreset = cleanupBaseUrlPresets.find((item) => item.id === matchedPresetId)
        setCleanupCustomPresetName(matchedPreset?.source === 'custom' ? matchedPreset.label : '')
      }
    }
    if ('model' in next && typeof next.model === 'string') {
      const nextModel = next.model
      setCleanupModelOptions((current) => mergeModelOptions(current, nextModel))
    }
  }

  function switchCleanupProvider(nextPresetId: CleanupBaseUrlPresetId) {
    const currentPresetId = cleanupBaseUrlPresetSelection
    const currentProfile = buildCleanupProviderProfile(cleanupConfig)
    const nextProviderProfiles = {
      ...cleanupConfig.providerProfiles,
      [currentPresetId]: currentProfile,
    }
    const nextProfile = nextProviderProfiles[nextPresetId] ?? getDefaultCleanupProviderProfile(nextPresetId, cleanupBaseUrlPresets)
    const matchedPreset = cleanupBaseUrlPresets.find((item) => item.id === nextPresetId) ?? null

    setCleanupBaseUrlPresetSelection(nextPresetId)
    setCleanupCustomPresetName(matchedPreset?.source === 'custom' ? matchedPreset.label : '')
    setCleanupConfig((current) => ({
      ...current,
      ...nextProfile,
      providerProfiles: nextProviderProfiles,
    }))
    setCleanupConnectionState('idle')
    setCleanupConnectionMessage('')
    setCleanupModelOptions((current) => mergeModelOptions(current, nextProfile.model))
  }

  async function pickMediaFile() {
    const selected = await appApi.pickMediaFile(inputPath || undefined)
    if (!selected) return
    setInputPath(selected)
    if (!outputDir) {
      setOutputDir(getDirectoryFromPath(selected))
    }
    await inspect(selected)
  }

  async function pickOutputDir() {
    const selected = await appApi.pickDirectory(outputDir || undefined)
    if (selected) setOutputDir(selected)
  }

  async function pickMergeFiles() {
    const selected = await appApi.pickMediaFiles(mergeInputPaths[0] || inputPath || outputDir || undefined)
    if (selected.length === 0) return
    setMergePreview(null)
    setMergePreviewKey('')
    setMergePreviewError('')
    setMergePreviewLoading(true)
    setMergeMode('selection')
    setMergeInputPaths(selected)
    setInspection(null)
    setStatus('idle')
    setStatusMessage(copy.mergePreviewLoading)
    if (!outputDir) {
      setOutputDir(getDirectoryFromPath(selected[0]))
    }
  }

  async function pickMergeFolder() {
    const selected = await appApi.pickDirectory(mergeInputDir || outputDir || undefined)
    if (!selected) return
    setMergePreview(null)
    setMergePreviewKey('')
    setMergePreviewError('')
    setMergePreviewLoading(true)
    setMergeMode('folder')
    setMergeInputDir(selected)
    setInspection(null)
    setStatus('idle')
    setStatusMessage(copy.mergePreviewLoading)
    if (!outputDir) {
      setOutputDir(selected)
    }
  }

  async function pickCleanupFile() {
    const selected = await appApi.pickSubtitleFile(cleanupInputPath || cleanupOutputDir || outputDir || undefined)
    if (!selected) return
    setCleanupInputPath(selected)
    if (!cleanupOutputDir) {
      setCleanupOutputDir(getDirectoryFromPath(selected))
    }
    if (!outputDir) {
      setOutputDir(getDirectoryFromPath(selected))
    }
  }

  async function pickCleanupFolder() {
    const selected = await appApi.pickDirectory(cleanupInputDir || cleanupOutputDir || outputDir || undefined)
    if (!selected) return
    setCleanupInputDir(selected)
    if (!cleanupOutputDir) {
      setCleanupOutputDir(selected)
    }
    if (!outputDir) {
      setOutputDir(selected)
    }
  }

  async function pickCleanupOutputDir() {
    const selected = await appApi.pickDirectory(cleanupOutputDir || cleanupInputDir || outputDir || undefined)
    if (selected) {
      setCleanupOutputDir(selected)
    }
  }

  async function inspect(filePath = inputPath) {
    if (!filePath) {
      setStatus('error')
      setStatusMessage(copy.chooseFirst)
      return
    }

    try {
      const result = await appApi.inspectMedia(filePath)
      setInspection(result)
      setStatus('success')
      setStatusMessage(copy.fileReady)
      const nextSubtitleStreams = result.streams.filter((stream) => stream.codecType === 'subtitle')
      setSelectedSubtitleTracks((current) => current.filter((index) => nextSubtitleStreams.some((stream) => stream.index === index)))
      setSelectedActions((current) => current.filter((action) => (action === 'extractSubtitles' ? nextSubtitleStreams.length > 0 : true)))
    } catch (error) {
      setStatus('error')
      setStatusMessage(error instanceof Error ? error.message : 'Failed to inspect media.')
    }
  }

  function toggleAction(action: MediaToolAction) {
    if (action === 'extractSubtitles' && inspection && !hasSubtitleStream) {
      setStatus('error')
      setStatusMessage(copy.subtitleMissingError)
      return
    }

    setSelectedActions((current) => (current.includes(action) ? current.filter((item) => item !== action) : [...current, action]))
  }

  function toggleSubtitleTrack(index: number) {
    setSelectedSubtitleTracks((current) => (current.includes(index) ? current.filter((item) => item !== index) : [...current, index]))
  }

  async function runSelectedActions() {
    if (!inputPath || !outputDir) {
      setStatus('error')
      setStatusMessage(copy.chooseFirst)
      return
    }

    if (selectedActions.length === 0) {
      setStatus('error')
      setStatusMessage(copy.chooseAction)
      return
    }

    if (selectedActions.includes('extractSubtitles') && !hasSubtitleStream) {
      setStatus('error')
      setStatusMessage(copy.subtitleMissingError)
      return
    }

    setLogs([])
    setOutputs([])
    setCurrentCommand('')
    setTaskProgress(null)
    setStatus('running')
    setStatusMessage(copy.runPlan)
    setLogs([`[ui] ${copy.runPlan}`])

    for (const action of selectedActions) {
      try {
        setRunningTaskLabel(action === 'extractAudio' ? copy.extractAudio : copy.extractSubtitles)
        const actionOutputs = await appApi.runMediaTool({
          action,
          inputPath,
          outputDir,
          audioFormat,
          subtitleFormat,
          subtitleStreamIndexes: action === 'extractSubtitles' ? selectedSubtitleTracks : [],
        })
        setOutputs((current) => [...current, ...actionOutputs.filter((item) => !current.includes(item))])
        setLogs((current) => [
          ...current,
          `[ui] ${action === 'extractAudio' ? copy.extractAudio : copy.extractSubtitles} ${copy.progressFinished}`,
          ...actionOutputs.map((item) => `[output] ${item}`),
        ].slice(-500))
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to run media tool.'
        setRunningTaskLabel('')
        setStatus(message.toLowerCase().includes('cancelled') ? 'cancelled' : 'error')
        setStatusMessage(message)
        return
      }
    }

    setRunningTaskLabel('')
  }

  async function fetchCleanupModels() {
    if (!cleanupConfig.baseUrl.trim() || !cleanupConfig.apiKey.trim()) {
      setCleanupConnectionState('error')
      setCleanupConnectionMessage(copy.cleanupMissingModel)
      return
    }

    setCleanupModelsLoading(true)
    setCleanupConnectionState('idle')
    setCleanupConnectionMessage('')

    try {
      const models = await appApi.listSubtitleCleanupModels({
        baseUrl: cleanupConfig.baseUrl,
        apiKey: cleanupConfig.apiKey,
      })
      setCleanupModelOptions((current) => mergeModelOptions([...current, ...models], cleanupConfig.model))
      const firstModel = models[0]
      if (!cleanupConfig.model && firstModel) {
        updateCleanupConfig({ model: firstModel })
      }
      setStatus('success')
      setStatusMessage(language === 'zh' ? `已拉取 ${models.length} 个模型。` : `Loaded ${models.length} models.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load models.'
      setCleanupConnectionState('error')
      setCleanupConnectionMessage(message)
      setStatus('error')
      setStatusMessage(message)
    } finally {
      setCleanupModelsLoading(false)
    }
  }

  async function testCleanupConnection() {
    if (!cleanupConfig.baseUrl.trim() || !cleanupConfig.apiKey.trim() || !cleanupConfig.model.trim()) {
      setCleanupConnectionState('error')
      setCleanupConnectionMessage(copy.cleanupMissingModel)
      return
    }

    setCleanupTesting(true)
    setCleanupConnectionState('idle')
    setCleanupConnectionMessage('')

    try {
      const result = await appApi.testSubtitleCleanupConnection(cleanupConfig)
      setCleanupConnectionState(result.ok ? 'success' : 'error')
      setCleanupConnectionMessage(result.message)
      setStatus('success')
      setStatusMessage(result.message)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection test failed.'
      setCleanupConnectionState('error')
      setCleanupConnectionMessage(message)
      setStatus('error')
      setStatusMessage(message)
    } finally {
      setCleanupTesting(false)
    }
  }

  function saveCustomCleanupPreset() {
    const label = cleanupCustomPresetName.trim()
    const url = cleanupConfig.baseUrl.trim()

    if (!label) {
      setStatus('error')
      setStatusMessage(copy.cleanupCustomPresetMissingName)
      return
    }

    if (!url) {
      setStatus('error')
      setStatusMessage(copy.cleanupCustomPresetMissingUrl)
      return
    }

    const normalizedUrl = url.replace(/\/+$/, '')
    const existingPreset = selectedCustomPreset
      ?? cleanupConfig.customPresets.find((item) => item.label === label || item.url.replace(/\/+$/, '') === normalizedUrl)
    const nextPreset: SubtitleCleanupCustomPreset = existingPreset
      ? { ...existingPreset, label, url }
      : { id: `custom-${Date.now()}`, label, url }

    const nextCustomPresets = existingPreset
      ? cleanupConfig.customPresets.map((item) => (item.id === existingPreset.id ? nextPreset : item))
      : [...cleanupConfig.customPresets, nextPreset]
    const nextProviderProfiles = {
      ...cleanupConfig.providerProfiles,
      [nextPreset.id]: buildCleanupProviderProfile({
        baseUrl: url,
        apiKey: cleanupConfig.apiKey,
        model: cleanupConfig.model,
      }),
    }

    if (existingPreset && existingPreset.id !== nextPreset.id) {
      delete nextProviderProfiles[existingPreset.id]
    }

    updateCleanupConfig({ customPresets: nextCustomPresets, baseUrl: url, providerProfiles: nextProviderProfiles })
    setCleanupBaseUrlPresetSelection(nextPreset.id)
    setCleanupCustomPresetName(nextPreset.label)
    setStatus('success')
    setStatusMessage(existingPreset ? copy.cleanupCustomPresetUpdated : copy.cleanupCustomPresetSaved)
  }

  function deleteCustomCleanupPreset() {
    if (!selectedCustomPreset) {
      return
    }

    const nextCustomPresets = cleanupConfig.customPresets.filter((item) => item.id !== selectedCustomPreset.id)
    const nextProviderProfiles: Record<string, SubtitleCleanupProviderProfile> = {
      ...cleanupConfig.providerProfiles,
      custom: buildCleanupProviderProfile(cleanupConfig),
    }
    delete nextProviderProfiles[selectedCustomPreset.id]

    updateCleanupConfig({ customPresets: nextCustomPresets, providerProfiles: nextProviderProfiles })
    setCleanupBaseUrlPresetSelection('custom')
    setCleanupCustomPresetName('')
    setStatus('success')
    setStatusMessage(copy.cleanupCustomPresetDeleted)
  }

  function switchToolSection(section: 'media' | 'merge' | 'cleanup') {
    setSelectedToolSection(section)
  }

  async function runMerge(mode: MediaMergeMode) {
    if (!outputDir) {
      setStatus('error')
      setStatusMessage(copy.mergeMissingOutput)
      return
    }
    if (mode === 'selection' && mergeInputPaths.length === 0) {
      setStatus('error')
      setStatusMessage(copy.mergeMissingVideo)
      return
    }
    if (mode === 'folder' && !mergeInputDir) {
      setStatus('error')
      setStatusMessage(copy.mergeMissingFolder)
      return
    }

    setLogs([])
    setOutputs([])
    setCurrentCommand('')
    setTaskProgress(null)
    setStatus('running')
    setStatusMessage(mode === 'selection' ? copy.mergeRunningSingle : copy.mergeRunningBatch)
    setRunningTaskLabel(mode === 'selection' ? copy.mergeRunSingle : copy.mergeRunBatch)
    setLogs([`[ui] ${mode === 'selection' ? copy.mergeRunningSingle : copy.mergeRunningBatch}`])

    try {
      const mergedOutputs = await appApi.runMediaMerge({
        mode,
        inputPaths: mode === 'selection' ? mergeInputPaths : [],
        inputDir: mode === 'folder' ? mergeInputDir : null,
        outputDir,
        outputFormat: mergeOutputFormat,
        outputName: mergeOutputName.trim() || null,
      })
      setOutputs((current) => [...current, ...mergedOutputs.filter((item) => !current.includes(item))])
      setLogs((current) => [
        ...current,
        `[ui] ${copy.mergeFinished.replace('{count}', String(mergedOutputs.length))}`,
        ...mergedOutputs.map((item) => `[output] ${item}`),
      ].slice(-500))
      setTaskProgress(null)
      setStatus('success')
      setStatusMessage(copy.mergeFinished.replace('{count}', String(mergedOutputs.length)))
      setRunningTaskLabel('')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Media merge failed.'
      setStatus(message.toLowerCase().includes('cancelled') ? 'cancelled' : 'error')
      setStatusMessage(message)
      setRunningTaskLabel('')
    }
  }

  async function runCleanup(mode: SubtitleCleanupMode) {
    const effectiveCleanupOutputDir = cleanupOutputDir || outputDir
    if (!effectiveCleanupOutputDir) {
      setStatus('error')
      setStatusMessage(copy.cleanupOutputDir)
      return
    }
    if (!cleanupConfig.baseUrl.trim() || !cleanupConfig.apiKey.trim() || !cleanupConfig.model.trim()) {
      setStatus('error')
      setStatusMessage(copy.cleanupMissingModel)
      return
    }
    if (mode === 'single' && !cleanupInputPath) {
      setStatus('error')
      setStatusMessage(copy.cleanupMissingSingle)
      return
    }
    if (mode === 'batch' && !cleanupInputDir) {
      setStatus('error')
      setStatusMessage(copy.cleanupMissingBatch)
      return
    }

    setLogs([])
    setOutputs([])
    setCurrentCommand('')
    setTaskProgress(null)
    setStatus('running')
    setStatusMessage(mode === 'single' ? copy.cleanupRunSingle : copy.cleanupRunBatch)
    setRunningTaskLabel(mode === 'single' ? copy.cleanupRunSingle : copy.cleanupRunBatch)

    try {
      await appApi.runSubtitleCleanup({
        ...cleanupConfig,
        mode,
        inputPath: mode === 'single' ? cleanupInputPath : null,
        inputDir: mode === 'batch' ? cleanupInputDir : null,
        outputDir: effectiveCleanupOutputDir,
        skipExistingOutputs: cleanupSkipExistingOutputs,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Subtitle cleanup failed.'
      setStatus(message.toLowerCase().includes('cancelled') ? 'cancelled' : 'error')
      setStatusMessage(message)
      setRunningTaskLabel('')
    }
  }

  const connectionClassName = cleanupConnectionState === 'success'
    ? 'media-inline-note media-inline-note--success'
    : cleanupConnectionState === 'error'
      ? 'media-inline-note media-inline-note--error'
      : 'media-inline-note'

  return (
    <div className={embedded ? 'media-embedded' : 'shell media-shell'}>
      {!embedded ? <div className="shell__glow shell__glow--left" /> : null}
      {!embedded ? <div className="shell__glow shell__glow--right" /> : null}
      <section className="hero panel media-hero">
        <div className="hero__toolbar media-hero__toolbar">
          <div>
            <div className="hero-brand">
              <div className="eyebrow">{copy.eyebrow}</div>
              <div className="eyebrow brand-signature">MEDIA DOCK</div>
            </div>
            <h1>{normalizedTitle}</h1>
            <p className="hero__copy media-hero__copy">{copy.copy}</p>
          </div>
          <div className="toolbar-group media-toolbar-group">
            {embedded ? (
              <div className="toolbar-block">
                <span>{language === 'zh' ? '工作区' : 'Workspace'}</span>
                <div className="segmented">
                  <button className="segmented__item active" type="button" onClick={onBack}>
                    {copy.backToDownload}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="toolbar-block">
                  <span>{copy.language}</span>
                  <div className="segmented">
                    <button className={language === 'zh' ? 'segmented__item active' : 'segmented__item'} type="button" onClick={() => setLanguage('zh')}>中文</button>
                    <button className={language === 'en' ? 'segmented__item active' : 'segmented__item'} type="button" onClick={() => setLanguage('en')}>EN</button>
                  </div>
                </div>
                <div className="toolbar-block">
                  <span>{copy.theme}</span>
                  <div className="theme-swatch-group" role="list" aria-label={copy.theme}>
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
              </>
            )}
          </div>
        </div>
        <div className="hero__status-grid media-hero__grid">
          <div className="status-card media-status-card">
            <span className="status-card__label">{copy.summary}</span>
            <ul className="summary-list">
              {copy.summaryItems.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <div className="status-card media-status-card">
            <span className="status-card__label">{copy.inputFile}</span>
            <strong>{inspection?.fileName ?? copy.waiting}</strong>
            <p>{inspection ? `${inspection.formatName} · ${formatDuration(inspection.duration, language)}` : inputPath || mergeInputPaths[0] || mergeInputDir || cleanupInputPath || cleanupInputDir || copy.waiting}</p>
          </div>
          <div className="status-card media-status-card">
            <span className="status-card__label">{copy.status}</span>
            <strong>{statusLabel(status, copy)}</strong>
            <p>{statusMessage || copy.toolsHint}</p>
          </div>
        </div>
      </section>
      <main className="workspace media-workspace">
        <section className="panel control-room media-panel">
          <div className="section-title">
            <span>{copy.tools}</span>
            <small>{copy.toolsHint}</small>
          </div>
          <div className="media-tools-nav">
            <div className="section-title section-title--tight">
              <span>{copy.toolsNavigator}</span>
              <small>{copy.toolsNavigatorHint}</small>
            </div>
            <div className="segmented media-tools-nav__segmented">
              <button
                className={selectedToolSection === 'media' ? 'segmented__item active' : 'segmented__item'}
                type="button"
                onClick={() => switchToolSection('media')}
              >
                {copy.toolsNavigatorMedia}
              </button>
              <button
                className={selectedToolSection === 'merge' ? 'segmented__item active' : 'segmented__item'}
                type="button"
                onClick={() => switchToolSection('merge')}
              >
                {copy.toolsNavigatorMerge}
              </button>
              <button
                className={selectedToolSection === 'cleanup' ? 'segmented__item active' : 'segmented__item'}
                type="button"
                onClick={() => switchToolSection('cleanup')}
              >
                {copy.toolsNavigatorCleanup}
              </button>
            </div>
          </div>
          <div className="media-control-stack">
            {selectedToolSection === 'media' ? (
              <>
                <section className="media-control-block">
                  <div className="section-title section-title--tight">
                    <span>{copy.inputFile}</span>
                    <small>{copy.toolsHint}</small>
                  </div>
                  <div className="media-path-group">
                    <label className="field field--grow media-path-field">
                      <span>{copy.inputFile}</span>
                      <input value={inputPath} onChange={(event) => setInputPath(event.target.value)} placeholder={copy.waiting} />
                    </label>
                    <button className="ghost-button media-side-button media-path-button" type="button" onClick={() => void pickMediaFile()}>{copy.pickFile}</button>
                  </div>
                  <div className="media-path-group">
                    <label className="field field--grow media-path-field">
                      <span>{copy.outputDir}</span>
                      <input value={outputDir} onChange={(event) => setOutputDir(event.target.value)} placeholder={copy.outputDir} />
                    </label>
                    <button className="ghost-button media-side-button media-path-button" type="button" onClick={() => void pickOutputDir()}>{copy.pickOutput}</button>
                  </div>
                  <div className="action-row media-toolbar-actions">
                    <button className="ghost-button" type="button" onClick={() => void inspect()}>{inspection ? copy.refresh : copy.inspect}</button>
                    <button className="ghost-button" type="button" onClick={() => void appApi.openPath(outputDir || inputPath || mergeInputPaths[0] || mergeInputDir || cleanupInputPath || cleanupInputDir)}>{copy.openFolder}</button>
                    <button className="ghost-button" type="button" onClick={() => embedded ? onBack?.() : window.close()}>
                      {embedded ? copy.backToDownload : copy.closeWindow}
                    </button>
                  </div>
                </section>

                <section className="media-control-block media-control-block--active">
                  <div className="section-title section-title--tight">
                    <span>{copy.tools}</span>
                    <small>{copy.toolsHint}</small>
                  </div>
                  <div className="preset-list media-tool-grid">
                    <button
                      className={selectedActions.includes('extractAudio') ? 'preset-chip active' : 'preset-chip'}
                      type="button"
                      onClick={() => toggleAction('extractAudio')}
                      disabled={status === 'running'}
                    >
                      <strong>{copy.extractAudio}</strong>
                      <span>{copy.extractAudioDesc}</span>
                    </button>
                    <button
                      className={selectedActions.includes('extractSubtitles') ? 'preset-chip active' : 'preset-chip'}
                      type="button"
                      onClick={() => toggleAction('extractSubtitles')}
                      disabled={status === 'running'}
                    >
                      <strong>{copy.extractSubtitles}</strong>
                      <span>{copy.extractSubtitlesDesc}</span>
                      {!hasSubtitleStream && inspection ? <small>{copy.subtitleUnavailable}</small> : null}
                    </button>
                  </div>
                  {!hasSubtitleStream && inspection ? (
                    <div className="media-inline-note media-inline-note--warning">
                      <span>{copy.subtitleExternalHint}</span>
                      <button className="ghost-button ghost-button--small" type="button" onClick={() => void appApi.openExternal(SUBTITLE_EDIT_RELEASES_URL)}>
                        {copy.subtitleExternalAction}
                      </button>
                    </div>
                  ) : null}
                  <div className="command-box media-selection-box">
                    <span>{copy.selectedActions}</span>
                    <code>
                      {selectedActions.length > 0
                        ? selectedActions
                            .map((action) =>
                              action === 'extractAudio'
                                ? `${copy.extractAudio} -> ${audioFormat.toUpperCase()}`
                                : `${copy.extractSubtitles} -> ${subtitleFormat.toUpperCase()} (${selectedSubtitleTracks.length > 0 ? selectedSubtitleTracks.join(', ') : 'ALL'})`,
                            )
                            .join('\n')
                        : copy.noneSelected}
                    </code>
                  </div>
                </section>

                <section className="media-control-block media-control-block--active">
                  <div className="section-title section-title--tight">
                    <span>{copy.audioFormat}</span>
                    <small>{copy.runPlan}</small>
                  </div>
                  <div className="field-grid field-grid--2 media-form-grid">
                    <label className="field">
                      <span>{copy.audioFormat}</span>
                      <select value={audioFormat} onChange={(event) => setAudioFormat(event.target.value as MediaAudioExportFormat)}>
                        <option value="wav">WAV</option>
                        <option value="flac">FLAC</option>
                        <option value="mp3">MP3</option>
                        <option value="m4a">M4A</option>
                      </select>
                      <small className="field-help">{copy.audioFormatHint}</small>
                    </label>
                    <label className="field">
                      <span>{copy.subtitleFormat}</span>
                      <select value={subtitleFormat} onChange={(event) => setSubtitleFormat(event.target.value as MediaSubtitleExportFormat)}>
                        <option value="srt">SRT</option>
                        <option value="ass">ASS</option>
                        <option value="vtt">VTT</option>
                      </select>
                      <small className="field-help">{copy.subtitleFormatHint}</small>
                    </label>
                  </div>
                  <div className="field">
                    <span>{copy.subtitleTracks}</span>
                    {subtitleStreams.length === 0 ? (
                      <div className="command-box media-selection-box">
                        <code>{copy.noSubtitleTracks}</code>
                      </div>
                    ) : (
                      <>
                        <div className="stream-list">
                          {subtitleStreams.map((stream) => (
                            <button
                              key={`subtitle-track-${stream.index}`}
                              className={selectedSubtitleTracks.includes(stream.index) ? 'preset-chip active' : 'preset-chip'}
                              type="button"
                              onClick={() => toggleSubtitleTrack(stream.index)}
                              disabled={status === 'running'}
                            >
                              <strong>{copy.trackLabel} #{stream.index}</strong>
                              <span>{stream.codecName}</span>
                              <span>{copy.languageLabel}: {stream.language || '--'}</span>
                              <span>{copy.titleLabel}: {stream.title || '--'}</span>
                            </button>
                          ))}
                        </div>
                        <small className="field-help">{copy.subtitleTracksHint}</small>
                      </>
                    )}
                  </div>
                  <div className="action-row media-primary-actions">
                    <button className="primary-button media-run-button" type="button" disabled={status === 'running' || selectedActions.length === 0} onClick={() => void runSelectedActions()}>
                      {copy.run}
                    </button>
                    <button className="ghost-button" type="button" disabled={status !== 'running'} onClick={() => void appApi.cancelMediaTool()}>
                      {copy.cancel}
                    </button>
                  </div>
                </section>
              </>
            ) : null}

            {selectedToolSection === 'merge' ? (
              <section className="media-control-block media-control-block--active">
                <div className="section-title section-title--tight">
                  <span>{copy.mergeTitle}</span>
                  <small>{copy.mergeHint}</small>
                </div>
                <div className="field">
                  <span>{copy.mergeMode}</span>
                  <div className="segmented media-cleanup-segmented">
                    <button className={mergeMode === 'selection' ? 'segmented__item active' : 'segmented__item'} type="button" disabled={status === 'running'} onClick={() => setMergeMode('selection')}>
                      {copy.mergeModeSingle}
                    </button>
                    <button className={mergeMode === 'folder' ? 'segmented__item active' : 'segmented__item'} type="button" disabled={status === 'running'} onClick={() => setMergeMode('folder')}>
                      {copy.mergeModeBatch}
                    </button>
                  </div>
                </div>

                {mergeMode === 'selection' ? (
                  <>
                    <div className="media-path-group">
                      <label className="field field--grow media-path-field">
                        <span>{copy.mergeVideoFile}</span>
                        <input value={mergeSelectedSummary} readOnly placeholder={copy.mergeVideoFile} />
                      </label>
                      <button className="ghost-button media-side-button media-path-button" type="button" disabled={status === 'running'} onClick={() => void pickMergeFiles()}>
                        {copy.mergePickVideo}
                      </button>
                    </div>
                    {mergeInputPaths.length > 0 ? (
                      <div className="merge-file-list">
                        {mergeInputPaths.slice(0, 6).map((filePath) => (
                          <span key={filePath}>{getPathBaseName(filePath)}</span>
                        ))}
                        {mergeInputPaths.length > 6 ? <small>+{mergeInputPaths.length - 6}</small> : null}
                      </div>
                    ) : null}
                    <small className="field-help merge-wide-help">{copy.mergeMissingAudio}</small>
                  </>
                ) : (
                  <div className="media-path-group">
                    <label className="field field--grow media-path-field">
                      <span>{copy.mergeInputFolder}</span>
                      <input value={mergeInputDir} disabled={status === 'running'} onChange={(event) => setMergeInputDir(event.target.value)} placeholder={copy.mergeInputFolder} />
                    </label>
                    <button className="ghost-button media-side-button media-path-button" type="button" disabled={status === 'running'} onClick={() => void pickMergeFolder()}>
                      {copy.mergePickFolder}
                    </button>
                  </div>
                )}

                <div className="field-grid field-grid--merge-output media-form-grid">
                  <label className="field">
                    <span>{copy.mergeOutputFormat}</span>
                    <select value={mergeOutputFormat} disabled={status === 'running'} onChange={(event) => setMergeOutputFormat(event.target.value as MediaMergeOutputFormat)}>
                      <option value="mp4">MP4</option>
                      <option value="mkv">MKV</option>
                      <option value="mov">MOV / DaVinci</option>
                    </select>
                    <small className="field-help">{copy.mergeFormatHint}</small>
                  </label>
                  <div className="merge-output-picker">
                    <div className="media-path-group merge-output-path-group">
                      <label className="field field--grow media-path-field">
                        <span>{copy.outputDir}</span>
                        <input value={outputDir} disabled={status === 'running'} onChange={(event) => setOutputDir(event.target.value)} placeholder={copy.outputDir} />
                      </label>
                      <button className="ghost-button media-side-button media-path-button" type="button" disabled={status === 'running'} onClick={() => void pickOutputDir()}>
                        {copy.pickOutput}
                      </button>
                    </div>
                    <small className="field-help">{copy.mergeMissingOutput}</small>
                  </div>
                </div>
                <small className="field-help merge-wide-help">{copy.mergeOutputHint}</small>
                <label className="field">
                  <span>{copy.mergeOutputName}</span>
                  <input value={mergeOutputName} disabled={status === 'running'} onChange={(event) => setMergeOutputName(event.target.value)} placeholder={copy.mergeOutputNamePlaceholder} />
                  <small className="field-help">{copy.mergeOutputNameHint}</small>
                </label>
                <div className="output-preview">
                  <span>{copy.mergeOutputPreview}</span>
                  <strong>{mergePreviewName}</strong>
                  <small>{mergePreviewCaption}</small>
                  {!mergeCustomBaseName && !mergeSourceReady ? <small>{copy.mergeOutputPreviewMissing}</small> : null}
                </div>

                <div className="merge-preview-panel">
                  <div className="section-title section-title--tight">
                    <span>{copy.mergePreviewTitle}</span>
                    <small>{mergePreviewLoading ? copy.mergePreviewLoading : copy.mergePreviewHint}</small>
                  </div>
                  {mergePreviewError ? (
                    <div className="media-inline-note media-inline-note--warning">
                      <span>{mergePreviewError}</span>
                    </div>
                  ) : !mergeSourceReady ? (
                    <div className="command-box media-selection-box">
                      <code>{copy.mergePreviewEmpty}</code>
                    </div>
                  ) : mergePreview ? (
                    <>
                      <div className="merge-preview-grid">
                        <div>
                          <span>{copy.mergePreviewInputCount}</span>
                          <strong>{mergePreview.inputCount}</strong>
                        </div>
                        <div>
                          <span>{copy.mergePreviewVideoCount}</span>
                          <strong>{mergePreview.videoCount}</strong>
                        </div>
                        <div>
                          <span>{copy.mergePreviewAudioCount}</span>
                          <strong>{mergePreview.audioCount}</strong>
                        </div>
                        <div>
                          <span>{copy.mergePreviewPairCount}</span>
                          <strong>{mergePreview.pairCount}</strong>
                        </div>
                        <div>
                          <span>{copy.mergePreviewSize}</span>
                          <strong>{formatBytes(mergePreview.estimatedSizeBytes, language)}</strong>
                        </div>
                        <div>
                          <span>{copy.mergePreviewDuration}</span>
                          <strong>{formatDuration(mergePreviewPrimaryDuration, language)}</strong>
                          {mergePreview.pairCount > 1 ? (
                            <small>{copy.mergePreviewTotalDuration}: {formatDuration(mergePreview.estimatedDurationSeconds, language)}</small>
                          ) : null}
                        </div>
                      </div>
                      <div className="merge-pair-list">
                        <span>{copy.mergePreviewPairs}</span>
                        {mergePreview.pairs.length === 0 ? (
                          <small>{copy.mergePreviewNoPairs}</small>
                        ) : (
                          mergePreview.pairs.slice(0, 5).map((pair) => (
                            <div className="merge-pair-item" key={`${pair.videoPath}-${pair.audioPath}`}>
                              <strong>{getPathBaseName(pair.videoPath)}</strong>
                              <span>{getPathBaseName(pair.audioPath)}</span>
                              <small>
                                {copy.mergePreviewDiff}: {pair.durationDiff === null ? copy.waiting : `${pair.durationDiff.toFixed(3)}s`} · {copy.mergePreviewTracks.replace('{video}', String(pair.videoAudioTracks)).replace('{audio}', String(pair.audioTracks))}
                              </small>
                              <small>
                                {copy.mergePreviewSize}: {formatBytes(pair.estimatedSizeBytes, language)} · {copy.mergePreviewDuration}: {formatDuration(pair.durationSeconds, language)}
                              </small>
                              <small>{copy.mergePreviewOutput}: {getPathBaseName(pair.outputPath)}</small>
                            </div>
                          ))
                        )}
                      </div>
                      {(mergePreview.unmatchedVideoCount > 0 || mergePreview.unmatchedAudioCount > 0) ? (
                        <small className="field-help">{copy.mergePreviewUnmatched.replace('{video}', String(mergePreview.unmatchedVideoCount)).replace('{audio}', String(mergePreview.unmatchedAudioCount))}</small>
                      ) : null}
                      {mergePreview.skipped.length > 0 ? (
                        <small className="field-help">{copy.mergePreviewSkipped.replace('{count}', String(mergePreview.skipped.length))}</small>
                      ) : null}
                    </>
                  ) : (
                    <div className="command-box media-selection-box">
                      <code>{copy.mergePreviewLoading}</code>
                    </div>
                  )}
                </div>

                <div className="action-row media-primary-actions">
                  <button
                    className="primary-button media-run-button"
                    type="button"
                    disabled={!mergeCanRun}
                    onClick={() => void runMerge(mergeMode)}
                  >
                    {mergeMode === 'selection' ? copy.mergeRunSingle : copy.mergeRunBatch}
                  </button>
                  <button className="ghost-button" type="button" disabled={status !== 'running'} onClick={() => void appApi.cancelMediaTool()}>
                    {copy.cancel}
                  </button>
                </div>
              </section>
            ) : null}

            {selectedToolSection === 'cleanup' ? (
              <section className="media-control-block media-cleanup-block media-control-block--active">
              <div className="section-title section-title--tight">
                <span>{copy.cleanupTitle}</span>
                <small>{copy.cleanupHint}</small>
              </div>
              <div className="field">
                <span>{copy.cleanupMode}</span>
                <div className="segmented media-cleanup-segmented">
                  <button className={cleanupMode === 'single' ? 'segmented__item active' : 'segmented__item'} type="button" onClick={() => setCleanupMode('single')}>
                    {copy.cleanupModeSingle}
                  </button>
                  <button className={cleanupMode === 'batch' ? 'segmented__item active' : 'segmented__item'} type="button" onClick={() => setCleanupMode('batch')}>
                    {copy.cleanupModeBatch}
                  </button>
                </div>
              </div>

              {cleanupMode === 'single' ? (
                <div className="media-path-group">
                  <label className="field field--grow media-path-field">
                    <span>{copy.cleanupSingleInput}</span>
                    <input value={cleanupInputPath} onChange={(event) => setCleanupInputPath(event.target.value)} placeholder={copy.cleanupSingleInput} />
                  </label>
                  <button className="ghost-button media-side-button media-path-button" type="button" onClick={() => void pickCleanupFile()}>
                    {copy.cleanupPickFile}
                  </button>
                </div>
              ) : (
                <div className="media-path-group">
                  <label className="field field--grow media-path-field">
                    <span>{copy.cleanupBatchInput}</span>
                    <input value={cleanupInputDir} onChange={(event) => setCleanupInputDir(event.target.value)} placeholder={copy.cleanupBatchInput} />
                  </label>
                  <button className="ghost-button media-side-button media-path-button" type="button" onClick={() => void pickCleanupFolder()}>
                    {copy.cleanupPickFolder}
                  </button>
                </div>
              )}

              <div className="media-path-group">
                <label className="field field--grow media-path-field">
                  <span>{copy.cleanupOutputDir}</span>
                  <input value={cleanupOutputDir} onChange={(event) => setCleanupOutputDir(event.target.value)} placeholder={copy.cleanupOutputDir} />
                </label>
                <button className="ghost-button media-side-button media-path-button" type="button" onClick={() => void pickCleanupOutputDir()}>
                  {copy.cleanupPickOutput}
                </button>
              </div>

              <label className="checkbox">
                <input type="checkbox" checked={cleanupSkipExistingOutputs} onChange={(event) => setCleanupSkipExistingOutputs(event.target.checked)} />
                <span>{copy.cleanupSkipExisting}</span>
              </label>
              <small className="field-help">{copy.cleanupOutputHint}</small>
              <small className="field-help">{copy.cleanupSkipExistingHint}</small>

              <div className="section-title section-title--tight media-subsection-title">
                <span>{copy.cleanupApiTitle}</span>
                <small>{copy.cleanupApiHint}</small>
              </div>
              <label className="field">
                <span>{copy.cleanupBaseUrlPreset}</span>
                <select
                  value={cleanupBaseUrlPresetSelection}
                  onChange={(event) => {
                    const nextPresetId = event.target.value
                    switchCleanupProvider(nextPresetId === 'custom' ? 'custom' : nextPresetId)
                  }}
                >
                  <option value="custom">{copy.cleanupBaseUrlCustom}</option>
                  {savedCleanupBaseUrlPresets.length > 0 ? (
                    <optgroup label={copy.cleanupSavedPresets}>
                      {savedCleanupBaseUrlPresets.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  <optgroup label={copy.cleanupBuiltinPresets}>
                    {builtinCleanupBaseUrlPresets.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
                <small className="field-help">{copy.cleanupBaseUrlPresetHint}</small>
              </label>
              {showCustomPresetEditor ? (
                <div className="field-grid field-grid--2 media-form-grid">
                  <label className="field">
                    <span>{copy.cleanupCustomPresetName}</span>
                    <input value={cleanupCustomPresetName} onChange={(event) => setCleanupCustomPresetName(event.target.value)} placeholder={copy.cleanupCustomPresetName} />
                    <small className="field-help">{copy.cleanupCustomPresetNameHint}</small>
                  </label>
                  <div className="field media-preset-actions">
                    <span>{copy.cleanupSavedPresets}</span>
                    <div className="action-row media-inline-button-row">
                      <button className="ghost-button" type="button" onClick={saveCustomCleanupPreset}>
                        {selectedCustomPreset ? copy.cleanupUpdateCustomPreset : copy.cleanupSaveCustomPreset}
                      </button>
                      <button className="ghost-button" type="button" disabled={!selectedCustomPreset} onClick={deleteCustomCleanupPreset}>
                        {copy.cleanupDeleteCustomPreset}
                      </button>
                    </div>
                    <small className="field-help">{copy.cleanupCustomPresetDeleteHint}</small>
                  </div>
                </div>
              ) : null}
              <div className="field-grid field-grid--2 media-form-grid">
                <label className="field">
                  <span>{copy.cleanupBaseUrl}</span>
                  <input value={cleanupConfig.baseUrl} onChange={(event) => updateCleanupConfig({ baseUrl: event.target.value })} placeholder="https://api.openai.com" />
                </label>
                <label className="field">
                  <span>{copy.cleanupApiKey}</span>
                  <input type="password" value={cleanupConfig.apiKey} onChange={(event) => updateCleanupConfig({ apiKey: event.target.value })} placeholder="sk-..." />
                </label>
              </div>
              <div className="field-grid field-grid--2 media-form-grid">
                <label className="field">
                  <span>{copy.cleanupModel}</span>
                  <select value={cleanupConfig.model} onChange={(event) => updateCleanupConfig({ model: event.target.value })}>
                    <option value="">{copy.cleanupModelPlaceholder}</option>
                    {cleanupModelOptions.map((model) => (
                      <option key={model} value={model}>{model}</option>
                    ))}
                  </select>
                  <small className="field-help">{copy.cleanupModelHint}</small>
                </label>
                <div className="field media-inline-actions">
                  <span>{copy.cleanupApiTitle}</span>
                  <div className="action-row media-inline-button-row">
                    <button className="ghost-button" type="button" disabled={cleanupModelsLoading || status === 'running'} onClick={() => void fetchCleanupModels()}>
                      {cleanupModelsLoading ? copy.cleanupFetchModelsLoading : copy.cleanupFetchModels}
                    </button>
                    <button className="ghost-button" type="button" disabled={cleanupTesting || status === 'running'} onClick={() => void testCleanupConnection()}>
                      {cleanupTesting ? copy.cleanupTesting : copy.cleanupTest}
                    </button>
                  </div>
                  <div className={connectionClassName}>
                    {cleanupConnectionMessage || copy.cleanupConnectionIdle}
                  </div>
                </div>
              </div>
              <div className="field-grid field-grid--2 media-form-grid">
                <label className="field">
                  <span>{copy.cleanupThinkingMode}</span>
                  <select value={cleanupConfig.thinkingMode} onChange={(event) => updateCleanupConfig({ thinkingMode: event.target.value as SubtitleCleanupConfig['thinkingMode'] })}>
                    <option value="default">{copy.cleanupThinkingModeDefault}</option>
                    <option value="disabled">{copy.cleanupThinkingModeDisabled}</option>
                  </select>
                  <small className="field-help">{copy.cleanupThinkingModeHint}</small>
                </label>
                <div className="field">
                  <span>{copy.cleanupThinkingMode}</span>
                  <div className="media-inline-note media-inline-note--warning">
                    <span>
                      {isDeepSeekCleanupProvider
                        ? copy.cleanupThinkingHintDeepSeek
                        : isBigModelCleanupProvider
                          ? copy.cleanupThinkingHintBigModel
                          : copy.cleanupThinkingModeHint}
                    </span>
                  </div>
                </div>
              </div>

              <label className="field">
                <span>{copy.cleanupPrompt}</span>
                <textarea value={cleanupConfig.prompt} onChange={(event) => updateCleanupConfig({ prompt: event.target.value })} rows={10} />
                <small className="field-help">{copy.cleanupPromptHint}</small>
              </label>

              <div className="action-row media-primary-actions">
                <button className="primary-button media-run-button" type="button" disabled={status === 'running'} onClick={() => void runCleanup('single')}>
                  {copy.cleanupRunSingle}
                </button>
                <button className="ghost-button" type="button" disabled={status === 'running'} onClick={() => void runCleanup('batch')}>
                  {copy.cleanupRunBatch}
                </button>
                <button className="ghost-button" type="button" disabled={status !== 'running'} onClick={() => void appApi.cancelMediaTool()}>
                  {copy.cleanupCancel}
                </button>
              </div>
              </section>
            ) : null}
          </div>
        </section>
        <aside className="media-sidebar">
          <section className="panel telemetry media-panel">
            <div className="section-title media-runtime-title">
              <div>
                <span>{copy.runtimeTitle}</span>
                <small>{copy.runtimeHint}</small>
              </div>
              <button className="ghost-button ghost-button--small" type="button" disabled={runtimeRefreshing || status === 'running'} onClick={() => void refreshRuntimeState()}>
                {runtimeRefreshing ? copy.runtimeRefreshing : copy.runtimeRefresh}
              </button>
            </div>
            <div className="runtime-compact-grid">
              <div>
                <span>{copy.runtimeSource}</span>
                <strong>{runtimePaths ? runtimeSourceLabel : copy.waiting}</strong>
              </div>
              <div>
                <span>{copy.runtimeDownloadCore}</span>
                <strong>{runtimePaths?.envName ?? copy.waiting}</strong>
              </div>
              <div>
                <span>Deno</span>
                <strong>{runtimePaths ? runtimeDenoLabel : copy.waiting}</strong>
              </div>
            </div>
            {runtimePaths ? (
              <div className="command-box command-box--compact">
                <span>{copy.runtimePathDetails}</span>
                <code>{runtimeSummary}</code>
              </div>
            ) : null}
            <div className="section-title">
              <span>{copy.streams}</span>
              <small>{copy.streamsHint}</small>
            </div>
            <div className="stream-list media-stream-list">
              {!inspection ? (
                <div className="job-empty">{copy.waiting}</div>
              ) : inspection.streams.length === 0 ? (
                <div className="job-empty">{copy.notFound}</div>
              ) : (
                inspection.streams.map((stream) => (
                  <div className="stream-card" key={`${stream.codecType}-${stream.index}`}>
                    <div className="stream-card__header">
                      <strong>{classifyStream(stream, copy)}</strong>
                      <span>#{stream.index}</span>
                    </div>
                    <p>{stream.codecName}</p>
                    <small>{[stream.language, stream.title].filter(Boolean).join(' · ') || copy.notFound}</small>
                  </div>
                ))
              )}
            </div>
            <div className="command-box">
              <span>{copy.command}</span>
              <code>{currentCommand || copy.noLogs}</code>
            </div>
            <div className="command-box">
              <span>{copy.outputFiles}</span>
              <code>{outputs.length > 0 ? outputs.join('\n') : copy.waiting}</code>
            </div>

            <div className="section-title">
              <span>{copy.progress}</span>
              <small>{copy.progressHint}</small>
            </div>
            <div className="progress-shell media-progress-shell">
              <div className="progress-shell__header">
                <div>
                  <span>{copy.activeTask}</span>
                  <strong>{progressStatusLabel}</strong>
                </div>
                <span>{statusLabel(status, copy)}</span>
              </div>
              <div className="progress-bar progress-bar--small media-progress-bar">
                <div
                  className={status === 'running' && !taskProgress ? 'progress-bar__fill media-progress-bar__fill media-progress-bar__fill--indeterminate' : 'progress-bar__fill media-progress-bar__fill'}
                  style={{ width: `${progressValue}%` }}
                />
              </div>
              <div className="progress-meta progress-meta--wrap">
                {progressFileLabel ? <span>{copy.progressFiles}: {progressFileLabel}</span> : null}
                <span>{copy.progressOutputs}: {outputs.length}</span>
                <span>{copy.progressLogs}: {logs.length}</span>
                <span>{copy.progressTracks}: {subtitleStreams.length}</span>
              </div>
              {taskProgress?.currentPath ? (
                <div className="command-box media-progress-task">
                  <span>{copy.progressCurrentFile}</span>
                  <code title={taskProgress.currentPath}>{compactPath(taskProgress.currentPath, 112)}</code>
                </div>
              ) : null}
              <div className="command-box media-progress-task">
                <span>{copy.activeTask}</span>
                <code>{activeTaskText}</code>
              </div>
            </div>
          </section>
        </aside>
        <section className="panel logs media-logs media-panel">
          <div className="section-title">
            <span>{copy.logs}</span>
            <small>{runningTaskLabel || copy.toolsHint}</small>
          </div>
          <div className="log-viewer">
            {logs.length === 0 ? <div className="log-placeholder">{copy.noLogs}</div> : logs.map((line, index) => <div className="log-line" key={`${line}-${index}`}>{line}</div>)}
          </div>
        </section>
      </main>
    </div>
  )
}
