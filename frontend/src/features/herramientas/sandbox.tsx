import { useState, useEffect, useCallback } from 'react'
import { Boxes, RefreshCw, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useTranslation } from 'react-i18next'
import { SandboxPanel, ResultadoSandbox, type Resultado } from './sandbox-panel'
import { useAuthStore } from '@/stores/auth-store'
import { HelpTip } from '@/components/help-tip'

const TOKEN_KEY = 'gjallarhorn_token'

type HistItem = {
  id: string; ts: string; engine: string; kind: string; origin: string
  target: string; status: string; verdict?: string; score?: number; family?: string; analyst?: string
}

function colorVerdict(v?: string) {
  if (v === 'MALICIOUS') return 'text-red-400'
  if (v === 'SUSPICIOUS') return 'text-amber-400'
  if (v === 'CLEAN') return 'text-emerald-400'
  if (v === 'UNANALYZED') return 'text-amber-400/80'
  return 'text-muted-foreground'
}

function labelVerdict(v?: string, unan?: string) {
  return v === 'UNANALYZED' ? unan : (v || '-')
}

// Color por motor, para que el badge se distinga de un vistazo.
const ENGINE_COLOR: Record<string, string> = {
  cape: '#06b6d4', cuckoo: '#84cc16', triage: '#a855f7',
}

export function SandboxView() {
  const { t } = useTranslation()
  const { auth } = useAuthStore()
  const role = auth.user?.role
  const avanzado = role === 'admin'
  const [hist, setHist] = useState<HistItem[]>([])
  const [loading, setLoading] = useState(true)

  // Detalle abierto en modal
  const [abierto, setAbierto] = useState<HistItem | null>(null)
  const [detalle, setDetalle] = useState<Resultado | null>(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)

  const cargarHistorial = useCallback(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    setLoading(true)
    fetch('/api/sandbox/history?limit=50', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setHist(d.submissions || []))
      .catch(() => setHist([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { cargarHistorial() }, [cargarHistorial])

  const abrirDetalle = useCallback((item: HistItem) => {
    setAbierto(item)
    setDetalle(null)
    setCargandoDetalle(true)
    const token = localStorage.getItem(TOKEN_KEY)
    fetch(`/api/sandbox/result/${item.id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((d: Resultado) => setDetalle(d))
      .catch(() => setDetalle(null))
      .finally(() => setCargandoDetalle(false))
  }, [])

  if (!avanzado) {
    return (
      <div className='p-8'>
        <div className='rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground'>
          {t('tools.sandbox.forbidden')}
        </div>
      </div>
    )
  }

  return (
    <div className='p-8'>
      <div className='flex items-center gap-2 mb-1'>
        <Boxes className='h-6 w-6 text-primary' />
        <h1 className='text-2xl font-bold'>{t('tools.sandbox.title')}</h1>
        <HelpTip
          title={t('help.sandbox.title')}
          description={t('help.sandbox.desc')}
          tips={t('help.sandbox.tips', { returnObjects: true }) as string[]}
        />
      </div>
      <p className='text-sm text-muted-foreground mb-6'>{t('tools.sandbox.desc')}</p>

      {/* Envío: archivo o URL, elección de motor, resultado */}
      <div className='rounded-lg border p-5 mb-8'>
        <SandboxPanel file={null} standalone onDone={cargarHistorial} />
      </div>

      {/* Historial */}
      <div className='flex items-center justify-between mb-3'>
        <h2 className='text-sm font-semibold uppercase tracking-wide text-muted-foreground'>
          {t('tools.sandbox.history')}
        </h2>
        <button className='text-xs text-muted-foreground hover:text-foreground flex items-center gap-1' onClick={cargarHistorial}>
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> {t('common.refresh')}
        </button>
      </div>

      <div className='rounded-lg border overflow-x-auto'>
        <table className='w-full text-sm'>
          <thead>
            <tr className='border-b text-left text-xs text-muted-foreground'>
              <th className='px-3 py-2 font-medium'>{t('tools.sandbox.col.date')}</th>
              <th className='px-3 py-2 font-medium'>{t('tools.sandbox.col.target')}</th>
              <th className='px-3 py-2 font-medium'>{t('tools.sandbox.col.engine')}</th>
              <th className='px-3 py-2 font-medium'>{t('tools.sandbox.col.verdict')}</th>
              <th className='px-3 py-2 font-medium'>{t('tools.sandbox.col.status')}</th>
            </tr>
          </thead>
          <tbody>
            {hist.length === 0 && (
              <tr><td colSpan={5} className='px-3 py-6 text-center text-muted-foreground text-xs'>
                {loading ? t('common.loading') : t('tools.sandbox.empty')}
              </td></tr>
            )}
            {hist.map(h => {
              const clickable = h.status === 'listo'
              return (
                <tr
                  key={h.id}
                  onClick={() => clickable && abrirDetalle(h)}
                  className={`border-b border-border/40 last:border-0 ${clickable ? 'cursor-pointer hover:bg-muted/40' : ''}`}
                >
                  <td className='px-3 py-2 text-xs text-muted-foreground whitespace-nowrap'>{new Date(h.ts).toLocaleString()}</td>
                  <td className='px-3 py-2 font-mono text-xs break-all max-w-[280px]'>{h.target}</td>
                  <td className='px-3 py-2'>
                    <span
                      className='text-xs font-semibold rounded px-2 py-0.5'
                      style={{ background: (ENGINE_COLOR[h.engine] || '#64748b') + '22', color: ENGINE_COLOR[h.engine] || '#94a3b8' }}
                    >{h.engine}</span>
                  </td>
                  <td className={`px-3 py-2 font-medium ${colorVerdict(h.verdict)}`}>
                    {labelVerdict(h.verdict, t('tools.sandbox.unanalyzed'))}{h.score != null && h.status === 'listo' && h.verdict !== 'UNANALYZED' ? ` (${h.score})` : ''}
                  </td>
                  <td className='px-3 py-2 text-xs text-muted-foreground'>{h.status}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Detalle del análisis */}
      <Dialog open={!!abierto} onOpenChange={o => { if (!o) { setAbierto(null); setDetalle(null) } }}>
        <DialogContent className='max-w-2xl max-h-[85vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle className='font-mono text-sm break-all'>{abierto?.target}</DialogTitle>
          </DialogHeader>
          {cargandoDetalle && (
            <div className='flex items-center gap-2 py-8 justify-center text-muted-foreground text-sm'>
              <Loader2 className='h-4 w-4 animate-spin' /> {t('common.loading')}
            </div>
          )}
          {!cargandoDetalle && detalle?.estado === 'listo' && (
            <ResultadoSandbox resultado={detalle} />
          )}
          {!cargandoDetalle && detalle && detalle.estado !== 'listo' && (
            <p className='text-sm text-muted-foreground py-6'>{detalle.error || t('tools.sandbox.detailUnavailable')}</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
