/**
 * Sincronización del inventario con otro sistema AllSafe. Canónico (utiles/activos/ui).
 *
 * Dos lados: "Compartir" emite tokens de solo lectura para que otro sistema traiga este inventario;
 * "Traer" guarda la dirección y el token de otro sistema y sincroniza cada 6 horas o a pedido.
 */
import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Copy, KeyRound, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { type Fetcher, fechaHora } from './tipos'

interface Conector { id: string; nombre: string; creado_por: string | null; ultimo_uso: string | null; activo: number; created_at: string }
interface Config {
  url: string; habilitada: number; ultimo_intento: string | null; ultimo_ok: string | null
  resultado: { ok: boolean; error?: string; resumen?: Record<string, number>; sistema?: string } | null
}

export function DialogoSincronizacion({ abierto, onClose, fetcher, q, sistema }: {
  abierto: boolean; onClose: () => void; fetcher: Fetcher; q: (p: string) => string; sistema: string
}) {
  const qc = useQueryClient()
  const otro = sistema === 'Skuld' ? 'Gjallarhorn' : 'Skuld'
  const { data: conectores = [], refetch: recargarConectores } = useQuery<Conector[]>({
    queryKey: ['inventario', 'conectores'], queryFn: () => fetcher(q('/inventario/conectores')), enabled: abierto,
  })
  const { data: cfg, refetch: recargarCfg } = useQuery<Config | null>({
    queryKey: ['inventario', 'sincronizacion'], queryFn: () => fetcher(q('/inventario/sincronizacion')), enabled: abierto,
  })
  const [nombre, setNombre] = useState(otro)
  const [tokenNuevo, setTokenNuevo] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  useEffect(() => { if (abierto) { setTokenNuevo(null); setUrl(cfg?.url || ''); setToken('') } }, [abierto, cfg?.url])

  async function emitir() {
    try {
      const r = await fetcher<{ token: string }>(q('/inventario/conectores'), { method: 'POST', body: JSON.stringify({ nombre }) })
      setTokenNuevo(r.token); recargarConectores()
    } catch (e) { toast.error((e as Error).message) }
  }
  async function revocar(id: string) {
    if (!window.confirm('Revocar este conector? El sistema que lo usa deja de poder traer el inventario.')) return
    try { await fetcher(q(`/inventario/conectores/${id}`), { method: 'DELETE' }); recargarConectores() }
    catch (e) { toast.error((e as Error).message) }
  }
  async function guardar() {
    try {
      await fetcher(q('/inventario/sincronizacion'), { method: 'PUT', body: JSON.stringify({ url, token }) })
      toast.success('Conexión guardada'); setToken(''); recargarCfg()
    } catch (e) { toast.error((e as Error).message) }
  }
  async function sincronizar() {
    setTrabajando(true)
    try {
      const r = await fetcher<{ resumen: Record<string, number> }>(q('/inventario/sincronizacion/ahora'), { method: 'POST' })
      toast.success(`Sincronizado: ${r.resumen.nuevo || 0} nuevos, ${(r.resumen.vinculado || 0) + (r.resumen.actualizado || 0)} actualizados`)
      qc.invalidateQueries({ queryKey: ['inventario'] })
    } catch (e) { toast.error((e as Error).message) } finally { setTrabajando(false); recargarCfg() }
  }
  async function desconectar() {
    if (!window.confirm('Quitar la conexión? Lo que ya se trajo queda en el inventario.')) return
    try { await fetcher(q('/inventario/sincronizacion'), { method: 'PUT', body: JSON.stringify({ borrar: true }) }); recargarCfg(); setUrl('') }
    catch (e) { toast.error((e as Error).message) }
  }

  const activos = conectores.filter((c) => c.activo)
  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>Conectar con {otro}</DialogTitle>
          <DialogDescription>
            Opcional. Cada sistema funciona solo; conectados, el inventario de uno alimenta al otro sin duplicar y sin pisar lo que cargó una persona.
          </DialogDescription>
        </DialogHeader>

        <section className='space-y-2'>
          <h4 className='font-semibold'>Traer el inventario de {otro}</h4>
          <p className='text-muted-foreground text-sm'>
            {sistema === 'Skuld'
              ? 'Lo que Gjallarhorn descubrió y monitorea (incluido lo que trae de Zabbix, GLPI y Huginn) llega acá como verificado en la red, con sus vencimientos.'
              : 'Lo declarado en Skuld llega acá como contexto del monitoreo.'}
            {' '}Se sincroniza cada 6 horas.
          </p>
          <div className='grid gap-2 sm:grid-cols-2'>
            <div className='space-y-1'><Label className='text-xs'>Dirección de {otro}</Label><Input placeholder={`https://${otro.toLowerCase()}.ejemplo.com`} value={url} onChange={(e) => setUrl(e.target.value)} /></div>
            <div className='space-y-1'><Label className='text-xs'>Token del conector {cfg ? '(vacío = mantener)' : ''}</Label><Input type='password' value={token} onChange={(e) => setToken(e.target.value)} /></div>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button size='sm' onClick={guardar} disabled={!url || (!cfg && !token)}>Guardar conexión</Button>
            {cfg ? <Button size='sm' variant='outline' onClick={sincronizar} disabled={trabajando}>{trabajando ? <Loader2 className='mr-1 size-4 animate-spin' /> : <RefreshCw className='mr-1 size-4' />}Sincronizar ahora</Button> : null}
            {cfg ? <Button size='sm' variant='ghost' onClick={desconectar}>Quitar conexión</Button> : null}
          </div>
          {cfg ? (
            <p className='text-xs'>
              {cfg.resultado?.ok
                ? <span className='text-emerald-700 dark:text-emerald-400'>Última sincronización: {fechaHora(cfg.ultimo_ok)} · {cfg.resultado.resumen?.recibidos ?? 0} activos recibidos</span>
                : cfg.resultado?.error ? <span className='text-red-600 dark:text-red-400'>Último intento ({fechaHora(cfg.ultimo_intento)}): {cfg.resultado.error}</span>
                : <span className='text-muted-foreground'>Todavía no se sincronizó.</span>}
            </p>
          ) : null}
        </section>

        <section className='space-y-2 border-t pt-4'>
          <h4 className='font-semibold'>Compartir este inventario</h4>
          <p className='text-muted-foreground text-sm'>Emití un token y pegalo en {otro}. Es de solo lectura y vale para esta organización; se puede revocar cuando quieras.</p>
          <div className='flex gap-2'>
            <Input className='max-w-xs' value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder='Para qué es' />
            <Button size='sm' variant='outline' onClick={emitir}><KeyRound className='mr-1 size-4' />Emitir token</Button>
          </div>
          {tokenNuevo ? (
            <div className='rounded-md border border-yellow-500/40 bg-yellow-500/5 p-3 text-sm'>
              <p className='mb-1 font-medium'>Copialo ahora: no se vuelve a mostrar.</p>
              <div className='flex items-center gap-2'>
                <code className='bg-muted flex-1 truncate rounded px-2 py-1 text-xs'>{tokenNuevo}</code>
                <Button size='sm' variant='ghost' onClick={() => { navigator.clipboard?.writeText(tokenNuevo); toast.success('Copiado') }}><Copy className='size-4' /></Button>
              </div>
            </div>
          ) : null}
          {activos.length ? (
            <div className='space-y-1'>
              {activos.map((c) => (
                <div key={c.id} className='flex items-center gap-2 rounded border px-3 py-1.5 text-sm'>
                  <KeyRound className='text-muted-foreground size-4' />
                  <span className='flex-1'>{c.nombre}</span>
                  <Badge variant='outline'>{c.ultimo_uso ? `usado ${fechaHora(c.ultimo_uso)}` : 'sin usar'}</Badge>
                  <Button size='sm' variant='ghost' onClick={() => revocar(c.id)}><Trash2 className='size-4' /></Button>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </DialogContent>
    </Dialog>
  )
}
