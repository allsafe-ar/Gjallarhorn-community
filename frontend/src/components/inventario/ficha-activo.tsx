/**
 * Ficha de un activo: datos, vencimientos, entregas, origen del dato e historial. Canónico
 * (utiles/activos/ui), idéntico en Skuld y Gjallarhorn.
 *
 * Cada sistema agrega su capa con `extra`: Gjallarhorn el monitoreo del equipo, Skuld los riesgos
 * que lo afectan. La ficha no sabe nada de eso.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertTriangle, Archive, CalendarClock, History, Loader2, PackageCheck, Plus, RefreshCw, RotateCcw, Save, Trash2, Undo2,
} from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
  type Activo, type Fetcher, type Taxonomia, type Vencimiento, CLASIFICACION, CRITICIDAD, FUENTE, SEMAFORO, VERIFICADAS,
  cuandoVence, dinero, fecha, fechaHora, nombreTipo,
} from './tipos'

interface Props {
  id: string | null
  onClose: () => void
  fetcher: Fetcher
  alcance: string
  tx: Taxonomia | undefined
  puede: { editar: boolean; borrar: boolean; administrar: boolean }
  extra?: (activo: Activo, recargar: () => void) => ReactNode
  extraTitulo?: string
}

const ACCION: Record<string, string> = {
  alta: 'Alta', edicion: 'Edición', estado: 'Cambio de estado', importacion: 'Actualizado por una fuente', fusion: 'Fusión',
  baja: 'Baja', eliminado: 'Eliminado', vencimiento: 'Vencimiento', vencimiento_borrado: 'Vencimiento borrado',
  renovacion: 'Renovación', entrega: 'Entrega', devolucion: 'Devolución',
}

/** Campos de la ficha agrupados como se relevan. */
const SECCIONES: { titulo: string; campos: [string, string, ('texto' | 'numero' | 'fecha' | 'correo' | 'largo')?][] }[] = [
  { titulo: 'Identificación', campos: [['nombre', 'Nombre'], ['alias', 'Cómo lo llaman'], ['numero_inventario', 'N° de inventario'], ['cantidad', 'Cantidad', 'numero'],
    ['fabricante', 'Fabricante'], ['modelo', 'Modelo'], ['serie', 'Número de serie'], ['version', 'Versión']] },
  { titulo: 'Responsables', campos: [['propietario', 'Propietario (responde por el activo)'], ['propietario_correo', 'Correo del propietario', 'correo'],
    ['custodio', 'Custodio (lo opera)'], ['asignado_a', 'Asignado a (lo usa)'], ['area', 'Área'], ['ubicacion', 'Ubicación']] },
  { titulo: 'Técnico', campos: [['ip', 'IP'], ['hostname', 'Hostname'], ['mac', 'MAC'], ['so', 'Sistema operativo'], ['so_version', 'Versión del SO'],
    ['url', 'URL'], ['grupo', 'Grupo']] },
  { titulo: 'Compra', campos: [['proveedor', 'Proveedor'], ['fecha_compra', 'Fecha de compra', 'fecha'], ['factura', 'Factura'], ['costo', 'Costo', 'numero'],
    ['moneda', 'Moneda'], ['centro_costo', 'Centro de costo']] },
]

export function FichaActivo({ id, onClose, fetcher, alcance, tx, puede, extra, extraTitulo }: Props) {
  const qc = useQueryClient()
  const q = (p: string) => (alcance ? `${p}${p.includes('?') ? '&' : '?'}${alcance}` : p)
  const { data: a, refetch, isLoading } = useQuery<Activo>({
    queryKey: ['inventario-ficha', id, alcance],
    queryFn: () => fetcher<Activo>(q(`/inventario/${id}`)),
    enabled: !!id,
  })
  const recargar = () => { refetch(); qc.invalidateQueries({ queryKey: ['inventario'] }) }
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [guardando, setGuardando] = useState(false)
  const [baja, setBaja] = useState(false)
  useEffect(() => { if (a) setForm({ ...a }) }, [a])

  const cambios = useMemo(() => {
    if (!a) return {}
    const o: Record<string, unknown> = {}
    for (const k of Object.keys(form)) {
      if (['vencimientos', 'asignaciones', 'fuentes', 'hijos', 'padre', 'discrepancias'].includes(k)) continue
      if (String(form[k] ?? '') !== String(a[k] ?? '')) o[k] = form[k]
    }
    return o
  }, [form, a])
  const hayCambios = Object.keys(cambios).length > 0
  const soloLectura = !puede.editar || a?.estado === 'baja'

  async function guardar() {
    setGuardando(true)
    try {
      await fetcher(q(`/inventario/${id}`), { method: 'PUT', body: JSON.stringify(cambios) })
      toast.success('Activo actualizado')
      recargar()
    } catch (e) { toast.error((e as Error).message) } finally { setGuardando(false) }
  }

  async function accion(path: string, metodo: string, ok: string, cuerpo?: unknown) {
    try {
      await fetcher(q(path), { method: metodo, body: cuerpo ? JSON.stringify(cuerpo) : undefined })
      toast.success(ok)
      recargar()
      return true
    } catch (e) { toast.error((e as Error).message); return false }
  }

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }))
  const tipos = tx?.categorias[String(form.categoria || a?.categoria || 'hardware')]?.tipos || {}

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className='w-full sm:max-w-3xl overflow-y-auto'>
        {isLoading || !a ? (
          <div className='flex h-40 items-center justify-center'><Loader2 className='size-5 animate-spin' /></div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className='flex flex-wrap items-center gap-2'>
                {a.nombre}
                {a.alias ? <span className='text-muted-foreground text-sm font-normal'>({String(a.alias)})</span> : null}
                <Badge variant='outline' className={CRITICIDAD[a.criticidad]?.clase}>{CRITICIDAD[a.criticidad]?.texto}</Badge>
                {a.estado === 'baja' ? <Badge variant='destructive'>Dado de baja</Badge> : null}
              </SheetTitle>
              <SheetDescription>
                {tx?.categorias[a.categoria]?.nombre} · {nombreTipo(tx, a.categoria, a.tipo)} · {tx?.estados[a.estado] || a.estado}
                {a.padre ? <> · depende de <b>{a.padre.nombre}</b></> : null}
              </SheetDescription>
            </SheetHeader>

            <div className='px-4 pb-6'>
              <Tabs defaultValue='datos'>
                <TabsList className='flex h-auto flex-wrap'>
                  <TabsTrigger value='datos'>Datos</TabsTrigger>
                  <TabsTrigger value='vencimientos'>Vencimientos{a.vencimientos.filter((v) => v.estado === 'vigente').length ? ` (${a.vencimientos.filter((v) => v.estado === 'vigente').length})` : ''}</TabsTrigger>
                  <TabsTrigger value='entregas'>Entregas</TabsTrigger>
                  <TabsTrigger value='origen'>Origen{a.discrepancias.length ? ' ⚠' : ''}</TabsTrigger>
                  <TabsTrigger value='historial'>Historial</TabsTrigger>
                  {extra ? <TabsTrigger value='extra'>{extraTitulo || 'Más'}</TabsTrigger> : null}
                </TabsList>

                <TabsContent value='datos' className='space-y-5 pt-3'>
                  <div className='grid gap-3 sm:grid-cols-3'>
                    <Campo label='Categoría'>
                      <Select disabled={soloLectura} value={String(form.categoria || '')}
                        onValueChange={(v) => { const t = Object.keys(tx?.categorias[v]?.tipos || {})[0]; setForm((f) => ({ ...f, categoria: v, tipo: t })) }}>
                        <SelectTrigger className='w-full'><SelectValue /></SelectTrigger>
                        <SelectContent>{Object.entries(tx?.categorias || {}).map(([k, c]) => <SelectItem key={k} value={k}>{c.nombre}</SelectItem>)}</SelectContent>
                      </Select>
                    </Campo>
                    <Campo label='Tipo'>
                      <Select disabled={soloLectura} value={String(form.tipo || '')} onValueChange={(v) => set('tipo', v)}>
                        <SelectTrigger className='w-full'><SelectValue /></SelectTrigger>
                        <SelectContent>{Object.entries(tipos).map(([k, n]) => <SelectItem key={k} value={k}>{n}</SelectItem>)}</SelectContent>
                      </Select>
                    </Campo>
                    <Campo label='Estado'>
                      <Select disabled={soloLectura} value={String(form.estado || '')} onValueChange={(v) => set('estado', v)}>
                        <SelectTrigger className='w-full'><SelectValue /></SelectTrigger>
                        <SelectContent>{Object.entries(tx?.estados || {}).filter(([k]) => k !== 'baja' || a.estado === 'baja').map(([k, n]) => <SelectItem key={k} value={k}>{n}</SelectItem>)}</SelectContent>
                      </Select>
                    </Campo>
                  </div>

                  <div>
                    <h4 className='mb-2 text-sm font-semibold'>Clasificación y valoración</h4>
                    <div className='grid gap-3 sm:grid-cols-3'>
                      <Campo label='Criticidad'>
                        <Select disabled={soloLectura} value={String(form.criticidad || 'media')} onValueChange={(v) => set('criticidad', v)}>
                          <SelectTrigger className='w-full'><SelectValue /></SelectTrigger>
                          <SelectContent>{Object.entries(CRITICIDAD).map(([k, c]) => <SelectItem key={k} value={k}>{c.texto}</SelectItem>)}</SelectContent>
                        </Select>
                      </Campo>
                      <Campo label='Clasificación de la información'>
                        <Select disabled={soloLectura} value={String(form.clasificacion || 'ninguna')} onValueChange={(v) => set('clasificacion', v === 'ninguna' ? null : v)}>
                          <SelectTrigger className='w-full'><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value='ninguna'>Sin clasificar</SelectItem>
                            {Object.entries(CLASIFICACION).map(([k, n]) => <SelectItem key={k} value={k}>{n}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </Campo>
                      <Campo label='Trata datos personales'>
                        <div className='flex h-9 items-center'><Switch disabled={soloLectura} checked={!!Number(form.datos_personales)} onCheckedChange={(v) => set('datos_personales', v ? 1 : 0)} /></div>
                      </Campo>
                      {([['val_confidencialidad', 'Confidencialidad'], ['val_integridad', 'Integridad'], ['val_disponibilidad', 'Disponibilidad']] as const).map(([k, n]) => (
                        <Campo key={k} label={`${n} (1 a 5)`}>
                          <Select disabled={soloLectura} value={form[k] == null ? 'nd' : String(form[k])} onValueChange={(v) => set(k, v === 'nd' ? null : Number(v))}>
                            <SelectTrigger className='w-full'><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value='nd'>Sin valorar</SelectItem>
                              {[1, 2, 3, 4, 5].map((n2) => <SelectItem key={n2} value={String(n2)}>{n2}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </Campo>
                      ))}
                      <Campo label='Expuesto a Internet'>
                        <div className='flex h-9 items-center'><Switch disabled={soloLectura} checked={!!Number(form.expuesto_internet)} onCheckedChange={(v) => set('expuesto_internet', v ? 1 : 0)} /></div>
                      </Campo>
                    </div>
                  </div>

                  {SECCIONES.map((s) => (
                    <div key={s.titulo}>
                      <h4 className='mb-2 text-sm font-semibold'>{s.titulo}</h4>
                      <div className='grid gap-3 sm:grid-cols-2'>
                        {s.campos.map(([k, n, t]) => (
                          <Campo key={k} label={n}>
                            <Input disabled={soloLectura} type={t === 'numero' ? 'number' : t === 'fecha' ? 'date' : t === 'correo' ? 'email' : 'text'}
                              value={form[k] == null ? '' : String(form[k])} onChange={(e) => set(k, e.target.value)} />
                          </Campo>
                        ))}
                      </div>
                    </div>
                  ))}
                  <Campo label='Notas'>
                    <Textarea disabled={soloLectura} rows={3} value={form.notas == null ? '' : String(form.notas)} onChange={(e) => set('notas', e.target.value)} />
                  </Campo>

                  {a.estado === 'baja' ? (
                    <div className='rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm'>
                      <b>Dado de baja</b> el {fechaHora(String(a.baja_at || ''))}: {String(a.baja_motivo || '')}
                      {a.disposicion ? <> · {tx?.disposicion[String(a.disposicion)]}</> : null}
                      {a.disposicion_evidencia ? <> · evidencia: {String(a.disposicion_evidencia)}</> : null}
                    </div>
                  ) : null}

                  <div className='flex flex-wrap gap-2 border-t pt-4'>
                    {!soloLectura ? (
                      <Button onClick={guardar} disabled={!hayCambios || guardando}>
                        {guardando ? <Loader2 className='mr-1 size-4 animate-spin' /> : <Save className='mr-1 size-4' />}Guardar cambios
                      </Button>
                    ) : null}
                    {puede.editar && a.estado !== 'baja' ? (
                      <Button variant='outline' onClick={() => setBaja(true)}><Archive className='mr-1 size-4' />Dar de baja</Button>
                    ) : null}
                    {puede.editar && a.estado === 'baja' ? (
                      <Button variant='outline' onClick={() => accion(`/inventario/${a.id}/reactivar`, 'POST', 'Activo reactivado')}><RotateCcw className='mr-1 size-4' />Reactivar</Button>
                    ) : null}
                    {puede.borrar ? (
                      <Button variant='ghost' className='text-destructive ml-auto' onClick={async () => {
                        if (!window.confirm('Eliminar este activo? Usalo solo para un error de carga: para retirarlo de servicio usá Dar de baja.')) return
                        if (await accion(`/inventario/${a.id}`, 'DELETE', 'Activo eliminado')) onClose()
                      }}><Trash2 className='mr-1 size-4' />Eliminar</Button>
                    ) : null}
                  </div>
                  {a.hijos.length ? (
                    <div className='text-sm'>
                      <h4 className='mb-1 font-semibold'>Dependen de este activo</h4>
                      <ul className='list-inside list-disc text-muted-foreground'>{a.hijos.map((h) => <li key={h.id}>{h.nombre} · {nombreTipo(tx, h.categoria, h.tipo)}</li>)}</ul>
                    </div>
                  ) : null}
                </TabsContent>

                <TabsContent value='vencimientos' className='pt-3'>
                  <Vencimientos activo={a} tx={tx} puede={puede} fetcher={fetcher} q={q} recargar={recargar} />
                </TabsContent>

                <TabsContent value='entregas' className='pt-3'>
                  <Entregas activo={a} puede={puede} fetcher={fetcher} q={q} recargar={recargar} />
                </TabsContent>

                <TabsContent value='origen' className='space-y-4 pt-3 text-sm'>
                  <p className='text-muted-foreground'>
                    {VERIFICADAS.includes(a.origen) ? 'Verificado en la red' : 'Declarado por una persona'}.
                    {a.visto_ultima ? <> Visto por última vez: {fechaHora(String(a.visto_ultima))}.</> : null}
                  </p>
                  <div className='space-y-1'>
                    {a.fuentes.map((f) => (
                      <div key={f.fuente} className='flex items-center justify-between rounded border px-3 py-2'>
                        <span><Badge variant='outline'>{FUENTE[f.fuente] || f.fuente}</Badge>{f.externo_id ? <span className='text-muted-foreground ml-2 font-mono text-xs'>{f.externo_id}</span> : null}</span>
                        <span className='text-muted-foreground text-xs'>{fechaHora(f.visto_at)}</span>
                      </div>
                    ))}
                  </div>
                  {a.discrepancias.length ? (
                    <div className='rounded-md border border-yellow-500/40 bg-yellow-500/5 p-3'>
                      <p className='mb-2 flex items-center gap-1 font-semibold'><AlertTriangle className='size-4' />Las fuentes no coinciden</p>
                      <p className='text-muted-foreground mb-2 text-xs'>Lo declarado y lo observado difieren: el inventario de alguna de las fuentes está desactualizado.</p>
                      {a.discrepancias.map((d) => (
                        <div key={d.campo} className='text-xs'><b>{d.campo}</b>: {Object.entries(d.valores).map(([f, v]) => `${FUENTE[f] || f}: ${v}`).join(' · ')}</div>
                      ))}
                    </div>
                  ) : null}
                </TabsContent>

                <TabsContent value='historial' className='pt-3'>
                  <Historial id={a.id} fetcher={fetcher} q={q} />
                </TabsContent>

                {extra ? <TabsContent value='extra' className='pt-3'>{extra(a, recargar)}</TabsContent> : null}
              </Tabs>
            </div>
            <DialogoBaja abierto={baja} onClose={() => setBaja(false)} activo={a} tx={tx}
              onConfirmar={async (cuerpo) => { if (await accion(`/inventario/${a.id}/baja`, 'POST', 'Activo dado de baja', cuerpo)) setBaja(false) }} />
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return <div className='space-y-1'><Label className='text-muted-foreground text-xs'>{label}</Label>{children}</div>
}

function Vencimientos({ activo, tx, puede, fetcher, q, recargar }: {
  activo: Activo; tx: Taxonomia | undefined; puede: Props['puede']; fetcher: Fetcher; q: (p: string) => string; recargar: () => void
}) {
  const vacio = { tipo: 'garantia', fecha: '', descripcion: '', costo_renovacion: '', moneda: 'ARS', responsable_correo: '', renovacion_auto: false }
  const [nuevo, setNuevo] = useState<typeof vacio | null>(null)
  const [renovar, setRenovar] = useState<Vencimiento | null>(null)
  const [fechaNueva, setFechaNueva] = useState('')
  const [costoNuevo, setCostoNuevo] = useState('')
  const vigentes = activo.vencimientos.filter((v) => v.estado === 'vigente')
  const historicos = activo.vencimientos.filter((v) => v.estado !== 'vigente')

  async function enviar(path: string, method: string, body: unknown, ok: string) {
    try { await fetcher(q(path), { method, body: JSON.stringify(body) }); toast.success(ok); recargar(); return true }
    catch (e) { toast.error((e as Error).message); return false }
  }

  return (
    <div className='space-y-3 text-sm'>
      {!vigentes.length ? (
        <p className='text-muted-foreground'>Sin vencimientos cargados. Garantía, fin de soporte, licencia, contrato, certificado: cargá las fechas y el sistema avisa antes de que venzan.</p>
      ) : null}
      {vigentes.map((v) => (
        <div key={v.id} className='flex flex-wrap items-center gap-2 rounded border px-3 py-2'>
          <CalendarClock className='text-muted-foreground size-4' />
          <b>{tx?.vencimientos[v.tipo] || v.tipo}</b>
          <span>{fecha(v.fecha)}</span>
          {v.semaforo ? <Badge variant='outline' className={SEMAFORO[v.semaforo].clase}>{v.semaforo === 'al_dia' ? cuandoVence(v.dias) : `${SEMAFORO[v.semaforo].texto} · ${cuandoVence(v.dias)}`}</Badge> : null}
          {v.costo_renovacion != null ? <span className='text-muted-foreground'>{dinero(v.costo_renovacion, v.moneda)}</span> : null}
          {v.renovacion_auto ? <Badge variant='secondary'>Renovación automática</Badge> : null}
          {v.descripcion ? <span className='text-muted-foreground w-full text-xs'>{v.descripcion}</span> : null}
          {v.ultimo_aviso ? <span className='text-muted-foreground w-full text-xs'>Último aviso: {fechaHora(v.ultimo_aviso)}</span> : null}
          {puede.editar && activo.estado !== 'baja' ? (
            <div className='ml-auto flex gap-1'>
              <Button size='sm' variant='outline' onClick={() => { setRenovar(v); setFechaNueva(''); setCostoNuevo('') }}><RefreshCw className='mr-1 size-3.5' />Renovar</Button>
              {puede.borrar ? <Button size='sm' variant='ghost' onClick={() => window.confirm('Borrar este vencimiento?') && enviar(`/inventario/vencimientos/${v.id}`, 'DELETE', {}, 'Vencimiento borrado')}><Trash2 className='size-3.5' /></Button> : null}
            </div>
          ) : null}
        </div>
      ))}
      {puede.editar && activo.estado !== 'baja' ? (
        nuevo ? (
          <div className='space-y-3 rounded border border-dashed p-3'>
            <div className='grid gap-3 sm:grid-cols-3'>
              <Campo label='Qué vence'>
                <Select value={nuevo.tipo} onValueChange={(v) => setNuevo({ ...nuevo, tipo: v })}>
                  <SelectTrigger className='w-full'><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(tx?.vencimientos || {}).map(([k, n]) => <SelectItem key={k} value={k}>{n}</SelectItem>)}</SelectContent>
                </Select>
              </Campo>
              <Campo label='Fecha'><Input type='date' value={nuevo.fecha} onChange={(e) => setNuevo({ ...nuevo, fecha: e.target.value })} /></Campo>
              <Campo label='Costo de renovación'><Input type='number' value={nuevo.costo_renovacion} onChange={(e) => setNuevo({ ...nuevo, costo_renovacion: e.target.value })} /></Campo>
              <Campo label='Moneda'><Input value={nuevo.moneda} maxLength={3} onChange={(e) => setNuevo({ ...nuevo, moneda: e.target.value.toUpperCase() })} /></Campo>
              <Campo label='Avisar además a (correo)'><Input type='email' value={nuevo.responsable_correo} onChange={(e) => setNuevo({ ...nuevo, responsable_correo: e.target.value })} /></Campo>
              <Campo label='Renovación automática'><div className='flex h-9 items-center'><Switch checked={nuevo.renovacion_auto} onCheckedChange={(v) => setNuevo({ ...nuevo, renovacion_auto: v })} /></div></Campo>
            </div>
            <Campo label='Detalle (contrato, proveedor, alcance)'><Input value={nuevo.descripcion} onChange={(e) => setNuevo({ ...nuevo, descripcion: e.target.value })} /></Campo>
            <p className='text-muted-foreground text-xs'>Se avisa por correo al propietario {tx?.avisos.length ? `a ${tx.avisos.filter((d) => d > 0).join(', ')} días y el día que vence` : ''}.</p>
            <div className='flex gap-2'>
              <Button size='sm' onClick={async () => { if (await enviar(`/inventario/${activo.id}/vencimientos`, 'POST', nuevo, 'Vencimiento cargado')) setNuevo(null) }} disabled={!nuevo.fecha}>Guardar</Button>
              <Button size='sm' variant='ghost' onClick={() => setNuevo(null)}>Cancelar</Button>
            </div>
          </div>
        ) : <Button size='sm' variant='outline' onClick={() => setNuevo(vacio)}><Plus className='mr-1 size-4' />Agregar vencimiento</Button>
      ) : null}
      {historicos.length ? (
        <div className='pt-2'>
          <h4 className='text-muted-foreground mb-1 text-xs font-semibold uppercase'>Anteriores</h4>
          {historicos.map((v) => (
            <div key={v.id} className='text-muted-foreground text-xs'>{tx?.vencimientos[v.tipo] || v.tipo} · {fecha(v.fecha)} · {v.estado === 'renovado' ? 'renovado' : 'no se renueva'}</div>
          ))}
        </div>
      ) : null}
      <Dialog open={!!renovar} onOpenChange={(o) => !o && setRenovar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renovar {renovar ? tx?.vencimientos[renovar.tipo] : ''}</DialogTitle>
            <DialogDescription>El vencimiento actual ({fecha(renovar?.fecha)}) queda en el historial como renovado y los avisos se reprograman con la fecha nueva.</DialogDescription>
          </DialogHeader>
          <div className='grid gap-3 sm:grid-cols-2'>
            <Campo label='Nueva fecha de vencimiento'><Input type='date' value={fechaNueva} onChange={(e) => setFechaNueva(e.target.value)} /></Campo>
            <Campo label='Costo de la próxima renovación'><Input type='number' value={costoNuevo} onChange={(e) => setCostoNuevo(e.target.value)} placeholder={renovar?.costo_renovacion != null ? String(renovar.costo_renovacion) : ''} /></Campo>
          </div>
          <DialogFooter>
            <Button disabled={!fechaNueva} onClick={async () => {
              if (renovar && await enviar(`/inventario/vencimientos/${renovar.id}/renovar`, 'POST', { fecha: fechaNueva, costo_renovacion: costoNuevo }, 'Renovación registrada')) setRenovar(null)
            }}>Registrar renovación</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Entregas({ activo, puede, fetcher, q, recargar }: {
  activo: Activo; puede: Props['puede']; fetcher: Fetcher; q: (p: string) => string; recargar: () => void
}) {
  const [nueva, setNueva] = useState<{ persona: string; persona_correo: string; fecha: string; acepto_uso: boolean } | null>(null)
  const abierta = activo.asignaciones.find((s) => !s.devuelto_at)
  async function enviar(path: string, method: string, body: unknown, ok: string) {
    try { await fetcher(q(path), { method, body: JSON.stringify(body) }); toast.success(ok); recargar(); return true }
    catch (e) { toast.error((e as Error).message); return false }
  }
  return (
    <div className='space-y-3 text-sm'>
      <p className='text-muted-foreground text-xs'>Entrega y devolución (ISO 27001 A.5.10 y A.5.11): a quién se le dio, si aceptó la política de uso aceptable y si lo devolvió al irse.</p>
      {activo.asignaciones.map((s) => (
        <div key={s.id} className='flex flex-wrap items-center gap-2 rounded border px-3 py-2'>
          <PackageCheck className='text-muted-foreground size-4' />
          <b>{s.persona}</b>
          <span className='text-muted-foreground'>entregado el {fecha(s.entregado_at)}</span>
          {s.acepto_uso ? <Badge variant='secondary'>Aceptó uso aceptable</Badge> : <Badge variant='outline'>Sin aceptación registrada</Badge>}
          {s.devuelto_at ? <span className='text-muted-foreground'>· devuelto el {fecha(s.devuelto_at)}{s.estado_devolucion ? ` (${s.estado_devolucion})` : ''}</span> : null}
          {!s.devuelto_at && puede.editar ? (
            <Button size='sm' variant='outline' className='ml-auto' onClick={() => {
              const estado = window.prompt('Estado en que se devuelve (opcional):', 'Completo y en buen estado')
              if (estado !== null) enviar(`/inventario/asignaciones/${s.id}/devolucion`, 'PUT', { estado_devolucion: estado }, 'Devolución registrada')
            }}><Undo2 className='mr-1 size-3.5' />Registrar devolución</Button>
          ) : null}
        </div>
      ))}
      {puede.editar && activo.estado !== 'baja' && (!abierta || Number(activo.cantidad) > 1) ? (
        nueva ? (
          <div className='space-y-3 rounded border border-dashed p-3'>
            <div className='grid gap-3 sm:grid-cols-3'>
              <Campo label='Persona'><Input value={nueva.persona} onChange={(e) => setNueva({ ...nueva, persona: e.target.value })} /></Campo>
              <Campo label='Correo'><Input type='email' value={nueva.persona_correo} onChange={(e) => setNueva({ ...nueva, persona_correo: e.target.value })} /></Campo>
              <Campo label='Fecha de entrega'><Input type='date' value={nueva.fecha} onChange={(e) => setNueva({ ...nueva, fecha: e.target.value })} /></Campo>
            </div>
            <label className='flex items-center gap-2'><Switch checked={nueva.acepto_uso} onCheckedChange={(v) => setNueva({ ...nueva, acepto_uso: v })} />Aceptó la política de uso aceptable</label>
            <div className='flex gap-2'>
              <Button size='sm' disabled={!nueva.persona.trim()} onClick={async () => { if (await enviar(`/inventario/${activo.id}/asignaciones`, 'POST', nueva, 'Entrega registrada')) setNueva(null) }}>Registrar entrega</Button>
              <Button size='sm' variant='ghost' onClick={() => setNueva(null)}>Cancelar</Button>
            </div>
          </div>
        ) : <Button size='sm' variant='outline' onClick={() => setNueva({ persona: '', persona_correo: '', fecha: '', acepto_uso: false })}><Plus className='mr-1 size-4' />Registrar entrega</Button>
      ) : null}
    </div>
  )
}

function Historial({ id, fetcher, q }: { id: string; fetcher: Fetcher; q: (p: string) => string }) {
  const { data = [], isLoading } = useQuery<{ accion: string; campo: string | null; antes: string | null; despues: string | null; usuario: string | null; ts: string }[]>({
    queryKey: ['inventario-historial', id],
    queryFn: () => fetcher(q(`/inventario/${id}/historial`)),
  })
  if (isLoading) return <Loader2 className='size-4 animate-spin' />
  if (!data.length) return <p className='text-muted-foreground text-sm'>Sin movimientos.</p>
  return (
    <ol className='space-y-2 text-sm'>
      {data.map((h, i) => (
        <li key={i} className='flex gap-2 border-l-2 pl-3'>
          <History className='text-muted-foreground mt-0.5 size-3.5 shrink-0' />
          <div>
            <div><b>{ACCION[h.accion] || h.accion}</b>{h.campo ? <> · {h.campo}</> : null}
              {h.antes || h.despues ? <span className='text-muted-foreground'>: {h.antes ? <s>{h.antes}</s> : null}{h.antes && h.despues ? ' → ' : ''}{h.despues}</span> : null}
            </div>
            <div className='text-muted-foreground text-xs'>{fechaHora(h.ts)}{h.usuario ? ` · ${h.usuario}` : ''}</div>
          </div>
        </li>
      ))}
    </ol>
  )
}

function DialogoBaja({ abierto, onClose, activo, tx, onConfirmar }: {
  abierto: boolean; onClose: () => void; activo: Activo; tx: Taxonomia | undefined; onConfirmar: (c: Record<string, unknown>) => void
}) {
  const [motivo, setMotivo] = useState('')
  const [disposicion, setDisposicion] = useState('')
  const [evidencia, setEvidencia] = useState('')
  const sensible = activo.categoria === 'hardware' && (Number(activo.datos_personales) === 1 || ['confidencial', 'restringida'].includes(String(activo.clasificacion)))
  const abierta = activo.asignaciones.find((s) => !s.devuelto_at)
  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dar de baja {activo.nombre}</DialogTitle>
          <DialogDescription>Sale de los tableros y de los avisos de vencimiento, pero queda con su historia: en una auditoría se puede mostrar cuándo y cómo se dispuso de él.</DialogDescription>
        </DialogHeader>
        {abierta ? <p className='rounded border border-yellow-500/40 bg-yellow-500/5 p-2 text-sm'>Figura entregado a <b>{abierta.persona}</b> sin devolución registrada.</p> : null}
        <div className='space-y-3'>
          <Campo label='Motivo'><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder='Fin de vida útil, rotura, reemplazo...' /></Campo>
          <Campo label={sensible ? 'Disposición (obligatoria: guardaba información sensible)' : 'Disposición'}>
            <Select value={disposicion || 'ninguna'} onValueChange={(v) => setDisposicion(v === 'ninguna' ? '' : v)}>
              <SelectTrigger className='w-full'><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value='ninguna'>Sin indicar</SelectItem>
                {Object.entries(tx?.disposicion || {}).map(([k, n]) => <SelectItem key={k} value={k}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </Campo>
          <Campo label='Evidencia (certificado de borrado, acta, remito)'><Input value={evidencia} onChange={(e) => setEvidencia(e.target.value)} /></Campo>
        </div>
        <DialogFooter>
          <Button variant='ghost' onClick={onClose}>Cancelar</Button>
          <Button disabled={!motivo.trim() || (sensible && !disposicion)} onClick={() => onConfirmar({ motivo, disposicion: disposicion || null, evidencia, forzar: !!abierta })}>Dar de baja</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
