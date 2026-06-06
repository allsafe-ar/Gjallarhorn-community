import { useState, useEffect } from 'react'
import { Key, Globe, Brain, Loader2, RefreshCw, CheckCircle2, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Header } from '@/components/layout/header'

type AiStatus = {
  status: 'connected' | 'configured' | 'disabled' | 'error'
  provider?: string; model?: string; models?: string[]
  modelInstalled?: boolean; enabled?: boolean
}
type SourceStat = { source: string; queries: number; detections: number }

const API_KEY_SERVICES = [
  { key: 'virustotal',      label: 'VirusTotal',           url: 'virustotal.com',      paid: false },
  { key: 'abuseipdb',       label: 'AbuseIPDB',            url: 'abuseipdb.com',       paid: false },
  { key: 'shodan',          label: 'Shodan',               url: 'shodan.io',           paid: false },
  { key: 'alienvault',      label: 'AlienVault OTX',       url: 'otx.alienvault.com',  paid: false },
  { key: 'greynoise',       label: 'GreyNoise',            url: 'greynoise.io',        paid: true  },
  { key: 'safebrowsing',    label: 'Google Safe Browsing', url: 'developers.google.com/safe-browsing', paid: false },
  { key: 'urlscan',         label: 'URLScan.io',           url: 'urlscan.io',          paid: false },
  { key: 'criminalip',      label: 'Criminal IP',          url: 'criminalip.io',       paid: false },
  { key: 'ipqualityscore',  label: 'IPQualityScore',       url: 'ipqualityscore.com',  paid: false },
  { key: 'threatfox',       label: 'Abuse.ch (ThreatFox)', url: 'threatfox.abuse.ch',  paid: false },
  { key: 'hybrid',          label: 'Hybrid Analysis',      url: 'hybrid-analysis.com', paid: false },
]

const FREE_INTEL = [
  { label: 'URLhaus (Abuse.ch)',       url: 'urlhaus.abuse.ch' },
  { label: 'MalwareBazaar (Abuse.ch)', url: 'bazaar.abuse.ch' },
  { label: 'ThreatFox (Abuse.ch)',     url: 'threatfox.abuse.ch' },
  { label: 'FeodoTracker (Abuse.ch)',  url: 'feodotracker.abuse.ch' },
  { label: 'C2 Trackers (GitHub)',     url: 'github.com/montysecurity' },
  { label: 'Tor Exit Nodes',           url: 'check.torproject.org' },
  { label: 'OpenPhish',                url: 'openphish.com' },
  { label: 'ThreatCrowd',              url: 'threatcrowd.org' },
  { label: 'CIRCL MISP',              url: 'www.circl.lu' },
  { label: 'Malpedia',                 url: 'malpedia.caad.fkie.fraunhofer.de' },
]

export function ApisView() {
  const { t } = useTranslation()
  const [apiStatus, setApiStatus] = useState<Record<string, boolean>>({})
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null)
  const [sourceStats, setSourceStats] = useState<SourceStat[]>([])
  const [loading, setLoading] = useState(true)

  const STATUS_META: Record<string, { label: string; color: string }> = {
    connected:  { label: t('intel.apis.status.connected'),  color: '#22c55e' },
    configured: { label: t('intel.apis.status.configured'), color: '#8b5cf6' },
    disabled:   { label: t('intel.apis.status.disabled'),   color: '#6b7280' },
    error:      { label: t('intel.apis.status.error'),      color: '#ef4444' },
  }

  async function load() {
    setLoading(true)
    try {
      const [k, ai, intel] = await Promise.all([
        apiFetch<{ status: Record<string, boolean> }>('/settings/api-keys/status'),
        apiFetch<AiStatus>('/ai/status').catch(() => ({ status: 'error' as const })),
        apiFetch<{ sourceStats: SourceStat[] }>('/intelligence/stats').catch(() => ({ sourceStats: [] })),
      ])
      setApiStatus(k?.status ?? {})
      setAiStatus(ai)
      setSourceStats(intel.sourceStats ?? [])
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const activeCount = API_KEY_SERVICES.filter(s => apiStatus[s.key]).length
  const aiMeta = STATUS_META[aiStatus?.status ?? 'error']

  return (
    <>
      <Header fixed>
        <Key className='h-4 w-4 text-primary shrink-0' />
        <div>
          <span className='text-sm font-semibold'>{t('intel.apis.title')}</span>
          <span className='text-xs text-muted-foreground block'>{t('intel.apis.desc')}</span>
        </div>
        <Button variant='outline' size='sm' onClick={load} className='ml-auto'>
          <RefreshCw className='h-3.5 w-3.5 mr-1.5' />{t('common.update')}
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
              {[
                { label: t('intel.apis.kpi.activeKeys'),   value: `${activeCount}/${API_KEY_SERVICES.length}`, color: activeCount > 0 ? '#22c55e' : '#6b7280' },
                { label: t('intel.apis.kpi.inactiveKeys'), value: API_KEY_SERVICES.length - activeCount,       color: '#6b7280' },
                { label: t('intel.apis.kpi.freeSources'),  value: FREE_INTEL.length,                           color: '#22c55e' },
                { label: t('intel.apis.kpi.iaModule'),     value: aiMeta.label,                                color: aiMeta.color },
              ].map(c => (
                <div key={c.label} className='relative rounded-lg border bg-card px-4 py-3 overflow-hidden flex-1'>
                  <div className='text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1'>{c.label}</div>
                  <div className='text-2xl font-black tabular-nums' style={{ color: c.color }}>{c.value}</div>
                  <div className='absolute bottom-0 left-0 right-0 h-0.5' style={{ background: c.color, opacity: 0.5 }} />
                </div>
              ))}
            </div>

            <div className='flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-3 overflow-hidden'>

              <div className='rounded-lg border bg-card p-4 flex flex-col min-h-0 overflow-hidden'>
                <div className='flex-none flex items-center gap-2 mb-3'>
                  <Key className='h-3.5 w-3.5 text-muted-foreground' />
                  <span className='text-xs font-semibold uppercase tracking-widest text-muted-foreground'>{t('intel.apis.apiKeys')}</span>
                  <span className='ml-auto text-[10px] text-muted-foreground'>{activeCount} / {API_KEY_SERVICES.length} {t('intel.apis.configured')}</span>
                </div>
                <div className='flex-1 min-h-0 overflow-y-auto space-y-2 pr-0.5'>
                  {API_KEY_SERVICES.map(s => {
                    const active = apiStatus[s.key]
                    const usage = sourceStats.find(x => x.source === s.label)
                    return (
                      <div key={s.key} className='flex items-center gap-3 py-0.5'>
                        {active
                          ? <CheckCircle2 className='h-3.5 w-3.5 shrink-0 text-green-500' />
                          : <XCircle className='h-3.5 w-3.5 shrink-0 text-muted-foreground/30' />
                        }
                        <span className={cn('text-sm flex-1', !active && 'text-muted-foreground')}>
                          {s.label}
                          {s.paid && (
                            <span className='ml-2 text-[10px] font-semibold text-amber-500/80 border border-amber-500/30 rounded px-1 py-0.5'>
                              {t('intel.apis.paid')}
                            </span>
                          )}
                        </span>
                        {usage && (
                          <span className='text-[10px] text-muted-foreground'>{t('intel.apis.usages', { n: usage.queries })}</span>
                        )}
                        <Badge
                          variant={active ? 'default' : 'secondary'}
                          className={cn('text-[10px] shrink-0', active && 'bg-green-500/15 text-green-500 border-green-500/30')}
                        >
                          {active ? t('intel.apis.configuredKey') : t('intel.apis.notConfigured')}
                        </Badge>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className='rounded-lg border bg-card p-4 flex flex-col min-h-0 overflow-hidden'>
                <div className='flex-none flex items-center gap-2 mb-3'>
                  <Globe className='h-3.5 w-3.5 text-muted-foreground' />
                  <span className='text-xs font-semibold uppercase tracking-widest text-muted-foreground'>{t('intel.apis.freeSources')}</span>
                  <Badge className='ml-auto text-[10px] bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20'>
                    {FREE_INTEL.length} {t('intel.apis.activeBadge')}
                  </Badge>
                </div>
                <div className='flex-1 min-h-0 overflow-y-auto space-y-2 pr-0.5'>
                  {FREE_INTEL.map(s => (
                    <div key={s.label} className='flex items-center gap-3 py-0.5'>
                      <CheckCircle2 className='h-3.5 w-3.5 shrink-0 text-green-500' />
                      <span className='text-sm flex-1'>{s.label}</span>
                      <span className='text-[10px] text-muted-foreground'>{s.url}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className='flex-none rounded-lg border bg-card p-3'>
              <div className='flex items-center gap-2 mb-2'>
                <Brain className='h-3.5 w-3.5 text-muted-foreground' />
                <span className='text-xs font-semibold uppercase tracking-widest text-muted-foreground'>{t('intel.apis.iaModule')}</span>
                <Badge variant='outline' className='text-[10px] font-bold tracking-wider border-amber-400/40 text-amber-400 ml-1'>
                  {t('intel.apis.experimental')}
                </Badge>
                <span className='ml-auto text-sm font-semibold' style={{ color: aiMeta.color }}>{aiMeta.label}</span>
              </div>

              <div className='flex gap-3 items-start flex-wrap'>
                <div className='grid grid-cols-2 md:grid-cols-4 gap-2 flex-1 min-w-0'>
                  {[
                    { label: t('ia.card.status'),    value: aiMeta.label,                                                                    color: aiMeta.color },
                    { label: t('ia.card.provider'),  value: aiStatus?.provider === 'ollama' ? 'Ollama (local)' : aiStatus?.provider || '—',  color: undefined },
                    { label: t('ia.card.model'),     value: aiStatus?.model || '—',                                                          mono: true, color: undefined },
                    { label: t('ia.card.available'), value: String(aiStatus?.models?.length ?? 0),                                           color: undefined },
                  ].map(({ label, value, color, mono }) => (
                    <div key={label} className='rounded-lg border bg-muted/30 px-2.5 py-2'>
                      <div className='text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5'>{label}</div>
                      <div className={cn('text-sm font-bold truncate', mono && 'font-mono text-xs')} style={color ? { color } : {}}>
                        {value}
                      </div>
                    </div>
                  ))}
                </div>

                {aiStatus?.models && aiStatus.models.length > 0 && (
                  <div className='flex flex-wrap gap-1.5 items-center self-center'>
                    {aiStatus.models.map(m => (
                      <span
                        key={m}
                        className={cn(
                          'text-xs font-mono px-2 py-0.5 rounded border',
                          m === aiStatus.model
                            ? 'border-primary/40 bg-primary/10 text-primary font-semibold'
                            : 'border-border text-muted-foreground'
                        )}
                      >
                        {m}{m === aiStatus.model ? ' ✓' : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {aiStatus?.status === 'error' && (
                <div className='mt-2 text-xs text-destructive border-l-2 border-destructive/50 pl-2'>
                  {t('intel.apis.noIaConnection')}
                </div>
              )}
              {aiStatus?.status === 'disabled' && (
                <div className='mt-2 text-xs text-muted-foreground border-l-2 border-muted pl-2'>
                  {t('intel.apis.iaDisabled')}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
