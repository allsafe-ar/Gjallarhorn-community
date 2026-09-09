/**
 * Panel del monitoreo.
 *
 * 🔑 **Primero lo que está mal.** Un panel que arranca con "42 activos" y esconde abajo
 * que tres están caídos invita a mirarlo y seguir de largo. Acá lo caído va arriba, con
 * nombre, y el total queda como contexto.
 */
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Activity, ServerCrash, ShieldQuestion, Gauge } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Badge } from '@/components/ui/badge'
import { HelpTip } from '@/components/help-tip'
import { apiFetch } from '@/lib/api'
import { EstadoBadge } from './estado'

type Resumen = {
  total: number
  cuenta: Record<string, number>
  porCriticidad: Record<string, { total: number; caidos: number }>
  porOrigen: Record<string, number>
  caidos: { id: string; nombre: string; ip: string | null; criticidad: string; origen: string; desde: string | null; tipos: string }[]
  eventos: { id: string; origen: string; severidad: string; estado_nuevo: string | null; mensaje: string; ts: string; activo: string | null }[]
  eventos24h: number
  enVivo: {
    id: string; nombre: string; nombre_real: string; ip: string | null; hostname: string | null
    criticidad: string; origen: string; estado: string
    chequeos: number; latencia: number | null; medido_at: string | null
    tipos: string | null; error: string | null
  }[]
}

function Cifra({ n, etiqueta, tono, icono }: { n: number; etiqueta: string; tono?: string; icono: React.ReactNode }) {
  return (
    <div className='rounded-lg border p-4'>
      <div className='flex items-center justify-between text-muted-foreground'>
        <span className='text-xs uppercase tracking-wide'>{etiqueta}</span>
        {icono}
      </div>
      <p className={`mt-1 text-3xl font-bold ${tono ?? ''}`}>{n}</p>
    </div>
  )
}

export function PanelMonitoreo() {
  const { t } = useTranslation()
  const { data } = useQuery<Resumen>({
    queryKey: ['monitor-resumen'],
    queryFn: () => apiFetch('/monitoreo/resumen'),
    refetchInterval: 30_000,
  })
  const c = data?.cuenta ?? {}

  return (
    <>
      <Header fixed>
        <div className='ms-auto flex items-center space-x-4'><ProfileDropdown /></div>
      </Header>
      <Main>
        <div className='mb-6'>
          <h1 className='text-2xl font-bold tracking-tight flex items-center gap-2'>
            {t('monitoreo.panelTitulo')}
            <HelpTip title={t('ayuda.monitoreo.t')} description={t('ayuda.monitoreo.d')}
              tips={[t('ayuda.monitoreo.k1'), t('ayuda.monitoreo.k2'), t('ayuda.monitoreo.k3')]} />
          </h1>
          <p className='text-sm text-muted-foreground'>{t('monitoreo.panelSubtitulo')}</p>
        </div>

        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          <Cifra n={c.caido ?? 0} etiqueta={t('monitoreo.estado.caido')}
            tono={(c.caido ?? 0) > 0 ? 'text-red-600' : ''} icono={<ServerCrash className='size-4' />} />
          <Cifra n={c.degradado ?? 0} etiqueta={t('monitoreo.estado.degradado')}
            tono={(c.degradado ?? 0) > 0 ? 'text-amber-600' : ''} icono={<Activity className='size-4' />} />
          <Cifra n={c.sin_medir ?? 0} etiqueta={t('monitoreo.estado.sin_medir')} icono={<ShieldQuestion className='size-4' />} />
          <Cifra n={data?.total ?? 0} etiqueta={t('monitoreo.totalActivos')} icono={<Gauge className='size-4' />} />
        </div>

        <div className='mt-6 grid gap-4 lg:grid-cols-2'>
          <div className='rounded-lg border'>
            <div className='border-b px-4 py-3'>
              <h2 className='text-sm font-semibold'>{t('monitoreo.caidosAhora')}</h2>
            </div>
            {!data?.caidos.length ? (
              <p className='px-4 py-8 text-center text-sm text-muted-foreground'>{t('monitoreo.nadaCaido')}</p>
            ) : (
              <ul className='divide-y'>
                {data.caidos.map((x) => (
                  <li key={x.id} className='flex items-center justify-between gap-2 px-4 py-2.5'>
                    <div className='min-w-0'>
                      <p className='truncate text-sm font-medium'>{x.nombre}</p>
                      <p className='truncate text-xs text-muted-foreground'>
                        {[x.ip, x.tipos].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <Badge variant='outline' className='shrink-0 text-xs'>{t(`monitoreo.crit.${x.criticidad}`)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className='rounded-lg border'>
            <div className='flex items-center justify-between border-b px-4 py-3'>
              <h2 className='text-sm font-semibold'>{t('monitoreo.ultimosCambios')}</h2>
              <span className='text-xs text-muted-foreground'>{t('monitoreo.en24h', { n: data?.eventos24h ?? 0 })}</span>
            </div>
            {!data?.eventos.length ? (
              <p className='px-4 py-8 text-center text-sm text-muted-foreground'>{t('monitoreo.sinEventos')}</p>
            ) : (
              <ul className='divide-y'>
                {data.eventos.map((e) => (
                  <li key={e.id} className='px-4 py-2.5'>
                    <div className='flex items-center gap-2'>
                      <Badge variant='outline' className='text-xs'>{t('monitoreo.origenPropio')}</Badge>
                      <EstadoBadge estado={e.estado_nuevo === 'problema' ? 'caido' : (e.estado_nuevo ?? 'desconocido')} />
                      <span className='ml-auto text-xs text-muted-foreground'>
                        {new Date(e.ts).toLocaleString('es-AR')}
                      </span>
                    </div>
                    <p className='mt-1 text-sm'>{e.mensaje}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Equipo por equipo, en vivo. Es lo que convierte al panel en una pantalla de
            guardia: se mira y se sabe quién responde y quién no, sin abrir nada. */}
        <div className='mt-6 rounded-lg border'>
          <div className='flex items-center justify-between border-b px-4 py-3'>
            <h2 className='text-sm font-semibold'>{t('monitoreo.enVivo')}</h2>
            <span className='text-xs text-muted-foreground'>{t('monitoreo.actualizaSolo')}</span>
          </div>
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead className='border-b text-left text-xs text-muted-foreground'>
                <tr>
                  <th className='px-4 py-2 font-medium'>{t('monitoreo.col.estado')}</th>
                  <th className='px-4 py-2 font-medium'>{t('monitoreo.col.nombre')}</th>
                  <th className='px-4 py-2 font-medium'>{t('monitoreo.col.ip')}</th>
                  <th className='px-4 py-2 font-medium'>{t('monitoreo.col.chequeos')}</th>
                  <th className='px-4 py-2 font-medium'>{t('monitoreo.latencia')}</th>
                  <th className='px-4 py-2 font-medium'>{t('monitoreo.ultimaMedicion')}</th>
                </tr>
              </thead>
              <tbody>
                {!data?.enVivo.length ? (
                  <tr><td colSpan={7} className='px-4 py-8 text-center text-muted-foreground'>
                    {t('monitoreo.vacio')}
                  </td></tr>
                ) : data.enVivo.map((h) => (
                  <tr key={h.id} className='border-b last:border-0'>
                    <td className='px-4 py-2'><EstadoBadge estado={h.estado} /></td>
                    <td className='px-4 py-2 font-medium'>
                      {h.nombre}
                      {h.nombre !== h.nombre_real && (
                        <span className='block text-xs font-normal text-muted-foreground'>{h.nombre_real}</span>
                      )}
                      {/* El error va acá y no en una columna aparte: es lo que se quiere
                          leer justo después de ver que algo está caído. */}
                      {h.estado === 'caido' && h.error && (
                        <span className='block text-xs font-normal text-red-600'>{h.error}</span>
                      )}
                    </td>
                    <td className='px-4 py-2 font-mono text-xs'>{h.ip || h.hostname || '-'}</td>
                    <td className='px-4 py-2 text-xs text-muted-foreground'>
                      {h.chequeos ? (h.tipos || '').split(',').join(' · ') : t('monitoreo.estado.sin_medir')}
                    </td>
                    <td className='px-4 py-2 text-xs tabular-nums text-muted-foreground'>
                      {h.latencia != null ? `${h.latencia} ms` : '-'}
                    </td>
                    <td className='px-4 py-2 text-xs text-muted-foreground'>
                      {h.medido_at ? new Date(h.medido_at).toLocaleTimeString('es-AR') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className='mt-4 text-xs text-muted-foreground'>
          <Link to='/monitoreo' className='hover:underline'>{t('monitoreo.verTodos')}</Link>
        </p>
      </Main>
    </>
  )
}
