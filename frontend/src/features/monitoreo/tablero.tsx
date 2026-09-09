/**
 * Tablero de monitoreo: las métricas.
 *
 * 🔑 Distinto del panel a propósito. El panel responde **qué está pasando ahora** y se mira
 * durante una guardia; este responde **cómo viene la cosa**, y se mira una vez por semana
 * para decidir dónde poner el esfuerzo. Mezclarlos daría una pantalla que no sirve para
 * ninguna de las dos.
 */
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { HelpTip } from '@/components/help-tip'
import { apiFetch } from '@/lib/api'

type Resumen = {
  total: number
  cuenta: Record<string, number>
  porOrigen: Record<string, number>
  eventos24h: number
}
type Metricas = {
  dias: { dia: string; caidas: number; recuperaciones: number }[]
  reincidentes: { nombre: string; criticidad: string; caidas: number }[]
  latencia: { tipo: string; media: number; n: number }[]
  porCriticidad: { criticidad: string; total: number; caidos: number }[]
}

// Mismos colores que las insignias de estado: si el gráfico usa otros, hay que traducir
// mentalmente entre una pantalla y la otra.
const COLOR: Record<string, string> = {
  ok: '#16a34a', degradado: '#d97706', caido: '#dc2626', sin_medir: '#6b7280',
}

function Caja({ titulo, children, alto = 260 }: { titulo: string; children: React.ReactNode; alto?: number }) {
  return (
    <div className='rounded-lg border'>
      <div className='border-b px-4 py-3'><h2 className='text-sm font-semibold'>{titulo}</h2></div>
      <div className='p-3' style={{ height: alto }}>{children}</div>
    </div>
  )
}

export function TableroMonitoreo() {
  const { t } = useTranslation()
  const { data: r } = useQuery<Resumen>({
    queryKey: ['monitor-resumen'], queryFn: () => apiFetch('/monitoreo/resumen'), refetchInterval: 60_000,
  })
  const { data: m } = useQuery<Metricas>({
    queryKey: ['monitor-metricas'], queryFn: () => apiFetch('/monitoreo/metricas?dias=7'), refetchInterval: 60_000,
  })

  const estados = Object.entries(r?.cuenta ?? {})
    .filter(([, n]) => n > 0)
    .map(([k, n]) => ({ nombre: t(`monitoreo.estado.${k}`), valor: n, color: COLOR[k] ?? '#6b7280' }))

  const crit = (m?.porCriticidad ?? []).map((x) => ({
    nombre: t(`monitoreo.crit.${x.criticidad}`),
    enPie: Number(x.total) - Number(x.caidos),
    caidos: Number(x.caidos),
  }))

  const serie = (m?.dias ?? []).map((d) => ({
    dia: d.dia.slice(5),            // día y mes: el año no aporta en una serie de 7 días
    caidas: d.caidas, recuperaciones: d.recuperaciones,
  }))

  return (
    <>
      <Header fixed>
        <div className='ms-auto flex items-center space-x-4'><ProfileDropdown /></div>
      </Header>
      <Main>
        <div className='mb-6'>
          <h1 className='text-2xl font-bold tracking-tight flex items-center gap-2'>
            {t('monitoreo.tableroTitulo')}
            <HelpTip title={t('ayuda.tablero.t')} description={t('ayuda.tablero.d')}
              tips={[t('ayuda.tablero.k1'), t('ayuda.tablero.k2'), t('ayuda.tablero.k3')]} />
          </h1>
          <p className='text-sm text-muted-foreground'>{t('monitoreo.tableroSubtitulo')}</p>
        </div>

        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          {[
            { k: 'totalActivos', n: r?.total ?? 0 },
            { k: 'estado.caido', n: r?.cuenta?.caido ?? 0, tono: (r?.cuenta?.caido ?? 0) > 0 ? 'text-red-600' : '' },
            { k: 'medidosPropio', n: r?.porOrigen?.propio ?? 0 },
          ].map((x) => (
            <div key={x.k} className='rounded-lg border p-4'>
              <p className='text-xs uppercase tracking-wide text-muted-foreground'>{t(`monitoreo.${x.k}`)}</p>
              <p className={`mt-1 text-3xl font-bold tabular-nums ${x.tono ?? ''}`}>{x.n}</p>
            </div>
          ))}
        </div>

        <div className='mt-4 grid gap-4 lg:grid-cols-2'>
          <Caja titulo={t('monitoreo.distribucion')}>
            {!estados.length ? (
              <p className='pt-16 text-center text-sm text-muted-foreground'>{t('monitoreo.sinDatos')}</p>
            ) : (
              <ResponsiveContainer width='100%' height='100%'>
                <PieChart>
                  <Pie data={estados} dataKey='valor' nameKey='nombre' innerRadius={55} outerRadius={85}
                       isAnimationActive={false}>
                    {estados.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Legend verticalAlign='bottom' height={28} />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Caja>

          <Caja titulo={t('monitoreo.porCriticidad')}>
            {!crit.length ? (
              <p className='pt-16 text-center text-sm text-muted-foreground'>{t('monitoreo.sinDatos')}</p>
            ) : (
              <ResponsiveContainer width='100%' height='100%'>
                <BarChart data={crit} margin={{ top: 8, right: 8, left: -26, bottom: 0 }} barSize={26}>
                  <CartesianGrid strokeDasharray='3 3' vertical={false} opacity={0.25} />
                  <XAxis dataKey='nombre' fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Legend verticalAlign='top' height={24} />
                  <Bar dataKey='enPie' stackId='a' name={t('monitoreo.enPie')} fill='#16a34a' isAnimationActive={false} />
                  <Bar dataKey='caidos' stackId='a' name={t('monitoreo.estado.caido')} fill='#dc2626' isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Caja>

          <Caja titulo={t('monitoreo.serie7d')}>
            <ResponsiveContainer width='100%' height='100%'>
              <BarChart data={serie} margin={{ top: 8, right: 8, left: -26, bottom: 0 }} barSize={16}>
                <CartesianGrid strokeDasharray='3 3' vertical={false} opacity={0.25} />
                <XAxis dataKey='dia' fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip />
                <Legend verticalAlign='top' height={24} />
                <Bar dataKey='caidas' name={t('monitoreo.caidas')} fill='#dc2626' isAnimationActive={false} />
                <Bar dataKey='recuperaciones' name={t('monitoreo.recuperaciones')} fill='#16a34a' isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </Caja>

          <Caja titulo={t('monitoreo.reincidentes')}>
            {!m?.reincidentes.length ? (
              <p className='pt-16 text-center text-sm text-muted-foreground'>{t('monitoreo.sinReincidentes')}</p>
            ) : (
              <ul className='divide-y overflow-y-auto' style={{ maxHeight: '100%' }}>
                {m.reincidentes.map((x, i) => (
                  <li key={i} className='flex items-center justify-between px-1 py-2 text-sm'>
                    <span className='truncate'>{x.nombre}</span>
                    <span className='ml-3 shrink-0 tabular-nums text-muted-foreground'>
                      {t('monitoreo.nCaidas', { n: x.caidas })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Caja>
        </div>

        {/* La latencia media dice si algo se está poniendo lento ANTES de caerse del todo,
            que es cuando todavía se puede hacer algo. */}
        {!!m?.latencia.length && (
          <div className='mt-4 flex flex-wrap gap-3'>
            {m.latencia.map((l) => (
              <div key={l.tipo} className='rounded-lg border px-4 py-3'>
                <p className='text-xs uppercase text-muted-foreground'>
                  {t('monitoreo.latenciaMedia')} · {l.tipo.toUpperCase()}
                </p>
                <p className='text-xl font-semibold tabular-nums'>{l.media ?? '-'} ms</p>
              </div>
            ))}
          </div>
        )}
      </Main>
    </>
  )
}
