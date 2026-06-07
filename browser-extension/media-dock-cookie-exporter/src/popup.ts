import {
  buildCookiePreviewScan,
  buildCookieExportFromScan,
  CookieExportBundle,
  CookiePreviewScan,
  previewCookieSources,
  ServiceSummary,
} from './cookie-export.js'
import { CookieScanMode, getCommonServiceSlugs } from './service-rules.js'
import { buildZip } from './zip.js'

const SELECTION_KEY = 'selectedServices'
const COMMON_PROFILE_KEY = 'commonServiceProfile'
const COMMON_PROFILE_FORMAT = 'media-dock-cookie-common-profile'

type CommonProfile = {
  version: 1
  savedAt: string
  serviceSlugs: string[]
}

const serviceList = getElement('service-list')
const statusBox = getElement('status-box')
const summaryBox = getElement('summary-box')
const tableBody = getElement('cookie-table-body')
const tableEmpty = getElement('cookie-table-empty')
const previewButton = getButton('preview-button')
const exportButton = getButton('export-button')
const exportLogButton = getButton('export-log-button')
const clearPreviewButton = getButton('clear-preview-button')
const selectCoreButton = getButton('select-core')
const selectAllButton = getButton('select-all')
const selectNoneButton = getButton('select-none')
const saveCommonButton = getButton('save-common')
const exportCommonButton = getButton('export-common')
const importCommonButton = getButton('import-common')
const importCommonFileInput = getElement('import-common-file') as HTMLInputElement
const commonProfileStatus = getElement('common-profile-status')
const scanModeInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="scan-mode"]'))

let selectedServices = new Set<string>()
let currentScan: CookiePreviewScan | null = null
let currentBundle: CookieExportBundle | null = null
let commonProfile: CommonProfile | null = null

void init().catch((error: unknown) => {
  setStatus(error instanceof Error ? error.message : String(error), 'error')
  setBusy(true)
})

async function init() {
  assertChromeApis()
  selectedServices = new Set(await loadSelectedServices())
  commonProfile = await loadCommonProfile()
  renderServices()
  updateCommonProfileStatus()
  updateActions()

  previewButton.addEventListener('click', () => void preview())
  clearPreviewButton.addEventListener('click', () => clearPreviewData())
  exportLogButton.addEventListener('click', () => void exportPreviewLog())
  exportButton.addEventListener('click', () => void exportCurrent())
  selectCoreButton.addEventListener('click', () => selectCommonServices())
  selectAllButton.addEventListener('click', () => setSelectedServices(currentScan?.rules.map((rule) => rule.slug) ?? []))
  selectNoneButton.addEventListener('click', () => setSelectedServices([]))
  saveCommonButton.addEventListener('click', () => void saveCurrentAsCommon())
  exportCommonButton.addEventListener('click', () => void exportCommonProfile())
  importCommonButton.addEventListener('click', () => importCommonFileInput.click())
  importCommonFileInput.addEventListener('change', () => void importCommonProfileFromInput())
  scanModeInputs.forEach((input) => {
    input.addEventListener('change', () => switchScanMode())
  })
}

async function loadSelectedServices() {
  return await new Promise<string[]>((resolve) => {
    chrome.storage.local.get([SELECTION_KEY], (items) => {
      const value = items[SELECTION_KEY]
      resolve(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])
    })
  })
}

async function saveSelectedServices() {
  await new Promise<void>((resolve) => {
    chrome.storage.local.set({ [SELECTION_KEY]: [...selectedServices] }, resolve)
  })
}

async function loadCommonProfile() {
  return await new Promise<CommonProfile | null>((resolve) => {
    chrome.storage.local.get([COMMON_PROFILE_KEY], (items) => {
      resolve(parseCommonProfile(items[COMMON_PROFILE_KEY]))
    })
  })
}

async function persistCommonProfile(profile: CommonProfile) {
  await new Promise<void>((resolve) => {
    chrome.storage.local.set({ [COMMON_PROFILE_KEY]: profile }, resolve)
  })
}

function setSelectedServices(slugs: string[]) {
  selectedServices = new Set(slugs)
  renderSelectedPreview()
  updateActions()
  void saveSelectedServices()
}

function renderServices(summaries: ServiceSummary[] = []) {
  const summaryMap = new Map(summaries.map((summary) => [summary.slug, summary]))
  const rules = currentScan?.rules ?? []
  serviceList.classList.toggle('service-list--dense', rules.length > 16)
  serviceList.replaceChildren()

  if (rules.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'service-empty'
    empty.textContent = '先点击“预览 Cookie”。预览后这里会显示当前浏览器里可导出的 Cookie 来源。'
    serviceList.append(empty)
    return
  }

  rules.forEach((rule) => {
    const item = document.createElement('label')
    item.className = 'service-card'
    item.htmlFor = `service-${rule.slug}`

    const checkbox = document.createElement('input')
    checkbox.id = `service-${rule.slug}`
    checkbox.type = 'checkbox'
    checkbox.checked = selectedServices.has(rule.slug)
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selectedServices.add(rule.slug)
      } else {
        selectedServices.delete(rule.slug)
      }
      currentBundle = null
      clearPreview()
      updateActions()
      void saveSelectedServices()
    })

    const content = document.createElement('span')
    content.className = 'service-card__content'

    const titleRow = document.createElement('span')
    titleRow.className = 'service-card__title-row'

    const title = document.createElement('strong')
    title.textContent = rule.title
    titleRow.append(title)

    const summary = summaryMap.get(rule.slug)
    if (summary) {
      const badge = document.createElement('span')
      badge.className = `service-badge service-badge--${summary.loginStatus}`
      badge.textContent = getLoginStatusText(summary)
      titleRow.append(badge)
    }

    const note = document.createElement('small')
    note.textContent = summary ? getServiceAdvice(summary) : rule.note

    const domains = document.createElement('small')
    domains.className = 'service-card__domains'
    domains.textContent = rule.domains.join(', ')

    content.append(titleRow, note, domains)
    item.append(checkbox, content)
    serviceList.append(item)
  })
}

async function preview() {
  await runWithBusyState('正在读取浏览器 Cookie，并匹配 yt-dlp 官方支持站点...', async () => {
    currentScan = await previewCookieSources(getScanMode())
    selectedServices = new Set(currentScan.rules.map((rule) => rule.slug))
    renderSelectedPreview()
    updateCommonProfileStatus()
    const ignored = currentScan.ignoredCookieCount > 0 ? ` 已忽略 ${currentScan.ignoredCookieCount} 条未匹配当前扫描范围的 Cookie。` : ''
    const scopeNote = getScanMode() === 'all' ? '已进入全部 Cookie 模式，请只导出你明确需要的来源。' : '默认模式不会保留未匹配 yt-dlp 支持站点的 Cookie。'
    setStatus(`预览已更新。这里不会显示 Cookie 值，导出的 txt 文件才会包含真实值。${scopeNote}${ignored}`, 'ok')
    void saveSelectedServices()
  })
}

function switchScanMode() {
  if (!currentScan) {
    renderServices()
    clearPreview()
    updateActions()
    return
  }

  const nextMode = getScanMode()
  currentScan = buildCookiePreviewScan(currentScan.allCookies, nextMode, currentScan.generatedAt)
  selectedServices = new Set(currentScan.rules.map((rule) => rule.slug))
  renderSelectedPreview()
  updateCommonProfileStatus()

  const scopeNote = nextMode === 'all'
    ? '已切换到全部 Cookie 预览。这里只是内存筛选，请只导出你明确需要的来源。'
    : '已切换到默认模式。只保留能匹配 yt-dlp 官方支持站点的 Cookie 来源。'
  setStatus(`${scopeNote} 不需要重新点击“预览 Cookie”。`, 'ok')
  void saveSelectedServices()
}

async function exportCurrent() {
  await runWithBusyState('正在生成 Media Dock 导出包...', async () => {
    if (!currentScan) {
      throw new Error('请先预览 Cookie，再选择需要导出的来源。')
    }
    const bundle = currentBundle ?? buildCookieExportFromScan(currentScan, [...selectedServices])
    currentBundle = bundle
    renderBundle(bundle)

    const folderName = `media-dock-cookies-${bundle.timestampSlug}`
    const files = [...bundle.files.entries()].map(([path, content]) => ({
      path: `${folderName}/${path}`,
      content,
    }))
    files.push({
      path: `${folderName}/common-profile.json`,
      content: stringifyCommonProfile(buildCommonProfile([...selectedServices])),
    })
    const zipBlob = buildZip(files, new Date(bundle.generatedAt))
    const filename = `${folderName}.zip`
    await downloadBlob(zipBlob, filename)

    clearPreviewAfterExport(`已生成 ${filename}。可直接在 Media Dock 的 Cookies 区导入；本次预览缓存已清除。`)
  })
}

async function exportPreviewLog() {
  await runWithBusyState('正在生成预览诊断日志...', async () => {
    if (!currentScan) {
      throw new Error('请先预览 Cookie，再导出诊断日志。')
    }
    const bundle = currentBundle ?? buildCookieExportFromScan(currentScan, [...selectedServices])
    currentBundle = bundle
    renderBundle(bundle)

    const logText = buildPreviewDiagnosticLog(bundle)
    const blob = new Blob([logText.replace(/\r?\n/g, '\r\n')], { type: 'text/plain;charset=utf-8' })
    const filename = `media-cookies-preview-log-${bundle.timestampSlug}.txt`
    await downloadBlob(blob, filename)

    setStatus(`已导出 ${filename}。诊断日志不包含 Cookie 值。`, 'ok')
  })
}

function buildPreviewDiagnosticLog(bundle: CookieExportBundle) {
  const lines = [
    'MediaCookies Preview Diagnostic',
    `generated_at: ${bundle.generatedAt}`,
    `scan_mode: ${bundle.scanMode}`,
    `selected_services: ${bundle.manifest.service_files.length}`,
    `selected_service_slugs: ${bundle.rules.map((rule) => rule.slug).join(',')}`,
    `common_profile_slugs: ${(commonProfile?.serviceSlugs ?? getCommonServiceSlugs()).join(',')}`,
    `domain_files: ${bundle.manifest.domain_files.length}`,
    `cookie_rows: ${bundle.cookies.length}`,
    `expired: ${bundle.manifest.expiry_summary.expired}`,
    `expiring_soon: ${bundle.manifest.expiry_summary.expiring_soon}`,
    '',
    '[services]',
    ...bundle.serviceSummaries.map((summary) => [
      summary.title,
      `slug=${summary.slug}`,
      `kind=${summary.sourceKind}`,
      `cookies=${summary.cookieCount}`,
      `status=${summary.loginStatus}`,
      summary.missingStrongMarkers.length > 0 ? `missing=${summary.missingStrongMarkers.join(',')}` : 'missing=',
      summary.domains.length > 0 ? `domains=${summary.domains.join(',')}` : 'domains=',
    ].join(' | ')),
  ]
  return lines.join('\n')
}

function renderBundle(bundle: CookieExportBundle) {
  renderServices(bundle.serviceSummaries)
  renderSummary(bundle)
  renderTable(bundle)
  updateActions()
}

function clearPreviewData() {
  currentScan = null
  currentBundle = null
  selectedServices = new Set()
  renderServices()
  clearPreview()
  updateCommonProfileStatus()
  updateActions()
}

function clearPreviewAfterExport(message: string) {
  currentScan = null
  currentBundle = null
  selectedServices = new Set()
  renderServices()
  summaryBox.replaceChildren()
  tableBody.replaceChildren()
  tableEmpty.hidden = false
  setStatus(message, 'ok')
  updateCommonProfileStatus()
  updateActions()
  void saveSelectedServices()
}

function renderSelectedPreview() {
  if (!currentScan) {
    currentBundle = null
    renderServices()
    clearPreview()
    return
  }

  const selected = [...selectedServices].filter((slug) => currentScan?.rules.some((rule) => rule.slug === slug))
  selectedServices = new Set(selected)
  if (selected.length === 0) {
    currentBundle = null
    renderServices()
    summaryBox.replaceChildren()
    tableBody.replaceChildren()
    tableEmpty.hidden = false
    setStatus('已清空选择。可以点“全选”恢复全部候选，或点“常用”只保留常见来源。', 'idle')
    updateActions()
    return
  }

  currentBundle = buildCookieExportFromScan(currentScan, selected)
  renderBundle(currentBundle)
}

function selectCommonServices() {
  if (!currentScan) return
  const available = new Set(currentScan.rules.map((rule) => rule.slug))
  const savedSlugs = commonProfile?.serviceSlugs.filter((slug) => available.has(slug)) ?? []
  const defaultSlugs = getCommonServiceSlugs(currentScan.rules)
  const common = savedSlugs.length > 0 ? savedSlugs : defaultSlugs
  setSelectedServices(common)

  if (common.length === 0) {
    setStatus('当前预览里没有匹配的常用来源。可以手动勾选需要的来源，再点“保存当前为常用”。', 'idle')
    return
  }

  const sourceText = savedSlugs.length > 0 ? '已按保存的常用配置选择' : '已按默认常用选择'
  setStatus(`${sourceText} ${common.length} 个来源。抖音/TikTok 仅在你手动保存为常用后才会被常用按钮选中。`, 'ok')
}

async function saveCurrentAsCommon() {
  if (!currentScan) {
    setStatus('请先预览 Cookie，再保存常用配置。', 'idle')
    return
  }

  const slugs = getCurrentValidSelectedSlugs()
  if (slugs.length === 0) {
    setStatus('当前没有选中的来源，不能保存为空常用配置。', 'idle')
    return
  }

  commonProfile = buildCommonProfile(slugs)
  await persistCommonProfile(commonProfile)
  updateCommonProfileStatus()
  setStatus(`已保存 ${slugs.length} 个来源为常用配置。这里只保存来源 ID，不保存 Cookie 值。`, 'ok')
}

async function exportCommonProfile() {
  await runWithBusyState('正在导出常用配置...', async () => {
    const slugs = currentScan ? getCurrentValidSelectedSlugs() : (commonProfile?.serviceSlugs ?? getCommonServiceSlugs())
    if (slugs.length === 0) {
      throw new Error('没有可导出的常用配置。请先预览并选择来源，或导入已有配置。')
    }

    const profile = buildCommonProfile(slugs)
    const filename = `media-dock-cookie-common-profile-${formatTimestampForFile(new Date())}.json`
    await downloadBlob(
      new Blob([stringifyCommonProfile(profile)], { type: 'application/json;charset=utf-8' }),
      filename,
    )
    setStatus(`已导出 ${filename}。配置文件只包含来源 ID，不包含 Cookie 值。`, 'ok')
  })
}

async function importCommonProfileFromInput() {
  const file = importCommonFileInput.files?.[0]
  if (!file) return

  try {
    const imported = parseCommonProfile(JSON.parse(await file.text()))
    if (!imported) {
      throw new Error('这个文件不像 Media Dock Cookie 常用配置。')
    }

    commonProfile = buildCommonProfile(imported.serviceSlugs, imported.savedAt)
    await persistCommonProfile(commonProfile)
    updateCommonProfileStatus()

    if (currentScan) {
      const available = new Set(currentScan.rules.map((rule) => rule.slug))
      const matched = commonProfile.serviceSlugs.filter((slug) => available.has(slug))
      setSelectedServices(matched)
      setStatus(`已导入常用配置，并套用当前预览中匹配到的 ${matched.length} 个来源。`, matched.length > 0 ? 'ok' : 'idle')
    } else {
      setStatus(`已导入常用配置：${commonProfile.serviceSlugs.length} 个来源。预览后点“常用”即可套用。`, 'ok')
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), 'error')
  } finally {
    importCommonFileInput.value = ''
  }
}

function getCurrentValidSelectedSlugs() {
  const available = currentScan ? new Set(currentScan.rules.map((rule) => rule.slug)) : null
  return [...selectedServices].filter((slug) => !available || available.has(slug))
}

function buildCommonProfile(serviceSlugs: string[], savedAt = new Date().toISOString()): CommonProfile {
  return {
    version: 1,
    savedAt,
    serviceSlugs: normalizeServiceSlugs(serviceSlugs),
  }
}

function parseCommonProfile(value: unknown): CommonProfile | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const serviceSlugs = normalizeServiceSlugs(record.serviceSlugs ?? record.service_slugs)
  if (serviceSlugs.length === 0) return null

  const savedAtValue = record.savedAt ?? record.saved_at
  return {
    version: 1,
    savedAt: typeof savedAtValue === 'string' && savedAtValue ? savedAtValue : new Date().toISOString(),
    serviceSlugs,
  }
}

function normalizeServiceSlugs(value: unknown) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))]
}

function stringifyCommonProfile(profile: CommonProfile) {
  return `${JSON.stringify({
    format: COMMON_PROFILE_FORMAT,
    version: profile.version,
    saved_at: profile.savedAt,
    service_slugs: profile.serviceSlugs,
    privacy: {
      cookie_values_included: false,
      passwords_included: false,
      preview_cache_files: false,
    },
    note: 'This file only stores preferred Media Dock Cookie source IDs. It does not contain cookie values.',
  }, null, 2)}\n`
}

function updateCommonProfileStatus() {
  if (!commonProfile) {
    commonProfileStatus.textContent = '默认常用：B站、YouTube。抖音/TikTok 官方支持部分具体链接，但不会默认加入常用。'
    return
  }

  const matched = currentScan
    ? commonProfile.serviceSlugs.filter((slug) => currentScan?.rules.some((rule) => rule.slug === slug)).length
    : null
  const matchText = matched === null ? '' : `；当前预览匹配 ${matched} 个`
  commonProfileStatus.textContent = `已保存 ${commonProfile.serviceSlugs.length} 个常用来源${matchText}。配置只保存来源 ID，不保存 Cookie 值。`
}

async function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  try {
    await new Promise<void>((resolve, reject) => {
      chrome.downloads.download({ url, filename, saveAs: true }, () => {
        const message = chrome.runtime.lastError?.message
        if (message) {
          reject(new Error(message))
        } else {
          resolve()
        }
      })
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

function formatTimestampForFile(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

function renderSummary(bundle: CookieExportBundle) {
  summaryBox.replaceChildren()

  const totals = [
    ['Cookie 总数', String(bundle.cookies.length)],
    ['站点包', String(bundle.manifest.service_files.length)],
    ['域名包', String(bundle.manifest.domain_files.length)],
    ['已过期', String(bundle.manifest.expiry_summary.expired)],
    ['24 小时内过期', String(bundle.manifest.expiry_summary.expiring_soon)],
  ]

  totals.forEach(([label, value]) => {
    const item = document.createElement('div')
    item.className = 'summary-item'
    const strong = document.createElement('strong')
    strong.textContent = value
    const small = document.createElement('small')
    small.textContent = label
    item.append(strong, small)
    summaryBox.append(item)
  })

  const warnings = bundle.serviceSummaries
    .filter((summary) => summary.cookieCount > 0 && summary.loginStatus !== 'strong' && summary.sourceKind !== 'domain')
    .map((summary) => `${summary.title}: ${getServiceAdvice(summary)}`)
  const domainWarningCount = bundle.serviceSummaries
    .filter((summary) => summary.cookieCount > 0 && summary.loginStatus !== 'strong' && summary.sourceKind === 'domain')
    .length

  if (warnings.length > 0 || domainWarningCount > 0) {
    const warning = document.createElement('p')
    warning.className = 'summary-warning'
    const visibleWarnings = warnings.slice(0, 5)
    const hiddenWarningCount = Math.max(0, warnings.length - visibleWarnings.length)
    const compactParts = [
      ...visibleWarnings,
      hiddenWarningCount > 0 ? `另有 ${hiddenWarningCount} 个站点提示已收起` : '',
      domainWarningCount > 0 ? `全部 Cookie 模式下另有 ${domainWarningCount} 个按域名整理的来源没有登录态判断，已收起` : '',
    ].filter(Boolean)
    warning.textContent = `提示：${compactParts.join('；')}。如果下载仍提示登录，请按对应站点刷新登录态后重新导出。`
    summaryBox.append(warning)
  }
}

function renderTable(bundle: CookieExportBundle) {
  tableBody.replaceChildren()
  tableEmpty.hidden = bundle.previewRows.length > 0

  const fragment = document.createDocumentFragment()
  bundle.previewRows.forEach((row) => {
    const tr = document.createElement('tr')
    const cells = [
      row.domain,
      row.name,
      row.path,
      row.expiry,
      getExpiryStatusText(row.status),
      row.httpOnly ? '是' : '否',
      row.secure ? '是' : '否',
      row.services.join(', '),
    ]
    cells.forEach((value) => {
      const td = document.createElement('td')
      td.textContent = value
      tr.append(td)
    })
    fragment.append(tr)
  })
  tableBody.append(fragment)
}

function clearPreview() {
  summaryBox.replaceChildren()
  tableBody.replaceChildren()
  tableEmpty.hidden = false
  setStatus('点击“预览 Cookie”后会请求浏览器站点权限。默认只保留能匹配 yt-dlp 官方支持站点的 Cookie，其他 Cookie 不进入后续选择或导出；预览不会生成缓存文件。', 'idle')
}

async function runWithBusyState(message: string, action: () => Promise<void>) {
  setBusy(true)
  setStatus(message, 'idle')
  try {
    await action()
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), 'error')
  } finally {
    setBusy(false)
  }
}

function updateActions() {
  previewButton.disabled = false
  exportButton.disabled = !currentScan || selectedServices.size === 0
  exportLogButton.disabled = !currentScan
  clearPreviewButton.disabled = !currentScan
  selectCoreButton.disabled = !currentScan
  selectAllButton.disabled = !currentScan
  selectNoneButton.disabled = !currentScan
  saveCommonButton.disabled = !currentScan || selectedServices.size === 0
  exportCommonButton.disabled = false
  importCommonButton.disabled = false
}

function setBusy(isBusy: boolean) {
  previewButton.disabled = isBusy
  exportButton.disabled = isBusy || !currentScan || selectedServices.size === 0
  exportLogButton.disabled = isBusy || !currentScan
  clearPreviewButton.disabled = isBusy || !currentScan
  selectCoreButton.disabled = isBusy || !currentScan
  selectAllButton.disabled = isBusy || !currentScan
  selectNoneButton.disabled = isBusy || !currentScan
  saveCommonButton.disabled = isBusy || !currentScan || selectedServices.size === 0
  exportCommonButton.disabled = isBusy
  importCommonButton.disabled = isBusy
  scanModeInputs.forEach((input) => {
    input.disabled = isBusy
  })
}

function setStatus(message: string, tone: 'idle' | 'ok' | 'error') {
  statusBox.textContent = message
  statusBox.className = `status status--${tone}`
}

function getScanMode(): CookieScanMode {
  const checked = scanModeInputs.find((input) => input.checked)
  return checked?.value === 'all' ? 'all' : 'supported'
}

function getLoginStatusText(summary: ServiceSummary) {
  if (summary.sourceKind === 'domain') return '按域名'
  if (summary.cookieCount === 0) return '未找到'
  if (summary.loginStatus === 'strong') return '登录态较完整'
  if (summary.loginStatus === 'partial' && summary.missingStrongMarkers.length === 0) return '已发现 Cookie'
  if (summary.loginStatus === 'partial') return '可能不完整'
  return '缺少登录态'
}

function getServiceAdvice(summary: ServiceSummary) {
  if (summary.sourceKind === 'domain') {
    return `按域名整理，已发现 ${summary.cookieCount} 条 Cookie。请只在明确需要时导出。`
  }
  if (summary.cookieCount === 0) {
    return `${summary.note} 未找到 Cookie，请先在同一个浏览器登录并打开该站点。`
  }
  if (summary.loginStatus === 'strong') {
    return summary.expiringSoonCount > 0
      ? `${summary.note} 已检测到关键登录态，但有 ${summary.expiringSoonCount} 条 Cookie 24 小时内过期。`
      : summary.note
  }
  if (summary.missingStrongMarkers.length === 0) {
    return `${summary.note} 已发现 ${summary.cookieCount} 条 Cookie，无法仅凭 Cookie 名称判断登录态。`
  }

  const missing = summary.missingStrongMarkers.slice(0, 4).join(', ')
  const missingText = missing ? `缺少关键标记：${missing}。` : ''
  const nextStep = summary.successTips[0] ?? '请在对应网站确认已登录后重新导出。'
  return `${missingText}${nextStep}`
}

function assertChromeApis() {
  if (typeof chrome === 'undefined' || !chrome.cookies?.getAll || !chrome.downloads?.download || !chrome.storage?.local) {
    throw new Error('当前浏览器没有提供完整的 Chrome 扩展 API。请优先在最新版 Chrome 中测试；Atlas 如无反应，可能是浏览器兼容性限制。')
  }
}

function getExpiryStatusText(status: string) {
  if (status === 'session') return '会话'
  if (status === 'expired') return '已过期'
  if (status === 'soon') return '快过期'
  return '有效'
}

function getElement(id: string) {
  const element = document.getElementById(id)
  if (!element) {
    throw new Error(`Missing element: ${id}`)
  }
  return element
}

function getButton(id: string) {
  return getElement(id) as HTMLButtonElement
}
