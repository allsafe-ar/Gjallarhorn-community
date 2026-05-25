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

function fmtTS(epochSeconds: number | undefined) {
  if (!epochSeconds) return '—'
  const d = new Date(epochSeconds * 1000)
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
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
              <th key={c.key} className='text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground'>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row[keyField] ?? i} className='border-b last:border-0 hover:bg-muted/20 transition-colors'>
              {cols.map(c => (
                <td key={c.key} className={cn('px-3 py-2.5', c.muted && 'text-muted-foreground text-xs')}>
                  {c.render ? c.render(row) : row[c.key] ?? '—'}
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
  const user = useAuthStore(s => s.user)
  const [tab, setTab] = useState('clients')
  const [clients, setClients] = useState<VClient[]>([])
  const [hunts, setHunts] = useState<VHunt[]>([])
  const [flows, setFlows] = useState<VFlow[]>([])
  const [selClient, setSelClient] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingFlows, setLoadingFlows] = useState(false)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ artifact: '', description: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [cr, hr] = await Promise.all([
        apiFetch('/soc/velociraptor/clients?limit=200'),
        apiFetch('/soc/velociraptor/hunts?limit=50'),
      ])
      setClients(cr.clients || []); setHunts(hr.hunts || [])
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function loadFlows(clientId: string) {
    setLoadingFlows(true); setSelClient(clientId)
    try {
      const r = await apiFetch(`/soc/velociraptor/flows?clientId=${clientId}&limit=20`)
      setFlows(r.flows || []); setTab('flows')
    } catch (e: any) { toast.error(e.message) } finally { setLoadingFlows(false) }
  }

  async function submitHunt(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    try {
      const r = await apiFetch('/soc/velociraptor/hunts', { method: 'POST', body: form })
      if (r.ok) { toast.success(t('soc.velociraptor.huntCreated')); setModal(false); load() }
      else toast.error(r.error || t('common.error'))
    } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }

  const canCreate = user?.role === 'admin' || user?.role === 'analyst'

  const clientCols: ColDef<VClient>[] = [
    { key: 'client_id', label: t('soc.velociraptor.col.clientId'),    muted: true, render: r => <span className='font-mono text-xs'>{(r.client_id || '').slice(0, 16)}</span> },
    { key: 'hostname',  label: t('soc.velociraptor.col.hostname'),                  render: r => <span className='font-medium'>{r.os_info?.fqdn || r.os_info?.hostname || '—'}</span> },
    { key: 'os',        label: t('soc.velociraptor.col.os'),           muted: true, render: r => r.os_info?.system || '—' },
    { key: 'last_seen', label: t('soc.velociraptor.col.lastContact'),  muted: true, render: r => fmtTS(Number(r.last_seen_at) / 1000) },
    { key: 'status',    label: t('soc.velociraptor.col.status'),                    render: r => (
      <Badge variant={isOnline(r.last_seen_at) ? 'default' : 'secondary'} className='text-[10px]'>
        {isOnline(r.last_seen_at) ? 'Online' : 'Offline'}
      </Badge>
    )},
    { key: 'actions', label: '', render: r => (
      <Button variant='ghost' size='sm' className='text-xs h-6 px-2' onClick={() => loadFlows(r.client_id)}>
        {t('soc.velociraptor.viewFlows')}
      </Button>
    )},
  ]

  const huntCols: ColDef<VHunt>[] = [
    { key: 'hunt_id',                  label: t('soc.velociraptor.col.huntId'),     muted: true, render: r => <span className='font-mono text-xs'>{(r.hunt_id || '').slice(0, 18)}</span> },
    { key: 'hunt_description',         label: t('soc.velociraptor.col.desc'),                    render: r => r.hunt_description || '—' },
    { key: 'state',                    label: t('soc.velociraptor.col.huntStatus'),              render: r => (
      <Badge variant={r.state === 'RUNNING' ? 'default' : r.state === 'PAUSED' ? 'secondary' : 'outline'} className='text-[10px]'>
        {r.state || '—'}
      </Badge>
    )},
    { key: 'total_clients_scheduled',  label: t('soc.velociraptor.col.clients'),   muted: true },
    { key: 'create_time',              label: t('soc.velociraptor.col.created'),   muted: true, render: r => fmtTS(Number(r.create_time) / 1000) },
  ]

  const flowCols: ColDef<VFlow>[] = [
    { key: 'FlowId',    label: t('soc.velociraptor.col.flowId'),    muted: true, render: r => <span className='font-mono text-xs'>{r.FlowId || '—'}</span> },
    { key: 'Artifacts', label: t('soc.velociraptor.col.artifacts'),              render: r => (Array.isArray(r.Artifacts) ? r.Artifacts : [r.Artifacts]).filter(Boolean).join(', ') || '—' },
    { key: 'State',     label: t('soc.velociraptor.col.huntStatus'),             render: r => (
      <Badge variant={r.State === 'FINISHED' ? 'default' : r.State === 'RUNNING' ? 'secondary' : 'outline'} className='text-[10px]'>
        {r.State || '—'}
      </Badge>
    )},
    { key: 'Rows',      label: t('soc.velociraptor.col.rows'),      muted: true },
    { key: 'Created',   label: t('soc.velociraptor.col.created'),   muted: true, render: r => fmtTS(Number(r.Created) / 1000) },
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
            <Button size='sm' onClick={() => setModal(true)}>
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
              {t('soc.velociraptor.tab.clients')} <span className='ml-1.5 text-[10px] bg-muted px-1.5 py-0.5 rounded-full'>{clients.length}</span>
            </TabsTrigger>
            <TabsTrigger value='hunts'>
              {t('soc.velociraptor.tab.hunts')} <span className='ml-1.5 text-[10px] bg-muted px-1.5 py-0.5 rounded-full'>{hunts.length}</span>
            </TabsTrigger>
            <TabsTrigger value='flows'>
              {t('soc.velociraptor.tab.flows')}{selClient ? ` — ${selClient.slice(0, 12)}` : ''} <span className='ml-1.5 text-[10px] bg-muted px-1.5 py-0.5 rounded-full'>{flows.length}</span>
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
            <DialogTitle>{t('soc.velociraptor.dialog.title')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitHunt} className='flex flex-col gap-4 mt-2'>
            <div className='flex flex-col gap-1.5'>
              <Label>{t('soc.velociraptor.dialog.artifact')}</Label>
              <Input value={form.artifact} onChange={e => setForm(f => ({ ...f, artifact: e.target.value }))} placeholder='Generic.Client.Info' />
            </div>
            <div className='flex flex-col gap-1.5'>
              <Label>{t('soc.velociraptor.dialog.desc')}</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={t('soc.velociraptor.dialog.descPlaceholder')} />
            </div>
            <div className='flex gap-2 justify-end'>
              <Button type='button' variant='ghost' onClick={() => setModal(false)}>{t('soc.velociraptor.dialog.cancel')}</Button>
              <Button type='submit' disabled={!form.artifact || saving}>
                {saving && <Loader2 className='h-3.5 w-3.5 mr-1.5 animate-spin' />}
                {t('soc.velociraptor.dialog.create')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
