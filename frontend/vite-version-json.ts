/**
 * Plugin de Vite del aviso de versión nueva. Canónico (utiles/version), idéntico en todos los sistemas.
 * Se copia a `frontend/vite-version-json.ts`, al lado de `vite.config.ts`.
 *
 * Cada compilación lleva un id propio (`__BUILD_ID__`, versión del package.json más la hora de la
 * compilación) y lo publica en `/version.json`. Una pestaña abierta desde antes de un despliegue
 * compara el publicado con el suyo y pide recargar (ver `src/lib/version-nueva.ts`).
 *
 * Uso en vite.config.ts:
 *   import { versionJson } from './vite-version-json'
 *   plugins: [versionJson(pkg.version), ...]
 * y sumar `vite-version-json.ts` al `include` de tsconfig.node.json.
 */
import type { Plugin } from 'vite'

export function versionJson(version: string): Plugin {
  const build = `${version}-${Date.now().toString(36)}`
  return {
    name: 'allsafe-version-json',
    // El id se define también al desarrollar y en las pruebas: así el código que lo lee nunca
    // encuentra la constante sin definir. El archivo, en cambio, solo sale en la compilación.
    config: () => ({ define: { __BUILD_ID__: JSON.stringify(build) } }),
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version, build }) })
    },
  }
}
