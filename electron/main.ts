import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname, relative, parse } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { fileURLToPath } from 'node:url'

type DownloadMode = 'video' | 'audio'
type AudioFormat = 'mp3' | 'm4a' | 'wav' | 'opus'
type AudioQuality = 'best' | '320k' | '192k' | '128k'
type VideoPreset = 'best' | '1080p' | '720p' | '480p'
type DownloadStatus = 'idle' | 'running' | 'success' | 'error' | 'cancelled'
type MediaToolAction = 'extractAudio' | 'extractSubtitles'
type MediaAudioExportFormat = 'mp3' | 'wav' | 'flac' | 'm4a'
type MediaSubtitleExportFormat = 'srt' | 'ass' | 'vtt'

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

type MediaToolRequest = {
  action: MediaToolAction
  inputPath: string
  outputDir: string
  audioFormat: MediaAudioExportFormat
  subtitleFormat: MediaSubtitleExportFormat
  subtitleStreamIndexes: number[]
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

type JobContext = {
  request: DownloadRequest
  jobId: string
  url: string
  index: number
  totalJobs: number
  snapshot: JobSnapshot
  command: string
  process: ChildProcessWithoutNullStreams
}

const envRoot = 'C:\\Users\\84027\\.conda\\envs\\yt-dlp'
const denoCandidates = [
  'C:\\Users\\84027\\AppData\\Local\\Microsoft\\WinGet\\Packages\\DenoLand.Deno_Microsoft.Winget.Source_8wekyb3d8bbwe\\deno.exe',
  'C:\\Program Files\\Deno\\bin\\deno.exe',
]

const __dirname = dirname(fileURLToPath(import.meta.url))
const rendererDist = join(__dirname, '..', 'dist')
const preloadPath = join(__dirname, '..', 'electron', 'preload.cjs')

let mainWindow: BrowserWindow | null = null
let mediaToolsWindow: BrowserWindow | null = null
let activeBatchRequest: DownloadRequest | null = null
let pendingJobs: Array<{ jobId: string; url: string; index: number; totalJobs: number }> = []
const activeJobs = new Map<string, JobContext>()
let queueSnapshot: QueueSnapshot = {
  total: 0,
  pending: 0,
  running: 0,
  completed: 0,
  failed: 0,
  cancelled: 0,
  concurrency: 1,
}
let batchCancelled = false
let activeMediaProcess: ChildProcessWithoutNullStreams | null = null
let mediaCancelled = false

function ensureDirectory(dirPath: string) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true })
  }
  return dirPath
}

function getDevRootDir() {
  return join(__dirname, '..')
}

function getBundledToolsDir() {
  return join(process.resourcesPath, 'tools')
}

function getPortableRootDir() {
  return dirname(process.execPath)
}

function getFallbackToolsDir() {
  return join(envRoot, 'Scripts')
}

function getToolsDir() {
  const candidates = [
    getBundledToolsDir(),
    join(getPortableRootDir(), 'tools'),
    join(getDevRootDir(), 'tools'),
    getFallbackToolsDir(),
  ]

  for (const candidate of candidates) {
    const bundledYtDlpPath = join(candidate, 'yt-dlp.exe')
    if (existsSync(bundledYtDlpPath)) {
      return candidate
    }
  }

  return getFallbackToolsDir()
}

function getCookiesDir() {
  const targetDir = app.isPackaged
    ? join(app.getPath('userData'), 'cookies')
    : join(getDevRootDir(), 'cookies')

  return ensureDirectory(targetDir)
}

function resolveDialogStartDirectory(inputPath?: string) {
  const fallback = resolveDefaultDownloads()
  if (!inputPath || inputPath.trim().length === 0) {
    return fallback
  }

  let currentPath = inputPath.trim()

  while (currentPath.length > 0) {
    if (existsSync(currentPath)) {
      try {
        return statSync(currentPath).isDirectory() ? currentPath : dirname(currentPath)
      } catch {
        break
      }
    }

    const parentPath = dirname(currentPath)
    if (parentPath === currentPath) {
      break
    }
    currentPath = parentPath
  }

  return fallback
}

function getYtDlpPath() {
  return join(getToolsDir(), 'yt-dlp.exe')
}

function getFfmpegPath() {
  return join(getToolsDir(), 'ffmpeg.exe')
}

function getFfprobePath() {
  return join(getToolsDir(), 'ffprobe.exe')
}

function getSelfCheckItems(): SelfCheckItem[] {
  const ytDlpPath = getYtDlpPath()
  const ffmpegPath = getFfmpegPath()
  const ffprobePath = getFfprobePath()
  const denoPath = getDenoPath()

  return [
    {
      key: 'yt-dlp',
      label: 'yt-dlp',
      ok: existsSync(ytDlpPath),
      detail: ytDlpPath,
    },
    {
      key: 'ffmpeg',
      label: 'ffmpeg',
      ok: existsSync(ffmpegPath),
      detail: ffmpegPath,
    },
    {
      key: 'ffprobe',
      label: 'ffprobe',
      ok: existsSync(ffprobePath),
      detail: ffprobePath,
    },
    {
      key: 'deno',
      label: 'Deno',
      ok: denoPath !== null,
      detail: denoPath ?? 'Not found',
    },
    {
      key: 'cookies',
      label: 'Cookies dir',
      ok: existsSync(getCookiesDir()),
      detail: getCookiesDir(),
    },
  ]
}

function emit(payload: unknown) {
  mainWindow?.webContents.send('download:update', payload)
}

function emitMedia(payload: unknown) {
  mediaToolsWindow?.webContents.send('media-tools:update', payload)
}

function emitQueue(message?: string) {
  emit({
    type: 'queue',
    queue: queueSnapshot,
    message,
  })
}

function emitJob(snapshot: JobSnapshot) {
  emit({
    type: 'job',
    job: snapshot,
  })
}

function emitLog(line: string, stream: 'stdout' | 'stderr' | 'system', jobId?: string) {
  emit({
    type: 'log',
    line,
    stream,
    jobId,
  })
}

function resolveDefaultDownloads() {
  return join(homedir(), 'Downloads')
}

function getHostWindow(webContentsId?: Electron.WebContents) {
  return (webContentsId ? BrowserWindow.fromWebContents(webContentsId) : null) ?? mediaToolsWindow ?? mainWindow!
}

function getDenoPath() {
  const existing = denoCandidates.find((candidate) => existsSync(candidate))
  return existing ?? null
}

function listCookieFilesRecursive(rootDir: string, currentDir = rootDir): CookieFileInfo[] {
  if (!existsSync(currentDir)) {
    return []
  }

  const items = readdirSync(currentDir, { withFileTypes: true })
  const result: CookieFileInfo[] = []

  for (const item of items) {
    const fullPath = join(currentDir, item.name)
    if (item.isDirectory()) {
      result.push(...listCookieFilesRecursive(rootDir, fullPath))
      continue
    }

    if (!item.isFile() || !item.name.toLowerCase().endsWith('.txt')) {
      continue
    }

    result.push({
      label: relative(rootDir, fullPath) || item.name,
      path: fullPath,
    })
  }

  return result.sort((left, right) => left.label.localeCompare(right.label))
}

function parseProgressLine(line: string) {
  if (!line.startsWith('PROGRESS|')) {
    return null
  }
  const [, percentText, downloaded, total, speed, eta] = line.split('|')
  const normalized = percentText.replace('%', '').trim()
  const percent = normalized ? Number.parseFloat(normalized) : null
  return {
    percent: Number.isFinite(percent ?? Number.NaN) ? percent : null,
    downloaded: downloaded || '--',
    total: total || '--',
    speed: speed || '--',
    eta: eta || '--',
  }
}

function tokenizeExtraArgs(value: string) {
  const tokens = value.match(/"[^"]*"|'[^']*'|\S+/g) ?? []
  return tokens.map((token) => token.replace(/^['"]|['"]$/g, ''))
}

function videoPresetToFormat(value: VideoPreset) {
  switch (value) {
    case '1080p':
      return 'bestvideo[height<=1080]+bestaudio/best[height<=1080]'
    case '720p':
      return 'bestvideo[height<=720]+bestaudio/best[height<=720]'
    case '480p':
      return 'bestvideo[height<=480]+bestaudio/best[height<=480]'
    default:
      return 'bv*+ba/b'
  }
}

function audioQualityToValue(value: AudioQuality) {
  switch (value) {
    case '320k':
      return '320'
    case '192k':
      return '192'
    case '128k':
      return '128'
    default:
      return '0'
  }
}

function buildArgs(request: DownloadRequest, url: string) {
  const toolsDir = getToolsDir()
  const extraArgs = tokenizeExtraArgs(request.extraArgs.trim())
  const skipDownload = extraArgs.includes('--skip-download')
  const args = [
    '--newline',
    '--progress-template',
    'download:PROGRESS|%(progress._percent_str)s|%(progress._downloaded_bytes_str)s|%(progress._total_bytes_str)s|%(progress._speed_str)s|%(progress._eta_str)s',
    '--print',
    'before_dl:TITLE|%(title)s',
    '--print',
    'after_move:FILEPATH|%(filepath)s',
    '--ffmpeg-location',
    toolsDir,
    '-o',
    join(request.outputDir, '%(title)s [%(id)s].%(ext)s'),
  ]

  if (!skipDownload && request.mode === 'audio') {
    args.push(
      '-x',
      '--audio-format',
      request.audioFormat,
      '--audio-quality',
      audioQualityToValue(request.audioQuality),
    )
  } else if (!skipDownload) {
    args.push('-f', videoPresetToFormat(request.videoPreset), '--merge-output-format', 'mp4')
  }

  if (request.cookieFile) {
    args.push('--cookies', request.cookieFile)
  }

  args.push(...extraArgs)
  args.push(url)
  return args
}

function stringifyCommand(args: string[]) {
  const ytDlpPath = getYtDlpPath()
  return `"${ytDlpPath}" ${args.map((part) => (part.includes(' ') ? `"${part}"` : part)).join(' ')}`
}

function stringifyExecutableCommand(executable: string, args: string[]) {
  return `"${executable}" ${args.map((part) => (part.includes(' ') ? `"${part}"` : part)).join(' ')}`
}

function parseDuration(value?: string) {
  if (!value) return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

async function inspectMedia(inputPath: string): Promise<MediaInspection> {
  const ffprobePath = getFfprobePath()

  return await new Promise((resolve, reject) => {
    const child = spawn(ffprobePath, [
      '-v',
      'error',
      '-show_entries',
      'format=duration,format_name',
      '-show_streams',
      '-of',
      'json',
      inputPath,
    ])

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8')
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `ffprobe exited with code ${code}`))
        return
      }

      try {
        const payload = JSON.parse(stdout) as {
          format?: { duration?: string; format_name?: string }
          streams?: Array<{ index?: number; codec_type?: string; codec_name?: string; tags?: { language?: string; title?: string } }>
        }

        resolve({
          inputPath,
          fileName: parse(inputPath).base,
          duration: parseDuration(payload.format?.duration),
          formatName: payload.format?.format_name ?? 'unknown',
          streams: (payload.streams ?? []).map((stream) => ({
            index: stream.index ?? -1,
            codecType: stream.codec_type ?? 'unknown',
            codecName: stream.codec_name ?? 'unknown',
            language: stream.tags?.language ?? '',
            title: stream.tags?.title ?? '',
          })),
        })
      } catch (error) {
        reject(error)
      }
    })
  })
}

function getAudioExportConfig(format: MediaAudioExportFormat) {
  switch (format) {
    case 'wav':
      return { extension: 'wav', args: ['-acodec', 'pcm_s16le'] }
    case 'flac':
      return { extension: 'flac', args: ['-acodec', 'flac'] }
    case 'm4a':
      return { extension: 'm4a', args: ['-acodec', 'aac', '-b:a', '256k'] }
    default:
      return { extension: 'mp3', args: ['-acodec', 'libmp3lame', '-q:a', '0'] }
  }
}

function getSubtitleExportConfig(format: MediaSubtitleExportFormat) {
  switch (format) {
    case 'ass':
      return { extension: 'ass', args: ['-c:s', 'ass'] }
    case 'vtt':
      return { extension: 'vtt', args: ['-c:s', 'webvtt'] }
    default:
      return { extension: 'srt', args: ['-c:s', 'srt'] }
  }
}

function buildMediaOutputPath(inputPath: string, outputDir: string, suffix: string, extension: string) {
  const baseName = parse(inputPath).name
  return join(outputDir, `${baseName}${suffix}.${extension}`)
}

async function runLoggedProcess(executable: string, args: string[], cwd: string) {
  return await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env: {
        ...process.env,
        PATH: `${getToolsDir()};${process.env.PATH ?? ''}`,
      },
    })

    activeMediaProcess = child
    const stdoutDecoder = new StringDecoder('utf8')
    const stderrDecoder = new StringDecoder('utf8')
    let stdoutBuffer = ''
    let stderrBuffer = ''

    const flush = (stream: 'stdout' | 'stderr') => {
      const current = stream === 'stdout' ? stdoutBuffer : stderrBuffer
      const lines = current.split(/\r?\n/)
      const remainder = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        emitMedia({ type: 'log', line: trimmed, stream })
      }

      if (stream === 'stdout') stdoutBuffer = remainder
      else stderrBuffer = remainder
    }

    child.stdout.on('data', (chunk) => {
      stdoutBuffer += stdoutDecoder.write(chunk)
      flush('stdout')
    })

    child.stderr.on('data', (chunk) => {
      stderrBuffer += stderrDecoder.write(chunk)
      flush('stderr')
    })

    child.on('error', (error) => {
      activeMediaProcess = null
      reject(error)
    })

    child.on('close', (code) => {
      stdoutBuffer += stdoutDecoder.end()
      stderrBuffer += stderrDecoder.end()
      flush('stdout')
      flush('stderr')
      activeMediaProcess = null

      if (mediaCancelled) {
        reject(new Error('Media tool action was cancelled.'))
        return
      }

      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}`))
        return
      }

      resolve()
    })
  })
}

async function runMediaTool(request: MediaToolRequest) {
  const ffmpegPath = getFfmpegPath()
  const inspection = await inspectMedia(request.inputPath)
  const outputs: string[] = []

  mediaCancelled = false
  emitMedia({
    type: 'status',
    status: 'running',
    message: request.action === 'extractAudio' ? 'Extracting audio track...' : 'Extracting subtitle streams...',
  })

  if (request.action === 'extractAudio') {
    const audioExport = getAudioExportConfig(request.audioFormat)
    const outputPath = buildMediaOutputPath(request.inputPath, request.outputDir, ` - audio-${request.audioFormat}`, audioExport.extension)
    const args = ['-y', '-i', request.inputPath, '-vn', ...audioExport.args, outputPath]
    emitMedia({ type: 'command', command: stringifyExecutableCommand(ffmpegPath, args) })
    await runLoggedProcess(ffmpegPath, args, request.outputDir)
    outputs.push(outputPath)
  } else {
    const subtitleStreams = inspection.streams.filter((stream) => stream.codecType === 'subtitle')
    if (subtitleStreams.length === 0) {
      throw new Error('No subtitle streams were found in this file.')
    }

    const selectedSubtitleStreams =
      request.subtitleStreamIndexes.length > 0
        ? subtitleStreams.filter((stream) => request.subtitleStreamIndexes.includes(stream.index))
        : subtitleStreams

    if (selectedSubtitleStreams.length === 0) {
      throw new Error('No selected subtitle streams were found in this file.')
    }

    for (const stream of selectedSubtitleStreams) {
      if (mediaCancelled) {
        throw new Error('Media tool action was cancelled.')
      }

      const subtitleExport = getSubtitleExportConfig(request.subtitleFormat)
      const outputPath = buildMediaOutputPath(
        request.inputPath,
        request.outputDir,
        ` - subtitle-${String(stream.index).padStart(2, '0')}`,
        subtitleExport.extension,
      )
      const args = ['-y', '-i', request.inputPath, '-map', `0:${stream.index}`, ...subtitleExport.args, outputPath]
      emitMedia({ type: 'command', command: stringifyExecutableCommand(ffmpegPath, args) })
      await runLoggedProcess(ffmpegPath, args, request.outputDir)
      outputs.push(outputPath)
    }
  }

  emitMedia({
    type: 'status',
    status: 'success',
    message: request.action === 'extractAudio' ? 'Audio track exported.' : 'Subtitle streams exported.',
    outputs,
  })

  return outputs
}

function refreshQueueSnapshot() {
  queueSnapshot = {
    ...queueSnapshot,
    pending: pendingJobs.length,
    running: activeJobs.size,
  }
}

function finishIfBatchDone() {
  refreshQueueSnapshot()
  const isDone = queueSnapshot.pending === 0 && queueSnapshot.running === 0
  emitQueue(
    isDone
      ? batchCancelled
        ? 'Queue cancelled.'
        : queueSnapshot.failed > 0
          ? 'Queue finished with some failed jobs.'
          : 'Queue finished.'
      : undefined,
  )

  if (isDone) {
    activeBatchRequest = null
    batchCancelled = false
  }
}

function startNextJobs() {
  if (!activeBatchRequest) {
    return
  }

  while (pendingJobs.length > 0 && activeJobs.size < queueSnapshot.concurrency) {
    const next = pendingJobs.shift()
    if (!next) {
      continue
    }

    const args = buildArgs(activeBatchRequest, next.url)
    const command = stringifyCommand(args)
    const snapshot: JobSnapshot = {
      jobId: next.jobId,
      url: next.url,
      title: next.url,
      status: 'running',
      percent: null,
      downloaded: '--',
      total: '--',
      speed: '--',
      eta: '--',
      command,
      message: 'Download started.',
      index: next.index,
      totalJobs: next.totalJobs,
    }

    emitLog(`[job ${next.index}/${next.totalJobs}] ${next.url}`, 'system', next.jobId)
    emitLog(`> ${command}`, 'system', next.jobId)
    emitJob(snapshot)

    const toolsDir = getToolsDir()
    const ytDlpPath = getYtDlpPath()
    const child = spawn(ytDlpPath, args, {
      cwd: activeBatchRequest.outputDir,
      env: {
        ...process.env,
        PATH: `${toolsDir};${process.env.PATH ?? ''}`,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      },
    })

    const stdoutDecoder = new StringDecoder('utf8')
    const stderrDecoder = new StringDecoder('utf8')

    const context: JobContext = {
      request: activeBatchRequest,
      jobId: next.jobId,
      url: next.url,
      index: next.index,
      totalJobs: next.totalJobs,
      snapshot,
      command,
      process: child,
    }

    activeJobs.set(next.jobId, context)
    refreshQueueSnapshot()
    emitQueue()

    const handleLine = (rawLine: string, stream: 'stdout' | 'stderr') => {
      const line = rawLine.trim()
      if (!line) {
        return
      }

      const job = activeJobs.get(next.jobId)
      if (!job) {
        return
      }

      const progress = parseProgressLine(line)
      if (progress) {
        job.snapshot = {
          ...job.snapshot,
          ...progress,
          status: 'running',
          message: `Downloading at ${progress.speed}`,
        }
        emitJob(job.snapshot)
        return
      }

      if (line.startsWith('TITLE|')) {
        job.snapshot = {
          ...job.snapshot,
          title: line.replace('TITLE|', ''),
        }
        emitJob(job.snapshot)
        return
      }

      if (line.startsWith('FILEPATH|')) {
        job.snapshot = {
          ...job.snapshot,
          outputPath: line.replace('FILEPATH|', ''),
        }
        emitJob(job.snapshot)
        return
      }

      emitLog(line, stream, next.jobId)
    }

    let stdoutBuffer = ''
    let stderrBuffer = ''

    const flushLines = (stream: 'stdout' | 'stderr') => {
      const currentBuffer = stream === 'stdout' ? stdoutBuffer : stderrBuffer
      const lines = currentBuffer.split(/\r?\n/)
      const remainder = lines.pop() ?? ''

      lines.forEach((line) => handleLine(line, stream))

      if (stream === 'stdout') {
        stdoutBuffer = remainder
      } else {
        stderrBuffer = remainder
      }
    }

    child.stdout.on('data', (chunk) => {
      stdoutBuffer += stdoutDecoder.write(chunk)
      flushLines('stdout')
    })

    child.stderr.on('data', (chunk) => {
      stderrBuffer += stderrDecoder.write(chunk)
      flushLines('stderr')
    })

    child.on('close', (code) => {
      stdoutBuffer += stdoutDecoder.end()
      stderrBuffer += stderrDecoder.end()

      if (stdoutBuffer.trim()) {
        handleLine(stdoutBuffer, 'stdout')
        stdoutBuffer = ''
      }

      if (stderrBuffer.trim()) {
        handleLine(stderrBuffer, 'stderr')
        stderrBuffer = ''
      }

      const job = activeJobs.get(next.jobId)
      if (!job) {
        return
      }

      const status: DownloadStatus = batchCancelled ? 'cancelled' : code === 0 ? 'success' : 'error'
      job.snapshot = {
        ...job.snapshot,
        status,
        percent: status === 'success' ? 100 : job.snapshot.percent,
        message:
          status === 'cancelled'
            ? 'Cancelled.'
            : code === 0
              ? 'Finished.'
              : `Exited with code ${code ?? 'unknown'}.`,
      }
      emitJob(job.snapshot)

      activeJobs.delete(next.jobId)
      if (status === 'success') {
        queueSnapshot.completed += 1
      } else if (status === 'cancelled') {
        queueSnapshot.cancelled += 1
      } else {
        queueSnapshot.failed += 1
      }

      refreshQueueSnapshot()
      emitQueue()
      startNextJobs()
      finishIfBatchDone()
    })

    child.on('error', (error) => {
      const job = activeJobs.get(next.jobId)
      if (!job) {
        return
      }

      job.snapshot = {
        ...job.snapshot,
        status: 'error',
        message: `Failed to start: ${error.message}`,
      }
      emitJob(job.snapshot)
      emitLog(`Failed to start: ${error.message}`, 'stderr', next.jobId)

      activeJobs.delete(next.jobId)
      queueSnapshot.failed += 1
      refreshQueueSnapshot()
      emitQueue()
      startNextJobs()
      finishIfBatchDone()
    })
  }

  finishIfBatchDone()
}

function createAppWindow(hash = '') {
  const win = new BrowserWindow({
    width: 1500,
    height: 1000,
    minWidth: 1280,
    minHeight: 840,
    backgroundColor: '#09111f',
    title: 'YT-DLP Studio',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl) => {
    console.error('[electron] did-fail-load', { errorCode, errorDescription, validatedUrl })
  })
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[electron] render-process-gone', details)
  })
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log('[renderer]', { level, message, line, sourceId })
  })

  if (devServerUrl) {
    void win.loadURL(`${devServerUrl}${hash}`)
    if (!hash) {
      win.webContents.openDevTools({ mode: 'detach' })
    }
  } else {
    void win.loadFile(join(rendererDist, 'index.html'), hash ? { hash: hash.slice(1) } : undefined)
  }

  return win
}

function createWindow() {
  mainWindow = createAppWindow()
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createMediaToolsWindow() {
  if (mediaToolsWindow && !mediaToolsWindow.isDestroyed()) {
    mediaToolsWindow.focus()
    return mediaToolsWindow
  }

  mediaToolsWindow = createAppWindow('#media-tools')
  mediaToolsWindow.setTitle('YT-DLP Studio - Local Media Tools')
  mediaToolsWindow.setMinimumSize(1100, 760)
  mediaToolsWindow.on('closed', () => {
    mediaToolsWindow = null
  })

  return mediaToolsWindow
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.handle('paths:get', () => ({
  ytDlpPath: getYtDlpPath(),
  ffmpegPath: getFfmpegPath(),
  ffprobePath: getFfprobePath(),
  denoPath: getDenoPath(),
  defaultDownloadDir: resolveDefaultDownloads(),
  envName: getToolsDir() === getFallbackToolsDir() ? 'yt-dlp' : 'portable-tools',
  cookiesDir: getCookiesDir(),
}))

ipcMain.handle('cookies:list', () => listCookieFilesRecursive(getCookiesDir()))

ipcMain.handle('self-check:get', () => ({
  items: getSelfCheckItems(),
  toolsSource: getToolsDir() === getFallbackToolsDir() ? 'conda' : 'bundled',
}))

ipcMain.handle('window:openMediaTools', () => {
  createMediaToolsWindow()
})

ipcMain.handle('dialog:pickDirectory', async (event, currentPath?: string) => {
  const result = await dialog.showOpenDialog(getHostWindow(event.sender), {
    defaultPath: resolveDialogStartDirectory(currentPath),
    properties: ['openDirectory', 'createDirectory'],
  })

  if (result.canceled) {
    return null
  }
  return result.filePaths[0] ?? null
})

ipcMain.handle('dialog:pickMediaFile', async (event, currentPath?: string) => {
  const result = await dialog.showOpenDialog(getHostWindow(event.sender), {
    defaultPath: resolveDialogStartDirectory(currentPath),
    properties: ['openFile'],
    filters: [
      { name: 'Media files', extensions: ['mp4', 'mkv', 'webm', 'mov', 'm4v', 'avi', 'mp3', 'm4a', 'wav', 'flac'] },
      { name: 'All files', extensions: ['*'] },
    ],
  })

  if (result.canceled) {
    return null
  }

  return result.filePaths[0] ?? null
})

ipcMain.handle('shell:openPath', async (_event, targetPath: string) => {
  if (!targetPath) {
    return
  }
  await shell.openPath(targetPath)
})

ipcMain.handle('shell:openExternal', async (_event, targetUrl: string) => {
  if (!targetUrl) {
    return
  }
  await shell.openExternal(targetUrl)
})

ipcMain.handle('config:export', async (_event, config: unknown) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: join(resolveDefaultDownloads(), 'yt-dlp-studio-config.json'),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })

  if (result.canceled || !result.filePath) {
    return null
  }

  writeFileSync(result.filePath, JSON.stringify(config, null, 2), 'utf8')
  return result.filePath
})

ipcMain.handle('config:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    defaultPath: resolveDefaultDownloads(),
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  })

  if (result.canceled || !result.filePaths[0]) {
    return null
  }

  const raw = readFileSync(result.filePaths[0], 'utf8')
  return JSON.parse(raw)
})

ipcMain.handle('media:inspect', async (_event, inputPath: string) => {
  if (!inputPath || !existsSync(inputPath)) {
    throw new Error(`Media file does not exist: ${inputPath}`)
  }

  return await inspectMedia(inputPath)
})

ipcMain.handle('media:cancel', () => {
  mediaCancelled = true
  activeMediaProcess?.kill()
  emitMedia({
    type: 'status',
    status: 'cancelled',
    message: 'Media tool action cancelled.',
  })
})

ipcMain.handle('media:run', async (_event, request: MediaToolRequest) => {
  if (activeMediaProcess) {
    throw new Error('Another media tool action is already running.')
  }
  if (!existsSync(getFfmpegPath())) {
    throw new Error(`ffmpeg was not found at ${getFfmpegPath()}`)
  }
  if (!request.inputPath || !existsSync(request.inputPath)) {
    throw new Error(`Media file does not exist: ${request.inputPath}`)
  }
  if (!request.outputDir || !existsSync(request.outputDir) || !statSync(request.outputDir).isDirectory()) {
    throw new Error(`Output directory does not exist: ${request.outputDir}`)
  }

  return await runMediaTool(request)
})

ipcMain.handle('download:cancel', () => {
  batchCancelled = true

  for (const [, job] of activeJobs) {
    job.process.kill()
  }

  if (pendingJobs.length > 0) {
    queueSnapshot.cancelled += pendingJobs.length
    pendingJobs = []
  }

  refreshQueueSnapshot()
  emitQueue('Cancelling active jobs...')
})

ipcMain.handle('download:start', async (_event, request: DownloadRequest) => {
  const urls = request.urls.map((item) => item.trim()).filter(Boolean)
  const ytDlpPath = getYtDlpPath()
  if (activeJobs.size > 0 || pendingJobs.length > 0) {
    throw new Error('A download queue is already running.')
  }
  if (!existsSync(ytDlpPath)) {
    throw new Error(`yt-dlp was not found at ${ytDlpPath}`)
  }
  if (!statSync(request.outputDir).isDirectory()) {
    throw new Error(`Output directory does not exist: ${request.outputDir}`)
  }
  if (request.cookieFile && !existsSync(request.cookieFile)) {
    throw new Error(`Cookie file does not exist: ${request.cookieFile}`)
  }
  if (urls.length === 0) {
    throw new Error('No URLs were provided.')
  }

  activeBatchRequest = request
  batchCancelled = false
  pendingJobs = urls.map((url, index) => ({
    jobId: `${Date.now()}-${index + 1}`,
    url,
    index: index + 1,
    totalJobs: urls.length,
  }))
  queueSnapshot = {
    total: urls.length,
    pending: pendingJobs.length,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    concurrency: Math.max(1, Math.min(request.concurrency, 3)),
  }

  emitQueue(`Queue started with ${urls.length} job(s).`)
  startNextJobs()
})
