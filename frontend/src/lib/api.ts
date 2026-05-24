const BASE = '/api'

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('gjallarhorn_token')
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> | undefined),
  }
  const res = await fetch(`${BASE}${path}`, { ...options, headers })
  if (res.status === 401 && localStorage.getItem('gjallarhorn_token')) {
    window.dispatchEvent(new CustomEvent('session-expired'))
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}
