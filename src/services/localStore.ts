export function readJsonStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeJsonStorage(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value))
}

export function removeStorageItem(key: string) {
  window.localStorage.removeItem(key)
}
