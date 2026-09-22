/**
 * Monitoreo de infraestructura e inventario de activos.
 *
 * 🔑 Una sola pantalla: los equipos que Gjallarhorn mide, con su estado, y el inventario de lo
 * que hay. La edición Pro suma la importación desde Zabbix y GLPI y el cruce del mismo equipo
 * entre varias fuentes sin duplicarlo.
 *
 * ⚠️ El monitoreo solo sirve on-premise: el servidor tiene que estar dentro de la red que mide.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { HelpTip } from '@/components/help-tip'
import { apiFetch } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { DetalleActivo } from './detalle'
import { ResumenActivos } from './resumen-activos'
import { EstadoBadge } from './estado'

type Activo = {
  id: string; nombre: string; ip: string | null; hostname: string | null
  grupo: string | null; origen: 'propio' | 'zabbix' | 'glpi' | 'huginn'; criticidad: string
  // Todas las procedencias del activo, no solo la que lo creó.
  fuentes: string[]
  monitoreado: number; visto_ultima: string | null
  estado: string; chequeos: number; organizacion: string
  alias: string | null; so: string | null; so_pista: string | null
  puertos: { puerto: number; servicio: string }[] | null; sondeado_at: string | null
}

const CRIT: Record<string, string> = {
  baja: 'text-muted-foreground', media: '', alta: 'text-amber-600', critica: 'text-red-600',
}

export function MonitoreoView() {
  const { t } = useTranslation()
  // Staff de AllSafe: inquilino nulo. Es el único que ve equipos de varias organizaciones.
  const [abierto, setAbierto] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [fCrit, setFCrit] = useState('')


  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (fEstado) params.set('estado', fEstado)
  if (fCrit) params.set('criticidad', fCrit)

  const { data: lista, isLoading } = useQuery<{ activos: Activo[] }>({
    queryKey: ['monitor-activos', q, fEstado, fCrit],
    queryFn: () => apiFetch<{ activos: Activo[] }>(`/monitoreo/activos?${params}`),
    // El estado cambia solo, sin que nadie toque nada: la pantalla se actualiza sola.
    refetchInterval: 30_000,
  })
  const activos = lista?.activos ?? []





  return (
    <>
      <Header fixed>
        <div className='ms-auto flex items-center space-x-4'><ProfileDropdown /></div>
      </Header>
      <Main>
        <div className='mb-6 flex items-center justify-between'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight flex items-center gap-2'>
              {t('monitoreo.title')}
              <HelpTip title={t('ayuda.monitoreo.t')} description={t('ayuda.monitoreo.d')}
                tips={[t('ayuda.monitoreo.k1'), t('ayuda.monitoreo.k2'), t('ayuda.monitoreo.k3')]} />
            </h1>
            <p className='text-sm text-muted-foreground'>
              {t('monitoreo.subtitle')}
            </p>
          </div>
        </div>

        {(
          <div className='mb-3 flex flex-wrap items-center gap-2'>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('monitoreo.buscar')}
              className='h-9 w-full sm:w-64'
            />
            <select
              value={fEstado} onChange={(e) => setFEstado(e.target.value)}
              className='h-9 rounded-md border bg-background px-2 text-sm'
            >
              <option value=''>{t('monitoreo.filtroEstado')}</option>
              {['ok', 'degradado', 'caido', 'sin_medir'].map((x) => (
                <option key={x} value={x}>{t(`monitoreo.estado.${x}`)}</option>
              ))}
            </select>
            <select
              value={fCrit} onChange={(e) => setFCrit(e.target.value)}
              className='h-9 rounded-md border bg-background px-2 text-sm'
            >
              <option value=''>{t('monitoreo.filtroCriticidad')}</option>
              {['critica', 'alta', 'media', 'baja'].map((x) => (
                <option key={x} value={x}>{t(`monitoreo.crit.${x}`)}</option>
              ))}
            </select>
            {(q || fEstado || fCrit) && (
              <button
                className='text-xs text-muted-foreground hover:underline'
                onClick={() => { setQ(''); setFEstado(''); setFCrit('') }}
              >
                {t('monitoreo.limpiar')}
              </button>
            )}
            <span className='ml-auto text-xs text-muted-foreground'>
              {t('monitoreo.nActivos', { n: activos.length })}
            </span>
          </div>
        )}

        <ResumenActivos />

        <div className='rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('monitoreo.col.estado')}</TableHead>
                <TableHead>{t('monitoreo.col.nombre')}</TableHead>
                <TableHead>{t('monitoreo.col.ip')}</TableHead>
                <TableHead>{t('monitoreo.col.grupo')}</TableHead>
                <TableHead>{t('monitoreo.col.origen')}</TableHead>
                <TableHead>{t('monitoreo.col.criticidad')}</TableHead>
                <TableHead>{t('monitoreo.col.chequeos')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className='text-center text-muted-foreground py-8'>
                    <Loader2 className='size-4 animate-spin inline mr-2' />{t('common.loading')}
                  </TableCell>
                </TableRow>
              ) : activos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className='text-center text-muted-foreground py-10'>
                    {t('monitoreo.vacio')}
                  </TableCell>
                </TableRow>
              ) : activos.map((a) => (
                <TableRow key={a.id} className='cursor-pointer' onClick={() => setAbierto(a.id)}>
                  <TableCell><EstadoBadge estado={a.estado} /></TableCell>
                  <TableCell className='font-medium'>
                    {a.alias || a.nombre}
                    {/* Con alias se muestra abajo el nombre real: hace falta para
                        reconocerlo en una consola. */}
                    {a.alias && <span className='block text-xs font-normal text-muted-foreground'>{a.nombre}</span>}
                  </TableCell>
                  <TableCell className='font-mono text-sm'>
                    {a.ip || a.hostname || <span className='text-muted-foreground'>-</span>}
                  </TableCell>
                  <TableCell className='text-sm'>{a.grupo || '-'}</TableCell>
                  <TableCell>
                    {/* La procedencia. En esta edición siempre es propia; la Pro suma
                        Zabbix, GLPI y el agente, y puede mostrar varias por equipo. */}
                    <div className='flex flex-wrap gap-1'>
                      {(a.fuentes?.length ? a.fuentes : [a.origen]).map((f) => (
                        <Badge key={f} variant='outline' className='text-xs'>
                          {t(`monitoreo.origen.${f}`)}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className={`text-sm ${CRIT[a.criticidad] ?? ''}`}>
                    {t(`monitoreo.crit.${a.criticidad}`)}
                  </TableCell>
                  <TableCell className='text-xs text-muted-foreground'>
                    {a.chequeos ? t('monitoreo.nChequeos', { n: a.chequeos }) : t('monitoreo.estado.sin_medir')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DetalleActivo id={abierto} onClose={() => setAbierto(null)} />
      </Main>
    </>
  )
}
