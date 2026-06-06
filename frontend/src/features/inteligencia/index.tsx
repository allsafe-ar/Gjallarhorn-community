import { useState, useEffect } from 'react'
import { Globe, Key, Loader2, RefreshCw, TrendingUp, Search, ShieldAlert, Brain } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'

type Stats = {
  totals: { total: number; malicious: number; suspicious: number; clean: number; unknown: number }
  byType: Array<{ ioc_type: string; c: number }>
  byVerdict: Array<{ verdict: string; c: number }>
  trend: Array<{ d: string; c: number }>
  sourceStats: Array<{ source: string; queries: number; detections: number }>
  apiKeyCount: number
}

type ApiKeyStatus = Record<string, boolean>

const API_KEY_SERVICES = [
  { key: 'virustotal',      label: 'VirusTotal',           color: '#3b82f6' },
  { key: 'abuseipdb',       label: 'AbuseIPDB',            color: '#f59e0b' },
  { key: 'shodan',          label: 'Shodan',               color: '#ef4444' },
  { key: 'alienvault',      label: 'AlienVault OTX',       color: '#8b5cf6' },
  { key: 'greynoise',       label: 'GreyNoise',            color: '#22c55e' },
  { key: 'urlscan',         label: 'URLScan.io',           color: '#06b6d4' },
  { key: 'criminalip',      label: 'Criminal IP',          color: '#f97316' },
  { key: 'ipqualityscore',  label: 'IPQualityScore',       color: '#ec4899' },
  { key: 'threatfox',       label: 'Abuse.ch (ThreatFox)', color: '#a855f7' },
  { key: 'hybrid',          label: 'Hybrid Analysis',      color: '#14b8a6' },
  { key: 'safebrowsing',    label: 'Google Safe Browsing', color: '#4285f4' },
]

const FREE_INTEL = [
  'URLhaus (Abuse.ch)', 'MalwareBazaar (Abuse.ch)', 'ThreatFox (Abuse.ch)',
  'FeodoTracker (Abuse.ch)', 'C2 Trackers (GitHub)', 'Tor Exit Nodes',
  'OpenPhish', 'ThreatCrowd', 'CIRCL MISP', 'Malpedia',
]

function KpiCard({ label, value, color, icon: Icon }: {
  label: string; value: number | string; color: string; icon?: React.ElementType
}) {
  return (
    <div className='relative rounded-lg border bg-card px-4 py-3 overflow-hidden'>
      {Icon && <Icon className='absolute right-3 top-3 opacity-10' style={{ width: 40, height: 40, color }} strokeWidth={1.4} />}
      <div className='text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1'>{label}</div>
      <div className='text-2xl font-black tabular-nums' style={{ color }}>{value}</div>
      <div className='absolute bottom-0 left-0 right-0 h-0.5' style={{ background: color, opacity: 0.5 }} />
    </div>
  )
}

function CustomTooltip({ active, payload, label }: any) {
  const { t } = useTranslation()
  if (!active || !payload?.length) return null
  return (
    <div className='rounded-lg border bg-popover px-3 py-2 text-xs shadow-md'>
      <p className='font-semibold text-muted-foreground mb-1'>{label}</p>
      <p className='font-bold'>{t('intel.index.queries', { n: payload[0]?.value })}</p>
    </div>
  )
}

export function InteligenciaView() {
  const { t } = useTranslation()
  const [stats, setStats] = useState<Stats | null>(null)
  const [apiStatus, setApiStatus] = useState<ApiKeyStatus>({})
  const [loading, setLoading] = useState(true)

  const TYPE_LABELS: Record<string, string> = {
    ipv4: 'IPv4', ipv6: 'IPv6', domain: t('common.domain'), url: 'URL',
    md5: 'MD5', sha1: 'SHA1', sha256: 'SHA256',
  }

  const VERDICT_META: Record<string, { label: string; color: string }> = {
    malicious:  { label: t('intel.index.verdict.malicious'),  color: '#ef4444' },
    suspicious: { label: t('intel.index.verdict.suspicious'), color: '#f59e0b' },
    clean:      { label: t('intel.index.verdict.clean'),      color: '#22c55e' },
    unknown:    { label: t('intel.index.verdict.unknown'),     color: '#6b7280' },
  }

  async function load() {
    setLoading(true)
    try {
      const [s, k] = await Promise.all([
        apiFetch<Stats>('/intelligence/stats'),
        apiFetch<{ keys: Record<string, string> }>('/settings/api-keys'),
      ])
      setStats(s)
      const st: ApiKeyStatus = {}
      for (const [key, val] of Object.entries(k.keys || {})) {
        st[key] = !!val && val !== 'REMOVE'
      }
      setApiStatus(st)
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const total      = stats?.totals?.total ?? 0
  const malicious  = stats?.totals?.malicious ?? 0
  const suspicious = stats?.totals?.suspicious ?? 0
  const clean      = stats?.totals?.clean ?? 0
  const apiActive  = API_KEY_SERVICES.filter(s => apiStatus[s.key]).length
  const topSources = (stats?.sourceStats ?? []).slice(0, 10)
  const maxQ = Math.max(1, ...topSources.map(s => s.queries))

  const trendData = (() => {
    const map: Record<string, number> = {}
    ;(stats?.trend ?? []).forEach(item => { map[item.d] = item.c })
    const days: Array<{ date: string; c: number }> = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      days.push({ date: key.slice(5), c: map[key] ?? 0 })
    }
    return days
  })()

  return (
    <div className='p-8 max-w-7xl'>
      <div className='flex items-center justify-between mb-6'>
        <div>
          <h1 className='text-2xl font-bold flex items-center gap-2'>
            <Globe className='h-5 w-5 text-primary' />
            {t('intel.index.title')}
          </h1>
          <p className='text-sm text-muted-foreground mt-1'>{t('intel.index.desc')}</p>
        </div>
        <Button variant='outline' size='sm' onClick={load}>
          <RefreshCw className='h-3.5 w-3.5 mr-1.5' />{t('common.update')}
        </Button>
      </div>

      {loading ? (
        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Loader2 className='h-4 w-4 animate-spin' />{t('common.loading')}
        </div>
      ) : (
        <div className='flex flex-col gap-5'>

          <div className='grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3'>
            <KpiCard label={t('intel.index.kpi.totalQueries')} value={total}      color='var(--primary)' icon={Search} />
            <KpiCard label={t('intel.index.kpi.malicious')}    value={malicious}  color='#ef4444'        icon={ShieldAlert} />
            <KpiCard label={t('intel.index.kpi.suspicious')}   value={suspicious} color='#f59e0b'        icon={ShieldAlert} />
            <KpiCard label={t('intel.index.kpi.clean')}        value={clean}      color='#22c55e'        icon={ShieldAlert} />
            <KpiCard label={t('intel.index.kpi.activeKeys')}   value={`${apiActive}/${API_KEY_SERVICES.length}`} color='#3b82f6' icon={Key} />
            <KpiCard label={t('intel.index.kpi.freeSources')}  value={FREE_INTEL.length} color='#22c55e' icon={Globe} />
          </div>

          <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>

            <div className='rounded-lg border bg-card p-4'>
              <div className='flex items-center gap-2 mb-4'>
                <TrendingUp className='h-3.5 w-3.5 text-muted-foreground' />
                <span className='text-xs font-semibold uppercase tracking-widest text-muted-foreground'>{t('intel.index.activity')}</span>
              </div>
              <ResponsiveContainer width='100%' height={160}>
                <BarChart data={trendData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }} barSize={16}>
                  <CartesianGrid strokeDasharray='3 3' stroke='#ffffff0d' vertical={false} />
                  <XAxis dataKey='date' tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#ffffff08' }} />
                  <Bar dataKey='c' fill='#e8192c' radius={[3, 3, 0, 0]} isAnimationActive />
                </BarChart>
              </ResponsiveContainer>

              {stats && (
                <div className='flex gap-3 mt-4 flex-wrap'>
                  {(stats.byType ?? []).map(item => (
                    <div key={item.ioc_type} className='flex items-center gap-1.5 text-[11px] text-muted-foreground'>
                      <span className='inline-block size-2 rounded-sm bg-primary/50' />
                      {TYPE_LABELS[item.ioc_type] || item.ioc_type}
                      <span className='font-bold text-foreground'>{item.c}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className='rounded-lg border bg-card p-4'>
              <div className='text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4'>
                {t('intel.index.topSources')}
              </div>
              {topSources.length === 0 ? (
                <div className='text-sm text-muted-foreground text-center py-8'>{t('intel.index.noUsage')}</div>
              ) : (
                <div className='flex flex-col gap-2.5'>
                  {topSources.map((s, i) => {
                    const pct = Math.round((s.queries / maxQ) * 100)
                    const detPct = s.queries > 0 ? Math.round((s.detections / s.queries) * 100) : 0
                    return (
                      <div key={s.source} className='flex items-center gap-3'>
                        <span className='text-[10px] text-muted-foreground w-3 text-right'>{i + 1}</span>
                        <div className='flex-1 min-w-0'>
                          <div className='flex items-center justify-between mb-0.5'>
                            <span className='text-xs font-medium truncate'>{s.source}</span>
                            <span className='text-[10px] text-muted-foreground ml-2 shrink-0'>{t('intel.index.queries', { n: s.queries })}</span>
                          </div>
                          <div className='h-1.5 rounded-full bg-muted overflow-hidden'>
                            <div
                              className='h-full rounded-full transition-all'
                              style={{ width: `${pct}%`, background: detPct > 30 ? '#ef4444' : detPct > 10 ? '#f59e0b' : '#3b82f6' }}
                            />
                          </div>
                        </div>
                        <span className={cn('text-[10px] font-bold w-10 text-right shrink-0', detPct > 30 ? 'text-red-500' : detPct > 10 ? 'text-amber-500' : 'text-muted-foreground')}>
                          {detPct}%
                        </span>
                      </div>
                    )
                  })}
                  <p className='text-[10px] text-muted-foreground mt-1'>{t('intel.index.detectionNote')}</p>
                </div>
              )}
            </div>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>

            <div className='rounded-lg border bg-card p-4'>
              <div className='flex items-center gap-2 mb-4'>
                <Key className='h-3.5 w-3.5 text-muted-foreground' />
                <span className='text-xs font-semibold uppercase tracking-widest text-muted-foreground'>{t('intel.index.withKey')}</span>
                <span className='ml-auto text-[10px] text-muted-foreground'>{apiActive} / {API_KEY_SERVICES.length} {t('intel.apis.activeBadge')}</span>
              </div>
              <div className='space-y-2.5'>
                {API_KEY_SERVICES.map(s => {
                  const usage = stats?.sourceStats?.find(x => x.source === s.label)
                  const active = apiStatus[s.key]
                  return (
                    <div key={s.key} className='flex items-center gap-3'>
                      <span className={cn('inline-block size-2 rounded-full shrink-0', active ? 'bg-green-500' : 'bg-muted-foreground/30')} />
                      <span className='text-sm flex-1'>{s.label}</span>
                      {usage && (
                        <span className='text-[10px] text-muted-foreground'>{t('intel.index.queries', { n: usage.queries })}</span>
                      )}
                      <Badge variant={active ? 'default' : 'secondary'} className='text-[10px]'>
                        {active ? t('intel.index.active') : t('intel.index.notConfigured')}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className='rounded-lg border bg-card p-4'>
              <div className='flex items-center gap-2 mb-4'>
                <Globe className='h-3.5 w-3.5 text-muted-foreground' />
                <span className='text-xs font-semibold uppercase tracking-widest text-muted-foreground'>{t('intel.index.freeSources')}</span>
                <span className='ml-auto text-[10px] text-green-500'>{t('intel.index.activeCount', { n: FREE_INTEL.length })}</span>
              </div>
              <div className='space-y-2.5'>
                {FREE_INTEL.map(s => {
                  const usage = stats?.sourceStats?.find(x => x.source === s || s.includes(x.source.split(' ')[0]))
                  return (
                    <div key={s} className='flex items-center gap-3'>
                      <span className='inline-block size-2 rounded-full shrink-0 bg-green-500' />
                      <span className='text-sm flex-1'>{s}</span>
                      {usage && (
                        <span className='text-[10px] text-muted-foreground'>{t('intel.index.queries', { n: usage.queries })}</span>
                      )}
                      <Badge className='text-[10px] bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20'>
                        {t('intel.index.active')}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
