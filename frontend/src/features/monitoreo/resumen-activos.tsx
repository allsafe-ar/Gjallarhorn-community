/**
 * De qué está hecho el parque de equipos.
 *
 * 🔑 Responde una pregunta distinta de la del tablero de métricas. Aquel muestra cómo VIENE la
 * infraestructura en el tiempo; este muestra de QUÉ está hecha ahora: cuántos Windows, cuántos
 * Linux, cuántos responden, cuántos no y de dónde salió cada equipo.
 *
 * ⚠️ Los equipos sin sistema operativo declarado se muestran, no se esconden. En un inventario
 * lo que falta es tan informativo como lo que está: dice que el inventario del cliente está
 * incompleto, y eso es un insumo del análisis de riesgo.
 */
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { apiFetch } from '@/lib/api'

type Resumen = {
  total: number
  sistemas: Record<string, number>
  enPie: number; caidos: number; sinMedir: number
}

/** Orden fijo: si se ordenara por cantidad, las columnas bailarían en cada refresco. */
const SISTEMAS = ['windows', 'linux', 'macos', 'red', 'movil', 'otro', 'sin_dato']

function Cifra({ etiqueta, valor, tono = '' }: { etiqueta: string; valor: number; tono?: string }) {
  return (
    <div className='rounded-lg border p-3'>
      <div className='text-[11px] uppercase tracking-wide text-muted-foreground'>{etiqueta}</div>
      <div className={`mt-0.5 text-2xl font-semibold ${tono}`}>{valor}</div>
    </div>
  )
}

/** Barra de composición: una sola línea que muestra la proporción sin ocupar media pantalla. */
function Barra({ partes }: { partes: { clave: string; n: number; color: string; texto: string }[] }) {
  const total = partes.reduce((s, p) => s + p.n, 0) || 1
  return (
    <div>
      <div className='flex h-2 overflow-hidden rounded-full bg-muted'>
        {partes.filter((p) => p.n).map((p) => (
          <div key={p.clave} className={p.color} style={{ width: `${(p.n / total) * 100}%` }} />
        ))}
      </div>
      <div className='mt-2 flex flex-wrap gap-x-4 gap-y-1'>
        {partes.filter((p) => p.n).map((p) => (
          <span key={p.clave} className='flex items-center gap-1.5 text-xs'>
            <span className={`size-2 rounded-sm ${p.color}`} />
            {p.texto}
            <span className='font-medium'>{p.n}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

export function ResumenActivos() {
  const { t } = useTranslation()
  const { data: r } = useQuery<Resumen>({
    queryKey: ['monitor-resumen-inventario'],
    queryFn: () => apiFetch('/monitoreo/inventario/resumen'),
    refetchInterval: 60_000,
  })
  if (!r) return null

  const COLOR: Record<string, string> = {
    windows: 'bg-sky-500', linux: 'bg-amber-500', macos: 'bg-zinc-400',
    red: 'bg-violet-500', movil: 'bg-teal-500', otro: 'bg-slate-500',
    sin_dato: 'bg-muted-foreground/40',
  }

  return (
    <div className='mb-4 space-y-3'>
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
        <Cifra etiqueta={t('monitoreo.res.total')} valor={r.total} />
        <Cifra etiqueta={t('monitoreo.res.enPie')} valor={r.enPie} tono='text-emerald-600' />
        <Cifra etiqueta={t('monitoreo.res.caidos')} valor={r.caidos}
          tono={r.caidos ? 'text-red-600' : ''} />
        {/* El número accionable: están en el inventario y no los mide nadie. */}
        <Cifra etiqueta={t('monitoreo.res.sinMedir')} valor={r.sinMedir}
          tono={r.sinMedir ? 'text-amber-600' : ''} />
      </div>

      <div className='grid gap-3'>
        <div className='rounded-lg border p-3'>
          <div className='mb-2 text-sm font-medium'>{t('monitoreo.res.porSistema')}</div>
          <Barra partes={SISTEMAS.map((k) => ({
            clave: k, n: r.sistemas[k] ?? 0, color: COLOR[k],
            texto: t(`monitoreo.so.${k}`),
          }))} />
          {(r.sistemas.sin_dato ?? 0) > 0 && (
            <p className='mt-2 text-[11px] text-muted-foreground'>
              {t('monitoreo.res.sinSoAyuda', { n: r.sistemas.sin_dato })}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
