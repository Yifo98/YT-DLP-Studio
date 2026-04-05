import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { appApi } from './services/appApi'
import { readJsonStorage, removeStorageItem, writeJsonStorage } from './services/localStore'

type Language = 'zh' | 'en'
type Theme = 'midnight' | 'ember' | 'aurora'
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

type HistoryItem = {
  id: string
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
}

const STORAGE_KEY = 'yt-dlp-studio.preferences'
const HISTORY_KEY = 'yt-dlp-studio.history'

const DEFAULT_PREFS: StoredPreferences = {
  outputDir: '',
  mode: 'video',
  audioFormat: 'mp3',
  audioQuality: 'best',
  videoPreset: 'best',
  language: 'zh',
  theme: 'midnight',
  cookieFile: '',
  enabledExtraPresets: [],
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

function getText(language: Language) {
  return language === 'zh'
    ? {
        heroTitle: '给 yt-dlp 准备的桌面控制台。',
        heroCopy: '收掉没必要的选择题，保留真正常用的下载动作。',
        status: '状态',
        compatibility: '兼容性',
        refreshTools: '刷新环境',
        refreshingTools: '刷新中...',
        refreshedWithDeno: '环境已刷新，已检测到 Deno。',
        refreshedWithoutDeno: '环境已刷新，暂时还没检测到 Deno。',
        refreshFailed: '环境刷新失败。',
        loading: '加载中...',
        loadingPath: '正在读取 yt-dlp 路径...',
        basicMode: '基础模式',
        readyForYoutube: 'YouTube 已优化',
        denoReady: '已检测到 Deno，YouTube 解析更稳。',
        denoMissing: '未检测到 Deno，多数站点仍可用。',
        downloadPanel: '下载面板',
        downloadPanelHint: '一行一个链接，默认顺序下载。',
        urls: '链接列表',
        urlsPlaceholder: '每行一个链接',
        urlsHint: '支持一次粘贴多行链接，系统会自动拆成多条。',
        addLink: '添加链接',
        clearLinks: '清空链接',
        outputFolder: '输出目录',
        browse: '选择目录',
        openCookiesDir: '打开 cookies 目录',
        mode: '下载模式',
        video: '视频',
        audio: '音频',
        sequentialHint: '现在默认按顺序下载，不再额外让你选队列模式。',
        videoPreset: '视频预设',
        videoPresetHint: '控制最高画质上限。自动最佳会尽量拿站点允许的最高画质；B 站 4K 取决于源片、登录态和权限。',
        best: '自动最佳',
        p2160: '最高 4K',
        p1080: '最高 1080p',
        p720: '最高 720p',
        p480: '最高 480p',
        audioFormat: '音频格式',
        audioQuality: '音频质量',
        audioQualityHint: '只在音频模式生效。',
        cookieFile: '认证文件',
        cookieAuto: '不使用 cookies 文件',
        cookieHint: 'B 站课程优先选推荐项，普通视频通常不用选。',
        cookieFallback: '不确定就先保持“不使用 cookies 文件”。',
        extraOptions: '常用附加选项',
        extraOptionsHint: '这里放网页下载增强；本地字幕/音轨分离请去“媒体工具”窗口。',
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
        liveDownload: '当前下载中',
        liveDownloadHint: '像 Claude 的状态面板一样，先盯住最关键的那条任务。',
        liveDownloadIdle: '还没有正在进行的下载任务。',
        waiting: '等待中',
        pending: '待开始',
        running: '进行中',
        done: '已完成',
        failed: '失败',
        cancelled: '已取消',
        activeJobs: '任务进度',
        activeJobsHint: '每张卡片代表一个链接。',
        downloaded: '已下载',
        total: '总量',
        eta: '剩余',
        currentCommand: '当前命令',
        ffmpegPath: 'FFmpeg 路径',
        logs: '日志',
        logsHint: '保留最近 600 行输出。',
        noLogs: '还没有输出。',
        recentJobs: '最近任务',
        recentJobsHint: '点卡片可回填链接和目录。',
        clearHistory: '清空记录',
        noHistory: '还没有历史任务。',
        audioExtract: '音频提取',
        videoDownload: '视频下载',
        language: '语言',
        theme: '背景',
        themeMidnight: '深夜',
        themeEmber: '余烬',
        themeAurora: '极光',
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
        heroTitle: 'Desktop control room for yt-dlp.',
        heroCopy: 'Trimmed back to the controls people actually use.',
        status: 'Status',
        compatibility: 'Compatibility',
        refreshTools: 'Refresh runtime',
        refreshingTools: 'Refreshing...',
        refreshedWithDeno: 'Runtime refreshed. Deno is now available.',
        refreshedWithoutDeno: 'Runtime refreshed. Deno is still missing.',
        refreshFailed: 'Failed to refresh runtime.',
        loading: 'Loading...',
        loadingPath: 'Reading yt-dlp path...',
        basicMode: 'Basic mode',
        readyForYoutube: 'Ready for YouTube',
        denoReady: 'Deno detected. YouTube support should be more stable.',
        denoMissing: 'Deno not found. Most sites still work.',
        downloadPanel: 'Download panel',
        downloadPanelHint: 'One URL per line. Downloads run sequentially by default.',
        urls: 'URL list',
        urlsPlaceholder: 'One URL per line',
        urlsHint: 'Paste multiple lines at once and they will be split into separate URLs.',
        addLink: 'Add link',
        clearLinks: 'Clear links',
        outputFolder: 'Output folder',
        browse: 'Browse',
        openCookiesDir: 'Open cookies folder',
        mode: 'Mode',
        video: 'Video',
        audio: 'Audio',
        sequentialHint: 'Queue mode has been removed from the UI. Downloads are sequential by default.',
        videoPreset: 'Video preset',
        videoPresetHint: 'Sets the maximum quality ceiling. Best available will try to grab the highest quality the site allows; Bilibili 4K depends on source availability, login state, and account permissions.',
        best: 'Best available',
        p2160: 'Up to 4K',
        p1080: 'Up to 1080p',
        p720: 'Up to 720p',
        p480: 'Up to 480p',
        audioFormat: 'Audio format',
        audioQuality: 'Audio quality',
        audioQualityHint: 'Only used in audio mode.',
        cookieFile: 'Auth file',
        cookieAuto: 'Do not use a cookie file',
        cookieHint: 'For Bilibili courses, pick the recommended file. Public videos usually do not need one.',
        cookieFallback: 'If unsure, keep “Do not use a cookie file”.',
        extraOptions: 'Common extra options',
        extraOptionsHint: 'These are link-download enhancements. Use the Media tools window for local subtitle or audio extraction.',
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
        liveDownload: 'Live download',
        liveDownloadHint: 'Keep the most important active job in focus, similar to Claude-style telemetry.',
        liveDownloadIdle: 'No active download job yet.',
        waiting: 'Waiting',
        pending: 'Pending',
        running: 'Running',
        done: 'Done',
        failed: 'Failed',
        cancelled: 'Cancelled',
        activeJobs: 'Job progress',
        activeJobsHint: 'Each card is one URL.',
        downloaded: 'Downloaded',
        total: 'Total',
        eta: 'ETA',
        currentCommand: 'Current command',
        ffmpegPath: 'FFmpeg path',
        logs: 'Logs',
        logsHint: 'Keeps the latest 600 lines.',
        noLogs: 'No output yet.',
        recentJobs: 'Recent jobs',
        recentJobsHint: 'Click a card to refill URLs and folder.',
        clearHistory: 'Clear history',
        noHistory: 'No history yet.',
        audioExtract: 'Audio extract',
        videoDownload: 'Video download',
        language: 'Language',
        theme: 'Theme',
        themeMidnight: 'Midnight',
        themeEmber: 'Ember',
        themeAurora: 'Aurora',
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
  return { ...DEFAULT_PREFS, ...parsed, enabledExtraPresets }
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

function classifyCookieFile(item: CookieFileInfo, language: Language) {
  const normalized = item.label.replace(/\\/g, '/').toLowerCase()
  if (normalized.endsWith('split/bilibili-family.txt')) {
    return {
      rank: 0,
      label: `[B站推荐] ${item.label}`,
      note: language === 'zh' ? '最推荐，适合 B 站课程、会员和多数需要登录态的内容。' : 'Recommended for Bilibili courses and member-only content.',
    }
  }
  if (normalized.includes('bilibili') || normalized.includes('biligame')) {
    return {
      rank: 1,
      label: `[B站相关] ${item.label}`,
      note: language === 'zh' ? 'B 站相关 cookies 文件，通常比整浏览器导出更干净。' : 'Bilibili-related cookie file.',
    }
  }
  if (normalized.includes('split/')) {
    return {
      rank: 2,
      label: `[拆分文件] ${item.label}`,
      note: language === 'zh' ? '拆分后的站点专用 cookies 文件。' : 'Split site-specific cookie file.',
    }
  }
  return {
    rank: 3,
    label: `[原始导出] ${item.label}`,
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
  const [logs, setLogs] = useState<string[]>([])
  const [queue, setQueue] = useState<QueueSnapshot>({ total: 0, pending: 0, running: 0, completed: 0, failed: 0, cancelled: 0, concurrency: 1 })
  const [jobs, setJobs] = useState<Record<string, JobSnapshot>>({})
  const [jobOrder, setJobOrder] = useState<string[]>([])
  const [status, setStatus] = useState<DownloadStatus>('idle')
  const [statusMessage, setStatusMessage] = useState(getText(initialPreferences.language).startHint)
  const [activeCommand, setActiveCommand] = useState('')
  const [history, setHistory] = useState<HistoryItem[]>(() => readHistory())
  const [selfCheckItems, setSelfCheckItems] = useState<SelfCheckItem[]>([])
  const [toolsSource, setToolsSource] = useState<'bundled' | 'external'>('external')
  const [runtimeRefreshing, setRuntimeRefreshing] = useState(false)
  const activeQueueSnapshotRef = useRef<ActiveQueueSnapshot>({
    mode: initialPreferences.mode,
    outputDir: initialPreferences.outputDir,
  })
  const logViewerRef = useRef<HTMLDivElement | null>(null)
  const text = getText(language)
  const normalizedHeroTitle = text.heroTitle.replace(/[。.]$/, '')
  const extraOptionsLabel = language === 'zh' ? '额外附加项' : 'Extra options'
  const extraOptionsHint =
    language === 'zh'
      ? '这些是额外增强项，不选也可以直接开始下载；本地字幕或音轨处理请去“媒体工具”窗口。'
      : 'These are optional add-ons. You can start downloads without them. Use the Media tools window for local subtitle or audio extraction.'
  const cookiesPluginUrl = 'https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc'
  const cookiesPluginLabel = language === 'zh' ? '推荐插件：Get cookies.txt LOCALLY' : 'Recommended: Get cookies.txt LOCALLY'
  const cookiesPluginHint =
    language === 'zh'
      ? '会员或登录态内容建议先用这个浏览器扩展导出 cookies.txt，再放进本项目的 cookies 目录。'
      : 'For member-only or signed-in content, export a cookies.txt file with this browser extension first, then place it in the project cookies folder.'
  const cookiesPluginButton = language === 'zh' ? '打开插件页' : 'Open extension page'
  const denoInstallUrl = 'https://deno.com/'
  const denoInstallButton = language === 'zh' ? '安装 Deno' : 'Install Deno'
  const denoInstallHint =
    language === 'zh'
      ? '安装后可提升 YouTube 等站点的解析稳定性。'
      : 'Install it to improve extraction stability for YouTube and similar sites.'
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
    const prefs: StoredPreferences = { outputDir, mode, audioFormat, audioQuality, videoPreset, language, theme, cookieFile, enabledExtraPresets }
    writeJsonStorage(STORAGE_KEY, prefs)
  }, [audioFormat, audioQuality, cookieFile, enabledExtraPresets, language, mode, outputDir, theme, videoPreset])

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
  const canStart = urls.length > 0 && outputDir.trim().length > 0 && queue.running === 0 && queue.pending === 0
  const bootstrapError = !appApi ? text.bootstrapError : null
  const effectiveStatus = bootstrapError ? 'error' : status
  const effectiveMessage = bootstrapError ?? statusMessage
  const visibleLogs = bootstrapError ? ['[bootstrap] window.appApi is unavailable'] : logs
  const denoHint = paths?.denoPath ? text.denoReady : text.denoMissing
  const sortedJobs = jobOrder.map((jobId) => jobs[jobId]).filter(Boolean)
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
  const liveJob = useMemo(
    () => [...sortedJobs].reverse().find((job) => job.status === 'running') ?? null,
    [sortedJobs],
  )
  const aggregateProgressLabel = queue.total > 0 ? `${aggregateProgressPercent.toFixed(1)}%` : text.waiting
  const combinedExtraArgs = mergeExtraArgs(enabledExtraPresets)
  const selectedCookieMeta = cookieFile ? cookieFiles.find((item) => item.path === cookieFile) : null
  const canClearLinks = linkInputs.some((item) => item.trim().length > 0) || linkInputs.length > 1

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

  async function handlePickFolder() {
    const folder = await appApi.pickDirectory(outputDir)
    if (folder) setOutputDir(folder)
  }

  async function handleStartDownload() {
    setLogs([])
    setJobs({})
    setJobOrder([])
    setActiveCommand('')
    activeQueueSnapshotRef.current = {
      mode,
      outputDir,
    }
    setQueue({ total: urls.length, pending: urls.length, running: 0, completed: 0, failed: 0, cancelled: 0, concurrency: 1 })
    setStatus('running')
    setStatusMessage(text.queuePrepared.replace('{count}', String(urls.length)))
    try {
      await appApi.startDownload({
        urls,
        outputDir,
        mode,
        audioFormat,
        audioQuality,
        videoPreset,
        extraArgs: combinedExtraArgs,
        cookieFile: cookieFile || null,
        concurrency: 1,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start queue.'
      setStatus('error')
      setStatusMessage(message)
      setLogs((current) => [...current, `[ui] ${message}`])
    }
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
    if (data.videoPreset === 'best' || data.videoPreset === '2160p' || data.videoPreset === '1080p' || data.videoPreset === '720p' || data.videoPreset === '480p') setVideoPreset(data.videoPreset)
    if (data.language === 'zh' || data.language === 'en') setLanguage(data.language)
    if (data.theme === 'midnight' || data.theme === 'ember' || data.theme === 'aurora') setTheme(data.theme)
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
            <div className="eyebrow">YT-DLP STUDIO</div>
            <div className="eyebrow brand-signature">DYFO</div>
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
              <span>{language === 'zh' ? '后处理' : 'Post tools'}</span>
              <div className="segmented">
                <button className="segmented__item" type="button" onClick={() => void appApi.openMediaTools()}>
                  {language === 'zh' ? '媒体工具' : 'Media tools'}
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
              <div className="segmented">
                <button className={theme === 'midnight' ? 'segmented__item active' : 'segmented__item'} type="button" onClick={() => setTheme('midnight')}>{text.themeMidnight}</button>
                <button className={theme === 'ember' ? 'segmented__item active' : 'segmented__item'} type="button" onClick={() => setTheme('ember')}>{text.themeEmber}</button>
                <button className={theme === 'aurora' ? 'segmented__item active' : 'segmented__item'} type="button" onClick={() => setTheme('aurora')}>{text.themeAurora}</button>
              </div>
            </div>
          </div>
        </div>
        <h1>{normalizedHeroTitle}</h1>
        <p className="hero__copy">{text.heroCopy}</p>
        <div className="hero__status-grid">
          <div className="status-card"><span className="status-card__label">{text.status}</span><strong>{statusLabel(effectiveStatus, text)}</strong><p>{effectiveMessage}</p></div>
          <div className="status-card"><span className="status-card__label">YT-DLP</span><strong>{paths?.envName ?? text.loading}</strong><p>{paths?.ytDlpPath ?? text.loadingPath}</p></div>
          <div className="status-card">
            <span className="status-card__label">{text.compatibility}</span>
            <strong>{paths?.denoPath ? text.readyForYoutube : text.basicMode}</strong>
            <p>{denoHint}</p>
            {!paths?.denoPath ? (
              <div className="status-card__actions">
                <button className="ghost-button ghost-button--small" type="button" onClick={() => void appApi.openExternal(denoInstallUrl)}>
                  {denoInstallButton}
                </button>
                <small>{denoInstallHint}</small>
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
              .map((item) => `${item.ok ? 'OK' : 'MISS'} ${item.label}: ${item.detail}`)
              .join('\n')}
          </code>
          <div className="section-actions">
            <button className="ghost-button ghost-button--small" type="button" disabled={runtimeRefreshing || queue.running > 0 || queue.pending > 0} onClick={() => void refreshRuntimeState()}>
              {runtimeRefreshing ? text.refreshingTools : text.refreshTools}
            </button>
          </div>
          <div className="progress-meta progress-meta--wrap">
            <span>{language === 'zh' ? '工具来源' : 'Tool source'}: {toolsSource === 'bundled' ? (language === 'zh' ? '分享包内置' : 'Bundled') : (language === 'zh' ? '系统环境' : 'System')}</span>
          </div>
        </div>
      </section>
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
              <label className="field">
                <span>{text.videoPreset}</span>
                <select value={videoPreset} onChange={(event) => setVideoPreset(event.target.value as VideoPreset)}>
                  <option value="best">{text.best}</option>
                  <option value="2160p">{text.p2160}</option>
                  <option value="1080p">{text.p1080}</option>
                  <option value="720p">{text.p720}</option>
                  <option value="480p">{text.p480}</option>
                </select>
                <small className="field-help">{text.videoPresetHint}</small>
              </label>
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
              <small className="field-help">{selectedCookieMeta ? classifyCookieFile(selectedCookieMeta, language).note : text.cookieHint}</small>
            </label>
            <label className="field field--button">
              <span>Cookies</span>
              <div className="cookie-helper-actions">
                <button className="ghost-button ghost-button--full" type="button" onClick={() => void appApi.openPath(paths?.cookiesDir ?? '')}>{text.openCookiesDir}</button>
                <button className="ghost-button ghost-button--full" type="button" onClick={() => void appApi.openExternal(cookiesPluginUrl)}>{cookiesPluginButton}</button>
              </div>
              <small className="field-help">{cookiesPluginLabel}</small>
              <small className="field-help">{cookiesPluginHint}</small>
              <small className="field-help">{text.cookieFallback}</small>
            </label>
          </div>
          <div className="field">
            <span>{extraOptionsLabel}</span>
            <div className="preset-list">
              {(Object.keys(presetCopy) as ExtraPresetId[]).map((presetId) => {
                const preset = presetCopy[presetId]
                const active = enabledExtraPresets.includes(presetId)
                return <button key={presetId} className={active ? 'preset-chip active' : 'preset-chip'} type="button" onClick={() => togglePreset(presetId)}><strong>{preset.label}</strong><span>{preset.desc}</span></button>
              })}
            </div>
            <small className="field-help">{extraOptionsHint}</small>
          </div>
          <div className="command-box"><span>{extraOptionsLabel}</span><code>{combinedExtraArgs || text.waiting}</code></div>
        </section>
        <section className="panel telemetry">
          <div className="section-title"><span>{text.telemetry}</span><small>{text.telemetryHint}</small></div>
          <div className="telemetry-stack">
            <div className="progress-shell progress-shell--overview">
              <div className="progress-shell__header"><strong>{aggregateProgressLabel}</strong><span>{text.queueProgress}</span></div>
              <div className="progress-shell__subhead"><span>{text.queueProgressHint}</span><strong>{queue.total > 0 ? `${queue.completed}/${queue.total}` : text.queueSummary}</strong></div>
              <div className="progress-bar"><div className="progress-bar__fill" style={{ width: `${queue.total > 0 ? Math.max(aggregateProgressPercent, 4) : 4}%` }} /></div>
              <div className="progress-meta progress-meta--wrap"><span>{text.pending}: {queue.pending}</span><span>{text.running}: {queue.running}</span><span>{text.done}: {queue.completed}</span><span>{text.failed}: {queue.failed}</span><span>{text.cancelled}: {queue.cancelled}</span></div>
            </div>
            <div className="progress-shell progress-shell--focus">
              <div className="progress-shell__header"><strong>{text.liveDownload}</strong><span>{text.liveDownloadHint}</span></div>
              {liveJob ? (
                <>
                  <div className="progress-focus__title"><strong>{liveJob.title}</strong><span>{statusLabel(liveJob.status, text)}</span></div>
                  <p className="progress-focus__url">{liveJob.url}</p>
                  <div className="progress-bar progress-bar--small"><div className="progress-bar__fill" style={{ width: `${Math.max(clampPercent(liveJob.percent), 6)}%` }} /></div>
                  <div className="progress-meta progress-meta--wrap"><span>{liveJob.percent !== null ? `${liveJob.percent.toFixed(1)}%` : text.waiting}</span><span>{text.downloaded}: {liveJob.downloaded}</span><span>{text.total}: {liveJob.total}</span><span>{text.eta}: {liveJob.eta}</span><span>{liveJob.speed}</span></div>
                </>
              ) : (
                <div className="job-empty job-empty--compact">{text.liveDownloadIdle}</div>
              )}
            </div>
          </div>
          <div className="job-grid">
            <div className="section-title section-title--tight"><span>{text.activeJobs}</span><small>{text.activeJobsHint}</small></div>
            {sortedJobs.length === 0 ? <div className="job-empty">{text.waiting}</div> : sortedJobs.map((job) => (
              <div className="job-card" key={job.jobId}>
                <div className="job-card__header"><strong>{job.title}</strong><span>{statusLabel(job.status, text)}</span></div>
                <p className="job-card__url">{job.url}</p>
                <div className="progress-bar progress-bar--small"><div className="progress-bar__fill" style={{ width: `${Math.max(job.percent ?? 4, 4)}%` }} /></div>
                <div className="progress-meta progress-meta--wrap"><span>{job.percent !== null ? `${job.percent.toFixed(1)}%` : text.waiting}</span><span>{text.downloaded}: {job.downloaded}</span><span>{text.total}: {job.total}</span><span>{text.eta}: {job.eta}</span><span>{job.speed}</span></div>
                {job.outputPath ? <button className="ghost-button ghost-button--full" type="button" onClick={() => void appApi.showItemInFolder(job.outputPath ?? '')}>{text.openFile}</button> : null}
              </div>
            ))}
          </div>
          <div className="telemetry-meta-grid">
            <div className="command-box"><span>{text.currentCommand}</span><code>{activeCommand || text.currentCommandPlaceholder}</code></div>
            <div className="command-box"><span>{text.ffmpegPath}</span><code>{paths?.ffmpegPath ?? text.loading}</code></div>
          </div>
        </section>
        <section className="panel logs">
          <div className="section-title"><span>{text.logs}</span><small>{text.logsHint}</small></div>
          <div className="log-viewer" ref={logViewerRef}>{visibleLogs.length === 0 ? <div className="log-placeholder">{text.noLogs}</div> : visibleLogs.map((line, index) => <div className="log-line" key={`${line}-${index}`}>{line}</div>)}</div>
        </section>
        <section className="panel history">
          <div className="section-title"><span>{text.recentJobs}</span><div className="section-actions"><small>{text.recentJobsHint}</small><button className="ghost-button ghost-button--small" type="button" onClick={() => { setHistory([]); removeStorageItem(HISTORY_KEY) }}>{text.clearHistory}</button></div></div>
          <div className="history-list">
            {history.length === 0 ? <div className="history-empty">{text.noHistory}</div> : history.map((item) => (
              <button className="history-item" key={item.id} type="button" onClick={() => { setLinkInputs(Array.isArray(item.urls) && item.urls.length > 0 ? item.urls : ['']); setOutputDir(item.outputDir); setMode(item.mode); setStatusMessage(text.copiedFromHistory) }}>
                <div className="history-item__content">
                  <strong>{item.mode === 'audio' ? text.audioExtract : text.videoDownload}</strong>
                  <p>{(Array.isArray(item.urls) ? item.urls : []).join(' | ')}</p>
                </div>
                <div className={`history-badge history-badge--${item.status}`}>{statusLabel(item.status, text)}</div>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
