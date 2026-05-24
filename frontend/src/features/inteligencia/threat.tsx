import { useState, useEffect } from 'react'
import { ShieldAlert, Search, TrendingUp, Loader2, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Header } from '@/components/layout/header'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'

type Stats = {
  totals: { total: number; malicious: number; suspicious: number; clean: number; unknown: number }
  byType: Array<{ ioc_type: string; c: number }>
  trend: Array<{ d: string; c: number }>
  sourceStats: Array<{ source: string; queries: number; detections: number }>
}

function KpiCard({ label, value, color, sub }: { label: string; value: number | string; color: string; sub?: string }) {
  return (
    <div className='relative rounded-lg border bg-card px-4 py-3 overflow-hidden flex-1'>
      <div className='text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1'>{label}</div>
      <div className='text-3xl font-black tabular-nums' style={{ color }}>{value}</div>
      {sub && <div className='text-[10px] mt-0.5' style={{ color }}>{sub}</div>}
      <div className='absolute bottom-0 left-0 right-0 h-0.5' style={{ background: color, opacity: 0.5 }} />
    </div>
  )
}

function TrendTooltip({ active, payload, label }: any) {
  const { t } = useTranslation()
  if (!active || !payload?.length) return null
  return (
    <div className='rounded-lg border bg-popover px-3 py-2 text-xs shadow-md'>
      <p className='font-semibold text-muted-foreground mb-0.5'>{label}</p>
      <p className='font-bold'>{payload[0].value} {t('intel.threat.queries')}</p>
    </div>
  )
}

export function ThreatIntelView() {
  const { t } = useTranslation()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  const TYPE_LABELS: Record<string, string> = {
    ipv4: 'IPv4', ipv6: 'IPv6', domain: t('common.domain'), url: 'URL',
    md5: 'MD5', sha1: 'SHA1', sha256: 'SHA256',
  }

  const VERDICT_META = [
    { key: 'malicious',  label: t('intel.index.verdict.malicious'),  color: '#ef4444' },
    { key: 'suspicious', label: t('intel.index.verdict.suspicious'), color: '#f59e0b' },
    { key: 'clean',      label: t('intel.index.verdict.clean'),      color: '#22c55e' },
    { key: 'unknown',    label: t('intel.index.verdict.unknown'),     color: '#6b7280' },
  ]

  async function load() {
    setLoading(true)
    try { setStats(await apiFetch('/intelligence/stats')) }
    catch {} finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const total = stats?.totals?.total ?? 0
  const topSources = (stats?.sourceStats ?? []).slice(0, 12)
  const maxQ = Math.max(1, ...topSources.map(s => s.queries))

  const trendData = (() => {
    const map: Record<string, number> = {}
    ;(stats?.trend ?? []).forEach(item => { map[item.d] = item.c })
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (13 - i))
      const key = d.toISOString().slice(0, 10)
      return { date: key.slice(5), c: map[key] ?? 0 }
    })
  })()

  const verdictData = VERDICT_META.map(v => ({
    ...v,
    value: stats?.totals?.[v.key as keyof typeof stats.totals] as number ?? 0,
  })).filter(v => v.value > 0)

  return (
    <>
      <Header fixed>
        <ShieldAlert className='h-4 w-4 text-destructive shrink-0' />
        <div>
          <span className='text-sm font-semibold'>{t('intel.threat.title')}</span>
          <span className='text-xs text-muted-foreground block'>{t('intel.threat.desc')}</span>
        </div>
        <Button variant='outline' size='sm' onClick={load} disabled={loading} className='ml-auto'>
          <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', loading && 'animate-spin')} />{t('common.update')}
        </Button>
      </Header>

      <div className='flex flex-col gap-3 px-4 py-3 overflow-hidden' style={{ height: 'calc(100svh - 3.5rem)' }}>
        {loading ? (
          <div className='flex items-center gap-2 text-sm text-muted-foreground'>
            <Loader2 className='h-4 w-4 animate-spin' />{t('common.loading')}
          </div>
        ) : (
          <>
            <div className='flex-none flex gap-3'>
              <KpiCard label={t('intel.threat.kpi.total')}     value={total} color='var(--primary)' />
              <KpiCard
                label={t('intel.threat.kpi.malicious')}
                value={stats?.totals?.malicious ?? 0}
                color='#ef4444'
                sub={total > 0 ? t('intel.threat.pctTotal', { n: Math.round(((stats?.totals?.malicious ?? 0) / total) * 100) }) : undefined}
              />
              <KpiCard label={t('intel.threat.kpi.suspicious')} value={stats?.totals?.suspicious ?? 0} color='#f59e0b' />
              <KpiCard label={t('intel.threat.kpi.clean')}      value={stats?.totals?.clean ?? 0}      color='#22c55e' />
            </div>

            <div className='flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-3 overflow-hidden'>

              <div className='rounded-lg border bg-card p-4 flex flex-col min-h-0 overflow-hidden'>
                <div className='flex-none flex items-center gap-2 mb-2'>
                  <TrendingUp className='h-3.5 w-3.5 text-muted-foreground' />
                  <span className='text-xs font-semibold uppercase tracking-widest text-muted-foreground'>
                    {t('intel.threat.activity')}
                  </span>
                </div>
                <div className='flex-1 min-h-0'>
                  <ResponsiveContainer width='100%' height='100%'>
                    <BarChart data={trendData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }} barSize={18}>
                      <CartesianGrid strokeDasharray='3 3' stroke='#ffffff0d' vertical={false} />
                      <XAxis dataKey='date' tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip content={<TrendTooltip />} cursor={{ fill: '#ffffff08' }} />
                      <Bar dataKey='c' fill='#e8192c' radius={[3, 3, 0, 0]} isAnimationActive />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className='flex-none flex gap-3 mt-2 flex-wrap'>
                  {(stats?.byType ?? []).map(item => (
                    <div key={item.ioc_type} className='flex items-center gap-1.5 text-[11px] text-muted-foreground'>
                      <span className='inline-block size-2 rounded-sm bg-primary/50' />
                      {TYPE_LABELS[item.ioc_type] || item.ioc_type}
                      <span className='font-bold text-foreground'>{item.c}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className='rounded-lg border bg-card p-4 flex flex-col min-h-0 overflow-hidden'>
                <span className='flex-none text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2'>
                  {t('intel.threat.verdictDist')}
                </span>
                {verdictData.length === 0 ? (
                  <div className='flex-1 flex items-center justify-center text-sm text-muted-foreground'>{t('intel.threat.noData')}</div>
                ) : (
                  <>
                    <div className='flex-1 min-h-0'>
                      <ResponsiveContainer width='100%' height='100%'>
                        <PieChart>
                          <Pie data={verdictData} dataKey='value' cx='50%' cy='50%'
                            innerRadius={45} outerRadius={65} paddingAngle={2}>
                            {verdictData.map(v => <Cell key={v.key} fill={v.color} />)}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className='flex-none w-full space-y-1.5 mt-2'>
                      {verdictData.map(v => (
                        <div key={v.key} className='flex justify-between items-center'>
                          <span className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                            <span className='inline-block size-2 rounded-sm' style={{ background: v.color }} />
                            {v.label}
                          </span>
                          <span className='text-xs font-semibold'>{v.value}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className='flex-none rounded-lg border bg-card p-3'>
              <div className='flex items-center gap-2 mb-2'>
                <Search className='h-3.5 w-3.5 text-muted-foreground' />
                <span className='text-xs font-semibold uppercase tracking-widest text-muted-foreground'>
                  {t('intel.threat.topSources')}
                </span>
                <span className='ml-auto text-[10px] text-muted-foreground'>{t('intel.threat.detectionNote')}</span>
              </div>
              {topSources.length === 0 ? (
                <div className='text-sm text-muted-foreground text-center py-3'>
                  {t('intel.threat.noUsage')}
                </div>
              ) : (
                <div className='grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2'>
                  {topSources.map((s, i) => {
                    const pct = Math.round((s.queries / maxQ) * 100)
                    const detPct = s.queries > 0 ? Math.round((s.detections / s.queries) * 100) : 0
                    const barColor = detPct > 30 ? '#ef4444' : detPct > 10 ? '#f59e0b' : '#3b82f6'
                    return (
                      <div key={s.source} className='flex items-center gap-3'>
                        <span className='text-[10px] text-muted-foreground w-4 text-right shrink-0'>{i + 1}</span>
                        <div className='flex-1 min-w-0'>
                          <div className='flex items-center justify-between mb-1'>
                            <span className='text-xs font-medium truncate'>{s.source}</span>
                            <span className='text-[10px] text-muted-foreground ml-2 shrink-0'>{s.queries} {t('intel.threat.queries')}</span>
                          </div>
                          <div className='h-1.5 rounded-full bg-muted overflow-hidden'>
                            <div className='h-full rounded-full' style={{ width: `${pct}%`, background: barColor }} />
                          </div>
                        </div>
                        <span className={cn('text-[10px] font-bold w-9 text-right shrink-0',
                          detPct > 30 ? 'text-red-500' : detPct > 10 ? 'text-amber-500' : 'text-muted-foreground')}>
                          {detPct}%
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
