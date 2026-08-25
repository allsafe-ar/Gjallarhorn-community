import { useState, useEffect, useCallback } from 'react'
import { Search, Loader2, Copy, Check, AlertCircle, Clock } from 'lucide-react'
import { PaginationBar } from '@/components/ui/pagination-bar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useTranslation } from 'react-i18next'
import { HelpTip } from '@/components/help-tip'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

const TOKEN_KEY = 'gjallarhorn_token'

type IocResult = {
  id: string; iocValue: string; iocType: string; score: number; verdict: string
  findings?: any[]; breakdown?: any; domainInfo?: any; dgaInfo?: any
  thehive_case_id?: string; internal_case_id?: string
  rules?: any; stix?: any
}
type HistEntry = { id: string; ts: string; ioc_value: string; ioc_type: string; threat_score: number; verdict: string; analyst: string }

function scoreColor(s: number) {
  if (s >= 70) return '#ef4444'
  if (s >= 40) return '#f59e0b'
  if (s > 0) return '#22c55e'
  return '#6b7280'
}

function VerdictBadge({ verdict }: { verdict: string }) {
  const map: Record<string, string> = { MALICIOUS: 'destructive', SUSPICIOUS: 'outline', CLEAN: 'default' }
  return <Badge variant={(map[verdict] ?? 'secondary') as any} className='font-bold'>{verdict}</Badge>
}

function detectType(val: string) {
  const v = val.trim()
  if (!v) return ''
  if (/^[0-9a-fA-F]{32}$/.test(v)) return 'MD5'
  if (/^[0-9a-fA-F]{40}$/.test(v)) return 'SHA-1'
  if (/^[0-9a-fA-F]{64}$/.test(v)) return 'SHA-256'
  if (/^https?:\/\//i.test(v)) return 'URL'
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(v)) return 'IPv4'
  if (/^[0-9a-fA-F:]{3,39}$/.test(v) && v.includes(':')) return 'IPv6'
  if (/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(v)) return 'Domain'
  return ''
}

async function downloadReport(type: string, id: string, format: string) {
  const token = localStorage.getItem(TOKEN_KEY)
  const ext = format === 'html' ? 'html' : 'json'
  const res = await fetch(`/api/reports/${type}/${id}/${format}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `gjallarhorn-${type}-${id.slice(0, 8)}.${ext}`
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}

export function IocView() {
  const { t } = useTranslation()
  const { auth } = useAuthStore()
  const [input, setInput] = useState('')
  const [iocType, setIocType] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<IocResult | null>(null)
  const [history, setHistory] = useState<HistEntry[]>([])
  const [histLoading, setHistLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [histPage, setHistPage] = useState(1)
  const [histPageSize, setHistPageSize] = useState(10)
  const [creatingCase, setCreatingCase] = useState(false)
  const [creatingInternal, setCreatingInt] = useState(false)
  const [aiEnabled, setAiEnabled] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null)
  const [tab, setTab] = useState('sources')

  useEffect(() => {
    apiFetch<{ enabled: boolean }>('/ai/status').then(d => setAiEnabled(!!d.enabled)).catch(() => {})
    apiFetch<{ investigations: HistEntry[] }>('/ioc/history?limit=200')
      .then(d => setHistory(d.investigations || []))
      .catch(() => {})
      .finally(() => setHistLoading(false))
  }, [])

  function handleInput(v: string) { setInput(v); setIocType(detectType(v)) }

  async function investigate(e?: React.FormEvent) {
    e?.preventDefault()
    if (!input.trim()) return
    setLoading(true); setResult(null); setAiAnalysis(null); setTab('sources')
    try {
      const data = await apiFetch<IocResult>('/ioc/investigate', { method: 'POST', body: JSON.stringify({ ioc: input.trim() }) })
      setResult(data)
      setHistory(h => [{ id: data.id, ts: new Date().toISOString(), ioc_value: data.iocValue, ioc_type: data.iocType, threat_score: data.score, verdict: data.verdict, analyst: auth.user?.username || '' }, ...h.slice(0, 49)])
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleAiAnalysis() {
    if (!result) return
    setAiLoading(true); setAiAnalysis(null)
    try {
      const d = await apiFetch<{ analysis: string }>('/ai/analyze/ioc', {
        method: 'POST',
        body: JSON.stringify({ ioc_id: result.id, indicator: result.iocValue, score: result.score, verdict: result.verdict, findings: result.findings, breakdown: result.breakdown, domainInfo: result.domainInfo, dgaInfo: result.dgaInfo }),
      })
      setAiAnalysis(d.analysis); setTab('ia')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setAiLoading(false)
    }
  }

  async function createInternalCase() {
    if (!result || creatingInternal) return
    setCreatingInt(true)
    try {
      const d = await apiFetch<{ id: string }>('/cases', { method: 'POST', body: JSON.stringify({ title: `IOC: ${result.iocValue}`, severity: result.score >= 70 ? 'high' : result.score >= 40 ? 'medium' : 'low', analysisType: 'ioc', analysisId: result.id }) })
      toast.success(t('tools.ioc.caseCreated'))
      setResult(r => r ? { ...r, internal_case_id: d.id } : r)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setCreatingInt(false)
    }
  }

  async function createHiveCase() {
    if (!result) return
    setCreatingCase(true)
    try {
      const d = await apiFetch<{ caseId: string }>(`/ioc/${result.id}/create-case`, { method: 'POST', body: JSON.stringify({}) })
      toast.success(`TheHive Case #${d.caseId}`)
      setResult(r => r ? { ...r, thehive_case_id: d.caseId } : r)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setCreatingCase(false)
    }
  }

  function copyJson() {
    navigator.clipboard.writeText(JSON.stringify(result, null, 2))
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  async function loadFromHistory(id: string) {
    try {
      const [d, rulesD, stixD] = await Promise.all([
        apiFetch<any>(`/ioc/${id}`),
        apiFetch<any>(`/ioc/${id}/rules`).catch(() => ({ rules: {} })),
        apiFetch<any>(`/ioc/${id}/stix`).catch(() => null),
      ])
      const sd = typeof d.sources_data === 'string' ? JSON.parse(d.sources_data) : (d.sources_data || {})
      setResult({
        id: d.id, iocValue: d.ioc_value, iocType: d.ioc_type, score: d.threat_score,
        verdict: d.verdict, findings: sd.findings || [], breakdown: sd.breakdown || {},
        domainInfo: sd.domainInfo, dgaInfo: sd.dgaInfo, rules: rulesD.rules || {},
        stix: stixD, thehive_case_id: d.thehive_case_id,
      })
      setTab('sources')
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const findings = result?.findings || []
  const foundCount = findings.filter((f: any) => f.found).length

  return (
    <div className='p-8'>
      <div className='flex items-center gap-2 mb-1'>
        <h1 className='text-2xl font-bold'>{t('tools.ioc.title')}</h1>
        <HelpTip title={t('help.ioc.title')} description={t('help.ioc.desc')} tips={t('help.ioc.tips', { returnObjects: true }) as string[]} />
      </div>
      <p className='text-sm text-muted-foreground mb-6'>{t('tools.ioc.desc')}</p>

      <form onSubmit={investigate} className='flex gap-3 mb-8 items-end'>
        <div className='relative flex-1'>
          <Input
            value={input}
            onChange={e => handleInput(e.target.value)}
            placeholder={t('tools.ioc.placeholder')}
            className='text-sm h-10 pr-20'
          />
          {iocType && (
            <span className='absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-primary bg-muted px-2 py-0.5 rounded'>
              {iocType}
            </span>
          )}
        </div>
        <Button type='submit' disabled={!input.trim() || loading} className='h-10 px-5'>
          {loading ? <Loader2 className='h-4 w-4 animate-spin mr-2' /> : <Search className='h-4 w-4 mr-2' />}
          {t('tools.ioc.investigate')}
        </Button>
      </form>

      {result && (
        <div className='mb-8'>
          <div className='rounded-lg border bg-card px-5 py-4 mb-4'>
            <div className='flex items-start gap-6 flex-wrap'>
              <div className='text-center shrink-0'>
                <div className='text-5xl font-black tabular-nums leading-none' style={{ color: scoreColor(result.score) }}>
                  {result.score}
                </div>
                <div className='text-[10px] text-muted-foreground mt-1'>/ 100</div>
              </div>
              <div className='flex-1 min-w-0'>
                <div className='flex items-center gap-2 mb-2 flex-wrap'>
                  <VerdictBadge verdict={result.verdict} />
                  <Badge variant='secondary'>{result.iocType}</Badge>
                  {result.thehive_case_id && <Badge variant='outline'>TH #{result.thehive_case_id}</Badge>}
                  {result.dgaInfo?.isDGA && <Badge variant='destructive'>DGA: {result.dgaInfo.family || 'generic'}</Badge>}
                </div>
                <div className='font-mono text-sm bg-muted rounded px-3 py-1.5 break-all'>{result.iocValue}</div>
                {result.domainInfo && (
                  <div className='text-xs text-muted-foreground mt-1.5'>
                    <span className={result.domainInfo.ageDays <= 30 ? 'text-amber-400' : 'text-foreground'}>
                      {t('tools.ioc.domainAge', { n: result.domainInfo.ageDays })}
                    </span>
                  </div>
                )}
              </div>
              <div className='flex gap-2 flex-wrap shrink-0'>
                <Button size='sm' variant={result.internal_case_id ? 'outline' : 'destructive'} disabled={!!result.internal_case_id || creatingInternal} onClick={createInternalCase}>
                  {creatingInternal ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : (result.internal_case_id ? t('tools.ioc.existingCase') : t('tools.ioc.createCase'))}
                </Button>
                <Button size='sm' variant='outline' onClick={createHiveCase} disabled={creatingCase || !!result.thehive_case_id}>
                  {creatingCase ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : 'TheHive'}
                </Button>
                {aiEnabled && (
                  <Button size='sm' variant='outline' onClick={handleAiAnalysis} disabled={aiLoading} className='border-primary/40 text-primary hover:bg-primary/10'>
                    {aiLoading ? <Loader2 className='h-3.5 w-3.5 animate-spin mr-1' /> : null}
                    {t('tools.ioc.analyzeAI')}
                  </Button>
                )}
                <Button size='sm' variant='ghost' onClick={() => downloadReport('ioc', result.id, 'html').catch(e => toast.error(e.message))}>HTML</Button>
                <Button size='sm' variant='ghost' onClick={() => downloadReport('ioc', result.id, 'json').catch(e => toast.error(e.message))}>JSON</Button>
                <Button size='sm' variant='ghost' onClick={() => downloadReport('ioc', result.id, 'mitre').catch(e => toast.error(e.message))}>MITRE Layer</Button>
                <Button size='sm' variant='ghost' onClick={copyJson}>
                  {copied ? <Check className='h-3.5 w-3.5' /> : <Copy className='h-3.5 w-3.5' />}
                </Button>
              </div>
            </div>
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className='mb-4'>
              <TabsTrigger value='sources'>{t('tools.ioc.tab.sources')}{foundCount > 0 ? ` (${foundCount})` : ''}</TabsTrigger>
              <TabsTrigger value='breakdown'>{t('tools.ioc.tab.breakdown')}</TabsTrigger>
              <TabsTrigger value='rules'>{t('tools.ioc.tab.rules')}</TabsTrigger>
              <TabsTrigger value='stix'>{t('tools.ioc.tab.stix')}</TabsTrigger>
              {aiAnalysis && <TabsTrigger value='ia'>{t('tools.ioc.tab.ai')}</TabsTrigger>}
            </TabsList>

            <TabsContent value='sources'>
              {findings.length === 0
                ? <p className='text-sm text-muted-foreground'>{t('tools.ioc.noSources')}</p>
                : (
                  <div className='grid grid-cols-2 md:grid-cols-3 gap-3'>
                    {findings.map((f: any, i: number) => {
                      const skipped = !!f.skipped
                      const errored = !skipped && !!f.error
                      const clean = !skipped && !errored && !f.found
                      const mal = !skipped && !errored && f.found && (f.detections > 0 || f.maliciousCount > 0)
                      const borderCls = skipped ? 'border-muted-foreground/20' : errored ? 'border-amber-400/40' : clean ? 'border-emerald-500/50' : mal ? 'border-destructive/60' : 'border-amber-400/50'
                      const barColor  = skipped ? '#6b7280' : errored ? '#f59e0b' : clean ? '#22c55e' : mal ? '#ef4444' : '#f59e0b'
                      const badgeCls  = skipped
                        ? 'bg-muted text-muted-foreground border-muted-foreground/20'
                        : errored
                          ? 'bg-amber-400/10 text-amber-400 border-amber-400/30'
                          : clean
                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                            : mal
                              ? 'bg-destructive/10 text-destructive border-destructive/30'
                              : 'bg-amber-400/10 text-amber-400 border-amber-400/30'
                      const badgeText = skipped ? t('tools.ioc.notConfigured') : errored ? t('tools.ioc.error') : clean ? t('tools.ioc.clean') : mal ? t('tools.ioc.detected') : t('tools.ioc.suspicious')
                      return (
                        <div key={i} className={cn('rounded-lg border bg-card p-4 flex flex-col gap-1.5 relative overflow-hidden', borderCls)}>
                          <div className='flex items-center justify-between gap-2'>
                            <span className='text-sm font-semibold leading-tight'>{f.source}</span>
                            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded border shrink-0', badgeCls)}>
                              {badgeText}
                            </span>
                          </div>
                          {f.detections != null && (
                            <div className='text-xs' style={{ color: f.detections > 0 ? '#ef4444' : '#22c55e' }}>
                              {t('tools.ioc.detections', { n: f.detections })}{f.total != null ? ` / ${f.total}` : ''}
                            </div>
                          )}
                          {f.maliciousCount != null && f.maliciousCount > 0 && (
                            <div className='text-xs text-destructive'>{t('tools.ioc.maliciousSources', { n: f.maliciousCount })}</div>
                          )}
                          {clean && f.detections == null && (
                            <div className='text-xs text-muted-foreground'>{t('tools.ioc.noDetections')}</div>
                          )}
                          {skipped && (
                            <div className='text-xs text-muted-foreground'>{t('tools.ioc.notConfiguredHint')}</div>
                          )}
                          {errored && (
                            <div className='text-xs text-amber-400/80 line-clamp-2'>{f.error}</div>
                          )}
                          {f.score != null && <div className='text-xs text-muted-foreground'>Score: {f.score}</div>}
                          {f.details && <div className='text-xs text-muted-foreground line-clamp-2'>{f.details}</div>}
                          {f.link && (
                            <a href={f.link} target='_blank' rel='noopener noreferrer'
                              className='text-[11px] text-primary hover:underline mt-auto pt-1'>
                              {t('tools.ioc.viewReport')}
                            </a>
                          )}
                          <div className='absolute bottom-0 left-0 right-0 h-0.5' style={{ background: barColor, opacity: 0.6 }} />
                        </div>
                      )
                    })}
                  </div>
                )
              }
            </TabsContent>

            <TabsContent value='breakdown'>
              {result.breakdown ? (
                <div className='rounded-lg border bg-muted/30 p-4'>
                  <pre className='text-xs font-mono whitespace-pre-wrap break-all'>{JSON.stringify(result.breakdown, null, 2)}</pre>
                </div>
              ) : <p className='text-sm text-muted-foreground'>{t('tools.ioc.noBreakdown')}</p>}
            </TabsContent>

            <TabsContent value='rules'>
              {result.rules && Object.keys(result.rules).length > 0 ? (
                <div className='space-y-3'>
                  {(['KQL', 'SPL (Splunk)', 'SIGMA', 'YARA'] as const).map(label => {
                    const key = label === 'KQL' ? 'kql' : label === 'SPL (Splunk)' ? 'spl' : label === 'SIGMA' ? 'sigma' : 'yara'
                    const code = result.rules[key]
                    if (!code) return null
                    return (
                      <div key={label} className='rounded-lg border bg-muted/30 p-3'>
                        <div className='text-xs font-semibold text-muted-foreground mb-2'>{label}</div>
                        <pre className='text-xs font-mono whitespace-pre-wrap break-all'>{code}</pre>
                      </div>
                    )
                  })}
                </div>
              ) : <p className='text-sm text-muted-foreground'>{t('tools.ioc.noRules')}</p>}
            </TabsContent>

            <TabsContent value='stix'>
              {result.stix ? (
                <div className='rounded-lg border bg-muted/30 p-3'>
                  <div className='flex items-center justify-between mb-2'>
                    <span className='text-xs font-semibold text-muted-foreground'>STIX 2.1 Bundle</span>
                    <div className='flex gap-2'>
                      <Button size='sm' variant='ghost' onClick={() => { navigator.clipboard.writeText(JSON.stringify(result!.stix, null, 2)); toast.success(t('tools.ioc.copied')) }}>
                        <Copy className='h-3.5 w-3.5 mr-1' />{t('tools.ioc.copy')}
                      </Button>
                      <Button size='sm' variant='ghost' onClick={() => { const a = document.createElement('a'); a.href = `/api/ioc/${result!.id}/stix`; a.download = `ioc-${result!.id.slice(0, 8)}-stix21.json`; a.click() }}>
                        {t('tools.ioc.download')}
                      </Button>
                    </div>
                  </div>
                  <pre className='text-xs font-mono whitespace-pre-wrap break-all max-h-96 overflow-y-auto'>{JSON.stringify(result.stix, null, 2)}</pre>
                </div>
              ) : <p className='text-sm text-muted-foreground'>{t('tools.ioc.noStix')}</p>}
            </TabsContent>

            {aiAnalysis && (
              <TabsContent value='ia'>
                <div className='rounded-lg border bg-card px-5 py-4'>
                  <div className='text-xs font-semibold text-primary mb-3'>{t('tools.ioc.aiAnalysis')}</div>
                  <div className='text-sm whitespace-pre-wrap leading-relaxed'>{aiAnalysis}</div>
                </div>
              </TabsContent>
            )}
          </Tabs>
        </div>
      )}

      <div>
        <h2 className='text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3'>{t('tools.ioc.history')}</h2>
        {histLoading ? (
          <div className='flex items-center gap-2 text-muted-foreground text-sm'>
            <Loader2 className='h-3.5 w-3.5 animate-spin' /> {t('common.loading')}
          </div>
        ) : history.length === 0 ? (
          <p className='text-sm text-muted-foreground'>{t('tools.ioc.noHistory')}</p>
        ) : (() => {
          const pageRows = histPageSize === 0 ? history : history.slice((histPage - 1) * histPageSize, histPage * histPageSize)
          const bar = <PaginationBar total={history.length} page={histPage} pageSize={histPageSize} onPage={setHistPage} onPageSize={setHistPageSize} />
          return (
            <div className='space-y-2'>
              {bar}
              <div className='rounded-lg border overflow-hidden'>
                <table className='w-full text-xs border-collapse'>
                  <thead>
                    <tr className='bg-muted/50'>
                      {[t('tools.ioc.col.date'), t('tools.ioc.col.ioc'), t('tools.ioc.col.type'), t('tools.ioc.col.score'), t('tools.ioc.col.verdict'), t('tools.ioc.col.analyst'), ''].map(h => (
                        <th key={h} className='px-3 py-2 text-left font-semibold text-muted-foreground border-b'>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map(h => (
                      <tr key={h.id} className='border-b last:border-0 hover:bg-muted/20 cursor-pointer' onClick={() => loadFromHistory(h.id)}>
                        <td className='px-3 py-2 text-muted-foreground whitespace-nowrap'>{new Date(h.ts).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                        <td className='px-3 py-2 font-mono max-w-[200px] truncate'>{h.ioc_value}</td>
                        <td className='px-3 py-2 text-muted-foreground'>{h.ioc_type}</td>
                        <td className='px-3 py-2 font-bold tabular-nums' style={{ color: scoreColor(h.threat_score) }}>{h.threat_score}</td>
                        <td className='px-3 py-2'>
                          <span className={cn('text-[10px] font-bold', h.verdict === 'MALICIOUS' ? 'text-destructive' : h.verdict === 'SUSPICIOUS' ? 'text-amber-400' : 'text-emerald-500')}>{h.verdict}</span>
                        </td>
                        <td className='px-3 py-2 text-muted-foreground'>{h.analyst}</td>
                        <td className='px-3 py-2'><span className='text-primary text-[11px]'>{t('tools.ioc.view')}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {bar}
            </div>
          )
        })()}
      </div>
    </div>
  )
}
