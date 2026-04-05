/// <reference types="vite/client" />

type DownloadMode = 'video' | 'audio'
type AudioFormat = 'mp3' | 'm4a' | 'wav' | 'opus'
type VideoPreset = 'best' | '2160p' | '1080p' | '720p' | '480p'
type AudioQuality = 'best' | '320k' | '192k' | '128k'
type DownloadStatus = 'idle' | 'running' | 'success' | 'error' | 'cancelled'

type AppPaths = {
  ytDlpPath: string
  ffmpegPath: string
  ffprobePath: string
  denoPath: string | null
  defaultDownloadDir: string
  envName: string
  cookiesDir: string
}

type CookieFileInfo = {
  label: string
  path: string
}

type SelfCheckItem = {
  key: string
  label: string
  ok: boolean
  detail: string
}

type MediaToolAction = 'extractAudio' | 'extractSubtitles'
type MediaAudioExportFormat = 'mp3' | 'wav' | 'flac' | 'm4a'
type MediaSubtitleExportFormat = 'srt' | 'ass' | 'vtt'
type SubtitleCleanupMode = 'single' | 'batch'

type SubtitleCleanupConfig = {
  baseUrl: string
  apiKey: string
  model: string
  prompt: string
  thinkingMode: 'default' | 'disabled'
  customPresets: SubtitleCleanupCustomPreset[]
  providerProfiles: Record<string, SubtitleCleanupProviderProfile>
}

type SubtitleCleanupCustomPreset = {
  id: string
  label: string
  url: string
}

type SubtitleCleanupProviderProfile = {
  baseUrl: string
  apiKey: string
  model: string
}

type MediaStreamInfo = {
  index: number
  codecType: string
  codecName: string
  language: string
  title: string
}

type MediaInspection = {
  inputPath: string
  fileName: string
  duration: number | null
  formatName: string
  streams: MediaStreamInfo[]
}

type DownloadRequest = {
  urls: string[]
  outputDir: string
  mode: DownloadMode
  audioFormat: AudioFormat
  audioQuality: AudioQuality
  videoPreset: VideoPreset
  extraArgs: string
  cookieFile: string | null
  concurrency: number
}

type JobSnapshot = {
  jobId: string
  url: string
  title: string
  status: DownloadStatus
  percent: number | null
  downloaded: string
  total: string
  speed: string
  eta: string
  outputPath?: string
  command?: string
  message?: string
  index: number
  totalJobs: number
}

type QueueSnapshot = {
  total: number
  pending: number
  running: number
  completed: number
  failed: number
  cancelled: number
  concurrency: number
}

type DownloadUpdate =
  | {
      type: 'log'
      line: string
      stream: 'stdout' | 'stderr' | 'system'
      jobId?: string
    }
  | {
      type: 'job'
      job: JobSnapshot
    }
  | {
      type: 'queue'
      queue: QueueSnapshot
      message?: string
    }

type MediaToolsUpdate =
  | { type: 'clear' }
  | { type: 'command'; command: string }
  | { type: 'log'; line: string; stream: 'stdout' | 'stderr' }
  | {
      type: 'status'
      status: DownloadStatus
      message: string
      outputs?: string[]
      progress?: {
        current: number
        total: number
        currentPath?: string
      }
    }

type Unsubscribe = () => void

interface Window {
  appApi: Window['ytDlpApi']
  ytDlpApi: {
    getPaths: () => Promise<AppPaths>
    listCookieFiles: () => Promise<CookieFileInfo[]>
    getSelfCheck: () => Promise<{ items: SelfCheckItem[]; toolsSource: 'bundled' | 'external' }>
    openMediaTools: () => Promise<void>
    pickDirectory: (currentPath?: string) => Promise<string | null>
    pickMediaFile: (currentPath?: string) => Promise<string | null>
    pickSubtitleFile: (currentPath?: string) => Promise<string | null>
    exportConfig: (config: unknown) => Promise<string | null>
    importConfig: () => Promise<unknown | null>
    startDownload: (request: DownloadRequest) => Promise<void>
    cancelDownload: () => Promise<void>
    inspectMedia: (inputPath: string) => Promise<MediaInspection>
    runMediaTool: (request: {
      action: MediaToolAction
      inputPath: string
      outputDir: string
      audioFormat: MediaAudioExportFormat
      subtitleFormat: MediaSubtitleExportFormat
      subtitleStreamIndexes: number[]
    }) => Promise<string[]>
    cancelMediaTool: () => Promise<void>
    getSubtitleCleanupConfig: () => Promise<SubtitleCleanupConfig>
    saveSubtitleCleanupConfig: (config: Partial<SubtitleCleanupConfig>) => Promise<SubtitleCleanupConfig>
    listSubtitleCleanupModels: (config: Pick<SubtitleCleanupConfig, 'baseUrl' | 'apiKey'>) => Promise<string[]>
    testSubtitleCleanupConnection: (config: SubtitleCleanupConfig) => Promise<{ ok: boolean; message: string }>
    runSubtitleCleanup: (request: SubtitleCleanupConfig & {
      mode: SubtitleCleanupMode
      inputPath: string | null
      inputDir: string | null
      outputDir: string
      skipExistingOutputs: boolean
    }) => Promise<string[]>
    openPath: (targetPath: string) => Promise<void>
    showItemInFolder: (targetPath: string) => Promise<void>
    openExternal: (targetUrl: string) => Promise<void>
    onDownloadUpdate: (listener: (payload: DownloadUpdate) => void) => Unsubscribe
    onMediaToolsUpdate: (listener: (payload: MediaToolsUpdate) => void) => Unsubscribe
  }
}
