import {
  buildDetectedServiceRules,
  cookieMatchesRule,
  CookieScanMode,
  CookieServiceRule,
  getDomainGroupKey,
  getServiceRules,
  normalizeDomain,
} from './service-rules.js'

export type ExpiryStatus = 'session' | 'expired' | 'soon' | 'valid'

export type ExportCookie = {
  domain: string
  hostOnly: boolean
  httpOnly: boolean
  name: string
  path: string
  sameSite: ChromeCookieSameSite
  secure: boolean
  session: boolean
  storeId: string
  value: string
  expirationDate: number
  expiryStatus: ExpiryStatus
}

export type PreviewCookieRow = {
  domain: string
  name: string
  path: string
  expiry: string
  status: ExpiryStatus
  secure: boolean
  httpOnly: boolean
  sameSite: ChromeCookieSameSite
  services: string[]
}

export type ServiceSummary = {
  slug: string
  title: string
  sourceKind: CookieServiceRule['sourceKind']
  note: string
  successTips: string[]
  cookieCount: number
  domains: string[]
  expiredCount: number
  expiringSoonCount: number
  loginStatus: 'strong' | 'partial' | 'missing'
  presentStrongMarkers: string[]
  presentWeakMarkers: string[]
  missingStrongMarkers: string[]
}

export type CookieManifest = {
  generated_at: string
  scan_mode: CookieScanMode
  format: 'Netscape cookies.txt'
  generator: string
  privacy: {
    password_exported: false
    cookie_values_in_manifest: false
    network_upload: false
  }
  total_cookie_lines: number
  expiry_summary: {
    valid: number
    session: number
    expired: number
    expiring_soon: number
  }
  outputs: {
    raw_file: string
    by_service_dir: string
    by_domain_dir: string
  }
  service_files: Array<{
    slug: string
    title: string
    filename: string
    cookie_count: number
    domains: string[]
    login_status: ServiceSummary['loginStatus']
    present_strong_markers: string[]
    present_weak_markers: string[]
    missing_strong_markers: string[]
    note: string
    success_tips: string[]
  }>
  domain_files: Array<{
    domain: string
    filename: string
    cookie_count: number
  }>
}

export type CookieExportBundle = {
  generatedAt: string
  timestampSlug: string
  scanMode: CookieScanMode
  rules: CookieServiceRule[]
  cookies: ExportCookie[]
  cookieServices: Map<string, string[]>
  previewRows: PreviewCookieRow[]
  serviceSummaries: ServiceSummary[]
  files: Map<string, string>
  manifest: CookieManifest
}

export type CookiePreviewScan = {
  generatedAt: string
  timestampSlug: string
  mode: CookieScanMode
  allCookies: ExportCookie[]
  cookies: ExportCookie[]
  rules: CookieServiceRule[]
  supportedCookieCount: number
  ignoredCookieCount: number
}

const EXPIRING_SOON_SECONDS = 24 * 60 * 60
const ALL_URLS_ORIGIN = '<all_urls>'

export function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

export function getRequiredOrigins(slugs: string[]) {
  return uniqueSorted(getServiceRules(slugs).flatMap((rule) => rule.origins))
}

export async function ensureHostPermissions(origins: string[]) {
  if (origins.length === 0) return
  if (!chrome.permissions?.contains) return
  const request = { origins }
  const alreadyGranted = await new Promise<boolean>((resolve) => {
    chrome.permissions?.contains(request, resolve)
  })
  if (alreadyGranted) return
  throw new Error('当前浏览器没有授予扩展站点权限。请重新加载扩展，或确认浏览器允许它访问支持的视频站点。')
}

export async function ensureAllCookiePermission() {
  if (!chrome.permissions?.contains || !chrome.permissions?.request) return
  const request = { origins: [ALL_URLS_ORIGIN] }
  const alreadyGranted = await new Promise<boolean>((resolve) => {
    chrome.permissions?.contains(request, resolve)
  })
  if (alreadyGranted) return

  const granted = await new Promise<boolean>((resolve) => {
    chrome.permissions?.request(request, resolve)
  })
  if (!granted) {
    throw new Error('需要授予“读取所有网站 Cookie”的临时权限，才能先分析当前浏览器里哪些 Cookie 对应 yt-dlp 官方支持站点。插件不会上传数据，也不会显示 Cookie 值。')
  }
}

export async function previewCookieSources(mode: CookieScanMode): Promise<CookiePreviewScan> {
  await ensureAllCookiePermission()
  const allCookies = await collectAllCookies()
  return buildCookiePreviewScan(allCookies, mode)
}

export function buildCookiePreviewScan(allCookies: ExportCookie[], mode: CookieScanMode, generatedAt = new Date().toISOString()): CookiePreviewScan {
  const timestampSlug = formatTimestampSlug(new Date(generatedAt))
  const rules = buildDetectedServiceRules(allCookies, mode)
  const cookies = filterCookiesByRules(allCookies, rules)

  return {
    generatedAt,
    timestampSlug,
    mode,
    allCookies,
    cookies,
    rules,
    supportedCookieCount: cookies.length,
    ignoredCookieCount: mode === 'all' ? 0 : Math.max(0, allCookies.length - cookies.length),
  }
}

export function buildCookieExportFromScan(scan: CookiePreviewScan, slugs: string[]): CookieExportBundle {
  const rules = getServiceRules(slugs, scan.rules)
  if (rules.length === 0) {
    throw new Error('请先从预览结果里选择至少一个 Cookie 来源。')
  }

  const cookies = filterCookiesByRules(scan.allCookies, rules)
  const cookieServices = mapCookieServices(cookies, rules)
  const serviceSummaries = rules.map((rule) => buildServiceSummary(rule, cookies))
  const previewRows = buildPreviewRows(cookies, cookieServices)
  const files = buildExportFiles({
    generatedAt: scan.generatedAt,
    timestampSlug: scan.timestampSlug,
    scanMode: scan.mode,
    rules,
    cookies,
    cookieServices,
    previewRows,
    serviceSummaries,
    files: new Map(),
    manifest: emptyManifest(scan.generatedAt, scan.mode),
  })
  const manifest = JSON.parse(files.get('manifest.json') ?? '{}') as CookieManifest

  return {
    generatedAt: scan.generatedAt,
    timestampSlug: scan.timestampSlug,
    scanMode: scan.mode,
    rules,
    cookies,
    cookieServices,
    previewRows,
    serviceSummaries,
    files,
    manifest,
  }
}

export async function buildCookieExport(slugs: string[]): Promise<CookieExportBundle> {
  const rules = getServiceRules(slugs)
  if (rules.length === 0) {
    throw new Error('请至少选择一个站点。')
  }

  await ensureHostPermissions(getRequiredOrigins(slugs))
  const cookies = await collectCookies(rules)
  const generatedAt = new Date().toISOString()
  const timestampSlug = formatTimestampSlug(new Date(generatedAt))
  const cookieServices = mapCookieServices(cookies, rules)
  const serviceSummaries = rules.map((rule) => buildServiceSummary(rule, cookies))
  const previewRows = buildPreviewRows(cookies, cookieServices)
  const files = buildExportFiles({
    cookies,
    generatedAt,
    timestampSlug,
    scanMode: 'supported',
    rules,
    cookieServices,
    previewRows,
    serviceSummaries,
    files: new Map(),
    manifest: emptyManifest(generatedAt, 'supported'),
  })
  const manifest = JSON.parse(files.get('manifest.json') ?? '{}') as CookieManifest

  return {
    generatedAt,
    timestampSlug,
    scanMode: 'supported',
    rules,
    cookies,
    cookieServices,
    previewRows,
    serviceSummaries,
    files,
    manifest,
  }
}

async function collectAllCookies() {
  const allCookies = await new Promise<ChromeCookie[]>((resolve) => {
    chrome.cookies.getAll({}, resolve)
  })

  return dedupeCookies(allCookies.map(toExportCookie)).sort(sortCookies)
}

async function collectCookies(rules: CookieServiceRule[]) {
  const allCookies = await collectAllCookies()
  return filterCookiesByRules(allCookies, rules)
}

function filterCookiesByRules(cookies: ExportCookie[], rules: CookieServiceRule[]) {
  return cookies.filter((cookie) => rules.some((rule) => cookieMatchesRule(cookie, rule))).sort(sortCookies)
}

function toExportCookie(cookie: ChromeCookie): ExportCookie {
  const expirationDate = cookie.session ? 0 : Math.floor(cookie.expirationDate ?? 0)
  return {
    domain: cookie.domain,
    hostOnly: cookie.hostOnly,
    httpOnly: cookie.httpOnly,
    name: cookie.name,
    path: cookie.path,
    sameSite: cookie.sameSite,
    secure: cookie.secure,
    session: cookie.session,
    storeId: cookie.storeId,
    value: cookie.value,
    expirationDate,
    expiryStatus: getExpiryStatus(expirationDate),
  }
}

function dedupeCookies(cookies: ExportCookie[]) {
  const byKey = new Map<string, ExportCookie>()
  cookies.forEach((cookie) => {
    byKey.set(cookieKey(cookie), cookie)
  })
  return [...byKey.values()]
}

function cookieKey(cookie: ExportCookie) {
  return `${cookie.storeId}\t${cookie.domain}\t${cookie.path}\t${cookie.name}`
}

function sortCookies(left: ExportCookie, right: ExportCookie) {
  return (
    normalizeDomain(left.domain).localeCompare(normalizeDomain(right.domain)) ||
    left.path.localeCompare(right.path) ||
    left.name.localeCompare(right.name)
  )
}

function getExpiryStatus(expirationDate: number): ExpiryStatus {
  if (!expirationDate) return 'session'
  const now = Math.floor(Date.now() / 1000)
  if (expirationDate < now) return 'expired'
  if (expirationDate < now + EXPIRING_SOON_SECONDS) return 'soon'
  return 'valid'
}

function mapCookieServices(cookies: ExportCookie[], rules: CookieServiceRule[]) {
  const result = new Map<string, string[]>()
  cookies.forEach((cookie) => {
    const slugs = rules
      .filter((rule) => cookieMatchesRule(cookie, rule))
      .map((rule) => rule.slug)
    result.set(cookieKey(cookie), slugs)
  })
  return result
}

function buildPreviewRows(cookies: ExportCookie[], cookieServices: Map<string, string[]>): PreviewCookieRow[] {
  return cookies.map((cookie) => ({
    domain: cookie.domain,
    name: cookie.name,
    path: cookie.path,
    expiry: formatExpiry(cookie),
    status: cookie.expiryStatus,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    services: cookieServices.get(cookieKey(cookie)) ?? [],
  }))
}

function buildServiceSummary(rule: CookieServiceRule, cookies: ExportCookie[]): ServiceSummary {
  const serviceCookies = cookies.filter((cookie) => cookieMatchesRule(cookie, rule))
  const activeNames = new Set(
    serviceCookies
      .filter((cookie) => cookie.expiryStatus !== 'expired')
      .map((cookie) => cookie.name.toLowerCase()),
  )
  const presentStrongMarkers = rule.strongLoginMarkers.filter((name) => activeNames.has(name.toLowerCase()))
  const presentWeakMarkers = rule.weakLoginMarkers.filter((name) => activeNames.has(name.toLowerCase()))
  const missingStrongMarkers = rule.strongLoginMarkers.filter((name) => !activeNames.has(name.toLowerCase()))
  const loginStatus = getLoginStatusForRule(rule, serviceCookies.length, presentStrongMarkers, presentWeakMarkers, missingStrongMarkers)

  return {
    slug: rule.slug,
    title: rule.title,
    sourceKind: rule.sourceKind,
    note: rule.note,
    successTips: rule.successTips,
    cookieCount: serviceCookies.length,
    domains: uniqueSorted(serviceCookies.map((cookie) => normalizeDomain(cookie.domain))),
    expiredCount: serviceCookies.filter((cookie) => cookie.expiryStatus === 'expired').length,
    expiringSoonCount: serviceCookies.filter((cookie) => cookie.expiryStatus === 'soon').length,
    loginStatus,
    presentStrongMarkers,
    presentWeakMarkers,
    missingStrongMarkers,
  }
}

function getLoginStatusForRule(
  rule: CookieServiceRule,
  cookieCount: number,
  presentStrongMarkers: string[],
  presentWeakMarkers: string[],
  missingStrongMarkers: string[],
): ServiceSummary['loginStatus'] {
  if (cookieCount === 0) return 'missing'
  if (rule.strongLoginMarkers.length === 0 && rule.weakLoginMarkers.length === 0) return 'partial'
  const hasStrongLogin = rule.strongMarkerMode === 'all'
    ? missingStrongMarkers.length === 0
    : presentStrongMarkers.length > 0
  if (hasStrongLogin) return 'strong'
  return presentWeakMarkers.length > 0 || presentStrongMarkers.length > 0 ? 'partial' : 'missing'
}

function buildExportFiles(bundle: CookieExportBundle) {
  const byService = buildServiceFiles(bundle.rules, bundle.cookies)
  const byDomain = buildDomainFiles(bundle.cookies)
  const manifest = buildManifest(bundle, byService, byDomain)
  const files = new Map<string, string>()
  files.set('cookies.txt', toNetscapeFile(bundle.cookies, 'All selected Media Dock cookies'))
  byService.forEach((content, filename) => files.set(filename, content))
  byDomain.forEach((content, filename) => files.set(filename, content))
  files.set('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`)
  files.set('README.txt', buildExportReadme(bundle, manifest))
  return files
}

function buildServiceFiles(rules: CookieServiceRule[], cookies: ExportCookie[]) {
  const files = new Map<string, string>()
  rules.forEach((rule) => {
    const serviceCookies = cookies.filter((cookie) => cookieMatchesRule(cookie, rule))
    if (serviceCookies.length === 0) return
    files.set(
      `by-service/${rule.slug}.cookies.txt`,
      toNetscapeFile(serviceCookies, `${rule.title} cookies`),
    )
  })
  return files
}

function buildDomainFiles(cookies: ExportCookie[]) {
  const groups = new Map<string, ExportCookie[]>()
  cookies.forEach((cookie) => {
    const groupKey = getDomainGroupKey(cookie.domain)
    const current = groups.get(groupKey) ?? []
    current.push(cookie)
    groups.set(groupKey, current)
  })

  const files = new Map<string, string>()
  ;[...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([groupKey, groupCookies]) => {
      files.set(`by-domain/${safeFilename(groupKey)}.cookies.txt`, toNetscapeFile(groupCookies, `${groupKey} cookies`))
    })
  return files
}

function buildManifest(
  bundle: CookieExportBundle,
  byService: Map<string, string>,
  byDomain: Map<string, string>,
): CookieManifest {
  return {
    generated_at: bundle.generatedAt,
    scan_mode: bundle.scanMode,
    format: 'Netscape cookies.txt',
    generator: 'XF MediaCookies',
    privacy: {
      password_exported: false,
      cookie_values_in_manifest: false,
      network_upload: false,
    },
    total_cookie_lines: bundle.cookies.length,
    expiry_summary: {
      valid: bundle.cookies.filter((cookie) => cookie.expiryStatus === 'valid').length,
      session: bundle.cookies.filter((cookie) => cookie.expiryStatus === 'session').length,
      expired: bundle.cookies.filter((cookie) => cookie.expiryStatus === 'expired').length,
      expiring_soon: bundle.cookies.filter((cookie) => cookie.expiryStatus === 'soon').length,
    },
    outputs: {
      raw_file: 'cookies.txt',
      by_service_dir: 'by-service',
      by_domain_dir: 'by-domain',
    },
    service_files: bundle.serviceSummaries
      .filter((summary) => byService.has(`by-service/${summary.slug}.cookies.txt`))
      .map((summary) => ({
        slug: summary.slug,
        title: summary.title,
        filename: `by-service/${summary.slug}.cookies.txt`,
        cookie_count: summary.cookieCount,
        domains: summary.domains,
        login_status: summary.loginStatus,
        present_strong_markers: summary.presentStrongMarkers,
        present_weak_markers: summary.presentWeakMarkers,
        missing_strong_markers: summary.missingStrongMarkers,
        note: summary.note,
        success_tips: summary.successTips,
      })),
    domain_files: [...byDomain.entries()].map(([filename, content]) => ({
      domain: filename.replace(/^by-domain\//, '').replace(/\.cookies\.txt$/, ''),
      filename,
      cookie_count: countCookieLines(content),
    })),
  }
}

function emptyManifest(generatedAt: string, scanMode: CookieScanMode): CookieManifest {
  return {
    generated_at: generatedAt,
    scan_mode: scanMode,
    format: 'Netscape cookies.txt',
    generator: 'XF MediaCookies',
    privacy: {
      password_exported: false,
      cookie_values_in_manifest: false,
      network_upload: false,
    },
    total_cookie_lines: 0,
    expiry_summary: {
      valid: 0,
      session: 0,
      expired: 0,
      expiring_soon: 0,
    },
    outputs: {
      raw_file: 'cookies.txt',
      by_service_dir: 'by-service',
      by_domain_dir: 'by-domain',
    },
    service_files: [],
    domain_files: [],
  }
}

function toNetscapeFile(cookies: ExportCookie[], title: string) {
  const lines = [
    '# Netscape HTTP Cookie File',
    '# Generated by XF MediaCookies',
    `# ${title}`,
    '# This file contains sensitive browser cookies. Keep it local.',
    '',
    ...cookies.map(formatNetscapeLine),
    '',
  ]
  return lines.join('\n')
}

function formatNetscapeLine(cookie: ExportCookie) {
  const domain = formatNetscapeDomain(cookie)
  const includeSubdomains = cookie.hostOnly ? 'FALSE' : 'TRUE'
  const secure = cookie.secure ? 'TRUE' : 'FALSE'
  return [
    domain,
    includeSubdomains,
    sanitizeField(cookie.path || '/'),
    secure,
    String(cookie.expirationDate || 0),
    sanitizeField(cookie.name),
    sanitizeField(cookie.value),
  ].join('\t')
}

function formatNetscapeDomain(cookie: ExportCookie) {
  const normalized = normalizeDomain(cookie.domain)
  const domain = cookie.hostOnly ? normalized : cookie.domain.startsWith('.') ? cookie.domain : `.${normalized}`
  return cookie.httpOnly ? `#HttpOnly_${domain}` : domain
}

function sanitizeField(value: string) {
  return value.replace(/[\r\n]/g, '').replace(/\t/g, '%09')
}

function formatExpiry(cookie: ExportCookie) {
  if (cookie.expiryStatus === 'session') return 'Session'
  return new Date(cookie.expirationDate * 1000).toLocaleString()
}

function safeFilename(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9.-]/g, '_')
}

function countCookieLines(content: string) {
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.startsWith('#'))
    .length
}

function buildExportReadme(bundle: CookieExportBundle, manifest: CookieManifest) {
  const serviceLines = manifest.service_files
    .map((item) => `- ${item.title}: ${item.filename} (${item.cookie_count} cookies, login status: ${item.login_status})`)
    .join('\n')

  return [
    'Media Dock Cookie Export',
    '',
    `Generated at: ${bundle.generatedAt}`,
    '',
    'How to use:',
    '1. Before exporting, open the target site in the same browser profile and confirm the normal login state is active.',
    '2. Open and play the target content first so the browser refreshes the site login state. If the preview reports missing login markers, refresh the site login before exporting.',
    '3. Open Media Dock and use the Cookies area to import this ZIP directly.',
    '4. If importing manually, unzip this package and copy the folder or selected by-service/*.cookies.txt files into Media Dock Data/cookies/.',
    '5. Paste a target link; Media Dock will recommend the matching by-service cookie file.',
    '',
    'Privacy notes:',
    '- This export contains browser cookies and should stay on your own machine.',
    '- No passwords are exported.',
    '- manifest.json contains only counts, domains, marker names, and status summaries; it does not contain cookie values.',
    '',
    'Included services:',
    serviceLines || '- No service cookies were found.',
    '',
  ].join('\n')
}

function formatTimestampSlug(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('')
}
