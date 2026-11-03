/**
 * Aviso de versión nueva: la lógica. Canónico (utiles/version), idéntico en todos los sistemas.
 * Se copia a `frontend/src/lib/version-nueva.ts`.
 *
 * Una pestaña abierta desde antes de un despliegue sigue con la pantalla vieja contra el servidor
 * nuevo. En octubre de 2026 eso mostró mal el resultado de un examen en Kvasir: el servidor corrigió
 * bien, pero la pantalla vieja marcó la correcta sobre otro orden de opciones. Cada compilación
 * publica su id en /version.json (plugin `vite-version-json.ts`); si el publicado no es el de esta
 * pestaña, hay que recargar.
 *
 * ⚠️ /version.json no puede quedar en ningún caché. Acá se pide con `cache: 'no-store'` y un
 * parámetro distinto cada vez; igual, nginx debe servirlo con `Cache-Control: no-store` (ver README).
 */
import { useEffect, useSyncExternalStore } from 'react'

/** Lo define el plugin `versionJson` de vite.config.ts. */
declare const __BUILD_ID__: string

const CADA_MS = 5 * 60 * 1000
let desactualizada = false
let ultima = 0
const oyentes = new Set<() => void>()

/** Consulta /version.json ya mismo. true si hay una versión nueva publicada. Sirve para frenar una acción delicada (un examen, una firma) antes de mandarla. */
export async function comprobarVersion(): Promise<boolean> {
  if (import.meta.env.DEV || desactualizada) return desactualizada
  ultima = Date.now()
  try {
    // BASE_URL es '/' en casi todos. En Heimdall el panel vive en /heimdall/ porque la raíz es el señuelo.
    const r = await fetch(`${import.meta.env.BASE_URL}version.json?t=${ultima}`, { cache: 'no-store' })
    if (!r.ok) return false
    const { build } = (await r.json()) as { build?: string }
    if (build && build !== __BUILD_ID__) {
      desactualizada = true
      oyentes.forEach((f) => f())
    }
  } catch {
    // Sin red, o sin version.json (nginx devuelve index.html y no es JSON): se vuelve a probar en el próximo turno.
  }
  return desactualizada
}

function suscribir(f: () => void) {
  oyentes.add(f)
  return () => { oyentes.delete(f) }
}

/** true cuando ya hay una versión nueva publicada. Comprueba al montar, al volver a la pestaña y cada 5 minutos. */
export function useVersionNueva() {
  useEffect(() => {
    const quizas = () => { if (Date.now() - ultima > 30 * 1000) void comprobarVersion() }
    const alVolver = () => { if (document.visibilityState === 'visible') quizas() }
    quizas()
    const id = window.setInterval(() => void comprobarVersion(), CADA_MS)
    document.addEventListener('visibilitychange', alVolver)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', alVolver) }
  }, [])
  return useSyncExternalStore(suscribir, () => desactualizada)
}

/**
 * Una pestaña de una versión anterior pide archivos que el despliegue ya borró (las pantallas se
 * cargan por partes): se recarga UNA vez para traer la versión publicada. Llamar una vez en main.tsx.
 * La marca en sessionStorage evita un bucle de recargas si el archivo falta por otro motivo.
 */
export function recargarSiFaltaUnArchivo(clave = 'allsafe-recargada') {
  window.addEventListener('vite:preloadError', (e) => {
    try {
      if (sessionStorage.getItem(clave) === '1') return
      sessionStorage.setItem(clave, '1')
    } catch {
      return
    }
    e.preventDefault()
    window.location.reload()
  })
  window.addEventListener('load', () => {
    window.setTimeout(() => { try { sessionStorage.removeItem(clave) } catch { /* sin almacenamiento */ } }, 10000)
  })
}
