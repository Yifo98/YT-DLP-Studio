import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, dirname, isAbsolute, join, parse, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TextDecoder } from 'node:util'

type DownloadMode = 'video' | 'audio'
type AudioFormat = 'mp3' | 'm4a' | 'wav' | 'opus'
type AudioQuality = 'best' | '320k' | '192k' | '128k'
type VideoPreset = 'best' | '2160p' | '1080p' | '720p' | '480p'
type DownloadStatus = 'idle' | 'running' | 'success' | 'error' | 'cancelled'
type MediaToolAction = 'extractAudio' | 'extractSubtitles'
type MediaAudioExportFormat = 'mp3' | 'wav' | 'flac' | 'm4a'
type MediaSubtitleExportFormat = 'srt' | 'ass' | 'vtt'
type SubtitleCleanupMode = 'single' | 'batch'

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

type SubtitleCleanupRunRequest = SubtitleCleanupConfig & {
  mode: SubtitleCleanupMode
  inputPath: string | null
  inputDir: string | null
  outputDir: string
  skipExistingOutputs: boolean
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

const isWindows = process.platform === 'win32'
const windowsHomeDir = process.env.USERPROFILE ?? homedir()
const windowsLocalAppDataDir = process.env.LOCALAPPDATA ?? join(windowsHomeDir, 'AppData', 'Local')
const windowsProgramFilesDir = process.env.ProgramFiles ?? 'C:\\Program Files'
const envRoot = process.env.YTDLP_ENV_ROOT
  ?? (
    isWindows
      ? join(windowsHomeDir, '.conda', 'envs', 'yt-dlp')
      : join(homedir(), '.conda', 'envs', 'yt-dlp')
  )
const denoCandidates = [
  process.env.DENO_BIN,
  ...(isWindows
    ? [
        join(windowsLocalAppDataDir, 'Microsoft', 'WinGet', 'Packages', 'DenoLand.Deno_Microsoft.Winget.Source_8wekyb3d8bbwe', 'deno.exe'),
        join(windowsProgramFilesDir, 'Deno', 'bin', 'deno.exe'),
      ]
    : [
        join(homedir(), '.deno', 'bin', 'deno'),
        '/opt/homebrew/bin/deno',
        '/usr/local/bin/deno',
      ]),
].filter((value): value is string => Boolean(value))

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
let activeSubtitleCleanupAbort: AbortController | null = null
let subtitleCleanupCancelled = false

const DEFAULT_SUBTITLE_CLEANUP_PROMPT = [
  '请帮我优化以下这份视频字幕文档。这份文档是通过 OCR 自动生成的，包含大量冗余和识别错误，同时含有时间戳和序号，需要请按以下规则进行清理和修复文字，最终形成一整份纯文本。',
  '',
  '1. 叙事完整性（最高优先级）',
  '严禁摘要或精简内容。只要是博主的口播内容，必须 100% 保留。特别注意：文中的具体案例是视频的核心，绝对不能删除或概括。',
  '2. 去除 UI 噪音',
  '去除时间戳、序号、样式标签，或误识别到的明显逻辑不通顺、突然冒出来与上下文不搭的系统 UI 词汇。任何疑似博主口中说出的话，只要出现在句子逻辑中，一律视为口播保留。',
  '3. 术语保护',
  '请务必保留 Claude、Anthropic、Skills、MCP、CODE、NotebookLM、Notion、Obsidain、Slack 等所有英文专业术语，不要翻译成中文或修改。',
  '4. 纠错原则',
  '保留原有叙述顺序，修正明显的 OCR 错别字和断句问题，让文本成为自然可读的纯文本。',
  '5. 输出格式',
  '最终输出只能包含整理后的正文，不要附加标题、解释、摘要、项目符号、Markdown、时间戳或额外说明。',
].join('\n')

function ensureDirectory(dirPath: string) {
  if (existsSync(dirPath)) {
    if (!statSync(dirPath).isDirectory()) {
      throw new Error(`Expected a directory but found a file at: ${dirPath}`)
    }
    return dirPath
  }

  mkdirSync(dirPath, { recursive: true })
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

function uniquePaths(paths: Array<string | undefined>) {
  return [...new Set(paths.filter((value): value is string => Boolean(value)))]
}

function getExecutableName(name: string) {
  return isWindows ? `${name}.exe` : name
}

function getManagedToolBinDirs() {
  const bundledToolsDir = getBundledToolsDir()

  return uniquePaths([
    join(bundledToolsDir, 'bin'),
    bundledToolsDir,
    join(getPortableRootDir(), 'tools', 'bin'),
    join(getPortableRootDir(), 'tools'),
    join(getDevRootDir(), 'tools', 'bin'),
    join(getDevRootDir(), 'tools'),
  ])
}

function getManagedToolLibDirs() {
  const bundledToolsDir = getBundledToolsDir()

  return uniquePaths([
    join(bundledToolsDir, 'lib'),
    join(getPortableRootDir(), 'tools', 'lib'),
    join(getDevRootDir(), 'tools', 'lib'),
  ])
}

function getManagedToolsDirs() {
  return getManagedToolBinDirs()
}

function getFallbackToolDirs() {
  return uniquePaths([
    process.env.YTDLP_TOOLS_DIR,
    join(envRoot, isWindows ? 'Scripts' : 'bin'),
    ...(isWindows ? [] : ['/opt/homebrew/bin', '/usr/local/bin']),
  ])
}

function findExecutableInDirectory(directory: string, name: string) {
  const candidatePath = join(directory, getExecutableName(name))
  return existsSync(candidatePath) ? candidatePath : null
}

function findExecutableInPath(name: string) {
  const pathEntries = (process.env.PATH ?? '').split(delimiter).filter(Boolean)

  for (const entry of uniquePaths(pathEntries)) {
    const candidatePath = findExecutableInDirectory(entry, name)
    if (candidatePath) {
      return candidatePath
    }
  }

  return null
}

function resolveExecutablePath(name: string) {
  const searchDirs = [
    ...getManagedToolsDirs(),
    ...getFallbackToolDirs(),
  ]

  for (const directory of searchDirs) {
    const candidatePath = findExecutableInDirectory(directory, name)
    if (candidatePath) {
      return candidatePath
    }
  }

  return findExecutableInPath(name)
}

function isPathInside(parentDir: string, targetPath: string) {
  const nestedPath = relative(parentDir, targetPath)
  return nestedPath === '' || (!nestedPath.startsWith('..') && !isAbsolute(nestedPath))
}

function getToolsSource() {
  const ytDlpPath = resolveExecutablePath('yt-dlp')
  if (!ytDlpPath) {
    return 'external' as const
  }

  return getManagedToolsDirs().some((directory) => isPathInside(directory, ytDlpPath))
    ? 'bundled'
    : 'external'
}

function getEnvironmentLabel() {
  const ytDlpPath = resolveExecutablePath('yt-dlp')
  if (!ytDlpPath) {
    return 'system-path'
  }

  if (getManagedToolsDirs().some((directory) => isPathInside(directory, ytDlpPath))) {
    return 'portable-tools'
  }

  if (isPathInside(envRoot, ytDlpPath)) {
    return 'conda-env'
  }

  if (ytDlpPath.startsWith('/opt/homebrew')) {
    return 'homebrew'
  }

  return 'system-path'
}

function collectToolPathEntries() {
  const resolvedToolDirs = [
    getYtDlpPath(),
    getFfmpegPath(),
    getFfprobePath(),
  ]
    .filter((value) => isAbsolute(value))
    .map((value) => dirname(value))

  return uniquePaths([
    ...resolvedToolDirs,
    ...getManagedToolBinDirs(),
    ...getFallbackToolDirs(),
    ...(process.env.PATH ?? '').split(delimiter).filter(Boolean),
  ])
}

function buildToolPathEnv() {
  return collectToolPathEntries().join(delimiter)
}

function buildDyldLibraryPathEnv() {
  return uniquePaths([
    ...getManagedToolLibDirs(),
    process.env.DYLD_LIBRARY_PATH,
  ]).join(delimiter)
}

function createStreamDecoder() {
  const encoding = isWindows ? 'gb18030' : 'utf-8'

  try {
    const decoder = new TextDecoder(encoding, { fatal: false })
    return {
      write(chunk: Uint8Array) {
        return decoder.decode(chunk, { stream: true })
      },
      end() {
        return decoder.decode()
      },
    }
  } catch {
    const decoder = new TextDecoder('utf-8', { fatal: false })
    return {
      write(chunk: Uint8Array) {
        return decoder.decode(chunk, { stream: true })
      },
      end() {
        return decoder.decode()
      },
    }
  }
}

function getCookiesDir() {
  const targetDir = app.isPackaged
    ? isWindows
      ? join(getPortableRootDir(), 'cookies')
      : join(app.getPath('userData'), 'cookie-files')
    : join(getDevRootDir(), 'cookies')

  return ensureDirectory(targetDir)
}

function getSubtitleCleanupConfigPath() {
  return join(app.getPath('userData'), 'subtitle-cleanup-config.json')
}

function normalizeSubtitleCleanupProviderProfile(input?: Partial<SubtitleCleanupProviderProfile> | null): SubtitleCleanupProviderProfile {
  return {
    baseUrl: input?.baseUrl?.trim() ?? '',
    apiKey: input?.apiKey?.trim() ?? '',
    model: input?.model?.trim() ?? '',
  }
}

function normalizeSubtitleCleanupThinkingMode(input?: string | null): SubtitleCleanupConfig['thinkingMode'] {
  return input === 'disabled' ? 'disabled' : 'default'
}

function normalizeSubtitleCleanupConfig(input?: Partial<SubtitleCleanupConfig> | null): SubtitleCleanupConfig {
  const customPresets = Array.isArray(input?.customPresets)
    ? input.customPresets
        .map((item, index) => ({
          id: typeof item?.id === 'string' && item.id.trim() ? item.id.trim() : `custom-${index + 1}`,
          label: typeof item?.label === 'string' && item.label.trim() ? item.label.trim() : '',
          url: typeof item?.url === 'string' ? item.url.trim() : '',
        }))
        .filter((item) => item.label && item.url)
    : []
  const providerProfiles = input?.providerProfiles && typeof input.providerProfiles === 'object'
    ? Object.fromEntries(
        Object.entries(input.providerProfiles)
          .map(([key, value]) => [key.trim(), normalizeSubtitleCleanupProviderProfile(value)] as const)
          .filter(([key, value]) => key && (value.baseUrl || value.apiKey || value.model)),
      ) as Record<string, SubtitleCleanupProviderProfile>
    : {}

  return {
    baseUrl: input?.baseUrl?.trim() ?? '',
    apiKey: input?.apiKey?.trim() ?? '',
    model: input?.model?.trim() ?? '',
    prompt: input?.prompt?.trim() || DEFAULT_SUBTITLE_CLEANUP_PROMPT,
    thinkingMode: normalizeSubtitleCleanupThinkingMode(input?.thinkingMode),
    customPresets,
    providerProfiles,
  }
}

function shouldDisableThinkingForProvider(config: Pick<SubtitleCleanupConfig, 'baseUrl' | 'thinkingMode'>) {
  if (config.thinkingMode !== 'disabled') {
    return false
  }

  const normalizedBaseUrl = config.baseUrl.trim().toLowerCase()
  return normalizedBaseUrl.includes('bigmodel.cn') || normalizedBaseUrl.includes('z.ai')
}

function buildSubtitleCleanupRequestBody(config: SubtitleCleanupConfig, chunk: string) {
  const body: Record<string, unknown> = {
    model: config.model,
    temperature: 0,
    messages: [
      { role: 'system', content: config.prompt },
      { role: 'user', content: chunk },
    ],
  }

  if (shouldDisableThinkingForProvider(config)) {
    body.thinking = { type: 'disabled' }
  }

  return body
}

function buildSubtitleCleanupConnectionTestBody(config: SubtitleCleanupConfig) {
  const body: Record<string, unknown> = {
    model: config.model,
    temperature: 0,
    max_tokens: 24,
    messages: [
      { role: 'system', content: 'Reply with OK only.' },
      { role: 'user', content: 'Connection test.' },
    ],
  }

  if (shouldDisableThinkingForProvider(config)) {
    body.thinking = { type: 'disabled' }
  }

  return body
}

function loadSubtitleCleanupConfig() {
  const configPath = getSubtitleCleanupConfigPath()
  if (!existsSync(configPath)) {
    return normalizeSubtitleCleanupConfig()
  }

  try {
    const raw = readFileSync(configPath, 'utf8')
    return normalizeSubtitleCleanupConfig(JSON.parse(raw) as Partial<SubtitleCleanupConfig>)
  } catch {
    return normalizeSubtitleCleanupConfig()
  }
}

function saveSubtitleCleanupConfig(input: Partial<SubtitleCleanupConfig>) {
  const configPath = getSubtitleCleanupConfigPath()
  ensureDirectory(dirname(configPath))
  const config = normalizeSubtitleCleanupConfig(input)
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
  return config
}

function buildOpenAiEndpoint(baseUrl: string, path: string) {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '')
  const url = new URL(normalizedBaseUrl)
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const basePath = url.pathname.replace(/\/+$/, '')
  const pathSegments = basePath.split('/').filter(Boolean)
  const lastSegment = pathSegments[pathSegments.length - 1] ?? ''
  const baseHasVersionPrefix =
    /^v\d+$/i.test(lastSegment)
    || /\/(?:api|compatible-mode)(?:\/[^/]+)*\/v\d+$/i.test(basePath)
  const resourcePath = baseHasVersionPrefix
    ? normalizedPath.replace(/^\/v\d+(?=\/)/i, '')
    : normalizedPath

  url.pathname = `${basePath}${resourcePath}`.replace(/\/{2,}/g, '/')
  return url.toString()
}

function buildOpenAiHeaders(apiKey: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }
}

function assertOpenAiConfig(config: Pick<SubtitleCleanupConfig, 'baseUrl' | 'apiKey'> & { model?: string }) {
  if (!config.baseUrl.trim()) {
    throw new Error('Base URL is required.')
  }
  if (!config.apiKey.trim()) {
    throw new Error('API key is required.')
  }
  if ('model' in config && typeof config.model === 'string' && config.model.trim().length === 0) {
    throw new Error('Model is required.')
  }
}

async function parseOpenAiResponse(response: Response) {
  const text = await response.text()
  if (!text) {
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}.`)
    }
    return null
  }

  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}: ${text}`)
    }
    return text
  }

  if (!response.ok) {
    if (
      payload
      && typeof payload === 'object'
      && 'error' in payload
      && payload.error
      && typeof payload.error === 'object'
      && 'message' in payload.error
      && typeof payload.error.message === 'string'
    ) {
      throw new Error(payload.error.message)
    }

    throw new Error(`Request failed with status ${response.status}.`)
  }

  return payload
}

async function listOpenAiModels(config: Pick<SubtitleCleanupConfig, 'baseUrl' | 'apiKey'>) {
  assertOpenAiConfig(config)
  const response = await fetch(buildOpenAiEndpoint(config.baseUrl, '/v1/models'), {
    headers: buildOpenAiHeaders(config.apiKey),
  })

  const payload = await parseOpenAiResponse(response) as { data?: Array<{ id?: string }> } | null
  const models = (payload?.data ?? [])
    .map((item) => item.id?.trim() ?? '')
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))

  if (models.length === 0) {
    throw new Error('No models were returned by this endpoint.')
  }

  return models
}

async function testOpenAiModelConnection(config: SubtitleCleanupConfig) {
  assertOpenAiConfig(config)
  const response = await fetch(buildOpenAiEndpoint(config.baseUrl, '/v1/chat/completions'), {
    method: 'POST',
    headers: buildOpenAiHeaders(config.apiKey),
    body: JSON.stringify(buildSubtitleCleanupConnectionTestBody(config)),
  })

  await parseOpenAiResponse(response)
  return { ok: true as const, message: 'Connection test passed.' }
}

function isSubtitleFile(filePath: string) {
  const extension = parse(filePath).ext.toLowerCase()
  return ['.srt', '.vtt', '.ass', '.ssa', '.txt'].includes(extension)
}

function shouldSkipSubtitleCleanupInput(filePath: string) {
  const normalizedName = parse(filePath).name.toLowerCase()
  return normalizedName.endsWith('.cleaned')
}

function collectSubtitleFiles(inputDir: string) {
  const files: string[] = []
  const entries = readdirSync(inputDir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(inputDir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectSubtitleFiles(fullPath))
      continue
    }
    if (entry.isFile() && isSubtitleFile(fullPath) && !shouldSkipSubtitleCleanupInput(fullPath)) {
      files.push(fullPath)
    }
  }

  return files.sort((left, right) => left.localeCompare(right))
}

function stripSubtitleLineNoise(line: string) {
  if (!line.trim()) {
    return ''
  }

  if (/^\d+$/.test(line.trim())) {
    return ''
  }

  if (/^WEBVTT\b/i.test(line.trim())) {
    return ''
  }

  if (/^(NOTE|STYLE|REGION)\b/i.test(line.trim())) {
    return ''
  }

  if (/^\[[^\]]+\]$/.test(line.trim())) {
    return ''
  }

  if (/^(Script Info|V4\+ Styles|Events|Format)\b/i.test(line.trim())) {
    return ''
  }

  if (/^\d{1,2}:\d{2}:\d{2}(?:[.,]\d{1,3})?\s*-->\s*\d{1,2}:\d{2}:\d{2}(?:[.,]\d{1,3})?/i.test(line.trim())) {
    return ''
  }

  if (/^\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?\s*-->\s*\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?/i.test(line.trim())) {
    return ''
  }

  let nextLine = line

  if (/^Dialogue:/i.test(nextLine)) {
    const segments = nextLine.split(',')
    nextLine = segments.length >= 10 ? segments.slice(9).join(',') : nextLine.replace(/^Dialogue:\s*/i, '')
  }

  nextLine = nextLine
    .replace(/^\uFEFF/, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{[^}]+\}/g, ' ')
    .replace(/\\[Nn]/g, '\n')
    .replace(/\\h/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return nextLine
}

function preprocessSubtitleContent(raw: string) {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const cleanedLines = normalized
    .split('\n')
    .map((line) => stripSubtitleLineNoise(line))
    .filter(Boolean)

  return cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function chunkSubtitleContent(content: string, maxChars = 6000) {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean)

  const chunks: string[] = []
  let buffer = ''

  const pushBuffer = () => {
    if (buffer.trim()) {
      chunks.push(buffer.trim())
      buffer = ''
    }
  }

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      pushBuffer()
      let start = 0
      while (start < paragraph.length) {
        chunks.push(paragraph.slice(start, start + maxChars).trim())
        start += maxChars
      }
      continue
    }

    const candidate = buffer ? `${buffer}\n\n${paragraph}` : paragraph
    if (candidate.length > maxChars) {
      pushBuffer()
      buffer = paragraph
    } else {
      buffer = candidate
    }
  }

  pushBuffer()
  return chunks.length > 0 ? chunks : [content]
}

async function requestSubtitleCleanupChunk(config: SubtitleCleanupConfig, chunk: string) {
  assertOpenAiConfig(config)
  activeSubtitleCleanupAbort = new AbortController()

  try {
    const response = await fetch(buildOpenAiEndpoint(config.baseUrl, '/v1/chat/completions'), {
      method: 'POST',
      headers: buildOpenAiHeaders(config.apiKey),
      signal: activeSubtitleCleanupAbort.signal,
      body: JSON.stringify(buildSubtitleCleanupRequestBody(config, chunk)),
    })

    const payload = await parseOpenAiResponse(response) as {
      choices?: Array<{ message?: { content?: string } }>
    } | null

    const content = payload?.choices?.[0]?.message?.content?.trim()
    if (!content) {
      throw new Error('Model returned an empty response.')
    }

    return content
  } catch (error) {
    if (subtitleCleanupCancelled) {
      throw new Error('Subtitle cleanup was cancelled.')
    }
    throw error
  } finally {
    activeSubtitleCleanupAbort = null
  }
}

function buildSubtitleCleanupOutputPath(inputPath: string, outputDir: string) {
  return join(outputDir, `${parse(inputPath).name}.cleaned.txt`)
}

async function runSubtitleCleanup(request: SubtitleCleanupRunRequest) {
  const config = normalizeSubtitleCleanupConfig(request)
  assertOpenAiConfig(config)

  const targets = request.mode === 'single'
    ? [request.inputPath].filter((value): value is string => Boolean(value)).filter((value) => !shouldSkipSubtitleCleanupInput(value))
    : request.inputDir
      ? collectSubtitleFiles(request.inputDir)
      : []

  if (targets.length === 0) {
    throw new Error(
      request.mode === 'single'
        ? 'Please choose a subtitle file first. Files already ending with .cleaned.txt are skipped.'
        : 'No subtitle files were found in this folder. Files already ending with .cleaned.txt are skipped.',
    )
  }

  subtitleCleanupCancelled = false
  const outputs: string[] = []
  emitMedia({
    type: 'status',
    status: 'running',
    message: request.mode === 'single' ? 'Cleaning subtitle file...' : `Cleaning ${targets.length} subtitle files...`,
    progress: {
      current: 0,
      total: targets.length,
    },
  })

  for (let index = 0; index < targets.length; index += 1) {
    if (subtitleCleanupCancelled) {
      throw new Error('Subtitle cleanup was cancelled.')
    }

    const targetPath = targets[index]
    const outputPath = buildSubtitleCleanupOutputPath(targetPath, request.outputDir)
    emitMedia({
      type: 'status',
      status: 'running',
      message: request.mode === 'single'
        ? 'Cleaning subtitle file...'
        : `Cleaning subtitle file ${index + 1}/${targets.length}...`,
      progress: {
        current: index + 1,
        total: targets.length,
        currentPath: targetPath,
      },
    })
    if (request.skipExistingOutputs && existsSync(outputPath)) {
      emitMedia({ type: 'log', line: `[${index + 1}/${targets.length}] Skipped existing output: ${outputPath}`, stream: 'stdout' })
      outputs.push(outputPath)
      continue
    }

    const raw = readFileSync(targetPath, 'utf8')
    const preprocessed = preprocessSubtitleContent(raw)

    if (!preprocessed) {
      throw new Error(`No usable subtitle text remained after preprocessing: ${targetPath}`)
    }

    const chunks = chunkSubtitleContent(preprocessed)
    const chunkOutputs: string[] = []

    emitMedia({ type: 'log', line: `[${index + 1}/${targets.length}] ${targetPath}`, stream: 'stdout' })
    emitMedia({ type: 'log', line: `Preprocessed ${preprocessed.length} chars into ${chunks.length} chunk(s).`, stream: 'stdout' })

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      if (subtitleCleanupCancelled) {
        throw new Error('Subtitle cleanup was cancelled.')
      }

      emitMedia({
        type: 'command',
        command: `POST ${buildOpenAiEndpoint(config.baseUrl, '/v1/chat/completions')} · ${config.model} · chunk ${chunkIndex + 1}/${chunks.length}`,
      })
      emitMedia({ type: 'log', line: `Requesting model cleanup for chunk ${chunkIndex + 1}/${chunks.length}...`, stream: 'stdout' })
      const content = await requestSubtitleCleanupChunk(config, chunks[chunkIndex])
      chunkOutputs.push(content)
    }

    activeSubtitleCleanupAbort = null
    writeFileSync(outputPath, chunkOutputs.join('\n\n').trim(), 'utf8')
    outputs.push(outputPath)
    emitMedia({ type: 'log', line: `Saved cleaned text to ${outputPath}`, stream: 'stdout' })
  }

  emitMedia({
    type: 'status',
    status: 'success',
    message: request.mode === 'single' ? 'Subtitle cleanup finished.' : `Subtitle cleanup finished for ${targets.length} file(s).`,
    outputs,
    progress: {
      current: targets.length,
      total: targets.length,
      currentPath: targets[targets.length - 1],
    },
  })

  return outputs
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
  return resolveExecutablePath('yt-dlp') ?? getExecutableName('yt-dlp')
}

function getFfmpegPath() {
  return resolveExecutablePath('ffmpeg') ?? getExecutableName('ffmpeg')
}

function getFfprobePath() {
  return resolveExecutablePath('ffprobe') ?? getExecutableName('ffprobe')
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
      ok: ytDlpPath !== getExecutableName('yt-dlp') || Boolean(findExecutableInPath('yt-dlp')),
      detail: ytDlpPath,
    },
    {
      key: 'ffmpeg',
      label: 'ffmpeg',
      ok: ffmpegPath !== getExecutableName('ffmpeg') || Boolean(findExecutableInPath('ffmpeg')),
      detail: ffmpegPath,
    },
    {
      key: 'ffprobe',
      label: 'ffprobe',
      ok: ffprobePath !== getExecutableName('ffprobe') || Boolean(findExecutableInPath('ffprobe')),
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
  const normalizedLine = line
    .replace(/\u001B\[[0-9;]*m/g, '')
    .replace(/\u001B\[[0-9;]*[A-Za-z]/g, '')
    .trim()
  const markerIndex = normalizedLine.indexOf('PROGRESS|')
  if (markerIndex === -1) {
    return null
  }
  const payload = normalizedLine.slice(markerIndex)
  const [, percentText, downloaded, total, speed, eta] = payload.split('|')
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
    case '2160p':
      return 'bestvideo[height<=2160]+bestaudio/best[height<=2160]'
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
  const ffmpegPath = getFfmpegPath()
  const extraArgs = tokenizeExtraArgs(request.extraArgs.trim())
  const skipDownload = extraArgs.includes('--skip-download')
  const args = [
    '--no-update',
    '--progress',
    '--newline',
    '--progress-template',
    'download:PROGRESS|%(progress._percent_str)s|%(progress._downloaded_bytes_str)s|%(progress._total_bytes_str)s|%(progress._speed_str)s|%(progress._eta_str)s',
    '--print',
    'before_dl:TITLE|%(title)s',
    '--print',
    'after_move:FILEPATH|%(filepath)s',
    '--ffmpeg-location',
    isAbsolute(ffmpegPath) ? dirname(ffmpegPath) : ffmpegPath,
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
        PATH: buildToolPathEnv(),
        DYLD_LIBRARY_PATH: buildDyldLibraryPathEnv(),
      },
    })

    activeMediaProcess = child
    const stdoutDecoder = createStreamDecoder()
    const stderrDecoder = createStreamDecoder()
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

    const ytDlpPath = getYtDlpPath()
    const child = spawn(ytDlpPath, args, {
      cwd: activeBatchRequest.outputDir,
      env: {
        ...process.env,
        PATH: buildToolPathEnv(),
        DYLD_LIBRARY_PATH: buildDyldLibraryPathEnv(),
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      },
    })

    const stdoutDecoder = createStreamDecoder()
    const stderrDecoder = createStreamDecoder()

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
      const lines = currentBuffer.split(/[\r\n]+/)
      const endsWithLineBreak = /[\r\n]$/.test(currentBuffer)
      const remainder = endsWithLineBreak ? '' : lines.pop() ?? ''

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
  win.webContents.on('console-message', (_event, detailsOrLevel: unknown, message?: string, line?: number, sourceId?: string) => {
    if (app.isPackaged) {
      return
    }
    if (
      typeof detailsOrLevel === 'object'
      && detailsOrLevel !== null
      && 'message' in detailsOrLevel
    ) {
      const details = detailsOrLevel as {
        level?: number
        message?: string
        lineNumber?: number
        sourceId?: string
      }
      console.log('[renderer]', {
        level: details.level,
        message: details.message,
        line: details.lineNumber,
        sourceId: details.sourceId,
      })
      return
    }

    console.log('[renderer]', {
      level: detailsOrLevel,
      message,
      line,
      sourceId,
    })
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
  envName: getEnvironmentLabel(),
  cookiesDir: getCookiesDir(),
}))

ipcMain.handle('cookies:list', () => listCookieFilesRecursive(getCookiesDir()))

ipcMain.handle('self-check:get', () => ({
  items: getSelfCheckItems(),
  toolsSource: getToolsSource(),
}))

ipcMain.handle('window:openMediaTools', () => {
  createMediaToolsWindow()
})

ipcMain.handle('subtitle-cleanup:get-config', () => loadSubtitleCleanupConfig())

ipcMain.handle('subtitle-cleanup:save-config', (_event, config: Partial<SubtitleCleanupConfig>) => {
  return saveSubtitleCleanupConfig(config)
})

ipcMain.handle('subtitle-cleanup:list-models', async (_event, config: Pick<SubtitleCleanupConfig, 'baseUrl' | 'apiKey'>) => {
  return await listOpenAiModels(config)
})

ipcMain.handle('subtitle-cleanup:test-connection', async (_event, config: SubtitleCleanupConfig) => {
  return await testOpenAiModelConnection(config)
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

ipcMain.handle('dialog:pickSubtitleFile', async (event, currentPath?: string) => {
  const result = await dialog.showOpenDialog(getHostWindow(event.sender), {
    defaultPath: resolveDialogStartDirectory(currentPath),
    properties: ['openFile'],
    filters: [
      { name: 'Subtitle files', extensions: ['srt', 'vtt', 'ass', 'ssa', 'txt'] },
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

ipcMain.handle('shell:showItemInFolder', async (_event, targetPath: string) => {
  if (!targetPath) {
    return
  }
  shell.showItemInFolder(targetPath)
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
  subtitleCleanupCancelled = true
  activeMediaProcess?.kill()
  activeSubtitleCleanupAbort?.abort()
  activeSubtitleCleanupAbort = null
  emitMedia({
    type: 'status',
    status: 'cancelled',
    message: 'Current media task was cancelled.',
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

ipcMain.handle('subtitle-cleanup:run', async (_event, request: SubtitleCleanupRunRequest) => {
  if (activeMediaProcess || activeSubtitleCleanupAbort) {
    throw new Error('Another media tool action is already running.')
  }
  if (!request.outputDir || !existsSync(request.outputDir) || !statSync(request.outputDir).isDirectory()) {
    throw new Error(`Output directory does not exist: ${request.outputDir}`)
  }
  if (request.mode === 'single') {
    if (!request.inputPath || !existsSync(request.inputPath)) {
      throw new Error(`Subtitle file does not exist: ${request.inputPath ?? ''}`)
    }
    if (!isSubtitleFile(request.inputPath)) {
      throw new Error(`Unsupported subtitle file: ${request.inputPath}`)
    }
  } else if (!request.inputDir || !existsSync(request.inputDir) || !statSync(request.inputDir).isDirectory()) {
    throw new Error(`Subtitle folder does not exist: ${request.inputDir ?? ''}`)
  }

  try {
    return await runSubtitleCleanup(request)
  } finally {
    activeSubtitleCleanupAbort = null
    subtitleCleanupCancelled = false
  }
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
