const BASE = '/api'

/**
 * `body` se declara aparte de RequestInit porque esta funcion serializa sola cualquier
 * objeto plano, igual que la edicion Pro. Antes no lo hacia y cinco llamados que pasaban
 * un objeto crudo terminaban enviando la cadena "[object Object]": cambiar contrasena,
 * activar y quitar el segundo factor, crear un caso en TheHive y crear un hunt en
 * Velociraptor. Con el RequestInit crudo el tipo tampoco lo dejaba ver.
 */
export type OpcionesApi = Omit<RequestInit, 'body'> & { body?: unknown }

export async function apiFetch<T = unknown>(
  path: string,
  options: OpcionesApi = {}
): Promise<T> {
  const token = localStorage.getItem('gjallarhorn_token')
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> | undefined),
  }
  // ⚠️ `typeof === 'object'` tambien es cierto para FormData, Blob y ArrayBuffer, y
  // serializarlos los convierte en "{}" sin que nada avise. Se excluyen explicitamente.
  // Lo que ya viene como cadena pasa intacto, asi que los llamados que hacen
  // JSON.stringify por su cuenta siguen funcionando igual.
  const crudo = options.body
  const serializar = crudo !== undefined && crudo !== null && typeof crudo === 'object'
    && !(crudo instanceof FormData) && !(crudo instanceof Blob)
    && !(crudo instanceof ArrayBuffer) && !ArrayBuffer.isView(crudo)
    && !(crudo instanceof URLSearchParams) && !(crudo instanceof ReadableStream)
  const body = (serializar ? JSON.stringify(crudo) : crudo) as BodyInit | null | undefined
  const { body: _sinUsar, ...resto } = options
  const res = await fetch(`${BASE}${path}`, { ...resto, body, headers })
  if (res.status === 401 && localStorage.getItem('gjallarhorn_token')) {
    window.dispatchEvent(new CustomEvent('session-expired'))
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}
