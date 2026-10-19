/**
 * Tipos y utilidades del inventario de activos. Canónico (utiles/activos/ui): idéntico en Skuld y
 * Gjallarhorn, copiado a `src/components/inventario/`.
 */

export type Fetcher = <T = unknown>(path: string, init?: { method?: string; body?: string }) => Promise<T>

export interface Taxonomia {
  categorias: Record<string, { nombre: string; tipos: Record<string, string> }>
  estados: Record<string, string>
  criticidad: string[]
  clasificacion: string[]
  disposicion: Record<string, string>
  vencimientos: Record<string, string>
  avisos: number[]
  fuentes: string[]
}

export type Semaforo = 'vencido' | 'critico' | 'proximo' | 'al_dia' | 'sin_fecha'

export interface FilaActivo {
  id: string
  categoria: string
  tipo: string
  nombre: string
  alias: string | null
  estado: string
  cantidad: number
  ip: string | null
  hostname: string | null
  serie: string | null
  numero_inventario: string | null
  fabricante: string | null
  modelo: string | null
  criticidad: string
  clasificacion: string | null
  propietario: string | null
  asignado_a: string | null
  ubicacion: string | null
  origen: string
  visto_ultima: string | null
  prox_venc: string | null
  dias_venc: number | null
  semaforo: Semaforo | null
  n_fuentes: number
}

export interface Vencimiento {
  id: string
  activo_id: string
  tipo: string
  descripcion: string | null
  fecha: string
  costo_renovacion: number | string | null
  moneda: string | null
  renovacion_auto: number
  responsable: string | null
  responsable_correo: string | null
  avisos: string | number[] | null
  estado: 'vigente' | 'renovado' | 'no_renovar'
  dias: number | null
  semaforo: Semaforo | null
  ultimo_aviso: string | null
  activo_nombre?: string
  propietario?: string | null
}

export interface Asignacion {
  id: string
  activo_id: string
  persona: string
  persona_correo: string | null
  entregado_at: string
  acepto_uso: number
  devuelto_at: string | null
  estado_devolucion: string | null
  notas: string | null
  activo_nombre?: string
  serie?: string | null
}

export interface Activo extends Record<string, unknown> {
  id: string
  tenant_id: string | null
  nombre: string
  categoria: string
  tipo: string
  estado: string
  criticidad: string
  origen: string
  vencimientos: Vencimiento[]
  asignaciones: Asignacion[]
  fuentes: { fuente: string; externo_id: string | null; visto_at: string }[]
  hijos: { id: string; nombre: string; tipo: string; categoria: string; estado: string }[]
  padre: { id: string; nombre: string; tipo: string } | null
  discrepancias: { campo: string; valores: Record<string, string> }[]
}

export const SEMAFORO: Record<Semaforo, { texto: string; clase: string }> = {
  vencido: { texto: 'Vencido', clase: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30' },
  critico: { texto: 'Vence en 30 días', clase: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30' },
  proximo: { texto: 'Próximo', clase: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30' },
  al_dia: { texto: 'Al día', clase: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' },
  sin_fecha: { texto: 'Sin fecha', clase: 'bg-muted text-muted-foreground' },
}

export const CRITICIDAD: Record<string, { texto: string; clase: string }> = {
  critica: { texto: 'Crítica', clase: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30' },
  alta: { texto: 'Alta', clase: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30' },
  media: { texto: 'Media', clase: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30' },
  baja: { texto: 'Baja', clase: 'bg-muted text-muted-foreground' },
}

export const CLASIFICACION: Record<string, string> = {
  publica: 'Pública', interna: 'Interna', confidencial: 'Confidencial', restringida: 'Restringida',
}

export const FUENTE: Record<string, string> = {
  manual: 'Carga manual', csv: 'Planilla', huginn: 'Huginn', zabbix: 'Zabbix', glpi: 'GLPI', sondeo: 'Sondeo',
  skuld: 'Skuld', gjallarhorn: 'Gjallarhorn', propio: 'Monitoreo propio',
}

export const VERIFICADAS = ['huginn', 'zabbix', 'glpi', 'sondeo', 'gjallarhorn', 'propio']

/** "2026-10-31" -> "31/10/2026" sin pasar por Date (que corre la fecha según la zona). */
export function fecha(iso: string | null | undefined): string {
  if (!iso) return '-'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso))
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso)
}

export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? String(iso) : d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

export function dinero(n: number | string | null | undefined, moneda?: string | null): string {
  if (n == null || n === '') return '-'
  return `${moneda || 'ARS'} ${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
}

export function cuandoVence(dias: number | null | undefined): string {
  if (dias == null) return ''
  if (dias < 0) return `venció hace ${-dias} día${dias === -1 ? '' : 's'}`
  if (dias === 0) return 'vence hoy'
  return `en ${dias} día${dias === 1 ? '' : 's'}`
}

export function nombreTipo(tx: Taxonomia | undefined, categoria: string, tipo: string): string {
  return tx?.categorias[categoria]?.tipos[tipo] || tipo
}
