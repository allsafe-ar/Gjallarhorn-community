import { useState, useEffect, useRef } from 'react'
import { Upload, Loader2, Copy, Check, FileSearch } from 'lucide-react'
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

type FileResult = {
  id: string; filename: string; fileSize: number; fileType: string
  hashes: { md5: string; sha1: string; sha256: string }
  score: number; verdict: string; thehive_case_id?: string; internal_case_id?: string
  analysis?: {
    entropy?: number; peInfo?: any; strings?: string[]
    iocs?: Record<string, string[]>; scriptInfo?: any
    ransomware?: { detected: boolean }; csBeacon?: { detected: boolean }
    c2Frameworks?: string[]
  }
}
type HistEntry = { id: string; ts: string; filename: string; threat_score: number; verdict: string; analyst: string }

function scoreColor(s: number) {
  if (s >= 70) return '#ef4444'
  if (s >= 40) return '#f59e0b'
  if (s > 0) return '#22c55e'
  return '#6b7280'
}

function fmtSize(b: number) {
  return b > 1024 * 1024 ? (b / 1024 / 1024).toFixed(2) + ' MB'
    : b > 1024 ? (b / 1024).toFixed(1) + ' KB'
    : b + ' B'
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

export function ArchivosView() {
  const { t } = useTranslation()
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<FileResult | null>(null)
  const [history, setHistory] = useState<HistEntry[]>([])
  const [histLoading, setHistLoading] = useState(true)
  const [tab, setTab] = useState('resumen')
  const [creatingCase, setCreatingCase] = useState(false)
  const [creatingInternal, setCreatingInt] = useState(false)
  const [copied, setCopied] = useState(false)
  const [histPage, setHistPage] = useState(1)
  const [histPageSize, setHistPageSize] = useState(10)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    apiFetch<{ analyses: HistEntry[] }>('/files/history?limit=200')
      .then(d => setHistory(d.analyses || []))
      .catch(() => {})
      .finally(() => setHistLoading(false))
  }, [])

  async function uploadFile(file: File) {
    if (!file) return
    if (file.size > 20 * 1024 * 1024) { toast.error(t('tools.files.tooLarge')); return }
    setUploading(true); setResult(null); setTab('resumen')
    try {
      const token = localStorage.getItem(TOKEN_KEY)
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/files/analyze', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setResult(data)
      setHistory(h => [{ id: data.id, ts: new Date().toISOString(), filename: data.filename, threat_score: data.score, verdict: data.verdict, analyst: '' }, ...h.slice(0, 49)])
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
      const d = await apiFetch<{ id: string }>('/cases', {
        method: 'POST',
        body: JSON.stringify({ title: `Archivo: ${result.filename}`, severity: result.score >= 70 ? 'high' : result.score >= 40 ? 'medium' : 'low', analysisType: 'file', analysisId: result.id }),
      })
      toast.success(t('tools.files.caseCreated'))
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
      const d = await apiFetch<{ caseId: string }>(`/files/${result.id}/create-case`, { method: 'POST', body: JSON.stringify({}) })
      toast.success(`TheHive Case #${d.caseId}`)
      setResult(r => r ? { ...r, thehive_case_id: d.caseId } : r)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setCreatingCase(false)
    }
  }

  async function loadFromHistory(id: string) {
    try {
      const d = await apiFetch<any>(`/files/${id}`)
      const ad = typeof d.analysis_data === 'string' ? JSON.parse(d.analysis_data) : (d.analysis_data || {})
      setResult({
        id: d.id,
        filename: d.filename,
        fileSize: d.file_size,
        fileType: d.file_type,
        hashes: { md5: d.md5, sha1: d.sha1, sha256: d.sha256 },
        score: d.threat_score,
        verdict: d.verdict,
        analysis: ad,
        thehive_case_id: d.thehive_case_id,
      })
      setTab('resumen')
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const analysis = result?.analysis || {}
  const iocCount = Object.values(analysis.iocs || {}).flat().length

  const tabs = [
    { id: 'resumen', label: t('tools.files.tab.summary') },
    { id: 'iocs', label: `${t('tools.files.tab.iocs')}${iocCount ? ` (${iocCount})` : ''}` },
    { id: 'strings', label: `${t('tools.files.tab.strings')}${analysis.strings?.length ? ` (${analysis.strings.length})` : ''}` },
    ...(analysis.peInfo ? [{ id: 'pe', label: t('tools.files.tab.pe') }] : []),
    ...(analysis.scriptInfo ? [{ id: 'script', label: t('tools.files.tab.script') }] : []),
    { id: 'ti', label: t('tools.files.tab.threatintel') },
  ]

  return (
    <div className='p-8'>
      <div className='flex items-center gap-2 mb-1'>
        <h1 className='text-2xl font-bold'>{t('tools.files.title')}</h1>
        <HelpTip title={t('help.files.title')} description={t('help.files.desc')} tips={t('help.files.tips', { returnObjects: true }) as string[]} />
      </div>
      <p className='text-sm text-muted-foreground mb-6'>{t('tools.files.desc')}</p>

      <div
        className={cn(
          'rounded-xl border-2 border-dashed px-8 py-12 text-center cursor-pointer transition-colors mb-8',
          dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'
        )}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0]) uploadFile(e.dataTransfer.files[0]) }}
        onClick={() => fileInputRef.current?.click()}
      >
        <input ref={fileInputRef} type='file' className='hidden' onChange={e => { if (e.target.files?.[0]) uploadFile(e.target.files[0]); e.target.value = '' }} />
        {uploading ? (
          <div className='flex items-center justify-center gap-3 text-muted-foreground'>
            <Loader2 className='h-5 w-5 animate-spin' />
            <span className='text-sm'>{t('tools.files.analyzing')}</span>
          </div>
        ) : (
          <>
            <Upload className='h-10 w-10 text-muted-foreground mx-auto mb-3' />
            <p className='text-sm font-medium'>{t('tools.files.dropzone')}</p>
            <p className='text-xs text-muted-foreground mt-1'>{t('tools.files.formats')}</p>
          </>
        )}
      </div>

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
                  <Badge variant={result.verdict === 'MALICIOUS' ? 'destructive' : result.verdict === 'SUSPICIOUS' ? 'outline' : 'default'} className='font-bold'>
                    {result.verdict}
                  </Badge>
                  <Badge variant='secondary'>{result.fileType}</Badge>
                  {analysis.peInfo?.isPacked && <Badge variant='destructive'>PACKED</Badge>}
                  {analysis.ransomware?.detected && <Badge variant='destructive'>RANSOMWARE</Badge>}
                  {analysis.csBeacon?.detected && <Badge variant='destructive'>CS BEACON</Badge>}
                  {analysis.c2Frameworks && analysis.c2Frameworks.length > 0 && <Badge variant='destructive'>C2: {analysis.c2Frameworks[0]}</Badge>}
                  {result.thehive_case_id && <Badge variant='outline'>TH #{result.thehive_case_id}</Badge>}
                </div>
                <div className='font-mono text-sm mb-1 truncate'>{result.filename}</div>
                <div className='text-xs text-muted-foreground flex gap-4 flex-wrap'>
                  <span>{fmtSize(result.fileSize)}</span>
                  <span>{t('tools.files.info.entropy')}: <span className={cn(analysis.entropy && analysis.entropy >= 7 ? 'text-destructive' : analysis.entropy && analysis.entropy >= 5 ? 'text-amber-400' : '')}>{analysis.entropy ?? '—'}</span></span>
                  {analysis.peInfo?.arch && <span>Arch: {analysis.peInfo.arch}</span>}
                </div>
              </div>
              <div className='flex gap-2 flex-wrap shrink-0'>
                <Button size='sm' variant={result.internal_case_id ? 'outline' : 'destructive'} disabled={!!result.internal_case_id || creatingInternal} onClick={createInternalCase}>
                  {creatingInternal ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : result.internal_case_id ? t('tools.ioc.existingCase') : t('tools.ioc.createCase')}
                </Button>
                <Button size='sm' variant='outline' disabled={creatingCase} onClick={createHiveCase}>
                  {creatingCase ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : 'TheHive'}
                </Button>
                <Button size='sm' variant='ghost' onClick={() => downloadReport('file', result.id, 'html').catch(e => toast.error(e.message))}>HTML</Button>
                <Button size='sm' variant='ghost' onClick={() => downloadReport('file', result.id, 'json').catch(e => toast.error(e.message))}>JSON</Button>
                <Button size='sm' variant='ghost' onClick={() => downloadReport('file', result.id, 'mitre').catch(e => toast.error(e.message))}>MITRE Layer</Button>
              </div>
            </div>
          </div>

          <div className='rounded-lg border bg-card px-4 py-3 mb-4'>
            <div className='text-xs font-semibold text-muted-foreground mb-2'>{t('tools.files.hashes')}</div>
            {[['MD5', result.hashes?.md5], ['SHA-1', result.hashes?.sha1], ['SHA-256', result.hashes?.sha256]].map(([label, val]) => (
              <div key={label} className='flex items-center gap-3 mb-1.5'>
                <span className='text-[11px] text-muted-foreground w-12 shrink-0'>{label}</span>
                <span className='font-mono text-xs flex-1 break-all'>{val || '—'}</span>
                {val && (
                  <button className='text-[11px] text-muted-foreground hover:text-foreground px-1' onClick={() => navigator.clipboard.writeText(val)}>
                    <Copy className='h-3 w-3' />
                  </button>
                )}
              </div>
            ))}
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className='mb-4 flex-wrap'>
              {tabs.map(t => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}
            </TabsList>

            <TabsContent value='resumen'>
              <div className='grid grid-cols-2 gap-3'>
                {[
                  [t('tools.files.info.name'), result.filename],
                  [t('tools.files.info.type'), result.fileType],
                  [t('tools.files.info.size'), fmtSize(result.fileSize)],
                  [t('tools.files.info.entropy'), String(analysis.entropy ?? '—')],
                ].map(([k, v]) => (
                  <div key={k} className='rounded bg-muted/50 px-3 py-2'>
                    <div className='text-[10px] text-muted-foreground mb-1'>{k}</div>
                    <div className='text-sm font-medium truncate'>{v}</div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value='iocs'>
              {Object.entries(analysis.iocs || {}).length === 0
                ? <p className='text-sm text-muted-foreground'>{t('tools.files.noIocs')}</p>
                : Object.entries(analysis.iocs || {}).map(([type, vals]: [string, any]) => (
                  <div key={type} className='mb-4'>
                    <div className='text-xs font-semibold text-muted-foreground uppercase mb-2'>{type}</div>
                    <div className='flex flex-col gap-1'>
                      {(vals as string[]).map((v, i) => (
                        <div key={i} className='font-mono text-xs bg-muted/50 rounded px-3 py-1.5 break-all'>{v}</div>
                      ))}
                    </div>
                  </div>
                ))
              }
            </TabsContent>

            <TabsContent value='strings'>
              <div className='rounded-lg border bg-muted/30 p-3 max-h-96 overflow-auto'>
                {(analysis.strings || []).length === 0
                  ? <p className='text-sm text-muted-foreground'>{t('tools.files.noStrings')}</p>
                  : (analysis.strings || []).map((s: string, i: number) => (
                    <div key={i} className='font-mono text-xs py-0.5 border-b border-border/30 last:border-0 break-all'>{s}</div>
                  ))
                }
              </div>
            </TabsContent>

            {analysis.peInfo && (
              <TabsContent value='pe'>
                <pre className='text-xs font-mono bg-muted/30 rounded p-4 whitespace-pre-wrap break-all'>{JSON.stringify(analysis.peInfo, null, 2)}</pre>
              </TabsContent>
            )}

            {analysis.scriptInfo && (
              <TabsContent value='script'>
                <pre className='text-xs font-mono bg-muted/30 rounded p-4 whitespace-pre-wrap break-all'>{JSON.stringify(analysis.scriptInfo, null, 2)}</pre>
              </TabsContent>
            )}

            <TabsContent value='ti'>
              <p className='text-sm text-muted-foreground'>{t('tools.files.threatIntNote')}</p>
            </TabsContent>
          </Tabs>
        </div>
      )}

      <div>
        <h2 className='text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3'>{t('tools.files.history')}</h2>
        {histLoading ? (
          <div className='flex items-center gap-2 text-sm text-muted-foreground'>
            <Loader2 className='h-3.5 w-3.5 animate-spin' /> {t('common.loading')}
          </div>
        ) : history.length === 0 ? (
          <p className='text-sm text-muted-foreground'>{t('tools.files.noHistory')}</p>
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
                      {[t('tools.files.col.date'), t('tools.files.col.file'), t('tools.files.col.score'), t('tools.files.col.verdict'), ''].map(h => (
                        <th key={h} className='px-3 py-2 text-left font-semibold text-muted-foreground border-b'>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map(h => (
                      <tr key={h.id} className='border-b last:border-0 hover:bg-muted/20 cursor-pointer' onClick={() => loadFromHistory(h.id)}>
                        <td className='px-3 py-2 text-muted-foreground whitespace-nowrap'>{new Date(h.ts).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                        <td className='px-3 py-2 font-mono max-w-[200px] truncate'>{h.filename}</td>
                        <td className='px-3 py-2 font-bold tabular-nums' style={{ color: scoreColor(h.threat_score) }}>{h.threat_score}</td>
                        <td className='px-3 py-2'>
                          <span className={cn('text-[10px] font-bold', h.verdict === 'MALICIOUS' ? 'text-destructive' : h.verdict === 'SUSPICIOUS' ? 'text-amber-400' : 'text-emerald-500')}>{h.verdict}</span>
                        </td>
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
