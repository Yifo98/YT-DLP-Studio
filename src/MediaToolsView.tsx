import { useEffect, useMemo, useState } from 'react'

type Language = 'zh' | 'en'
type Theme = 'midnight' | 'ember' | 'aurora'
type MediaToolAction = 'extractAudio' | 'extractSubtitles'
type MediaAudioExportFormat = 'mp3' | 'wav' | 'flac' | 'm4a'
type MediaSubtitleExportFormat = 'srt' | 'ass' | 'vtt'

const STORAGE_KEY = 'yt-dlp-studio.preferences'

type UiPrefs = {
  language: Language
  theme: Theme
}

function readUiPrefs(): UiPrefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { language: 'zh', theme: 'midnight' }
    }
    const parsed = JSON.parse(raw) as Partial<UiPrefs>
    return {
      language: parsed.language === 'en' ? 'en' : 'zh',
      theme: parsed.theme === 'ember' || parsed.theme === 'aurora' ? parsed.theme : 'midnight',
    }
  } catch {
    return { language: 'zh', theme: 'midnight' }
  }
}

function persistUiPrefs(next: Partial<UiPrefs>) {
  const current = readUiPrefs()
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...next }))
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

function getCopy(language: Language) {
  return language === 'zh'
    ? {
        eyebrow: 'MEDIA TOOLS',
        title: '本地媒体工具台。',
        copy: '这个窗口只处理你电脑里已经有的媒体文件。下载和后处理分开后，像达芬奇剪辑、音频整理、字幕导出这种流程会更顺手。',
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
        extractAudio: '音轨分离',
        extractAudioDesc: '把本地视频里的音频导出成单独文件，适合剪辑、播客或调音。',
        extractSubtitles: '字幕分离',
        extractSubtitlesDesc: '把文件里已有的字幕轨单独导出来。只有源文件本身带字幕流时才做得了。',
        subtitleUnavailable: '当前文件没有检测到字幕流，这项现在不能做。',
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
          '本地媒体工具: 负责对已经下载好的文件做音轨分离、字幕分离。',
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
        noLogs: '这里会显示 ffmpeg / ffprobe 的输出。',
        command: '当前命令',
        outputFiles: '输出文件',
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
      }
    : {
        eyebrow: 'MEDIA TOOLS',
        title: 'Local media workstation.',
        copy: 'This window is for files already on your machine. Keeping downloads and post-processing separate makes editing, audio prep, and subtitle export much cleaner.',
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
        extractAudio: 'Extract audio',
        extractAudioDesc: 'Export the local video audio as a separate file for editing or cleanup.',
        extractSubtitles: 'Extract subtitles',
        extractSubtitlesDesc: 'Export subtitle streams already embedded in the file.',
        subtitleUnavailable: 'No subtitle stream was detected in this file.',
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
          'Local media tools work on files you already downloaded.',
          'Subtitle extraction does not create subtitles. It only exports subtitle tracks that already exist.',
        ],
        status: 'Status',
        waiting: 'No media file selected yet.',
        fileReady: 'Media inspection finished.',
        chooseFirst: 'Pick a local media file first.',
        chooseAction: 'Select at least one action first.',
        subtitleMissingError: 'This file does not contain subtitle streams, so subtitle extraction cannot run.',
        runPlan: 'The selected actions will run one by one in order.',
        logs: 'Tool logs',
        noLogs: 'ffmpeg / ffprobe output will appear here.',
        command: 'Current command',
        outputFiles: 'Output files',
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
  const [runningAction, setRunningAction] = useState<MediaToolAction | null>(null)
  const [audioFormat, setAudioFormat] = useState<MediaAudioExportFormat>('wav')
  const [subtitleFormat, setSubtitleFormat] = useState<MediaSubtitleExportFormat>('srt')
  const [selectedSubtitleTracks, setSelectedSubtitleTracks] = useState<number[]>([])
  const copy = getCopy(language)
  const normalizedTitle = copy.title.replace(/[。.]$/, '')
  const subtitleStreams = inspection?.streams.filter((stream) => stream.codecType === 'subtitle') ?? []
  const hasSubtitleStream = subtitleStreams.length > 0

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    persistUiPrefs({ theme })
  }, [theme])

  useEffect(() => {
    persistUiPrefs({ language })
  }, [language])

  useEffect(() => {
    const unsubscribe = window.ytDlpApi.onMediaToolsUpdate((payload) => {
      if (payload.type === 'clear') {
        setLogs([])
        setOutputs([])
        setCurrentCommand('')
        return
      }
      if (payload.type === 'command') {
        setCurrentCommand(payload.command)
        return
      }
      if (payload.type === 'log') {
        setLogs((current) => [...current, payload.line].slice(-400))
        return
      }
      if (payload.type === 'status') {
        setStatus(payload.status)
        setStatusMessage(payload.message)
        if (payload.outputs) {
          const nextOutputs = payload.outputs
          setOutputs((current) => [...current, ...nextOutputs.filter((item) => !current.includes(item))])
        }
        if (payload.status !== 'running') {
          setRunningAction(null)
        }
      }
    })
    return unsubscribe
  }, [])

  async function pickMediaFile() {
    const selected = await window.ytDlpApi.pickMediaFile(inputPath || undefined)
    if (!selected) return
    setInputPath(selected)
    if (!outputDir) {
      const folder = getDirectoryFromPath(selected)
      setOutputDir(folder)
    }
    await inspect(selected)
  }

  async function pickOutputDir() {
    const selected = await window.ytDlpApi.pickDirectory(outputDir || undefined)
    if (selected) setOutputDir(selected)
  }

  async function inspect(filePath = inputPath) {
    if (!filePath) {
      setStatus('error')
      setStatusMessage(copy.chooseFirst)
      return
    }

    try {
      const result = await window.ytDlpApi.inspectMedia(filePath)
      setInspection(result)
      setStatus('success')
      setStatusMessage(copy.fileReady)
      const nextSubtitleStreams = result.streams.filter((stream) => stream.codecType === 'subtitle')
      setSelectedSubtitleTracks((current) => current.filter((index) => nextSubtitleStreams.some((stream) => stream.index === index)))
      setSelectedActions((current) =>
        current.filter((action) => (action === 'extractSubtitles' ? nextSubtitleStreams.length > 0 : true)),
      )
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
    setStatus('running')
    setStatusMessage(copy.runPlan)

    for (const action of selectedActions) {
      try {
        setRunningAction(action)
        await window.ytDlpApi.runMediaTool({
          action,
          inputPath,
          outputDir,
          audioFormat,
          subtitleFormat,
          subtitleStreamIndexes: action === 'extractSubtitles' ? selectedSubtitleTracks : [],
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to run media tool.'
        setRunningAction(null)
        setStatus(message.toLowerCase().includes('cancelled') ? 'cancelled' : 'error')
        setStatusMessage(message)
        return
      }
    }

    setRunningAction(null)
  }

  return (
    <div className="shell media-shell">
      <div className="shell__glow shell__glow--left" />
      <div className="shell__glow shell__glow--right" />
      <section className="hero panel media-hero">
        <div className="hero__toolbar media-hero__toolbar">
          <div>
            <div className="eyebrow">{copy.eyebrow}</div>
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
            <p>{inspection ? `${inspection.formatName} · ${formatDuration(inspection.duration, language)}` : inputPath || copy.waiting}</p>
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
                <button className="ghost-button" type="button" onClick={() => void window.ytDlpApi.openPath(outputDir || inputPath)}>{copy.openFolder}</button>
                <button className="ghost-button" type="button" onClick={() => window.close()}>{copy.closeWindow}</button>
              </div>
            </section>

            <section className="media-control-block">
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

            <section className="media-control-block">
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
                <button className="ghost-button" type="button" disabled={status !== 'running'} onClick={() => void window.ytDlpApi.cancelMediaTool()}>
                  {copy.cancel}
                </button>
              </div>
            </section>
          </div>
        </section>
        <section className="panel telemetry media-panel">
          <div className="section-title">
            <span>{copy.streams}</span>
            <small>{copy.streamsHint}</small>
          </div>
          <div className="stream-list">
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
        </section>
        <section className="panel logs media-logs media-panel">
          <div className="section-title">
            <span>{copy.logs}</span>
            <small>{runningAction ? `${copy.run} · ${runningAction === 'extractAudio' ? copy.extractAudio : copy.extractSubtitles}` : copy.toolsHint}</small>
          </div>
          <div className="log-viewer">
            {logs.length === 0 ? <div className="log-placeholder">{copy.noLogs}</div> : logs.map((line, index) => <div className="log-line" key={`${line}-${index}`}>{line}</div>)}
          </div>
        </section>
      </main>
    </div>
  )
}
