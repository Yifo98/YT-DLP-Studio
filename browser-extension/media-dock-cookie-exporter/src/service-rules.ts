import { YT_DLP_SUPPORTED_SITE_NAMES } from './yt-dlp-supported-sites.js'

export type CookieScanMode = 'supported' | 'all'
export type CookieSourceKind = 'curated' | 'yt-dlp' | 'domain'

export type CookieServiceRule = {
  slug: string
  title: string
  shortTitle: string
  note: string
  domains: string[]
  origins: string[]
  strongLoginMarkers: string[]
  strongMarkerMode?: 'any' | 'all'
  weakLoginMarkers: string[]
  successTips: string[]
  common?: boolean
  defaultCommon?: boolean
  sourceKind?: CookieSourceKind
  supportedSite?: string
}

const subdomainOrigins = (domains: string[]) => domains.flatMap((domain) => [
  `https://${domain}/*`,
  `https://*.${domain}/*`,
])

const COMPOUND_TLDS = new Set([
  'com.cn',
  'net.cn',
  'org.cn',
  'gov.cn',
  'edu.cn',
  'co.uk',
  'org.uk',
  'gov.uk',
  'ac.uk',
  'com.hk',
  'com.sg',
  'com.my',
  'com.au',
])

export const SERVICE_RULES: CookieServiceRule[] = [
  {
    slug: 'bilibili-b-site',
    title: 'Bilibili / B站',
    shortTitle: 'B站',
    note: 'B站及相关登录域名。用于会员、高清画质和 412/403 情况。',
    domains: ['bilibili.com', 'bilibili.cn', 'biligame.com', 'live.bilibili.com'],
    origins: subdomainOrigins(['bilibili.com', 'bilibili.cn', 'biligame.com']),
    strongLoginMarkers: ['SESSDATA', 'bili_jct', 'DedeUserID'],
    weakLoginMarkers: ['buvid3', 'buvid4', 'sid', 'CURRENT_FNVAL'],
    common: true,
    defaultCommon: true,
    sourceKind: 'curated',
    supportedSite: 'BiliBili',
    successTips: [
      '先在同一个浏览器里打开 B 站并确认头像/会员状态正常。',
      '遇到 412/403 时重新登录 B 站后再导出。',
    ],
  },
  {
    slug: 'youtube',
    title: 'YouTube',
    shortTitle: 'YouTube',
    note: 'YouTube 及 Google 登录域名。用于年龄限制、会员或登录态内容。',
    domains: ['youtube.com', 'google.com', 'accounts.google.com'],
    origins: [...subdomainOrigins(['youtube.com', 'google.com']), 'https://accounts.google.com/*'],
    strongLoginMarkers: ['SAPISID', '__Secure-1PSID', '__Secure-3PSID', 'LOGIN_INFO', 'SID'],
    weakLoginMarkers: ['VISITOR_INFO1_LIVE', 'YSC', 'PREF', '__Secure-1PAPISID', '__Secure-3PAPISID'],
    common: true,
    defaultCommon: true,
    sourceKind: 'curated',
    supportedSite: 'youtube',
    successTips: [
      '先在同一个浏览器打开 YouTube，确认账号头像和会员/年龄限制内容可访问。',
      '如导出后仍失败，重新进入 accounts.google.com 完成一次登录验证。',
    ],
  },
  {
    slug: 'douyin',
    title: 'Douyin / 抖音',
    shortTitle: '抖音',
    note: '抖音网页及创作者域名。yt-dlp 官方支持单条 /video/{id}，推荐页/精选页需要先转成具体视频链接。',
    domains: ['douyin.com', 'www.douyin.com', 'creator.douyin.com', 'open.douyin.com'],
    origins: subdomainOrigins(['douyin.com']),
    strongLoginMarkers: ['sessionid', 'sessionid_ss', 'sid_guard', 'uid_tt'],
    weakLoginMarkers: ['passport_csrf_token', 'ttwid', 's_v_web_id'],
    common: true,
    defaultCommon: false,
    sourceKind: 'curated',
    supportedSite: 'Douyin',
    successTips: [
      '先在同一个浏览器打开 douyin.com，确认账号头像正常。',
      '尽量复制具体视频页链接，不要直接使用推荐、精选或首页入口。',
      '导出后优先用公开视频测试，再测试登录态内容。',
    ],
  },
  {
    slug: 'tiktok',
    title: 'TikTok',
    shortTitle: 'TikTok',
    note: 'TikTok 网页域名。yt-dlp 官方支持 @user/video/{id}、短链、用户页和直播等；/foryou 不是下载目标页。',
    domains: ['tiktok.com'],
    origins: subdomainOrigins(['tiktok.com']),
    strongLoginMarkers: ['sessionid', 'sessionid_ss', 'sid_guard'],
    weakLoginMarkers: ['ttwid', 'msToken', 'passport_csrf_token'],
    common: true,
    defaultCommon: false,
    sourceKind: 'curated',
    supportedSite: 'TikTok',
    successTips: [
      '先在同一个浏览器打开 tiktok.com，确认账号头像正常。',
      '尽量复制具体视频页或短链，不要直接使用 For You 页面。',
      '如站点要求验证码或地区验证，需要先在浏览器里完成。',
    ],
  },
]

const SUPPORTED_SITE_BY_KEY = new Map<string, string>()
const SUPPORTED_DOMAIN_BY_KEY = new Map<string, string>()

YT_DLP_SUPPORTED_SITE_NAMES.forEach((name) => {
  const baseName = getExtractorBaseName(name)
  const key = normalizeSiteKey(baseName)
  if (key && !SUPPORTED_SITE_BY_KEY.has(key)) {
    SUPPORTED_SITE_BY_KEY.set(key, baseName)
  }
  if (baseName.includes('.')) {
    SUPPORTED_DOMAIN_BY_KEY.set(normalizeDomain(baseName), baseName)
  }
})

const SUPPORTED_DOMAIN_ALIASES = new Map<string, string>([
  ['b23.tv', 'BiliBili'],
  ['bilibili.cn', 'BiliBili'],
  ['bilibili.com', 'BiliBili'],
  ['biligame.com', 'BiliBili'],
  ['youtu.be', 'youtube'],
  ['youtube.com', 'youtube'],
  ['googlevideo.com', 'youtube'],
  ['douyin.com', 'Douyin'],
  ['iesdouyin.com', 'Douyin'],
  ['tiktok.com', 'TikTok'],
  ['youku.com', 'youku'],
  ['tudou.com', 'youku'],
  ['soku.com', 'youku'],
  ['iqiyi.com', 'iqiyi'],
  ['pps.tv', 'iqiyi'],
  ['xiaohongshu.com', 'XiaoHongShu'],
  ['xhslink.com', 'XiaoHongShu'],
  ['vimeo.com', 'vimeo'],
  ['dailymotion.com', 'dailymotion'],
  ['twitter.com', 'twitter'],
  ['x.com', 'twitter'],
  ['instagram.com', 'Instagram'],
  ['facebook.com', 'facebook'],
  ['soundcloud.com', 'soundcloud'],
  ['twitch.tv', 'twitch'],
])

export function getCommonServiceSlugs(rules: CookieServiceRule[] = SERVICE_RULES) {
  return rules.filter((rule) => rule.defaultCommon).map((rule) => rule.slug)
}

export function getServiceRules(slugs: string[], rules: CookieServiceRule[] = SERVICE_RULES) {
  const selected = new Set(slugs)
  return rules.filter((rule) => selected.has(rule.slug))
}

export function findServiceRule(slug: string, rules: CookieServiceRule[] = SERVICE_RULES) {
  return rules.find((rule) => rule.slug === slug) ?? null
}

export function buildDetectedServiceRules(cookies: Array<{ domain: string }>, mode: CookieScanMode) {
  const bySlug = new Map<string, CookieServiceRule>()

  cookies.forEach((cookie) => {
    const curatedRule = SERVICE_RULES.find((rule) => cookieMatchesRule(cookie, rule))
    if (curatedRule) {
      bySlug.set(curatedRule.slug, curatedRule)
      return
    }

    const groupKey = getDomainGroupKey(cookie.domain)
    const rule = mode === 'all'
      ? buildDomainRule(groupKey)
      : buildYtDlpRule(groupKey)
    if (rule) {
      bySlug.set(rule.slug, rule)
    }
  })

  return [...bySlug.values()].sort((left, right) => {
    const leftRank = left.common ? 0 : left.sourceKind === 'yt-dlp' ? 1 : 2
    const rightRank = right.common ? 0 : right.sourceKind === 'yt-dlp' ? 1 : 2
    return leftRank - rightRank || left.title.localeCompare(right.title)
  })
}

export function cookieMatchesRule(cookie: { domain: string }, rule: CookieServiceRule) {
  return rule.domains.some((domain) => domainMatches(cookie.domain, domain))
}

function buildYtDlpRule(groupKey: string): CookieServiceRule | null {
  const supportedSite = getSupportedSiteForDomain(groupKey)
  if (!supportedSite) return null

  return {
    slug: `yt-dlp-${safeSlug(supportedSite)}-${safeSlug(groupKey)}`,
    title: supportedSite === groupKey ? groupKey : `${supportedSite} / ${groupKey}`,
    shortTitle: supportedSite,
    note: `匹配到 yt-dlp 官方 supported sites 中的 ${supportedSite}。`,
    domains: [groupKey],
    origins: subdomainOrigins([groupKey]),
    strongLoginMarkers: [],
    weakLoginMarkers: [],
    successTips: [
      '如果下载需要登录态，请先在同一个浏览器打开目标网站并确认账号状态正常。',
    ],
    sourceKind: 'yt-dlp',
    supportedSite,
  }
}

function buildDomainRule(groupKey: string): CookieServiceRule {
  return {
    slug: `domain-${safeSlug(groupKey)}`,
    title: groupKey,
    shortTitle: groupKey,
    note: '全部 Cookie 模式下按域名整理。请只在你明确需要时导出。',
    domains: [groupKey],
    origins: subdomainOrigins([groupKey]),
    strongLoginMarkers: [],
    weakLoginMarkers: [],
    successTips: [
      '全部 Cookie 可能包含和下载无关的登录态，请只保存在自己的设备上。',
    ],
    sourceKind: 'domain',
  }
}

export function normalizeDomain(value: string) {
  return value.trim().replace(/^#HttpOnly_/, '').replace(/^\./, '').toLowerCase()
}

export function domainMatches(domain: string, expected: string) {
  const normalized = normalizeDomain(domain)
  const target = normalizeDomain(expected)
  return normalized === target || normalized.endsWith(`.${target}`)
}

export function getDomainGroupKey(domain: string) {
  const labels = normalizeDomain(domain).split('.').filter(Boolean)
  if (labels.length <= 2) return labels.join('.')
  const lastTwo = labels.slice(-2).join('.')
  if (COMPOUND_TLDS.has(lastTwo) && labels.length >= 3) {
    return labels.slice(-3).join('.')
  }
  return lastTwo
}

function getSupportedSiteForDomain(domain: string) {
  const groupKey = getDomainGroupKey(domain)
  const alias = SUPPORTED_DOMAIN_ALIASES.get(groupKey)
  if (alias && isSupportedSiteName(alias)) return alias

  const directDomain = SUPPORTED_DOMAIN_BY_KEY.get(groupKey)
  if (directDomain) return directDomain

  const rootLabel = getRootLabel(groupKey)
  const labelMatch = SUPPORTED_SITE_BY_KEY.get(normalizeSiteKey(rootLabel))
  if (labelMatch) return labelMatch

  const compactDomainKey = normalizeSiteKey(groupKey.replace(/\.[a-z0-9-]+$/i, ''))
  return SUPPORTED_SITE_BY_KEY.get(compactDomainKey) ?? null
}

function isSupportedSiteName(name: string) {
  return SUPPORTED_SITE_BY_KEY.has(normalizeSiteKey(name))
}

function getExtractorBaseName(name: string) {
  return name.split(':')[0].trim()
}

function getRootLabel(groupKey: string) {
  const labels = normalizeDomain(groupKey).split('.').filter(Boolean)
  if (labels.length === 0) return ''
  if (labels.length >= 3 && COMPOUND_TLDS.has(labels.slice(-2).join('.'))) {
    return labels[labels.length - 3]
  }
  return labels[labels.length - 2] ?? labels[0]
}

function normalizeSiteKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function safeSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '') || 'site'
}
