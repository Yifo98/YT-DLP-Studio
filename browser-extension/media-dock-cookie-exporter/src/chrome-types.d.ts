type ChromeCookieSameSite = 'no_restriction' | 'lax' | 'strict' | 'unspecified'

type ChromeCookie = {
  domain: string
  expirationDate?: number
  hostOnly: boolean
  httpOnly: boolean
  name: string
  path: string
  sameSite: ChromeCookieSameSite
  secure: boolean
  session: boolean
  storeId: string
  value: string
}

type ChromePermissionRequest = {
  origins?: string[]
  permissions?: string[]
}

type ChromeDownloadOptions = {
  url: string
  filename?: string
  saveAs?: boolean
}

declare const chrome: {
  cookies: {
    getAll(details: Record<string, never>, callback: (cookies: ChromeCookie[]) => void): void
  }
  downloads: {
    download(options: ChromeDownloadOptions, callback?: (downloadId?: number) => void): void
  }
  permissions?: {
    contains(request: ChromePermissionRequest, callback: (result: boolean) => void): void
    request(request: ChromePermissionRequest, callback: (granted: boolean) => void): void
  }
  runtime: {
    lastError?: { message?: string }
  }
  storage: {
    local: {
      get(keys: string[], callback: (items: Record<string, unknown>) => void): void
      set(items: Record<string, unknown>, callback?: () => void): void
    }
  }
}
