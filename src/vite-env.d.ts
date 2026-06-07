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
  cookieExtensionDir: string | null
  cookieExtensionZipPath: string | null
}

type CookieFileInfo = {
  label: string
  path: string
  domains: string[]
  cookieCount: number
  expiredCookieCount: number
  expiredCookieNames: string[]
  expiringSoonCookieCount: number
  expiringSoonCookieNames: string[]
}

type CookieZipImportResult = {
  importedDir: string
  importedFiles: string[]
  cookieFiles: CookieFileInfo[]
}

type SelfCheckItem = {
  key: string
  label: string
  ok: boolean
  detail: string
}

type UpdateCheckResult = {
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
  releaseName: string | null
  releaseUrl: string | null
  assetName: string | null
  assetUrl: string | null
}

type UpdateDownloadResult = {
  filePath: string
  assetName: string
  releaseUrl: string
}

type RuntimeToolInstallResult = {
  tool: 'deno'
  path: string
  version: string
}

type MediaToolAction = 'extractAudio' | 'extractSubtitles'
type MediaAudioExportFormat = 'mp3' | 'wav' | 'flac' | 'm4a'
type MediaSubtitleExportFormat = 'srt' | 'ass' | 'vtt'
type SubtitleCleanupMode = 'single' | 'batch'
type MediaMergeMode = 'selection' | 'folder'
type MediaMergeOutputFormat = 'mp4' | 'mkv' | 'mov'

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

type MediaMergePair = {
  videoPath: string
  audioPath: string
  outputPath: string
  durationDiff: number | null
  durationSeconds: number | null
  estimatedSizeBytes: number | null
  videoAudioTracks: number
  audioTracks: number
  matchReason: string
}

type MediaMergePreviewResult = {
  inputCount: number
  videoCount: number
  audioCount: number
  pairCount: number
  unmatchedVideoCount: number
  unmatchedAudioCount: number
  estimatedSizeBytes: number | null
  estimatedDurationSeconds: number | null
  longestDurationSeconds: number | null
  pairs: MediaMergePair[]
  skipped: { path: string; reason: string }[]
}

type MediaMergeRequest = {
  mode: MediaMergeMode
  inputPaths: string[]
  inputDir: string | null
  outputDir: string
  outputFormat: MediaMergeOutputFormat
  outputName: string | null
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
  urlCookieFiles: Array<string | null>
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
  exitCode?: number | null
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
  | { type: 'log'; line: string; stream: 'stdout' | 'stderr' | 'system' }
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
    importCookieZip: () => Promise<CookieZipImportResult | null>
    getSelfCheck: () => Promise<{ items: SelfCheckItem[]; toolsSource: 'bundled' | 'external' }>
    checkForUpdates: () => Promise<UpdateCheckResult>
    downloadLatestUpdate: () => Promise<UpdateDownloadResult>
    installDenoRuntime: () => Promise<RuntimeToolInstallResult>
    openMediaTools: () => Promise<void>
    pickDirectory: (currentPath?: string) => Promise<string | null>
    pickMediaFile: (currentPath?: string) => Promise<string | null>
    pickMediaFiles: (currentPath?: string) => Promise<string[]>
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
    previewMediaMerge: (request: MediaMergeRequest) => Promise<MediaMergePreviewResult>
    runMediaMerge: (request: MediaMergeRequest) => Promise<string[]>
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
    copyText: (text: string) => Promise<boolean>
    exportTextLog: (defaultName: string, content: string) => Promise<string | null>
    onDownloadUpdate: (listener: (payload: DownloadUpdate) => void) => Unsubscribe
    onMediaToolsUpdate: (listener: (payload: MediaToolsUpdate) => void) => Unsubscribe
  }
}
