import { useState, useEffect, useCallback } from 'react'
import { ScanLine, Loader2, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

function fmtDate(val: string | undefined) {
  if (!val) return '—'
  const d = new Date(val)
  return isNaN(d.getTime()) ? val : d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

function SevBadge({ score }: { score: number }) {
  const label = score >= 9 ? 'Critical' : score >= 7 ? 'High' : score >= 4 ? 'Medium' : score > 0 ? 'Low' : 'Info'
  const color = score >= 9 ? '#ef4444' : score >= 7 ? '#f97316' : score >= 4 ? '#f59e0b' : score > 0 ? '#22c55e' : '#6b7280'
  return (
    <span className='inline-flex items-center gap-1 text-xs font-semibold' style={{ color }}>
      <span className='inline-block w-1.5 h-1.5 rounded-full' style={{ background: color }} />
      {score} {label}
    </span>
  )
}

type OVTask = {
  id: string; name?: string; status?: string; progress?: number
  target?: { name?: string }; hosts?: string
  last_report?: { timestamp?: string }; modification_time?: string
}
type OVResult = {
  id: string; host?: { ip?: string } | string; name?: string
  nvt?: { name?: string; refs?: { ref?: Array<{ type: string; id: string }> } }
  severity?: string | number; cve?: string; port?: string
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

export function OpenVASView() {
  const { t } = useTranslation()
  const [tab, setTab] = useState('tasks')
  const [tasks, setTasks] = useState<OVTask[]>([])
  const [results, setResults] = useState<OVResult[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingRes, setLoadingRes] = useState(false)
  const [error, setError] = useState('')
  const [selTask, setSelTask] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const r = await apiFetch('/soc/openvas/tasks?limit=50')
      setTasks(r.tasks || [])
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function loadResults(taskId: string) {
    setLoadingRes(true)
    try {
      const r = await apiFetch(`/soc/openvas/results?taskId=${taskId}&limit=100`)
      setResults(r.results || []); setTab('results')
    } catch (e: any) { toast.error(e.message) } finally { setLoadingRes(false) }
  }

  const taskCols: ColDef<OVTask>[] = [
    { key: 'name',     label: t('soc.openvas.col.name'),     render: r => <span className='font-medium'>{r.name || '—'}</span> },
    { key: 'status',   label: t('soc.openvas.col.status'),   render: r => {
      const st = r.status || ''
      return <Badge variant={st === 'Done' ? 'default' : st === 'Running' ? 'secondary' : 'outline'} className='text-[10px]'>{st || '—'}</Badge>
    }},
    { key: 'progress', label: t('soc.openvas.col.progress'), muted: true, render: r => r.progress != null ? `${r.progress}%` : '—' },
    { key: 'hosts',    label: t('soc.openvas.col.target'),   muted: true, render: r => r.target?.name || r.hosts || '—' },
    { key: 'date',     label: t('soc.openvas.col.lastScan'), muted: true, render: r => fmtDate(r.last_report?.timestamp || r.modification_time) },
    { key: 'actions',  label: '', render: r => (
      <Button variant='ghost' size='sm' className='text-xs h-6 px-2' onClick={() => { setSelTask(r.id); loadResults(r.id) }}>
        {t('soc.openvas.viewVulns')}
      </Button>
    )},
  ]

  const resultCols: ColDef<OVResult>[] = [
    { key: 'host',     label: t('soc.openvas.col.host'),  muted: true, render: r => (typeof r.host === 'object' ? r.host?.ip : r.host) || '—' },
    { key: 'name',     label: t('soc.openvas.col.vuln'),               render: r => <span className='font-medium'>{r.name || r.nvt?.name || '—'}</span> },
    { key: 'severity', label: t('soc.openvas.col.cvss'),               render: r => <SevBadge score={parseFloat(String(r.severity || 0))} /> },
    { key: 'cve',      label: t('soc.openvas.col.cve'),   muted: true, render: r => r.nvt?.refs?.ref?.find(x => x.type === 'cve')?.id || r.cve || '—' },
    { key: 'port',     label: t('soc.openvas.col.port'),  muted: true, render: r => r.port || '—' },
  ]

  return (
    <div className='p-8 max-w-6xl'>
      <div className='flex items-center justify-between mb-6'>
        <div>
          <h1 className='text-2xl font-bold flex items-center gap-2'>
            <ScanLine className='h-5 w-5' style={{ color: '#22c55e' }} />
            {t('soc.openvas.title')}
          </h1>
          <p className='text-sm text-muted-foreground mt-1'>{t('soc.openvas.subtitle')}</p>
        </div>
        <Button variant='outline' size='sm' onClick={load}>
          <RefreshCw className='h-3.5 w-3.5 mr-1.5' />{t('soc.openvas.update')}
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
            <TabsTrigger value='tasks'>
              {t('soc.openvas.tab.tasks')} <span className='ml-1.5 text-[10px] bg-muted px-1.5 py-0.5 rounded-full'>{tasks.length}</span>
            </TabsTrigger>
            <TabsTrigger value='results'>
              {t('soc.openvas.tab.vulns')}{selTask ? ` (task)` : ''} <span className='ml-1.5 text-[10px] bg-muted px-1.5 py-0.5 rounded-full'>{results.length}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value='tasks'>
            <SocTable cols={taskCols} rows={tasks} keyField='id' loading={loading} emptyMsg={t('soc.openvas.noTasks')} />
          </TabsContent>
          <TabsContent value='results'>
            <SocTable cols={resultCols} rows={results} keyField='id' loading={loadingRes} emptyMsg={t('soc.openvas.selectTask')} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
