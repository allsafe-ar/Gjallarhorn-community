import { useState, useEffect, useCallback } from 'react'
import { Zap, Plus, Loader2, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { localeActivo } from '@/lib/locale'

// Velociraptor manda las fechas en MICROsegundos: se dividen por 1e6 antes de llamar acá (antes se dividía por
// 1000 y la fecha salía en el año 58).
function fmtTS(epochSeconds: number | undefined) {
  if (!epochSeconds) return '-'
  const d = new Date(epochSeconds * 1000)
  return isNaN(d.getTime()) ? '-' : d.toLocaleString(localeActivo(), { dateStyle: 'short', timeStyle: 'short' })
}

const isOnline = (ts: string | number | undefined) =>
  ts ? (Date.now() * 1000 - Number(ts)) / 1e6 < 600 : false

type VClient = {
  client_id: string
  os_info?: { fqdn?: string; hostname?: string; system?: string }
  last_seen_at?: string | number
}
type VHunt = {
  hunt_id: string; hunt_description?: string; state?: string
  total_clients_scheduled?: number; create_time?: string | number
}
type VFlow = {
  FlowId: string; Artifacts?: string | string[]; State?: string
  Rows?: number; Created?: string | number; Creator?: string
}

type ColDef<T> = {
  key: string; label: string; muted?: boolean
  render?: (row: T) => React.ReactNode
}

function SocTable<T extends Record<string, any>>({ cols, rows, keyField, loading, emptyMsg }: {
  cols: ColDef<T>[]; rows: T[]; keyField: string; loading?: boolean; emptyMsg: string
}) {
  const { t } = useTranslation()
  if (loading) return <div className='flex items-center gap-2 text-sm text-muted-foreground py-6'><Loader2 className='h-4 w-4 animate-spin' />{t('common.loading')}</div>
  if (rows.length === 0) return <div className='rounded-lg border bg-card px-4 py-8 text-sm text-center text-muted-foreground'>{emptyMsg}</div>
  return (
    <div className='rounded-lg border bg-card overflow-hidden'>
      <table className='w-full text-sm'>
        <thead>
          <tr className='border-b bg-muted/40'>
            {cols.map(c => (
              <th key={c.key} className='text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground'>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row[keyField] ?? i} className='border-b last:border-0 hover:bg-muted/20 transition-colors'>
              {cols.map(c => (
                <td key={c.key} className={cn('px-3 py-2.5', c.muted && 'text-muted-foreground text-xs')}>
                  {c.render ? c.render(row) : row[c.key] ?? '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function VelociraptorView() {
  const { t } = useTranslation()
  const user = useAuthStore(s => s.auth.user)
  const [tab, setTab] = useState('clients')
  const [clients, setClients] = useState<VClient[]>([])
  const [hunts, setHunts] = useState<VHunt[]>([])
  const [flows, setFlows] = useState<VFlow[]>([])
  const [selClient, setSelClient] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingFlows, setLoadingFlows] = useState(false)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(false)
  // El mismo diálogo sirve para un hunt (varios equipos) y para recolectar en un solo equipo.
  const [equipo, setEquipo] = useState<{ id: string; host: string } | null>(null)
  const FORM0 = { artifact: '', description: '', destino: 'todos' as 'todos' | 'sistema' | 'etiquetas', sistema: 'WINDOWS', etiquetas: '', dias: 7, iniciar: false }
  const [form, setForm] = useState(FORM0)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [cr, hr] = await Promise.all([
        apiFetch<{ clients?: VClient[] }>('/soc/velociraptor/clients?limit=200'),
        apiFetch<{ hunts?: VHunt[] }>('/soc/velociraptor/hunts?limit=50'),
      ])
      setClients(cr.clients || []); setHunts(hr.hunts || [])
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function loadFlows(clientId: string) {
    setLoadingFlows(true); setSelClient(clientId)
    try {
      const r = await apiFetch<{ flows?: VFlow[] }>(`/soc/velociraptor/flows?clientId=${clientId}&limit=20`)
      setFlows(r.flows || []); setTab('flows')
    } catch (e: any) { toast.error(e.message) } finally { setLoadingFlows(false) }
  }

  function abrirHunt() { setEquipo(null); setForm(FORM0); setModal(true) }
  function abrirEquipo(c: VClient) { setEquipo({ id: c.client_id, host: c.os_info?.fqdn || c.os_info?.hostname || c.client_id }); setForm(FORM0); setModal(true) }

  async function submitHunt(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    try {
      if (equipo) {
        const r = await apiFetch<{ ok?: boolean; error?: string }>('/soc/velociraptor/collect', { method: 'POST', body: { clientId: equipo.id, artifact: form.artifact.trim() } })
        if (r.ok) { toast.success(t('soc.velociraptor.collectStarted', 'Recolección iniciada en el equipo')); setModal(false); loadFlows(equipo.id) }
        else toast.error(r.error || t('common.error'))
        return
      }
      const body = {
        artifact: form.artifact.trim(), description: form.description, iniciar: form.iniciar, dias: form.dias,
        sistema: form.destino === 'sistema' ? form.sistema : '',
        etiquetas: form.destino === 'etiquetas' ? form.etiquetas.split(',').map(x => x.trim()).filter(Boolean) : [],
      }
      const r = await apiFetch<{ ok?: boolean; error?: string; estado?: string }>('/soc/velociraptor/hunts', { method: 'POST', body })
      if (r.ok) { toast.success(r.estado === 'RUNNING' ? t('soc.velociraptor.huntStarted', 'Hunt iniciado') : t('soc.velociraptor.huntDraft', 'Hunt creado en borrador: revisalo e inicialo desde la lista')); setModal(false); setTab('hunts'); load() }
      else toast.error(r.error || t('common.error'))
    } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }

  async function cambiarEstado(huntId: string, estado: 'RUNNING' | 'STOPPED') {
    try {
      const r = await apiFetch<{ ok?: boolean; error?: string }>(`/soc/velociraptor/hunts/${huntId}/estado`, { method: 'POST', body: { estado } })
      if (r.ok) { toast.success(estado === 'RUNNING' ? t('soc.velociraptor.huntStarted', 'Hunt iniciado') : t('soc.velociraptor.huntStopped', 'Hunt detenido')); load() }
      else toast.error(r.error || t('common.error'))
    } catch (e: any) { toast.error(e.message) }
  }

  const canCreate = user?.role === 'admin' || user?.role === 'analyst'

  const clientCols: ColDef<VClient>[] = [
    { key: 'client_id', label: t('soc.velociraptor.col.clientId'),    muted: true, render: r => <span className='font-mono text-xs'>{(r.client_id || '').slice(0, 16)}</span> },
    { key: 'hostname',  label: t('soc.velociraptor.col.hostname'),                  render: r => <span className='font-medium'>{r.os_info?.fqdn || r.os_info?.hostname || '-'}</span> },
    { key: 'os',        label: t('soc.velociraptor.col.os'),           muted: true, render: r => r.os_info?.system || '-' },
    { key: 'last_seen', label: t('soc.velociraptor.col.lastContact'),  muted: true, render: r => fmtTS(Number(r.last_seen_at) / 1e6) },
    { key: 'status',    label: t('soc.velociraptor.col.status'),                    render: r => (
      <Badge variant={isOnline(r.last_seen_at) ? 'default' : 'secondary'} className='text-xs'>
        {isOnline(r.last_seen_at) ? 'Online' : 'Offline'}
      </Badge>
    )},
    { key: 'actions', label: '', render: r => (
      <div className='flex gap-1 justify-end'>
        <Button variant='ghost' size='sm' className='text-xs h-6 px-2' onClick={() => loadFlows(r.client_id)}>
          {t('soc.velociraptor.viewFlows')}
        </Button>
        {canCreate && (
          <Button variant='ghost' size='sm' className='text-xs h-6 px-2' onClick={() => abrirEquipo(r)}>
            {t('soc.velociraptor.collect', 'Recolectar')}
          </Button>
        )}
      </div>
    )},
  ]

  const huntCols: ColDef<VHunt>[] = [
    { key: 'hunt_id',                  label: t('soc.velociraptor.col.huntId'),     muted: true, render: r => <span className='font-mono text-xs'>{(r.hunt_id || '').slice(0, 18)}</span> },
    { key: 'hunt_description',         label: t('soc.velociraptor.col.desc'),                    render: r => r.hunt_description || '-' },
    { key: 'state',                    label: t('soc.velociraptor.col.huntStatus'),              render: r => (
      <Badge variant={r.state === 'RUNNING' ? 'default' : r.state === 'PAUSED' ? 'secondary' : 'outline'} className='text-xs'>
        {r.state || '-'}
      </Badge>
    )},
    { key: 'total_clients_scheduled',  label: t('soc.velociraptor.col.clients'),   muted: true },
    { key: 'create_time',              label: t('soc.velociraptor.col.created'),   muted: true, render: r => fmtTS(Number(r.create_time) / 1e6) },
    { key: 'acciones', label: '', render: r => !canCreate ? null
      : r.state === 'PAUSED' ? <Button variant='ghost' size='sm' className='text-xs h-6 px-2' onClick={() => cambiarEstado(r.hunt_id, 'RUNNING')}>{t('soc.velociraptor.start', 'Iniciar')}</Button>
      : r.state === 'RUNNING' ? <Button variant='ghost' size='sm' className='text-xs h-6 px-2' onClick={() => cambiarEstado(r.hunt_id, 'STOPPED')}>{t('soc.velociraptor.stop', 'Detener')}</Button>
      : null },
  ]

  const flowCols: ColDef<VFlow>[] = [
    { key: 'FlowId',    label: t('soc.velociraptor.col.flowId'),    muted: true, render: r => <span className='font-mono text-xs'>{r.FlowId || '-'}</span> },
    { key: 'Artifacts', label: t('soc.velociraptor.col.artifacts'),              render: r => (Array.isArray(r.Artifacts) ? r.Artifacts : [r.Artifacts]).filter(Boolean).join(', ') || '-' },
    { key: 'State',     label: t('soc.velociraptor.col.huntStatus'),             render: r => (
      <Badge variant={r.State === 'FINISHED' ? 'default' : r.State === 'RUNNING' ? 'secondary' : 'outline'} className='text-xs'>
        {r.State || '-'}
      </Badge>
    )},
    { key: 'Rows',      label: t('soc.velociraptor.col.rows'),      muted: true },
    { key: 'Created',   label: t('soc.velociraptor.col.created'),   muted: true, render: r => fmtTS(Number(r.Created) / 1e6) },
    { key: 'Creator',   label: t('soc.velociraptor.col.creator'),   muted: true },
  ]

  return (
    <div className='p-8 max-w-6xl'>
      <div className='flex items-center justify-between mb-6'>
        <div>
          <h1 className='text-2xl font-bold flex items-center gap-2'>
            <Zap className='h-5 w-5' style={{ color: '#8b5cf6' }} />
            {t('soc.velociraptor.title')}
          </h1>
          <p className='text-sm text-muted-foreground mt-1'>{t('soc.velociraptor.subtitle')}</p>
        </div>
        <div className='flex gap-2'>
          <Button variant='outline' size='sm' onClick={load}>
            <RefreshCw className='h-3.5 w-3.5 mr-1.5' />{t('soc.velociraptor.update')}
          </Button>
          {canCreate && (
            <Button size='sm' onClick={abrirHunt}>
              <Plus className='h-3.5 w-3.5 mr-1.5' />{t('soc.velociraptor.newHunt')}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className='rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-6'>{error}</div>
      )}

      {loading ? (
        <div className='flex items-center gap-2 text-sm text-muted-foreground'><Loader2 className='h-4 w-4 animate-spin' />{t('common.loading')}</div>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className='mb-4'>
            <TabsTrigger value='clients'>
              {t('soc.velociraptor.tab.clients')} <span className='ml-1.5 text-xs bg-muted px-1.5 py-0.5 rounded-full'>{clients.length}</span>
            </TabsTrigger>
            <TabsTrigger value='hunts'>
              {t('soc.velociraptor.tab.hunts')} <span className='ml-1.5 text-xs bg-muted px-1.5 py-0.5 rounded-full'>{hunts.length}</span>
            </TabsTrigger>
            <TabsTrigger value='flows'>
              {t('soc.velociraptor.tab.flows')}{selClient ? ` - ${selClient.slice(0, 12)}` : ''} <span className='ml-1.5 text-xs bg-muted px-1.5 py-0.5 rounded-full'>{flows.length}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value='clients'>
            <SocTable cols={clientCols} rows={clients} keyField='client_id' loading={loading} emptyMsg={t('soc.velociraptor.noClients')} />
          </TabsContent>
          <TabsContent value='hunts'>
            <SocTable cols={huntCols} rows={hunts} keyField='hunt_id' loading={loading} emptyMsg={t('soc.velociraptor.noHunts')} />
          </TabsContent>
          <TabsContent value='flows'>
            <SocTable cols={flowCols} rows={flows} keyField='FlowId' loading={loadingFlows} emptyMsg={t('soc.velociraptor.selectClient')} />
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle>{equipo ? t('soc.velociraptor.dialog.collectTitle', { defaultValue: 'Recolectar en {{host}}', host: equipo.host }) : t('soc.velociraptor.dialog.title')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitHunt} className='flex flex-col gap-4 mt-2'>
            <div className='flex flex-col gap-1.5'>
              <Label>{t('soc.velociraptor.dialog.artifact')}</Label>
              <Input value={form.artifact} onChange={e => setForm(f => ({ ...f, artifact: e.target.value }))} placeholder='Generic.Client.Info' />
            </div>
            {!equipo && (<>
            <div className='flex flex-col gap-1.5'>
              <Label>{t('soc.velociraptor.dialog.desc')}</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={t('soc.velociraptor.dialog.descPlaceholder')} />
            </div>
            {/* Velociraptor admite un solo criterio: todos los equipos, un sistema operativo o etiquetas. */}
            <div className='flex flex-col gap-1.5'>
              <Label>{t('soc.velociraptor.dialog.target', 'Equipos')}</Label>
              <select value={form.destino} onChange={e => setForm(f => ({ ...f, destino: e.target.value as typeof f.destino }))}
                className='h-9 rounded-md border bg-background px-2 text-sm'>
                <option value='todos'>{t('soc.velociraptor.dialog.targetAll', 'Todos los equipos')}</option>
                <option value='sistema'>{t('soc.velociraptor.dialog.targetOs', 'Por sistema operativo')}</option>
                <option value='etiquetas'>{t('soc.velociraptor.dialog.targetLabels', 'Por etiqueta de Velociraptor')}</option>
              </select>
              {form.destino === 'sistema' && (
                <select value={form.sistema} onChange={e => setForm(f => ({ ...f, sistema: e.target.value }))} className='h-9 rounded-md border bg-background px-2 text-sm'>
                  <option value='WINDOWS'>Windows</option><option value='LINUX'>Linux</option><option value='OSX'>macOS</option>
                </select>
              )}
              {form.destino === 'etiquetas' && (
                <Input value={form.etiquetas} onChange={e => setForm(f => ({ ...f, etiquetas: e.target.value }))} placeholder={t('soc.velociraptor.dialog.labelsPlaceholder', 'servidores, sede-centro (separadas por coma)')} />
              )}
            </div>
            <div className='flex items-end gap-4'>
              <div className='flex flex-col gap-1.5 w-28'>
                <Label>{t('soc.velociraptor.dialog.days', 'Días')}</Label>
                <Input type='number' min={1} max={30} value={form.dias} onChange={e => setForm(f => ({ ...f, dias: Number(e.target.value) }))} />
              </div>
              <label className='flex items-center gap-2 text-sm pb-2'>
                <input type='checkbox' checked={form.iniciar} onChange={e => setForm(f => ({ ...f, iniciar: e.target.checked }))} />
                {t('soc.velociraptor.dialog.startNow', 'Iniciar ahora')}
              </label>
            </div>
            <p className='text-xs text-muted-foreground'>{form.iniciar
              ? t('soc.velociraptor.dialog.startNowHint', 'Se ejecuta enseguida en los equipos elegidos.')
              : t('soc.velociraptor.dialog.draftHint', 'Queda en borrador: revisalo en la lista y tocá Iniciar.')}</p>
            </>)}
            <div className='flex gap-2 justify-end'>
              <Button type='button' variant='ghost' onClick={() => setModal(false)}>{t('soc.velociraptor.dialog.cancel')}</Button>
              <Button type='submit' disabled={!form.artifact || saving}>
                {saving && <Loader2 className='h-3.5 w-3.5 mr-1.5 animate-spin' />}
                {equipo ? t('soc.velociraptor.collect', 'Recolectar') : t('soc.velociraptor.dialog.create')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
