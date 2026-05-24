import { useEffect, useRef, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, type TooltipProps,
} from 'recharts'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { apiFetch } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Header } from '@/components/layout/header'
import {
  AlertTriangle, Activity, RefreshCw,
  CheckCircle2, XCircle, HelpCircle, Loader2,
  Ticket, Bell, Search, Bug, Key, ShieldAlert as ShieldAlertIcon,
  FolderOpen, AlertCircle, Clock, CheckCheck, Archive,
  type LucideIcon,
} from 'lucide-react'

const PLATFORM_META: Record<string, { name: string; abbr: string; color: string }> = {
  thehive:      { name: 'TheHive',       abbr: 'TH', color: '#f59e0b' },
  wazuh:        { name: 'Wazuh',         abbr: 'WZ', color: '#3b82f6' },
  velociraptor: { name: 'Velociraptor',  abbr: 'VR', color: '#8b5cf6' },
  openvas:      { name: 'OpenVAS / GVM', abbr: 'OV', color: '#22c55e' },
  nessus:       { name: 'Nessus',        abbr: 'NS', color: '#ef4444' },
}
const PLATFORM_ORDER = ['thehive', 'wazuh', 'velociraptor', 'openvas', 'nessus']

const API_KEY_SERVICES = [
  { key: 'virustotal',     label: 'VirusTotal' },
  { key: 'abuseipdb',      label: 'AbuseIPDB' },
  { key: 'shodan',         label: 'Shodan' },
  { key: 'alienvault',     label: 'AlienVault OTX' },
  { key: 'greynoise',      label: 'GreyNoise' },
  { key: 'urlscan',        label: 'URLScan.io' },
  { key: 'criminalip',     label: 'Criminal IP' },
  { key: 'ipqualityscore', label: 'IPQualityScore' },
  { key: 'threatfox',      label: 'Abuse.ch (ThreatFox)' },
  { key: 'hybrid',         label: 'Hybrid Analysis' },
]

const FREE_INTEL_COUNT = 10

type Platform = {
  platform: string; url?: string; enabled: boolean
  last_status?: string; last_message?: string; last_check?: string
}
type Summary = {
  thehive?: { openCases?: number }
  wazuh?: { active?: number; alertsLast24h?: number }
  velociraptor?: { runningHunts?: number }
  openvas?: { criticalVulns?: number }
  nessus?: { criticalVulns?: number }
  localCases?: { total?: number; open?: number; inProgress?: number; resolved?: number; closed?: number; criticalOpen?: number }
}
type ActivityDay = { date: string; ioc: number; file: number; email: number; cases: number }

function ActivityTooltip({ active, payload, label }: TooltipProps<number, string>) {
  const { t } = useTranslation()
  if (!active || !payload?.length) return null
  const items = [
    { key: 'ioc',   label: t('dashboard.chart.ioc'),   color: '#e8192c' },
    { key: 'file',  label: t('dashboard.chart.files'), color: '#22c55e' },
    { key: 'email', label: t('dashboard.chart.email'), color: '#f59e0b' },
    { key: 'cases', label: t('dashboard.chart.cases'), color: '#f97316' },
  ]
  return (
    <div className='rounded-lg border bg-popover px-3 py-2 text-xs shadow-md'>
      <p className='font-semibold text-muted-foreground mb-1.5'>{label}</p>
      {items.map(({ key, label: l, color }) => {
        const val = payload.find(p => p.dataKey === key)?.value ?? 0
        return (
          <div key={key} className='flex items-center justify-between gap-4'>
            <span className='flex items-center gap-1.5' style={{ color }}>
              <span className='inline-block size-2 rounded-sm' style={{ background: color }} />{l}
            </span>
            <span className='font-bold'>{val}</span>
          </div>
        )
      })}
    </div>
  )
}

type TimelineEvent = {
  id: number; source: string; event_type: string; severity?: string
  ts: string; data: string | Record<string, string>
}
type PhishingSummary = {
  total_campaigns?: number; active_campaigns?: number
  total_sent?: number; total_opened?: number; total_clicked?: number; total_submitted?: number
  avg_open_rate?: number; avg_click_rate?: number
}
type CorrStatus = { running?: boolean; lastWazuhRun?: string }

function StatusIcon({ status }: { status: string }) {
  if (status === 'connected') return <CheckCircle2 className='size-3 text-green-500' />
  if (status === 'error') return <XCircle className='size-3 text-destructive' />
  return <HelpCircle className='size-3 text-muted-foreground' />
}

function KpiCard({ label, value, color, sub, loading, icon: Icon }: {
  label: string; value?: number | null; color: string; sub?: string; loading?: boolean; icon?: LucideIcon
}) {
  return (
    <div className='relative border rounded-lg px-3 py-2 flex-1 min-w-[80px] overflow-hidden bg-card'>
      {Icon && (
        <Icon
          className='absolute right-2 top-2 pointer-events-none'
          style={{ width: 34, height: 34, color, opacity: 0.15 }}
          strokeWidth={1.4}
        />
      )}
      <div className='relative z-10 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 pr-8 leading-tight'>{label}</div>
      <div className='relative z-10 text-xl font-black tabular-nums pr-8' style={{ color }}>
        {loading ? <Loader2 className='size-5 animate-spin' style={{ color }} /> : (value != null ? value : '—')}
      </div>
      {sub && <div className='relative z-10 text-[9px] mt-0.5' style={{ color }}>{sub}</div>}
      <div className='absolute bottom-0 left-0 right-0 h-0.5' style={{ background: color, opacity: 0.6 }} />
    </div>
  )
}

export function Dashboard() {
  const { t } = useTranslation()
  const { auth } = useAuthStore()
  const user = auth.user
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [apiStatus, setApiStatus] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState<string | null>(null)
  const [activity, setActivity] = useState<ActivityDay[]>([])
  const [recentEvents, setRecentEvents] = useState<TimelineEvent[]>([])
  const [corrStatus, setCorrStatus] = useState<CorrStatus | null>(null)
  const [runningCorr, setRunningCorr] = useState(false)
  const [checkInterval, setCheckInterval] = useState('0')
  const [phishingSummary, setPhishingSummary] = useState<PhishingSummary | null>(null)
  const testAllRef = useRef<(() => void) | null>(null)

  const INTERVAL_OPTS = [
    { value: '0',    label: t('dashboard.interval.manual') },
    { value: '10',   label: t('dashboard.interval.10s') },
    { value: '60',   label: t('dashboard.interval.1m') },
    { value: '300',  label: t('dashboard.interval.5m') },
    { value: '900',  label: t('dashboard.interval.15m') },
    { value: '3600', label: t('dashboard.interval.1h') },
  ]

  function statusLabel(s: string) {
    if (s === 'connected') return t('dashboard.status.connected')
    if (s === 'error') return t('dashboard.status.error')
    if (s === 'unconfigured') return t('dashboard.status.notConfigured')
    return t('dashboard.status.unknown')
  }

  useEffect(() => {
    Promise.all([
      apiFetch<{ platforms: Platform[] }>('/platforms').then(d => setPlatforms(d.platforms || [])),
      apiFetch<Summary>('/soc/dashboard/summary').then(setSummary).catch(() => {}),
      apiFetch<{ status: Record<string, boolean> }>('/settings/api-keys/status').then(d => setApiStatus(d.status || {})).catch(() => {}),
      apiFetch<{ activity: ActivityDay[] }>('/dashboard/activity').then(d => setActivity(d.activity || [])).catch(() => {}),
      apiFetch<{ events: TimelineEvent[] }>('/timeline?limit=8').then(d => setRecentEvents(d.events || [])).catch(() => {}),
      apiFetch<CorrStatus>('/correlations/status').then(setCorrStatus).catch(() => {}),
      apiFetch<{ interval: string }>('/settings/platform-check-interval').then(d => setCheckInterval(d.interval || '0')).catch(() => {}),
      apiFetch<PhishingSummary>('/phishing/dashboard/summary').then(setPhishingSummary).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  const platformMap = Object.fromEntries(platforms.map(p => [p.platform, p]))

  async function testAll() {
    for (const p of PLATFORM_ORDER) {
      if (!platformMap[p]?.url) continue
      setTesting(p)
      try {
        const r = await apiFetch<{ status: string; message: string }>(`/platforms/${p}/test`, { method: 'POST', body: '{}' })
        setPlatforms(prev => prev.map(x =>
          x.platform === p ? { ...x, last_status: r.status, last_message: r.message, last_check: new Date().toISOString() } : x
        ))
      } catch { /* continue */ }
    }
    setTesting(null)
    apiFetch<Summary>('/soc/dashboard/summary').then(setSummary).catch(() => {})
  }

  useEffect(() => { testAllRef.current = testAll })

  useEffect(() => {
    const secs = Number(checkInterval)
    if (!secs) return
    const id = setInterval(() => testAllRef.current?.(), secs * 1000)
    return () => clearInterval(id)
  }, [checkInterval])

  async function runCorrelation() {
    setRunningCorr(true)
    try {
      await apiFetch('/correlations/run', { method: 'POST', body: '{}' })
      setTimeout(() => {
        apiFetch<{ events: TimelineEvent[] }>('/timeline?limit=8').then(d => setRecentEvents(d.events || [])).catch(() => {})
        apiFetch<CorrStatus>('/correlations/status').then(setCorrStatus).catch(() => {})
        setRunningCorr(false)
      }, 8000)
    } catch { setRunningCorr(false) }
  }

  const localCases = summary?.localCases ?? {}

  const statCards = [
    { label: t('dashboard.kpi.openCases'),     value: summary?.thehive?.openCases,                                                     color: '#f59e0b', sub: 'TheHive',        key: 'thehive',      icon: Ticket },
    { label: t('dashboard.kpi.activeAgents'),  value: summary?.wazuh?.active,                                                          color: '#3b82f6', sub: 'Wazuh',          key: 'wazuh',        icon: Activity },
    { label: t('dashboard.kpi.alerts24h'),     value: summary?.wazuh?.alertsLast24h,                                                   color: '#60a5fa', sub: 'Wazuh',          key: 'wazuh',        icon: Bell },
    { label: t('dashboard.kpi.activeHunts'),   value: summary?.velociraptor?.runningHunts,                                             color: '#8b5cf6', sub: 'Velociraptor',   key: 'velociraptor', icon: Search },
    { label: t('dashboard.kpi.criticalVulns'), value: (summary?.openvas?.criticalVulns ?? 0) + (summary?.nessus?.criticalVulns ?? 0),  color: '#ef4444', sub: 'OpenVAS+Nessus', key: 'vuln',         icon: Bug },
  ].filter(s => s.key === 'vuln'
    ? (platformMap['openvas']?.enabled || platformMap['nessus']?.enabled)
    : platformMap[s.key]?.enabled
  )

  const apiActiveCount = API_KEY_SERVICES.filter(s => apiStatus[s.key]).length

  const sevColor: Record<string, string> = { critical: '#ef4444', high: '#ef4444', medium: '#f59e0b', low: '#6b7280' }
  const srcColor: Record<string, string> = { wazuh: '#3b82f6', ioc: '#e8192c', file: '#22c55e', email: '#f59e0b', nessus: '#ef4444', phishing: '#f97316' }

  const today = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

  const chartLegend = [
    [t('dashboard.chart.ioc'),   '#e8192c', 'ioc'   as keyof ActivityDay],
    [t('dashboard.chart.files'), '#22c55e', 'file'  as keyof ActivityDay],
    [t('dashboard.chart.email'), '#f59e0b', 'email' as keyof ActivityDay],
    [t('dashboard.chart.cases'), '#f97316', 'cases' as keyof ActivityDay],
  ] as [string, string, keyof ActivityDay][]

  return (
    <>
      <Header fixed>
        <div className='flex flex-col leading-tight'>
          <span className='text-sm font-semibold'>Dashboard</span>
          <span className='text-xs text-muted-foreground capitalize'>{today}</span>
        </div>
      </Header>

      <div className='flex flex-col gap-2 px-4 py-3 overflow-hidden' style={{ height: 'calc(100svh - 3.5rem)' }}>

        <div className='flex-none flex items-center justify-between gap-4'>
          <div>
            <h1 className='text-base font-bold'>{t('dashboard.welcome', { name: user?.nombre || user?.username })}</h1>
            <p className='text-[11px] text-muted-foreground'>{t('dashboard.subtitle')}</p>
          </div>
          <div className='flex items-center gap-2 flex-shrink-0'>
            {Number(checkInterval) > 0 && (
              <span className='text-xs px-2 py-0.5 rounded border border-primary/40 text-primary font-semibold'>
                Auto · {INTERVAL_OPTS.find(o => o.value === checkInterval)?.label}
              </span>
            )}
            <Select value={checkInterval} onValueChange={setCheckInterval}>
              <SelectTrigger className='h-7 w-32 text-xs'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTERVAL_OPTS.map(o => <SelectItem key={o.value} value={o.value} className='text-xs'>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size='sm' variant='outline' className='h-7 text-xs' onClick={testAll} disabled={!!testing}>
              {testing ? <Loader2 className='size-3 animate-spin' /> : <RefreshCw className='size-3' />}
              {t('dashboard.verify')}
            </Button>
          </div>
        </div>

        {statCards.length > 0 && (
          <div className='flex-none flex gap-2 flex-wrap'>
            {statCards.map(s => (
              <KpiCard key={s.label} label={s.label} value={s.value} color={s.color} sub={s.sub} loading={loading} icon={s.icon} />
            ))}
          </div>
        )}

        <div className='flex-none'>
          <h2 className='text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5 flex items-center gap-2'>
            {t('dashboard.internalCases')}
            {(localCases.criticalOpen ?? 0) > 0 && (
              <span className='text-[9px] font-bold text-destructive border border-destructive/40 rounded px-1'>
                {t('dashboard.criticals', { n: localCases.criticalOpen })}
              </span>
            )}
          </h2>
          <div className='flex gap-2 flex-wrap'>
            <KpiCard label={t('dashboard.cases.total')}      value={localCases.total}      color='#e8192c' loading={loading} icon={FolderOpen} />
            <KpiCard label={t('dashboard.cases.open')}       value={localCases.open}       color='#f59e0b' loading={loading} icon={AlertCircle} />
            <KpiCard label={t('dashboard.cases.inProgress')} value={localCases.inProgress} color='#3b82f6' loading={loading} icon={Clock} />
            <KpiCard label={t('dashboard.cases.resolved')}   value={localCases.resolved}   color='#22c55e' loading={loading} icon={CheckCheck} />
            <KpiCard label={t('dashboard.cases.closed')}     value={localCases.closed}     color='#6b7280' loading={loading} icon={Archive} />
          </div>
        </div>

        <div className='flex-none'>
          <h2 className='text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5'>{t('dashboard.soc')}</h2>
          <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5'>
            {PLATFORM_ORDER.map(p => {
              const cfg = platformMap[p] ?? {}
              const meta = PLATFORM_META[p]
              if (!cfg.enabled) {
                return (
                  <div key={p} className='flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 opacity-40'>
                    <span className='text-[10px] font-bold rounded px-1 py-0.5' style={{ background: meta.color + '15', color: meta.color + '99' }}>{meta.abbr}</span>
                    <span className='text-xs font-medium text-muted-foreground truncate'>{meta.name}</span>
                  </div>
                )
              }
              const st = cfg.last_status ?? 'unknown'
              return (
                <div key={p} className='relative rounded-lg border bg-card px-3 pb-2 pt-3 overflow-hidden'>
                  <div className='absolute top-0 left-0 right-0 h-0.5' style={{ background: meta.color }} />
                  <span
                    className='absolute top-2 right-2 text-[10px] font-black rounded px-1 py-0.5 tracking-wide'
                    style={{ background: meta.color + '22', color: meta.color }}
                  >{meta.abbr}</span>
                  <span className='text-xs font-semibold pr-7 block truncate'>{meta.name}</span>
                  <div className='flex items-center gap-1 mt-1'>
                    {testing === p
                      ? <Loader2 className='size-3 animate-spin text-muted-foreground' />
                      : <StatusIcon status={st} />
                    }
                    <span className='text-[10px]' style={{ color: st === 'connected' ? '#22c55e' : st === 'error' ? '#ef4444' : '#6b7280' }}>
                      {testing === p ? t('dashboard.verifying') : statusLabel(st)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className='flex-1 min-h-0 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_180px_1fr] overflow-hidden'>

          <div className='rounded-lg border bg-card p-3 flex flex-col min-h-0 overflow-hidden'>
            <span className='flex-none text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2'>{t('dashboard.activity7d')}</span>
            <div className='flex-1 min-h-0'>
              <ResponsiveContainer width='100%' height='100%'>
                <BarChart data={activity} margin={{ top: 4, right: 4, left: -28, bottom: 0 }} barSize={18}>
                  <CartesianGrid strokeDasharray='3 3' stroke='#ffffff0d' vertical={false} />
                  <XAxis
                    dataKey='date'
                    tickFormatter={(v: string) => v.slice(5)}
                    tick={{ fontSize: 10, fill: '#6b7280' }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#6b7280' }}
                    axisLine={false} tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<ActivityTooltip />} cursor={{ fill: '#ffffff08' }} />
                  <Bar dataKey='ioc'   stackId='a' fill='#e8192c' radius={[0,0,0,0]} isAnimationActive />
                  <Bar dataKey='file'  stackId='a' fill='#22c55e' radius={[0,0,0,0]} isAnimationActive />
                  <Bar dataKey='email' stackId='a' fill='#f59e0b' radius={[0,0,0,0]} isAnimationActive />
                  <Bar dataKey='cases' stackId='a' fill='#f97316' radius={[4,4,0,0]} isAnimationActive />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className='flex-none flex items-center divide-x divide-border mt-2'>
              {chartLegend.map(([label, color, key]) => (
                <div key={label} className='flex-1 flex flex-col items-center gap-0 px-2'>
                  <span className='text-lg font-black tabular-nums leading-tight' style={{ color }}>
                    {activity.reduce((s, d) => s + (d[key] as number), 0)}
                  </span>
                  <span className='text-[9px] uppercase tracking-wider text-muted-foreground'>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className='flex flex-col gap-2 min-h-0 overflow-hidden'>
            {(() => {
              const segs = [
                { key: 'open',       label: t('dashboard.cases.open'),       value: localCases.open || 0,       color: '#f59e0b' },
                { key: 'inProgress', label: t('dashboard.cases.inProgress'), value: localCases.inProgress || 0, color: '#3b82f6' },
                { key: 'resolved',   label: t('dashboard.cases.resolved'),   value: localCases.resolved || 0,   color: '#22c55e' },
                { key: 'closed',     label: t('dashboard.cases.closed'),     value: localCases.closed || 0,     color: '#6b7280' },
              ]
              const total = segs.reduce((s, x) => s + x.value, 0)
              const sz = 88, th = 16, r = (sz - th) / 2, cx = sz / 2, cy = sz / 2, circ = 2 * Math.PI * r
              let acc = 0
              return (
                <div className='flex-1 min-h-0 rounded-lg border bg-card p-3 flex flex-col items-center overflow-hidden'>
                  <span className='flex-none text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 self-start'>{t('dashboard.casesDist')}</span>
                  <svg width={sz} height={sz} className='shrink-0'>
                    {total === 0
                      ? <circle cx={cx} cy={cy} r={r} fill='none' stroke='currentColor' strokeOpacity={0.1} strokeWidth={th} />
                      : segs.filter(s => s.value > 0).map(s => {
                          const frac = s.value / total, arc = frac * circ, rot = acc * 360 - 90
                          acc += frac
                          return <circle key={s.key} cx={cx} cy={cy} r={r} fill='none' stroke={s.color} strokeWidth={th}
                            strokeDasharray={`${arc} ${circ - arc}`} transform={`rotate(${rot} ${cx} ${cy})`} />
                        })
                    }
                    <text x={cx} y={cy - 3} textAnchor='middle' fill='currentColor' fontSize='14' fontWeight='700'>{total}</text>
                    <text x={cx} y={cy + 9} textAnchor='middle' fill='#6b7280' fontSize='7'>total</text>
                  </svg>
                  <div className='flex-none mt-2 w-full space-y-1'>
                    {segs.map(s => (
                      <div key={s.key} className='flex justify-between items-center'>
                        <span className='flex items-center gap-1.5 text-[10px] text-muted-foreground'>
                          <span className='inline-block size-1.5 rounded-sm flex-shrink-0' style={{ background: s.color }} />{s.label}
                        </span>
                        <span className='text-[10px] font-semibold'>{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {phishingSummary && (() => {
              const ph = phishingSummary
              const sent = ph.total_sent ?? 0
              const sz = 88, th = 16, r = (sz - th) / 2, cx = sz / 2, cy = sz / 2, circ = 2 * Math.PI * r
              const segs = sent === 0 ? [] : [
                { label: t('dashboard.phishing.notOpened'),   value: Math.max(0, sent - (ph.total_opened ?? 0)),                          color: '#6b7280' },
                { label: t('dashboard.phishing.opened'),      value: Math.max(0, (ph.total_opened ?? 0) - (ph.total_clicked ?? 0)),       color: '#f59e0b' },
                { label: t('dashboard.phishing.clicked'),     value: Math.max(0, (ph.total_clicked ?? 0) - (ph.total_submitted ?? 0)),    color: '#f97316' },
                { label: t('dashboard.phishing.credentials'), value: ph.total_submitted ?? 0,                                             color: '#ef4444' },
              ]
              let acc = 0
              return (
                <div className='flex-1 min-h-0 rounded-lg border bg-card p-3 flex flex-col items-center overflow-hidden'>
                  <span className='flex-none text-[9px] font-semibold uppercase tracking-widest text-orange-500 mb-2 self-start'>Phishing</span>
                  <svg width={sz} height={sz} className='shrink-0'>
                    {sent === 0
                      ? <circle cx={cx} cy={cy} r={r} fill='none' stroke='currentColor' strokeOpacity={0.1} strokeWidth={th} />
                      : segs.filter(s => s.value > 0).map(s => {
                          const frac = s.value / sent, arc = frac * circ, rot = acc * 360 - 90
                          acc += frac
                          return <circle key={s.label} cx={cx} cy={cy} r={r} fill='none' stroke={s.color} strokeWidth={th}
                            strokeDasharray={`${arc} ${circ - arc}`} transform={`rotate(${rot} ${cx} ${cy})`} />
                        })
                    }
                    <text x={cx} y={cy - 3} textAnchor='middle' fill='currentColor' fontSize='14' fontWeight='700'>{sent}</text>
                    <text x={cx} y={cy + 9} textAnchor='middle' fill='#6b7280' fontSize='7'>{t('dashboard.phishing.sent')}</text>
                  </svg>
                  <div className='flex-none mt-2 w-full space-y-1'>
                    {[
                      { label: t('dashboard.phishing.campaigns'), value: ph.total_campaigns ?? 0,        color: '#f97316' },
                      { label: t('dashboard.phishing.active'),    value: ph.active_campaigns ?? 0,       color: '#22c55e' },
                      { label: t('dashboard.phishing.openRate'),  value: (ph.avg_open_rate ?? 0) + '%',  color: '#f59e0b' },
                      { label: t('dashboard.phishing.clickRate'), value: (ph.avg_click_rate ?? 0) + '%', color: '#f97316' },
                    ].map(s => (
                      <div key={s.label} className='flex justify-between items-center'>
                        <span className='flex items-center gap-1.5 text-[10px] text-muted-foreground'>
                          <span className='inline-block size-1.5 rounded-sm flex-shrink-0' style={{ background: s.color }} />{s.label}
                        </span>
                        <span className='text-[10px] font-semibold'>{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>

          <div className='rounded-lg border bg-card p-3 flex flex-col min-h-0 overflow-hidden'>
            <div className='flex-none flex items-center justify-between mb-2'>
              <span className='text-[10px] font-semibold uppercase tracking-widest text-muted-foreground'>{t('dashboard.recentEvents')}</span>
              <div className='flex items-center gap-2'>
                {corrStatus && (
                  <span className='text-[10px] text-muted-foreground'>
                    {corrStatus.running
                      ? t('dashboard.correlating')
                      : corrStatus.lastWazuhRun
                        ? t('dashboard.lastRun', { time: new Date(corrStatus.lastWazuhRun).toLocaleTimeString('es-AR') })
                        : t('dashboard.neverRun')
                    }
                  </span>
                )}
                <Button size='sm' variant='ghost' className='h-6 px-2 text-xs' onClick={runCorrelation} disabled={runningCorr}>
                  {runningCorr ? <Loader2 className='size-3 animate-spin' /> : <Activity className='size-3' />}
                  {t('dashboard.correlate')}
                </Button>
              </div>
            </div>
            {recentEvents.length === 0 ? (
              <div className='flex-1 flex items-center justify-center text-sm text-muted-foreground'>{t('dashboard.noEvents')}</div>
            ) : (
              <div className='flex-1 min-h-0 overflow-y-auto space-y-2'>
                {recentEvents.map(ev => {
                  const d = typeof ev.data === 'string' ? JSON.parse(ev.data) : (ev.data ?? {})
                  const sc = srcColor[ev.source] ?? '#6b7280'
                  return (
                    <div key={ev.id} className='flex gap-2 items-start pb-2 border-b last:border-0 last:pb-0'>
                      <span className='text-[9px] font-bold rounded px-1 py-0.5 flex-shrink-0 mt-0.5' style={{ background: sc + '22', color: sc }}>
                        {ev.source.toUpperCase()}
                      </span>
                      <div className='flex-1 min-w-0'>
                        <div className='text-xs font-medium truncate'>
                          {d.ioc ?? d.filename ?? d.subject ?? d.campaign ?? d.ip ?? d.vuln ?? ev.event_type}
                        </div>
                        <div className='text-[10px] text-muted-foreground'>
                          {ev.event_type} · {new Date(ev.ts).toLocaleString('es-AR')}
                        </div>
                      </div>
                      {ev.severity && (
                        <span className='text-[9px] font-bold flex-shrink-0' style={{ color: sevColor[ev.severity] ?? '#6b7280' }}>
                          {ev.severity.toUpperCase()}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className='flex-none grid grid-cols-2 gap-2'>
          <Link to='/inteligencia/threat' className='group rounded-lg border bg-card px-3 py-2 flex items-center gap-2 hover:bg-muted/40 transition-colors'>
            <ShieldAlertIcon className='h-3.5 w-3.5 text-destructive shrink-0' />
            <span className='text-xs font-semibold flex-1'>Threat Intelligence</span>
            <span className='text-[10px] text-muted-foreground group-hover:text-foreground'>→</span>
          </Link>
          <Link to='/inteligencia/apis' className='group rounded-lg border bg-card px-3 py-2 flex items-center gap-2 hover:bg-muted/40 transition-colors'>
            <Key className='h-3.5 w-3.5 text-primary shrink-0' />
            <span className='text-xs font-semibold flex-1'>APIs &amp; Módulos</span>
            <span className='text-[10px] text-muted-foreground group-hover:text-foreground'>{apiActiveCount}/{API_KEY_SERVICES.length} {t('intel.apis.activeBadge')} →</span>
          </Link>
        </div>

      </div>
    </>
  )
}
