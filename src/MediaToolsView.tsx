import { useEffect, useMemo, useState } from 'react'
import { appApi } from './services/appApi'
import { readJsonStorage, writeJsonStorage } from './services/localStore'

type Language = 'zh' | 'en'
type Theme = 'midnight' | 'ember' | 'aurora'
type MediaToolAction = 'extractAudio' | 'extractSubtitles'
type MediaAudioExportFormat = 'mp3' | 'wav' | 'flac' | 'm4a'
type MediaSubtitleExportFormat = 'srt' | 'ass' | 'vtt'
type CleanupConnectionState = 'idle' | 'success' | 'error'
type CleanupBaseUrlPresetId = string | 'custom'
type CleanupBaseUrlPreset = {
  id: string
  label: string
  url: string
  source: 'builtin' | 'custom'
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
    theme: parsed.theme === 'ember' || parsed.theme === 'aurora' ? parsed.theme : 'midnight',
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
        eyebrow: 'MEDIA TOOLS',
        title: '本地媒体工具台。',
        copy: '这个窗口只处理你电脑里已经有的媒体文件。下载和后处理分开后，像达芬奇剪辑、音频整理、字幕导出、字幕清洗这种流程会更顺手。',
        language: '语言',
        theme: '背景',
        themeMidnight: '深夜',
        themeEmber: '余烬',
        themeAurora: '极光',
        inputFile: '输入文件',
        outputDir: '输出目录',
        pickFile: '选择媒体文件',
        pickOutput: '选择输出目录',
        inspect: '读取媒体信息',
        refresh: '重新识别',
        openFolder: '打开输出目录',
        closeWindow: '关闭窗口',
        tools: '处理动作',
        toolsHint: '先勾选动作，再统一点开始。支持单选，也支持多选顺序执行。',
        toolsNavigator: '功能选择',
        toolsNavigatorHint: '先在这里切换功能区，就不用反复往下翻。',
        toolsNavigatorMedia: '媒体处理',
        toolsNavigatorCleanup: '字幕整理',
        extractAudio: '音轨分离',
        extractAudioDesc: '把本地视频里的音频导出成单独文件，适合剪辑、播客或调音。',
        extractSubtitles: '字幕分离',
        extractSubtitlesDesc: '把文件里已有的字幕轨单独导出来。只有源文件本身带字幕流时才做得了。',
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
          '本地媒体工具: 负责对已经下载好的文件做音轨分离、字幕分离、字幕清洗。',
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
        progressCurrentFile: '当前字幕',
        progressReady: '准备就绪',
        progressRunning: '处理中',
        progressFinished: '处理完成',
        progressStopped: '已停止',
        runtimeTitle: '工具环境',
        runtimeHint: '这里会显示当前识别到的 ffmpeg / yt-dlp / Deno 状态。',
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
        eyebrow: 'MEDIA TOOLS',
        title: 'Local media workstation.',
        copy: 'This window is for files already on your machine. Keeping downloads and post-processing separate makes editing, audio prep, subtitle export, and subtitle cleanup much cleaner.',
        language: 'Language',
        theme: 'Theme',
        themeMidnight: 'Midnight',
        themeEmber: 'Ember',
        themeAurora: 'Aurora',
        inputFile: 'Input file',
        outputDir: 'Output folder',
        pickFile: 'Choose media file',
        pickOutput: 'Choose output folder',
        inspect: 'Inspect media',
        refresh: 'Refresh',
        openFolder: 'Open output folder',
        closeWindow: 'Close window',
        tools: 'Actions',
        toolsHint: 'Select one or more actions first, then press start once.',
        toolsNavigator: 'Feature switch',
        toolsNavigatorHint: 'Switch between work areas here instead of scrolling through the whole page every time.',
        toolsNavigatorMedia: 'Media tools',
        toolsNavigatorCleanup: 'Subtitle cleanup',
        extractAudio: 'Extract audio',
        extractAudioDesc: 'Export the local video audio as a separate file for editing or cleanup.',
        extractSubtitles: 'Extract subtitles',
        extractSubtitlesDesc: 'Export subtitle streams already embedded in the file.',
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
          'Local media tools work on files you already downloaded, including subtitle cleanup.',
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
        progressCurrentFile: 'Current subtitle',
        progressReady: 'Ready',
        progressRunning: 'Running',
        progressFinished: 'Finished',
        progressStopped: 'Stopped',
        runtimeTitle: 'Runtime',
        runtimeHint: 'Shows the currently detected ffmpeg / yt-dlp / Deno runtime state.',
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

export default function MediaToolsView() {
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
  const [selectedToolSection, setSelectedToolSection] = useState<'media' | 'cleanup'>('media')
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
  const progressValue = status === 'running' ? 58 : status === 'success' ? 100 : status === 'error' || status === 'cancelled' ? 100 : 12
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
  const runtimeSummary = runtimePaths
    ? [
        `${copy.runtimeSource}: ${runtimeToolsSource === 'bundled' ? (language === 'zh' ? '分享包内置' : 'Bundled') : (language === 'zh' ? '系统环境' : 'System')}`,
        `YT-DLP: ${runtimePaths.envName}`,
        `FFmpeg: ${runtimePaths.ffmpegPath}`,
        `Deno: ${runtimePaths.denoPath ?? copy.runtimeDenoMissing}`,
      ].join('\n')
    : copy.waiting

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    persistUiPrefs({ theme })
  }, [theme])

  useEffect(() => {
    persistUiPrefs({ language })
  }, [language])

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
        } else if (payload.status === 'running') {
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
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to refresh runtime.'
        setLogs((current) => [...current, `[ui] ${message}`].slice(-500))
      } finally {
        setRuntimeRefreshing(false)
      }
    })()
  }, [])

  useEffect(() => {
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

    for (const action of selectedActions) {
      try {
        setRunningTaskLabel(action === 'extractAudio' ? copy.extractAudio : copy.extractSubtitles)
        await appApi.runMediaTool({
          action,
          inputPath,
          outputDir,
          audioFormat,
          subtitleFormat,
          subtitleStreamIndexes: action === 'extractSubtitles' ? selectedSubtitleTracks : [],
        })
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

  function switchToolSection(section: 'media' | 'cleanup') {
    setSelectedToolSection(section)
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
    <div className="shell media-shell">
      <div className="shell__glow shell__glow--left" />
      <div className="shell__glow shell__glow--right" />
      <section className="hero panel media-hero">
        <div className="hero__toolbar media-hero__toolbar">
          <div>
            <div className="hero-brand">
              <div className="eyebrow">{copy.eyebrow}</div>
              <div className="eyebrow brand-signature">DYFO</div>
            </div>
            <h1>{normalizedTitle}</h1>
            <p className="hero__copy media-hero__copy">{copy.copy}</p>
          </div>
          <div className="toolbar-group media-toolbar-group">
            <div className="toolbar-block">
              <span>{copy.language}</span>
              <div className="segmented">
                <button className={language === 'zh' ? 'segmented__item active' : 'segmented__item'} type="button" onClick={() => setLanguage('zh')}>中文</button>
                <button className={language === 'en' ? 'segmented__item active' : 'segmented__item'} type="button" onClick={() => setLanguage('en')}>EN</button>
              </div>
            </div>
            <div className="toolbar-block">
              <span>{copy.theme}</span>
              <div className="segmented">
                <button className={theme === 'midnight' ? 'segmented__item active' : 'segmented__item'} type="button" onClick={() => setTheme('midnight')}>{copy.themeMidnight}</button>
                <button className={theme === 'ember' ? 'segmented__item active' : 'segmented__item'} type="button" onClick={() => setTheme('ember')}>{copy.themeEmber}</button>
                <button className={theme === 'aurora' ? 'segmented__item active' : 'segmented__item'} type="button" onClick={() => setTheme('aurora')}>{copy.themeAurora}</button>
              </div>
            </div>
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
            <p>{inspection ? `${inspection.formatName} · ${formatDuration(inspection.duration, language)}` : inputPath || cleanupInputPath || cleanupInputDir || copy.waiting}</p>
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
                className={selectedToolSection === 'cleanup' ? 'segmented__item active' : 'segmented__item'}
                type="button"
                onClick={() => switchToolSection('cleanup')}
              >
                {copy.toolsNavigatorCleanup}
              </button>
            </div>
          </div>
          <div className="media-control-stack">
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
                <button className="ghost-button" type="button" onClick={() => void appApi.openPath(outputDir || inputPath || cleanupInputPath || cleanupInputDir)}>{copy.openFolder}</button>
                <button className="ghost-button" type="button" onClick={() => window.close()}>{copy.closeWindow}</button>
              </div>
            </section>

            {selectedToolSection === 'media' ? (
              <>
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
            <div className="section-title">
              <span>{copy.runtimeTitle}</span>
              <div className="section-actions">
                <small>{copy.runtimeHint}</small>
                <button className="ghost-button ghost-button--small" type="button" disabled={runtimeRefreshing || status === 'running'} onClick={() => void refreshRuntimeState()}>
                  {runtimeRefreshing ? copy.runtimeRefreshing : copy.runtimeRefresh}
                </button>
              </div>
            </div>
            <div className="command-box">
              <span>{copy.runtimeTitle}</span>
              <code>{runtimeSummary}</code>
            </div>
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
                  className={status === 'running' ? 'progress-bar__fill media-progress-bar__fill media-progress-bar__fill--indeterminate' : 'progress-bar__fill media-progress-bar__fill'}
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
                  <code>{taskProgress.currentPath}</code>
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
