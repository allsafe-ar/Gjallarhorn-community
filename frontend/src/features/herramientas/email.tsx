import { useState, useEffect, useRef, useCallback } from 'react'
import { Mail, Upload, Loader2 } from 'lucide-react'
import { PaginationBar } from '@/components/ui/pagination-bar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useTranslation } from 'react-i18next'
import { HelpTip } from '@/components/help-tip'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

const TOKEN_KEY = 'gjallarhorn_token'

type EmailResult = {
  id: string; score: number; verdict: string; subject?: string
  from?: any; to?: any; replyTo?: any; messageId?: string; date?: string
  isPhishing?: boolean; isBEC?: boolean
  auth?: { spf?: string; dkim?: string; dmarc?: string; arc?: string }
  attachments?: any[]; links?: any[]
  receivedChain?: any[]; phishing?: any; bec?: any
  iocs?: Record<string, string[]>; rules?: any
  thehive_case_id?: string; internal_case_id?: string
}
type HistEntry = { id: string; ts: string; subject: string; email_from: string; threat_score: number; verdict: string }

function scoreColor(s: number) {
  if (s >= 70) return '#ef4444'
  if (s >= 40) return '#f59e0b'
  if (s > 0) return '#22c55e'
  return '#6b7280'
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

export function EmailView() {
  const { t } = useTranslation()
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<EmailResult | null>(null)
  const [history, setHistory] = useState<HistEntry[]>([])
  const [histLoading, setHistLoading] = useState(true)
  const [tab, setTab] = useState('resumen')
  const [creatingCase, setCreatingCase] = useState(false)
  const [creatingInternal, setCreatingInt] = useState(false)
  const [histPage, setHistPage] = useState(1)
  const [histPageSize, setHistPageSize] = useState(10)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadHistory = useCallback(async () => {
    setHistLoading(true)
    try {
      const d = await apiFetch<{ analyses: HistEntry[] }>('/emails/history?limit=200')
      setHistory(d.analyses || [])
    } catch {}
    finally { setHistLoading(false) }
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  async function handleUpload(file: File | undefined) {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.eml')) { toast.error(t('tools.email.wrongFormat')); return }
    setUploading(true); setResult(null); setTab('resumen')
    try {
      const token = localStorage.getItem(TOKEN_KEY)
      const fd = new FormData(); fd.append('file', file)
      const r = await fetch('/api/emails/analyze', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setResult(d); loadHistory()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function createInternalCase() {
    if (!result) return
    setCreatingInt(true)
    try {
      const d = await apiFetch<{ id: string }>('/cases', { method: 'POST', body: JSON.stringify({ title: `Email: ${result.subject || t('tools.email.noSubject')}`, severity: result.score >= 70 ? 'high' : result.score >= 40 ? 'medium' : 'low', analysisType: 'email', analysisId: result.id }) })
      toast.success(t('tools.email.caseCreated'))
      setResult(r => r ? { ...r, internal_case_id: d.id } : r)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setCreatingInt(false)
    }
  }

  async function createHiveCase() {
    if (!result?.id) return
    setCreatingCase(true)
    try {
      const d = await apiFetch<{ caseId: string }>(`/emails/${result.id}/create-case`, { method: 'POST', body: JSON.stringify({}) })
      toast.success(`TheHive Case #${d.caseId}`)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setCreatingCase(false)
    }
  }

  async function loadFromHistory(id: string) {
    try {
      const d = await apiFetch<any>(`/emails/${id}`)
      const ad = typeof d.analysis_data === 'string' ? JSON.parse(d.analysis_data) : (d.analysis_data || {})
      setResult({ id: d.id, ...ad, score: d.threat_score, verdict: d.verdict, isPhishing: !!d.is_phishing, isBEC: !!d.is_bec, rules: typeof d.rules_data === 'string' ? JSON.parse(d.rules_data) : (d.rules_data || {}) })
      setTab('resumen')
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const fromStr = (v: any) => typeof v === 'string' ? v : v?.address || v?.name || '—'
  const toStr = (v: any) => Array.isArray(v) ? v.map((r: any) => r.address || r.name || r).filter(Boolean).join(', ') : (v || '—')

  return (
    <div className='p-8'>
      <div className='flex items-center gap-2 mb-1'>
        <h1 className='text-2xl font-bold'>{t('tools.email.title')}</h1>
        <HelpTip title={t('help.email.title')} description={t('help.email.desc')} tips={t('help.email.tips', { returnObjects: true }) as string[]} />
      </div>
      <p className='text-sm text-muted-foreground mb-6'>{t('tools.email.desc')}</p>

      <div
        className='rounded-xl border-2 border-dashed px-8 py-12 text-center cursor-pointer transition-colors mb-8 hover:border-primary/50 hover:bg-muted/30'
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); handleUpload(e.dataTransfer.files[0]) }}
        onClick={() => fileRef.current?.click()}
      >
        <input ref={fileRef} type='file' accept='.eml' className='hidden' onChange={e => handleUpload(e.target.files?.[0])} />
        {uploading ? (
          <div className='flex items-center justify-center gap-3 text-muted-foreground'>
            <Loader2 className='h-5 w-5 animate-spin' /> {t('tools.email.analyzing')}
          </div>
        ) : (
          <>
            <Mail className='h-10 w-10 text-muted-foreground mx-auto mb-3' />
            <p className='text-sm font-medium'>{t('tools.email.dropzone')}</p>
            <p className='text-xs text-muted-foreground mt-1'>{t('tools.email.formats')}</p>
          </>
        )}
      </div>

      {result && (
        <div className='mb-8'>
          <div className='rounded-lg border bg-card px-5 py-4 mb-4'>
            <div className='flex items-start justify-between gap-4 flex-wrap mb-3'>
              <div className='min-w-0'>
                <div className='flex items-center gap-2 mb-2 flex-wrap'>
                  <span className='text-lg font-black tabular-nums' style={{ color: scoreColor(result.score) }}>{result.score}</span>
                  <Badge variant={result.verdict === 'MALICIOUS' ? 'destructive' : result.verdict === 'SUSPICIOUS' ? 'outline' : 'default'} className='font-bold'>{result.verdict}</Badge>
                  {result.isPhishing && <Badge variant='destructive'>PHISHING</Badge>}
                  {result.isBEC && <Badge variant='destructive'>BEC</Badge>}
                  {result.thehive_case_id && <Badge variant='outline'>TH #{result.thehive_case_id}</Badge>}
                </div>
                <p className='text-sm font-medium break-all mb-1'>{result.subject || t('tools.email.noSubject')}</p>
                <p className='text-xs text-muted-foreground'>{t('tools.email.info.from')}: {fromStr(result.from)} → {t('tools.email.info.to')}: {toStr(result.to)}</p>
              </div>
              <div className='flex gap-2 flex-wrap shrink-0'>
                <Button size='sm' variant={result.internal_case_id ? 'outline' : 'destructive'} disabled={!!result.internal_case_id || creatingInternal} onClick={createInternalCase}>
                  {creatingInternal ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : result.internal_case_id ? t('tools.ioc.existingCase') : t('tools.ioc.createCase')}
                </Button>
                <Button size='sm' variant='outline' disabled={creatingCase} onClick={createHiveCase}>
                  {creatingCase ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : 'TheHive'}
                </Button>
                <Button size='sm' variant='ghost' onClick={() => downloadReport('email', result.id, 'html').catch(e => toast.error(e.message))}>HTML</Button>
                <Button size='sm' variant='ghost' onClick={() => downloadReport('email', result.id, 'json').catch(e => toast.error(e.message))}>JSON</Button>
                <Button size='sm' variant='ghost' onClick={() => downloadReport('email', result.id, 'mitre').catch(e => toast.error(e.message))}>MITRE Layer</Button>
              </div>
            </div>

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className='mb-4 flex-wrap'>
                <TabsTrigger value='resumen'>{t('tools.email.tab.summary')}</TabsTrigger>
                <TabsTrigger value='cabeceras'>{t('tools.email.tab.headers')}</TabsTrigger>
                <TabsTrigger value='phishing'>{t('tools.email.tab.phishing')}</TabsTrigger>
                <TabsTrigger value='bec'>{t('tools.email.tab.bec')}</TabsTrigger>
                <TabsTrigger value='iocs'>{t('tools.email.tab.iocs')}</TabsTrigger>
                <TabsTrigger value='links'>{t('tools.email.tab.links')}{result.links?.length ? ` (${result.links.length})` : ''}</TabsTrigger>
                <TabsTrigger value='adjuntos'>{t('tools.email.tab.attachments')}{result.attachments?.length ? ` (${result.attachments.length})` : ''}</TabsTrigger>
                <TabsTrigger value='reglas'>{t('tools.email.tab.rules')}</TabsTrigger>
              </TabsList>

              <TabsContent value='resumen'>
                <div className='grid grid-cols-2 md:grid-cols-3 gap-3'>
                  {[
                    [t('tools.email.info.subject'), result.subject || '—'],
                    [t('tools.email.info.from'), fromStr(result.from)],
                    [t('tools.email.info.to'), toStr(result.to)],
                    [t('tools.email.info.replyTo'), fromStr(result.replyTo)],
                    [t('tools.email.info.messageId'), result.messageId || '—'],
                    [t('tools.email.info.date'), result.date ? new Date(result.date).toLocaleString('es-AR') : '—'],
                    [t('tools.email.info.spf'), result.auth?.spf || '—'],
                    [t('tools.email.info.dkim'), result.auth?.dkim || '—'],
                    [t('tools.email.info.dmarc'), result.auth?.dmarc || '—'],
                    [t('tools.email.info.arc'), result.auth?.arc || '—'],
                    [t('tools.email.info.attachments'), String(result.attachments?.length || 0)],
                    [t('tools.email.info.links'), String(result.links?.length || 0)],
                  ].map(([k, v]) => (
                    <div key={k} className='rounded bg-muted/50 px-3 py-2'>
                      <div className='text-[10px] text-muted-foreground mb-1'>{k}</div>
                      <div className='text-xs break-all'>{v}</div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value='cabeceras'>
                {result.receivedChain?.length ? (
                  <div className='space-y-2'>
                    {result.receivedChain.map((h: any, i: number) => (
                      <div key={i} className='rounded-lg border border-border/50 bg-muted/20 px-4 py-2.5 text-xs'>
                        {h.ip && <span className='text-primary font-mono mr-3'>IP: {h.ip}</span>}
                        {h.fromServer && <span className='text-muted-foreground mr-3'>From: <span className='text-foreground font-mono'>{h.fromServer}</span></span>}
                        {h.byServer && <span className='text-muted-foreground mr-3'>By: <span className='text-foreground font-mono'>{h.byServer}</span></span>}
                        {h.timestamp && <span className='text-muted-foreground'>{h.timestamp}</span>}
                        {!h.ip && !h.fromServer && !h.byServer && <span className='font-mono break-all'>{h.raw}</span>}
                      </div>
                    ))}
                  </div>
                ) : <p className='text-sm text-muted-foreground'>{t('tools.email.noHeaders')}</p>}
              </TabsContent>

              <TabsContent value='phishing'>
                {result.phishing ? (
                  <div>
                    <div className='flex items-center gap-3 mb-4'>
                      <span className='text-2xl font-black tabular-nums' style={{ color: scoreColor(result.phishing.score ?? 0) }}>{result.phishing.score ?? 0}</span>
                      <span className='text-sm text-muted-foreground'>{t('tools.email.phishingScore')}</span>
                      {result.phishing.linkCount != null && <span className='text-xs text-muted-foreground ml-4'>Links: {result.phishing.linkCount}</span>}
                      {result.phishing.shortLinks != null && result.phishing.shortLinks > 0 && <span className='text-xs text-amber-700 dark:text-amber-400'>Short links: {result.phishing.shortLinks}</span>}
                      {result.phishing.mismatchedLinks != null && result.phishing.mismatchedLinks > 0 && <span className='text-xs text-destructive'>Links mismatched: {result.phishing.mismatchedLinks}</span>}
                    </div>
                    {result.phishing.indicators?.length > 0 ? (
                      <div className='space-y-2'>
                        {result.phishing.indicators.map((ind: any, i: number) => (
                          <div key={i} className={cn('rounded-lg border px-4 py-2.5 text-xs',
                            ind.severity === 'critical' || ind.severity === 'high' ? 'border-destructive/40 bg-destructive/5' : 'border-amber-400/30 bg-amber-400/5')}>
                            <span className='font-semibold'>{ind.check}</span>
                            {ind.detail && <span className='text-muted-foreground ml-2'>— {ind.detail}</span>}
                          </div>
                        ))}
                      </div>
                    ) : <p className='text-sm text-muted-foreground'>{t('tools.email.noPhishing')}</p>}
                  </div>
                ) : <p className='text-sm text-muted-foreground'>{t('tools.email.noPhishing')}</p>}
              </TabsContent>

              <TabsContent value='bec'>
                {result.bec ? (
                  <div>
                    <div className='flex items-center gap-3 mb-4'>
                      <span className='text-2xl font-black tabular-nums' style={{ color: scoreColor(result.bec.score ?? 0) }}>{result.bec.score ?? 0}</span>
                      <span className='text-sm text-muted-foreground'>{t('tools.email.becScore')}</span>
                      {result.bec.verdict && <span className={cn('text-xs font-bold ml-4', result.bec.verdict === 'BEC' ? 'text-destructive' : result.bec.verdict === 'SUSPICIOUS' ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-500')}>{result.bec.verdict}</span>}
                    </div>
                    {result.bec.indicators?.length > 0 ? (
                      <div className='space-y-2'>
                        {result.bec.indicators.map((ind: any, i: number) => (
                          <div key={i} className={cn('rounded-lg border px-4 py-2.5 text-xs',
                            ind.severity === 'critical' || ind.severity === 'high' ? 'border-destructive/40 bg-destructive/5' : 'border-amber-400/30 bg-amber-400/5')}>
                            <span className='font-semibold'>{ind.check}</span>
                            {ind.detail && <span className='text-muted-foreground ml-2'>— {ind.detail}</span>}
                          </div>
                        ))}
                      </div>
                    ) : <p className='text-sm text-muted-foreground'>{t('tools.email.noBec')}</p>}
                  </div>
                ) : <p className='text-sm text-muted-foreground'>{t('tools.email.noBec')}</p>}
              </TabsContent>

              <TabsContent value='iocs'>
                {Object.keys(result.iocs || {}).length === 0 ? (
                  <p className='text-sm text-muted-foreground'>{t('tools.email.noIocs')}</p>
                ) : Object.entries(result.iocs || {}).map(([type, vals]) => (
                  <div key={type} className='mb-4'>
                    <div className='text-xs font-semibold text-muted-foreground uppercase mb-2'>{type}</div>
                    <div className='flex flex-col gap-1'>
                      {(vals as string[]).map((v, i) => <div key={i} className='font-mono text-xs bg-muted/50 rounded px-3 py-1.5 break-all'>{v}</div>)}
                    </div>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value='links'>
                {!result.links?.length ? <p className='text-sm text-muted-foreground'>{t('tools.email.noLinks')}</p> : (
                  <div className='flex flex-col gap-1.5'>
                    {result.links.map((l: any, i: number) => (
                      <div key={i} className='rounded bg-muted/50 px-3 py-2 text-xs font-mono break-all'>
                        {typeof l === 'string' ? l : l.href || l.url || JSON.stringify(l)}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value='adjuntos'>
                {!result.attachments?.length ? <p className='text-sm text-muted-foreground'>{t('tools.email.noAttachments')}</p> : (
                  <div className='flex flex-col gap-2'>
                    {result.attachments.map((a: any, i: number) => (
                      <div key={i} className='rounded-lg border px-3 py-2 text-sm'>
                        <div className='font-medium'>{a.filename || a.name || t('tools.email.noName')}</div>
                        <div className='text-xs text-muted-foreground mt-0.5'>{a.contentType || a.type || '—'} · {a.size ? `${(a.size / 1024).toFixed(1)} KB` : '—'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value='reglas'>
                {result.rules && Object.keys(result.rules).length > 0 ? (
                  <div className='space-y-3'>
                    {[['Microsoft 365 (Transport Rule)', 'm365'], ['FortiMail', 'fortimail'], ['Proofpoint', 'proofpoint'], ['Mimecast', 'mimecast']].map(([label, key]) => {
                      const code = result.rules[key]
                      if (!code) return null
                      return (
                        <div key={key} className='rounded-lg border bg-muted/30 p-3'>
                          <div className='text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2'>{label}</div>
                          <pre className='text-xs font-mono whitespace-pre-wrap break-all'>{code}</pre>
                        </div>
                      )
                    })}
                  </div>
                ) : <p className='text-sm text-muted-foreground'>{t('tools.email.noRules')}</p>}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}

      <div>
        <h2 className='text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3'>{t('tools.email.historyTitle')}</h2>
        {histLoading ? (
          <div className='flex items-center gap-2 text-sm text-muted-foreground'><Loader2 className='h-3.5 w-3.5 animate-spin' /> {t('common.loading')}</div>
        ) : history.length === 0 ? (
          <p className='text-sm text-muted-foreground'>{t('tools.email.noHistory')}</p>
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
                      {[t('tools.email.col.date'), t('tools.email.col.subject'), t('tools.email.col.from'), t('tools.email.col.score'), t('tools.email.col.verdict'), ''].map(h => (
                        <th key={h} className='px-3 py-2 text-left font-semibold text-muted-foreground border-b'>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map(h => (
                      <tr key={h.id} className='border-b last:border-0 hover:bg-muted/20 cursor-pointer' onClick={() => loadFromHistory(h.id)}>
                        <td className='px-3 py-2 text-muted-foreground whitespace-nowrap'>{new Date(h.ts).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                        <td className='px-3 py-2 max-w-[200px] truncate'>{h.subject || '—'}</td>
                        <td className='px-3 py-2 max-w-[160px] truncate text-muted-foreground'>{h.email_from || '—'}</td>
                        <td className='px-3 py-2 font-bold tabular-nums' style={{ color: scoreColor(h.threat_score) }}>{h.threat_score}</td>
                        <td className='px-3 py-2'><span className={cn('text-[10px] font-bold', h.verdict === 'MALICIOUS' ? 'text-destructive' : h.verdict === 'SUSPICIOUS' ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-500')}>{h.verdict}</span></td>
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
