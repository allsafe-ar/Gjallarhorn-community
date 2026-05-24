import { useState, useEffect, useCallback } from 'react'
import { TriangleAlert, Loader2, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

function fmtTS(epochSeconds: number | undefined) {
  if (!epochSeconds) return '—'
  const d = new Date(epochSeconds * 1000)
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

const SEV_META: Record<number, { label: string; color: string }> = {
  4: { label: 'Critical', color: '#7c3aed' },
  3: { label: 'High',     color: '#ef4444' },
  2: { label: 'Medium',   color: '#f59e0b' },
  1: { label: 'Low',      color: '#22c55e' },
  0: { label: 'Info',     color: '#6b7280' },
}

function SevBadge({ severity }: { severity: number }) {
  const m = SEV_META[severity] || SEV_META[0]
  return (
    <span className='inline-flex items-center gap-1 text-xs font-semibold' style={{ color: m.color }}>
      <span className='inline-block w-1.5 h-1.5 rounded-full' style={{ background: m.color }} />
      {m.label}
    </span>
  )
}

type NScan = {
  id: number; name: string; status: string; owner?: string; last_modification_date?: number
}
type NVuln = {
  plugin_id: number; plugin_name: string; severity: number; count?: number
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

export function NessusView() {
  const { t } = useTranslation()
  const [tab, setTab] = useState('scans')
  const [scans, setScans] = useState<NScan[]>([])
  const [vulns, setVulns] = useState<NVuln[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingV, setLoadingV] = useState(false)
  const [error, setError] = useState('')
  const [selScan, setSelScan] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { const r = await apiFetch('/soc/nessus/scans'); setScans(r.scans || []) }
    catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function loadVulns(scanId: number, scanName: string) {
    setLoadingV(true); setSelScan(scanName)
    try {
      const r = await apiFetch(`/soc/nessus/scans/${scanId}/vulns`)
      setVulns(r.vulns || []); setTab('vulns')
    } catch (e: any) { toast.error(e.message) } finally { setLoadingV(false) }
  }

  const scanCols: ColDef<NScan>[] = [
    { key: 'name',   label: t('soc.nessus.col.name'),     render: r => <span className='font-medium'>{r.name}</span> },
    { key: 'status', label: t('soc.nessus.col.status'),   render: r => {
      const type = r.status === 'completed' ? 'default' : r.status === 'running' ? 'secondary' : 'outline'
      const lbl = r.status === 'empty' ? t('soc.nessus.neverRun') : r.status
      return <Badge variant={type} className='text-[10px]'>{lbl}</Badge>
    }},
    { key: 'owner',                  label: t('soc.nessus.col.owner'),    muted: true },
    { key: 'last_modification_date', label: t('soc.nessus.col.modified'), muted: true, render: r => fmtTS(r.last_modification_date) },
    { key: 'actions', label: '', render: r => (
      r.status === 'empty'
        ? <span className='text-xs text-muted-foreground'>{t('soc.nessus.noResults')}</span>
        : <Button variant='ghost' size='sm' className='text-xs h-6 px-2' onClick={() => loadVulns(r.id, r.name)}>
            {t('soc.nessus.viewVulns')}
          </Button>
    )},
  ]

  const vulnCols: ColDef<NVuln>[] = [
    { key: 'plugin_name', label: t('soc.nessus.col.vuln'),     render: r => <span className='font-medium'>{r.plugin_name}</span> },
    { key: 'severity',    label: t('soc.nessus.col.severity'), render: r => <SevBadge severity={Number(r.severity)} /> },
    { key: 'count',       label: t('soc.nessus.col.affected'), muted: true },
    { key: 'plugin_id',   label: t('soc.nessus.col.plugin'),   muted: true },
  ]

  return (
    <div className='p-8 max-w-6xl'>
      <div className='flex items-center justify-between mb-6'>
        <div>
          <h1 className='text-2xl font-bold flex items-center gap-2'>
            <TriangleAlert className='h-5 w-5' style={{ color: '#ef4444' }} />
            {t('soc.nessus.title')}
          </h1>
          <p className='text-sm text-muted-foreground mt-1'>{t('soc.nessus.subtitle')}</p>
        </div>
        <Button variant='outline' size='sm' onClick={load}>
          <RefreshCw className='h-3.5 w-3.5 mr-1.5' />{t('soc.nessus.update')}
        </Button>
      </div>

      {error && (
        <div className='rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-6'>{error}</div>
      )}

      {loading ? (
        <div className='flex items-center gap-2 text-sm text-muted-foreground'><Loader2 className='h-4 w-4 animate-spin' />{t('common.loading')}</div>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className='mb-4'>
            <TabsTrigger value='scans'>
              {t('soc.nessus.tab.scans')} <span className='ml-1.5 text-[10px] bg-muted px-1.5 py-0.5 rounded-full'>{scans.length}</span>
            </TabsTrigger>
            <TabsTrigger value='vulns'>
              {t('soc.nessus.tab.vulns')}{selScan ? ` — ${selScan}` : ''} <span className='ml-1.5 text-[10px] bg-muted px-1.5 py-0.5 rounded-full'>{vulns.length}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value='scans'>
            <SocTable cols={scanCols} rows={scans} keyField='id' loading={loading} emptyMsg={t('soc.nessus.noScans')} />
          </TabsContent>
          <TabsContent value='vulns'>
            <SocTable cols={vulnCols} rows={vulns} keyField='plugin_id' loading={loadingV} emptyMsg={t('soc.nessus.selectScan')} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
