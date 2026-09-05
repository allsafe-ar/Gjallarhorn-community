import { useState, useEffect, useRef } from 'react'
import { Loader2, Send, ShieldAlert, ServerCog, Upload, FolderPlus } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const TOKEN_KEY = 'gjallarhorn_token'

type Motor = {
  id: string; nombre: string; tipo: string
  publica: boolean; archivos: boolean; urls: boolean
  configurado: boolean; habilitado: boolean; destino: string | null
}

export type Resultado = {
  estado: 'pendiente' | 'corriendo' | 'listo' | 'error'
  error?: string
  verdicto?: string; puntaje?: number; familia?: string | null
  comportamientos?: { nombre?: string; descripcion?: string; severidad?: number }[]
  red?: { tipo: string; valor: string }[]
  procesos?: { pid?: number; nombre?: string; comando?: string }[]
  archivos?: { nombre?: string; sha256?: string; tipo?: string }[]
  capturas?: string[]
  urlReporte?: string | null
  // Identificación de la detonación y del caso que se haya abierto a partir de ella.
  id?: string
  target?: string
  internal_case_id?: string | null
  internal_case_title?: string | null
}

function colorPuntaje(s = 0) {
  if (s >= 70) return '#ef4444'
  if (s >= 40) return '#f59e0b'
  return '#22c55e'
}

export function SandboxPanel({ file, fileAnalysisId, standalone, onDone }: { file: File | null; fileAnalysisId?: string; standalone?: boolean; onDone?: () => void }) {
  const { t } = useTranslation()
  const [motores, setMotores] = useState<Motor[]>([])
  const [elegido, setElegido] = useState<string>('')
  const [enviando, setEnviando] = useState(false)
  const [envioId, setEnvioId] = useState<string | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [archivoLocal, setArchivoLocal] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const muestra = file || archivoLocal
  const motor = motores.find(m => m.id === elegido) || null

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    fetch('/api/sandbox/engines', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        const lista: Motor[] = d.engines || []
        setMotores(lista)
        // Se preselecciona un motor propio antes que uno de nube: si hay que elegir
        // por el analista, se elige el que no saca la muestra de la red.
        const propio = lista.find(m => m.habilitado && !m.publica)
        const cualquiera = lista.find(m => m.habilitado)
        setElegido((propio || cualquiera)?.id || '')
      })
      .catch(() => setMotores([]))
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [])

  async function consultar(id: string) {
    try {
      const token = localStorage.getItem(TOKEN_KEY)
      const r = await fetch(`/api/sandbox/result/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      const d: Resultado = await r.json()
      setResultado(d)
      if (d.estado === 'pendiente' || d.estado === 'corriendo') {
        timer.current = setTimeout(() => consultar(id), 4000)
      } else if (onDone) {
        onDone()
      }
    } catch {
      timer.current = setTimeout(() => consultar(id), 8000)
    }
  }

  async function enviar() {
    const usaUrl = standalone && url.trim() && !muestra
    if ((!muestra && !usaUrl) || !motor) return
    setEnviando(true); setResultado(null); setEnvioId(null)
    try {
      const token = localStorage.getItem(TOKEN_KEY)
      const fd = new FormData()
      fd.append('engine', motor.id)
      fd.append('origen', 'subida')
      if (usaUrl) fd.append('url', url.trim())
      else fd.append('file', muestra as File)
      if (fileAnalysisId) fd.append('file_analysis_id', fileAnalysisId)
      const r = await fetch('/api/sandbox/submit', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setEnvioId(d.id)
      setResultado({ estado: 'pendiente' })
      consultar(d.id)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setEnviando(false)
    }
  }

  if (!motores.some(m => m.habilitado)) {
    return (
      <div className='rounded-lg border border-dashed p-6 text-center'>
        <ServerCog className='h-8 w-8 mx-auto mb-2 text-muted-foreground' />
        <p className='text-sm text-muted-foreground'>{t('tools.sandbox.noEngines')}</p>
      </div>
    )
  }

  return (
    <div className='space-y-4'>
      {/* Selector de motor */}
      <div className='flex flex-wrap items-center gap-3'>
        <Select value={elegido} onValueChange={setElegido}>
          <SelectTrigger className='w-[260px]'>
            <SelectValue placeholder={t('tools.sandbox.pickEngine')} />
          </SelectTrigger>
          <SelectContent>
            {motores.map(m => (
              <SelectItem key={m.id} value={m.id} disabled={!m.habilitado}>
                {m.nombre} · {m.tipo}{!m.configurado ? ` - ${t('tools.sandbox.notConfigured')}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!file && (
          <>
            <input ref={inputRef} type='file' className='hidden'
              onChange={e => setArchivoLocal(e.target.files?.[0] || null)} />
            <Button variant='outline' size='sm' onClick={() => inputRef.current?.click()}>
              <Upload className='h-3.5 w-3.5 mr-1' />
              {archivoLocal ? archivoLocal.name.slice(0, 32) : t('tools.sandbox.pickFile')}
            </Button>
          </>
        )}

        <Button size='sm' onClick={enviar} disabled={(!muestra && !(standalone && url.trim())) || !motor?.habilitado || enviando}>
          {enviando ? <Loader2 className='h-3.5 w-3.5 animate-spin mr-1' /> : <Send className='h-3.5 w-3.5 mr-1' />}
          {t('tools.sandbox.submit')}
        </Button>
      </div>

      {standalone && !muestra && motor?.urls && (
        <input
          className='w-full rounded-md border bg-transparent px-3 py-2 text-sm'
          placeholder={t('tools.sandbox.urlPlaceholder')}
          value={url}
          onChange={e => setUrl(e.target.value)}
        />
      )}

      {/* A dónde viaja la muestra. Va SIEMPRE, no solo cuando el motor publica:
          saber que el archivo no sale de la red vale tanto como el aviso inverso. */}
      {motor && (
        <div className={cn('rounded-lg border px-3 py-2 text-xs',
          motor.publica
            ? 'border-amber-500/50 bg-amber-500/10 text-amber-200'
            : 'border-sky-500/40 bg-sky-500/10 text-sky-200')}>
          {motor.publica && <ShieldAlert className='h-3.5 w-3.5 inline mr-1 -mt-0.5' />}
          <span className='font-semibold'>
            {motor.publica ? t('tools.sandbox.warnPublic') : t('tools.sandbox.warnPrivate')}
          </span>
          <span className='ml-1'>
            {t('tools.sandbox.destination', { engine: motor.nombre, host: motor.destino || '-' })}
          </span>
          {motor.publica && <div className='mt-1 opacity-90'>{t('tools.sandbox.warnPublicDetail')}</div>}
        </div>
      )}

      {!muestra && <p className='text-xs text-muted-foreground'>{t('tools.sandbox.needFile')}</p>}

      {/* Estado y resultado */}
      {resultado && resultado.estado !== 'listo' && resultado.estado !== 'error' && (
        <div className='rounded-lg border p-4 flex items-center gap-3'>
          <Loader2 className='h-4 w-4 animate-spin text-muted-foreground' />
          <span className='text-sm text-muted-foreground'>
            {resultado.estado === 'pendiente' ? t('tools.sandbox.queued') : t('tools.sandbox.running')}
          </span>
          {envioId && <span className='font-mono text-[11px] text-muted-foreground ml-auto'>{envioId.slice(0, 8)}</span>}
        </div>
      )}

      {resultado?.estado === 'error' && (
        <div className='rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200'>
          {resultado.error}
        </div>
      )}

      {resultado?.estado === 'listo' && (
        <ResultadoSandbox resultado={resultado} destino={motor?.destino} />
      )}
    </div>
  )
}

// Detalle completo de un análisis, reutilizable en el panel y en el historial.
export function ResultadoSandbox({ resultado, destino }: { resultado: Resultado; destino?: string | null }) {
  const { t } = useTranslation()
  const [casoInterno, setCasoInterno] = useState<string | null>(resultado.internal_case_id ?? null)
  const [creandoInterno, setCreandoInterno] = useState(false)

  useEffect(() => { setCasoInterno(resultado.internal_case_id ?? null) }, [resultado.internal_case_id])

  async function crearCasoInterno() {
    if (!resultado.id) return
    setCreandoInterno(true)
    try {
      const d = await apiFetch<{ id: string }>(`/sandbox/${resultado.id}/create-case`, { method: 'POST' })
      setCasoInterno(d.id)
      toast.success(t('tools.sandbox.caseCreated', 'Caso creado'))
    } catch (e: any) { toast.error(e.message) }
    finally { setCreandoInterno(false) }
  }

  return (
    <div className='space-y-4'>
      {resultado.verdicto === 'UNANALYZED' && (
        <div className='rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200'>
          {t('tools.sandbox.unanalyzedWarn')}
        </div>
      )}
      <div className='rounded-lg border p-4 flex flex-wrap items-center gap-4'>
        <div>
          <div className='text-3xl font-bold' style={{ color: resultado.verdicto === 'UNANALYZED' ? '#9ca3af' : colorPuntaje(resultado.puntaje) }}>
            {resultado.verdicto === 'UNANALYZED' ? '—' : (resultado.puntaje ?? 0)}
          </div>
          <div className='text-[11px] text-muted-foreground'>{t('tools.sandbox.score')}</div>
        </div>
        <Badge variant={resultado.verdicto === 'MALICIOUS' ? 'destructive' : 'outline'}
          className={resultado.verdicto === 'UNANALYZED' ? 'border-amber-500/50 text-amber-700 dark:text-amber-400' : undefined}>
          {resultado.verdicto === 'UNANALYZED' ? t('tools.sandbox.unanalyzed') : resultado.verdicto}
        </Badge>
        {resultado.familia && <Badge variant='outline'>{t('tools.sandbox.family')}: {resultado.familia}</Badge>}
        {resultado.urlReporte && (
          <a className='ml-auto text-xs text-primary hover:underline'
             href={resultado.urlReporte.startsWith('http') ? resultado.urlReporte : `//${destino}${resultado.urlReporte}`}
             target='_blank' rel='noreferrer'>
            {t('tools.sandbox.fullReport')}
          </a>
        )}
      </div>

      {resultado.id && resultado.verdicto !== 'UNANALYZED' && (
        <div className='flex flex-wrap items-center gap-2'>
          <Button size='sm' variant={casoInterno ? 'outline' : 'destructive'}
            disabled={!!casoInterno || creandoInterno} onClick={crearCasoInterno}>
            {creandoInterno
              ? <Loader2 className='h-3.5 w-3.5 animate-spin' />
              : <><FolderPlus className='h-3.5 w-3.5 mr-1.5' />{casoInterno ? t('tools.sandbox.existingCase', 'Caso ya abierto') : t('tools.sandbox.createCase', 'Abrir caso')}</>}
          </Button>
          {casoInterno && resultado.internal_case_title && (
            <span className='text-[11px] text-muted-foreground'>{resultado.internal_case_title}</span>
          )}
        </div>
      )}

      <Seccion titulo={t('tools.sandbox.behaviors')} vacio={!resultado.comportamientos?.length}>
        {resultado.comportamientos?.map((c, i) => (
          <div key={i} className='py-1.5 border-b border-border/40 last:border-0'>
            <span className='font-medium text-sm'>{c.nombre}</span>
            {c.descripcion && <span className='text-xs text-muted-foreground ml-2'>{c.descripcion}</span>}
          </div>
        ))}
      </Seccion>

      <Seccion titulo={t('tools.sandbox.network')} vacio={!resultado.red?.length}>
        {resultado.red?.map((r, i) => (
          <div key={i} className='py-1 flex gap-2 items-center'>
            <Badge variant='outline' className='text-[10px]'>{r.tipo}</Badge>
            <span className='font-mono text-xs break-all'>{r.valor}</span>
          </div>
        ))}
      </Seccion>

      <Seccion titulo={t('tools.sandbox.processes')} vacio={!resultado.procesos?.length}>
        {resultado.procesos?.map((p, i) => (
          <div key={i} className='py-1 font-mono text-xs break-all'>
            <span className='text-muted-foreground mr-2'>{p.pid}</span>{p.comando || p.nombre}
          </div>
        ))}
      </Seccion>

      <Seccion titulo={t('tools.sandbox.dropped')} vacio={!resultado.archivos?.length}>
        {resultado.archivos?.map((a, i) => (
          <div key={i} className='py-1 text-xs'>
            <span className='font-medium'>{a.nombre}</span>
            {a.tipo && <span className='text-muted-foreground ml-2'>{a.tipo}</span>}
            {a.sha256 && <div className='font-mono text-[10px] text-muted-foreground break-all'>{a.sha256}</div>}
          </div>
        ))}
      </Seccion>
    </div>
  )
}

function Seccion({ titulo, vacio, children }: { titulo: string; vacio: boolean; children: React.ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className='rounded-lg border p-3'>
      <div className='text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2'>{titulo}</div>
      {vacio ? <p className='text-xs text-muted-foreground'>{t('tools.sandbox.nothing')}</p> : children}
    </div>
  )
}
