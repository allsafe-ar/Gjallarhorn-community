import { useState, useEffect, useCallback } from 'react'
import { Activity, Loader2, RefreshCw, Server, Wifi, WifiOff, Bell } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

function fmtDate(val: string | number | undefined) {
  if (!val) return '—'
  const d = new Date(typeof val === 'number' ? val : val)
  return isNaN(d.getTime()) ? String(val) : d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

function LevelBadge({ level }: { level: number | string }) {
  const n = Number(level)
  const color = n >= 12 ? '#ef4444' : n >= 7 ? '#f97316' : n >= 4 ? '#f59e0b' : '#22c55e'
  return (
    <span className='inline-flex items-center gap-1 text-xs font-bold font-mono' style={{ color }}>
      {n}
    </span>
  )
}

type Agent = {
  id: string; name: string; ip?: string; lastKeepAlive?: string | { ip?: string }
  os?: { name?: string; platform?: string }; version?: string; status: string
}
type Alert = {
  '@timestamp'?: string; timestamp?: string
  rule?: { level?: number; description?: string }
  'rule.level'?: number; 'rule.description'?: string
  agent?: { name?: string }; 'agent.name'?: string
  data?: { srcip?: string }; 'data.srcip'?: string
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

export function WazuhView() {
  const { t } = useTranslation()
  const [agents, setAgents] = useState<Agent[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [stats, setStats] = useState({ active: 0, disconnected: 0, total: 0, alertsTotal: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [ar, alr] = await Promise.all([
        apiFetch('/soc/wazuh/agents?limit=500'),
        apiFetch('/soc/wazuh/alerts?limit=50&hours=24').catch(() => ({ alerts: [], ok: false })),
      ])
      setAgents(ar.agents || [])
      setAlerts(alr.alerts || [])
      const a = (ar.agents || []) as Agent[]
      const active = a.filter(x => x.status === 'active').length
      const disc   = a.filter(x => x.status === 'disconnected').length
      setStats({ active, disconnected: disc, total: a.length, alertsTotal: alr.total || 0 })
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const statCards = [
    { label: t('soc.wazuh.stat.totalAgents'),   value: stats.total,        color: 'var(--primary)', icon: Server },
    { label: t('soc.wazuh.stat.active'),         value: stats.active,       color: '#22c55e',        icon: Wifi },
    { label: t('soc.wazuh.stat.disconnected'),   value: stats.disconnected, color: '#ef4444',        icon: WifiOff },
    { label: t('soc.wazuh.stat.alerts24h'),      value: stats.alertsTotal,  color: '#f59e0b',        icon: Bell },
  ]

  const agentCols: ColDef<Agent>[] = [
    { key: 'name',          label: t('soc.wazuh.col.name'),        render: r => <span className='font-medium'>{r.name}</span> },
    { key: 'ip',            label: t('soc.wazuh.col.ip'),          muted: true, render: r => r.ip || (typeof r.lastKeepAlive === 'object' ? r.lastKeepAlive?.ip : undefined) || '—' },
    { key: 'os',            label: t('soc.wazuh.col.os'),          muted: true, render: r => r.os?.name || r.os?.platform || '—' },
    { key: 'version',       label: t('soc.wazuh.col.version'),     muted: true, render: r => r.version || '—' },
    { key: 'status',        label: t('soc.wazuh.col.status'),      render: r => (
      <Badge variant={r.status === 'active' ? 'default' : 'destructive'} className='text-[10px]'>{r.status}</Badge>
    )},
    { key: 'lastKeepAlive', label: t('soc.wazuh.col.lastContact'), muted: true, render: r => fmtDate(typeof r.lastKeepAlive === 'string' ? r.lastKeepAlive : undefined) },
  ]

  const alertCols: ColDef<Alert>[] = [
    { key: 'ts',    label: t('soc.wazuh.col.date'),   muted: true, render: r => fmtDate(r['@timestamp'] || r.timestamp) },
    { key: 'level', label: t('soc.wazuh.col.level'),               render: r => <LevelBadge level={r.rule?.level ?? r['rule.level'] ?? 0} /> },
    { key: 'desc',  label: t('soc.wazuh.col.desc'),                render: r => <span className='max-w-xs truncate block'>{r.rule?.description || r['rule.description'] || '—'}</span> },
    { key: 'agent', label: t('soc.wazuh.col.agent'),  muted: true, render: r => r.agent?.name || r['agent.name'] || '—' },
    { key: 'srcip', label: t('soc.wazuh.col.srcip'),  muted: true, render: r => r.data?.srcip || r['data.srcip'] || '—' },
  ]

  return (
    <div className='p-8 max-w-6xl'>
      <div className='flex items-center justify-between mb-6'>
        <div>
          <h1 className='text-2xl font-bold flex items-center gap-2'>
            <Activity className='h-5 w-5' style={{ color: '#3b82f6' }} />
            {t('soc.wazuh.title')}
          </h1>
          <p className='text-sm text-muted-foreground mt-1'>{t('soc.wazuh.subtitle')}</p>
        </div>
        <Button variant='outline' size='sm' onClick={load}>
          <RefreshCw className='h-3.5 w-3.5 mr-1.5' />{t('soc.wazuh.update')}
        </Button>
      </div>

      {!loading && (
        <div className='grid grid-cols-2 md:grid-cols-4 gap-3 mb-6'>
          {statCards.map(s => {
            const Icon = s.icon
            return (
              <div key={s.label} className='relative border rounded-lg px-3 py-2 overflow-hidden bg-card'>
                <Icon className='absolute right-2 top-2 pointer-events-none' style={{ width: 34, height: 34, color: s.color, opacity: 0.15 }} strokeWidth={1.4} />
                <div className='relative z-10 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 pr-8 leading-tight'>{s.label}</div>
                <div className='relative z-10 text-xl font-black tabular-nums pr-8' style={{ color: s.color }}>{s.value ?? '—'}</div>
                <div className='absolute bottom-0 left-0 right-0 h-0.5' style={{ background: s.color, opacity: 0.6 }} />
              </div>
            )
          })}
        </div>
      )}

      {error && (
        <div className='rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-6'>{error}</div>
      )}

      {loading ? (
        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Loader2 className='h-4 w-4 animate-spin' />{t('common.loading')}
        </div>
      ) : (
        <Tabs defaultValue='agents'>
          <TabsList className='mb-4'>
            <TabsTrigger value='agents'>
              {t('soc.wazuh.tab.agents')} <span className='ml-1.5 text-[10px] bg-muted px-1.5 py-0.5 rounded-full'>{agents.length}</span>
            </TabsTrigger>
            <TabsTrigger value='alerts'>
              {t('soc.wazuh.tab.alerts')} <span className='ml-1.5 text-[10px] bg-muted px-1.5 py-0.5 rounded-full'>{alerts.length}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value='agents'>
            <SocTable cols={agentCols} rows={agents} keyField='id' emptyMsg={t('soc.wazuh.noAgents')} />
          </TabsContent>

          <TabsContent value='alerts'>
            <SocTable cols={alertCols} rows={alerts} keyField='@timestamp' emptyMsg={error ? t('soc.wazuh.error') : t('soc.wazuh.noAlerts')} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
