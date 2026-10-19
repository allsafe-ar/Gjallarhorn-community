/**
 * Inventario de activos: pantalla única. Canónico (utiles/activos/ui), idéntico en Skuld y
 * Gjallarhorn, copiado a `src/components/inventario/`.
 *
 * 🔑 **No sabe en qué sistema corre**, igual que el mural. Recibe cómo pedir datos (`fetcher`), el
 * alcance (`cliente=...` en Skuld, vacío en Gjallarhorn, que lo resuelve por sesión) y qué puede la
 * persona. Lo propio de cada sistema entra por `extraFicha` (monitoreo en Gjallarhorn, riesgos en
 * Skuld) y por `cabecera` (el selector de cliente de Skuld).
 *
 * Lo primero que se ve es el semáforo de vencimientos: es lo que no existía y lo que más cuesta
 * descubrir tarde.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertTriangle, CalendarClock, ChevronLeft, ChevronRight, Copy, Download, FileSpreadsheet, Link2, Loader2, Plus, Search, ShieldCheck, Upload,
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FichaActivo } from './ficha-activo'
import { DialogoSincronizacion } from './sincronizacion'
import {
  type Activo, type Asignacion, type Fetcher, type FilaActivo, type Taxonomia, type Vencimiento,
  CRITICIDAD, FUENTE, SEMAFORO, VERIFICADAS, cuandoVence, dinero, fecha, nombreTipo,
} from './tipos'

export interface InventarioProps {
  fetcher: Fetcher
  /** Descarga autenticada de un archivo (el CSV): cada sistema sabe cómo mandar su token. */
  descargar: (path: string, nombre: string) => Promise<void>
  /** Query string sin `?` que identifica la organización (`cliente=ID`), o vacío. */
  alcance: string
  puede: { editar: boolean; borrar: boolean; administrar: boolean }
  sistema: string
  cabecera?: ReactNode
  extraFicha?: (activo: Activo, recargar: () => void) => ReactNode
  extraFichaTitulo?: string
  /** Si es false (Skuld sin cliente elegido) se muestra el aviso en vez de pedir datos. */
  listo?: boolean
  /** Conexión con el otro sistema AllSafe. En false (Community) no se ofrece. */
  sincronizacion?: boolean
}

interface Resumen {
  por_categoria: { categoria: string; filas: number; unidades: number }[]
  por_estado: { estado: string; n: number }[]
  por_criticidad: { criticidad: string; n: number }[]
  por_origen: { origen: 'declarado' | 'verificado'; n: number }[]
  vencimientos: {
    semaforo: { vencido: number; critico: number; proximo: number; al_dia: number }
    proximos: (Vencimiento & { activo_nombre: string })[]
    sin_fechas: number
    proyeccion: { mes: string; cantidad: number; costos: Record<string, number>; sin_costo: number }[]
  }
  dudas: number
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export function InventarioBase(props: InventarioProps) {
  const { fetcher, alcance, puede, cabecera, listo = true, sincronizacion = true } = props
  const qc = useQueryClient()
  const q = (p: string) => (alcance ? `${p}${p.includes('?') ? '&' : '?'}${alcance}` : p)
  const [tab, setTab] = useState('resumen')
  const [ficha, setFicha] = useState<string | null>(null)
  const [alta, setAlta] = useState(false)
  const [importar, setImportar] = useState(false)
  const [duplicados, setDuplicados] = useState(false)
  const [conectar, setConectar] = useState(false)
  const [filtroVenc, setFiltroVenc] = useState<string>('')

  const { data: tx } = useQuery<Taxonomia>({ queryKey: ['inventario-taxonomia'], queryFn: () => fetcher<Taxonomia>('/inventario/taxonomia'), staleTime: Infinity })
  const { data: resumen } = useQuery<Resumen>({
    queryKey: ['inventario', 'resumen', alcance], queryFn: () => fetcher<Resumen>(q('/inventario/resumen')), enabled: listo,
  })

  const irA = (venc: string) => { setFiltroVenc(venc); setTab('inventario') }

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center gap-2'>
        {cabecera}
        <div className='ml-auto flex flex-wrap gap-2'>
          {listo && puede.administrar && resumen?.dudas ? (
            <Button variant='outline' onClick={() => setDuplicados(true)}><Copy className='mr-1 size-4' />Posibles duplicados <Badge className='ml-1'>{resumen.dudas}</Badge></Button>
          ) : null}
          {listo && sincronizacion && puede.administrar ? <Button variant='outline' onClick={() => setConectar(true)}><Link2 className='mr-1 size-4' />Conectar</Button> : null}
          {listo ? <Button variant='outline' onClick={() => props.descargar(q('/inventario/exportar.csv'), 'inventario.csv').catch((e) => toast.error(e.message))}><Download className='mr-1 size-4' />Exportar</Button> : null}
          {listo && puede.administrar ? <Button variant='outline' onClick={() => setImportar(true)}><Upload className='mr-1 size-4' />Importar planilla</Button> : null}
          {listo && puede.editar ? <Button onClick={() => setAlta(true)}><Plus className='mr-1 size-4' />Nuevo activo</Button> : null}
        </div>
      </div>

      {!listo ? (
        <Card><CardContent className='text-muted-foreground py-10 text-center'>Elegí una organización para ver su inventario.</CardContent></Card>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value='resumen'>Resumen</TabsTrigger>
            <TabsTrigger value='inventario'>Inventario</TabsTrigger>
            <TabsTrigger value='vencimientos'>Vencimientos</TabsTrigger>
            <TabsTrigger value='entregas'>Entregas</TabsTrigger>
          </TabsList>
          <TabsContent value='resumen' className='pt-2'>
            <PanelResumen r={resumen} tx={tx} irA={irA} abrir={setFicha} />
          </TabsContent>
          <TabsContent value='inventario' className='pt-2'>
            <Listado {...props} tx={tx} q={q} abrir={setFicha} filtroVenc={filtroVenc} setFiltroVenc={setFiltroVenc} />
          </TabsContent>
          <TabsContent value='vencimientos' className='pt-2'>
            <ListaVencimientos fetcher={fetcher} q={q} alcance={alcance} tx={tx} abrir={setFicha} />
          </TabsContent>
          <TabsContent value='entregas' className='pt-2'>
            <ListaEntregas fetcher={fetcher} q={q} alcance={alcance} abrir={setFicha} />
          </TabsContent>
        </Tabs>
      )}

      <FichaActivo id={ficha} onClose={() => setFicha(null)} fetcher={fetcher} alcance={alcance} tx={tx} puede={puede}
        extra={props.extraFicha} extraTitulo={props.extraFichaTitulo} />
      <DialogoAlta abierto={alta} onClose={() => setAlta(false)} tx={tx} fetcher={fetcher} q={q}
        onCreado={(id) => { setAlta(false); qc.invalidateQueries({ queryKey: ['inventario'] }); setFicha(id) }} />
      <DialogoImportar abierto={importar} onClose={() => setImportar(false)} fetcher={fetcher} q={q}
        onListo={() => qc.invalidateQueries({ queryKey: ['inventario'] })} />
      {sincronizacion && puede.administrar ? <DialogoSincronizacion abierto={conectar} onClose={() => setConectar(false)} fetcher={fetcher} q={q} sistema={props.sistema} /> : null}
      {puede.administrar ? <DialogoDuplicados abierto={duplicados} onClose={() => setDuplicados(false)} fetcher={fetcher} q={q}
        onCambio={() => qc.invalidateQueries({ queryKey: ['inventario'] })} /> : null}
    </div>
  )
}

function Kpi({ titulo, valor, detalle, clase, onClick }: { titulo: string; valor: ReactNode; detalle?: string; clase?: string; onClick?: () => void }) {
  return (
    <Card className={`${onClick ? 'hover:bg-muted/40 cursor-pointer' : ''} gap-1 py-4`} onClick={onClick}>
      <CardContent className='px-4'>
        <div className='text-muted-foreground text-xs'>{titulo}</div>
        <div className={`text-2xl font-semibold ${clase || ''}`}>{valor}</div>
        {detalle ? <div className='text-muted-foreground text-xs'>{detalle}</div> : null}
      </CardContent>
    </Card>
  )
}

function PanelResumen({ r, tx, irA, abrir }: { r: Resumen | undefined; tx: Taxonomia | undefined; irA: (v: string) => void; abrir: (id: string) => void }) {
  if (!r) return <div className='flex h-40 items-center justify-center'><Loader2 className='size-5 animate-spin' /></div>
  const total = r.por_categoria.reduce((s, c) => s + Number(c.filas), 0)
  const unidades = r.por_categoria.reduce((s, c) => s + Number(c.unidades || 0), 0)
  const s = r.vencimientos.semaforo
  const verificado = Number(r.por_origen.find((o) => o.origen === 'verificado')?.n || 0)
  const maxMes = Math.max(1, ...r.vencimientos.proyeccion.map((m) => m.cantidad))
  const totalesProy: Record<string, number> = {}
  for (const m of r.vencimientos.proyeccion) for (const [mon, v] of Object.entries(m.costos)) totalesProy[mon] = (totalesProy[mon] || 0) + v
  const sinCosto = r.vencimientos.proyeccion.reduce((a, m) => a + m.sin_costo, 0)
  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6'>
        <Kpi titulo='Activos' valor={total} detalle={unidades !== total ? `${unidades} unidades` : undefined} />
        <Kpi titulo='Vencidos' valor={s.vencido} clase={s.vencido ? 'text-red-600 dark:text-red-400' : ''} onClick={() => irA('vencido')} />
        <Kpi titulo='Vencen en 30 días' valor={s.critico} clase={s.critico ? 'text-orange-600 dark:text-orange-400' : ''} onClick={() => irA('proximo')} />
        <Kpi titulo='Próximos (90 días)' valor={s.proximo} onClick={() => irA('proximo')} />
        <Kpi titulo='Sin fechas cargadas' valor={r.vencimientos.sin_fechas} detalle='hardware y software' clase={r.vencimientos.sin_fechas ? 'text-yellow-700 dark:text-yellow-400' : ''} onClick={() => irA('sin_fecha')} />
        <Kpi titulo='Verificado en la red' valor={total ? `${Math.round((verificado / total) * 100)}%` : '-'} detalle={`${verificado} de ${total}`} />
      </div>

      <div className='grid gap-4 lg:grid-cols-2'>
        <Card>
          <CardHeader className='pb-2'><CardTitle className='flex items-center gap-2 text-base'><CalendarClock className='size-4' />Lo que vence</CardTitle></CardHeader>
          <CardContent>
            {!r.vencimientos.proximos.length ? (
              <p className='text-muted-foreground text-sm'>{r.vencimientos.sin_fechas ? 'No hay vencimientos próximos entre los cargados, pero hay activos sin fechas: el semáforo solo ve lo que se cargó.' : 'Nada vence en los próximos 90 días.'}</p>
            ) : (
              <ul className='space-y-1.5 text-sm'>
                {r.vencimientos.proximos.map((v) => (
                  <li key={v.id} className='hover:bg-muted/40 flex cursor-pointer items-center gap-2 rounded px-1' onClick={() => abrir(v.activo_id)}>
                    <Badge variant='outline' className={`${SEMAFORO[v.semaforo || 'al_dia'].clase} w-24 justify-center`}>{cuandoVence(v.dias)}</Badge>
                    <span className='truncate'><b>{v.activo_nombre}</b> · {tx?.vencimientos[v.tipo] || v.tipo}</span>
                    <span className='text-muted-foreground ml-auto shrink-0 text-xs'>{fecha(v.fecha)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-base'>Renovaciones en los próximos 12 meses</CardTitle>
            <p className='text-muted-foreground text-xs'>
              {Object.entries(totalesProy).map(([m, v]) => dinero(v, m)).join(' + ') || 'Sin costos cargados'}
              {sinCosto ? ` · ${sinCosto} vencimiento${sinCosto === 1 ? '' : 's'} sin costo cargado` : ''}
            </p>
          </CardHeader>
          <CardContent>
            <div className='flex h-36 items-end gap-1'>
              {r.vencimientos.proyeccion.map((m) => {
                const [y, mm] = m.mes.split('-')
                const costo = Object.entries(m.costos).map(([mon, v]) => dinero(v, mon)).join(' + ')
                return (
                  <div key={m.mes} className='flex h-full flex-1 flex-col items-center gap-1' title={`${m.cantidad} vencimiento(s)${costo ? ' · ' + costo : ''}`}>
                    {/* El alto en % necesita un contenedor con alto propio: por eso la columna es h-full y la barra vive en un flex-1. */}
                    <div className='flex w-full flex-1 flex-col items-center justify-end'>
                      {m.cantidad ? <span className='text-muted-foreground mb-0.5 text-[10px]'>{m.cantidad}</span> : null}
                      <div className='bg-primary/70 w-full rounded-t' style={{ height: `${(m.cantidad / maxMes) * 85}%`, minHeight: m.cantidad ? 4 : 0 }} />
                    </div>
                    <span className='text-muted-foreground text-[10px]'>{MESES[Number(mm) - 1]}{mm === '01' ? ` ${y.slice(2)}` : ''}</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className='grid gap-4 md:grid-cols-2'>
        <Card>
          <CardHeader className='pb-2'><CardTitle className='text-base'>Por categoría</CardTitle></CardHeader>
          <CardContent className='space-y-1 text-sm'>
            {r.por_categoria.map((c) => (
              <div key={c.categoria} className='flex justify-between'><span>{tx?.categorias[c.categoria]?.nombre || c.categoria}</span><span className='text-muted-foreground'>{c.filas}{Number(c.unidades) !== Number(c.filas) ? ` (${c.unidades} u.)` : ''}</span></div>
            ))}
            {!r.por_categoria.length ? <p className='text-muted-foreground'>Todavía no hay activos. Cargalos a mano, importá una planilla o usá el relevamiento automático.</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'><CardTitle className='text-base'>Por criticidad</CardTitle></CardHeader>
          <CardContent className='space-y-1 text-sm'>
            {['critica', 'alta', 'media', 'baja'].map((k) => {
              const n = Number(r.por_criticidad.find((c) => c.criticidad === k)?.n || 0)
              return <div key={k} className='flex items-center justify-between'><Badge variant='outline' className={CRITICIDAD[k].clase}>{CRITICIDAD[k].texto}</Badge><span className='text-muted-foreground'>{n}</span></div>
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Paginador({ pagina, total, limite, setPagina, setLimite }: { pagina: number; total: number; limite: number; setPagina: (n: number) => void; setLimite: (n: number) => void }) {
  const paginas = Math.max(1, Math.ceil(total / limite))
  return (
    <div className='flex flex-wrap items-center gap-2 text-sm'>
      <span className='text-muted-foreground'>{total} activo{total === 1 ? '' : 's'}</span>
      <div className='ml-auto flex items-center gap-2'>
        <Select value={String(limite)} onValueChange={(v) => { setLimite(Number(v)); setPagina(1) }}>
          <SelectTrigger className='h-8 w-36'><SelectValue /></SelectTrigger>
          <SelectContent>{[10, 50, 100, 500].map((n) => <SelectItem key={n} value={String(n)}>{n === 500 ? 'Todos' : `${n} por página`}</SelectItem>)}</SelectContent>
        </Select>
        <Button size='sm' variant='outline' disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}><ChevronLeft className='size-4' />Anterior</Button>
        <span className='text-muted-foreground'>{pagina} de {paginas}</span>
        <Button size='sm' variant='outline' disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)}>Siguiente<ChevronRight className='size-4' /></Button>
      </div>
    </div>
  )
}

function Listado({ fetcher, q, tx, abrir, alcance, filtroVenc, setFiltroVenc }: InventarioProps & {
  q: (p: string) => string; tx: Taxonomia | undefined; abrir: (id: string) => void; filtroVenc: string; setFiltroVenc: (v: string) => void
}) {
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [categoria, setCategoria] = useState('')
  const [estado, setEstado] = useState('')
  const [criticidad, setCriticidad] = useState('')
  const [bajas, setBajas] = useState(false)
  const [orden, setOrden] = useState('nombre')
  const [pagina, setPagina] = useState(1)
  const [limite, setLimite] = useState(50)
  useEffect(() => { const t = setTimeout(() => { setBuscaAplicada(busca); setPagina(1) }, 300); return () => clearTimeout(t) }, [busca])
  useEffect(() => { setPagina(1) }, [categoria, estado, criticidad, bajas, filtroVenc, orden])

  const params = useMemo(() => {
    const p = new URLSearchParams()
    if (buscaAplicada) p.set('q', buscaAplicada)
    if (categoria) p.set('categoria', categoria)
    if (estado) p.set('estado', estado)
    if (criticidad) p.set('criticidad', criticidad)
    if (bajas || estado === 'baja') p.set('incluirBajas', '1')
    if (filtroVenc) p.set('venc', filtroVenc)
    p.set('orden', orden); p.set('pagina', String(pagina)); p.set('limite', String(limite))
    return p.toString()
  }, [buscaAplicada, categoria, estado, criticidad, bajas, filtroVenc, orden, pagina, limite])

  const { data, isFetching } = useQuery<{ filas: FilaActivo[]; total: number }>({
    queryKey: ['inventario', 'lista', alcance, params],
    queryFn: () => fetcher(q(`/inventario?${params}`)),
    placeholderData: (prev) => prev,
  })
  const filas = data?.filas || []

  const filtro = (valor: string, set: (v: string) => void, opciones: [string, string][], todos: string) => (
    <Select value={valor || 'todos'} onValueChange={(v) => set(v === 'todos' ? '' : v)}>
      <SelectTrigger className='h-9 w-48'><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value='todos'>{todos}</SelectItem>{opciones.map(([k, n]) => <SelectItem key={k} value={k}>{n}</SelectItem>)}</SelectContent>
    </Select>
  )

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <div className='relative'>
          <Search className='text-muted-foreground absolute top-2.5 left-2 size-4' />
          <Input className='h-9 w-72 pl-8' placeholder='Buscar por nombre, IP, serie, persona...' value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        {filtro(categoria, setCategoria, Object.entries(tx?.categorias || {}).map(([k, c]) => [k, c.nombre]), 'Todas las categorías')}
        {filtro(estado, setEstado, Object.entries(tx?.estados || {}), 'Todos los estados')}
        {filtro(criticidad, setCriticidad, Object.entries(CRITICIDAD).map(([k, c]) => [k, c.texto]), 'Toda criticidad')}
        {filtro(filtroVenc, setFiltroVenc, [['vencido', 'Con algo vencido'], ['proximo', 'Vence en 90 días'], ['sin_fecha', 'Sin fechas cargadas']], 'Todo vencimiento')}
        <label className='flex items-center gap-2 text-sm'><Switch checked={bajas} onCheckedChange={setBajas} />Incluir bajas</label>
        <Select value={orden} onValueChange={setOrden}>
          <SelectTrigger className='ml-auto h-9 w-44'><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value='nombre'>Ordenar por nombre</SelectItem>
            <SelectItem value='vencimiento'>Próximo vencimiento</SelectItem>
            <SelectItem value='criticidad'>Criticidad</SelectItem>
            <SelectItem value='tipo'>Tipo</SelectItem>
            <SelectItem value='actualizado'>Últimos modificados</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Paginador pagina={pagina} total={data?.total || 0} limite={limite} setPagina={setPagina} setLimite={setLimite} />
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Activo</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Criticidad</TableHead>
              <TableHead className='hidden lg:table-cell'>Propietario</TableHead>
              <TableHead className='hidden 2xl:table-cell'>Ubicación</TableHead>
              <TableHead>Próximo vencimiento</TableHead>
              <TableHead className='hidden xl:table-cell'>Origen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((f) => (
              <TableRow key={f.id} className={`cursor-pointer ${f.estado === 'baja' ? 'opacity-50' : ''}`} onClick={() => abrir(f.id)}>
                <TableCell>
                  <div className='font-medium'>{f.alias || f.nombre}{f.cantidad > 1 ? <span className='text-muted-foreground font-normal'> × {f.cantidad}</span> : null}</div>
                  <div className='text-muted-foreground text-xs'>{[f.alias ? f.nombre : null, f.ip, f.serie ? `S/N ${f.serie}` : null].filter(Boolean).join(' · ')}</div>
                </TableCell>
                <TableCell className='max-w-48 text-sm whitespace-normal'>{nombreTipo(tx, f.categoria, f.tipo)}{f.estado !== 'produccion' ? <div className='text-muted-foreground text-xs'>{tx?.estados[f.estado]}</div> : null}</TableCell>
                <TableCell><Badge variant='outline' className={CRITICIDAD[f.criticidad]?.clase}>{CRITICIDAD[f.criticidad]?.texto}</Badge></TableCell>
                <TableCell className='hidden text-sm lg:table-cell'>{f.propietario || <span className='text-muted-foreground'>-</span>}</TableCell>
                <TableCell className='hidden text-sm 2xl:table-cell'>{f.ubicacion || '-'}</TableCell>
                <TableCell>
                  {f.semaforo ? <Badge variant='outline' className={SEMAFORO[f.semaforo].clase}>{fecha(f.prox_venc)} · {cuandoVence(f.dias_venc)}</Badge> : <span className='text-muted-foreground text-xs'>Sin fechas</span>}
                </TableCell>
                <TableCell className='hidden xl:table-cell'>
                  {VERIFICADAS.includes(f.origen) || f.n_fuentes > 1
                    ? <span className='flex items-center gap-1 text-xs'><ShieldCheck className='size-3.5 text-emerald-600' />{FUENTE[f.origen] || f.origen}{f.n_fuentes > 1 ? ` +${f.n_fuentes - 1}` : ''}</span>
                    : <span className='text-muted-foreground text-xs'>{FUENTE[f.origen] || f.origen}</span>}
                </TableCell>
              </TableRow>
            ))}
            {!filas.length && !isFetching ? (
              <TableRow><TableCell colSpan={7} className='text-muted-foreground py-8 text-center'>No hay activos con esos filtros.</TableCell></TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
      {filas.length > 10 ? <Paginador pagina={pagina} total={data?.total || 0} limite={limite} setPagina={setPagina} setLimite={setLimite} /> : null}
    </div>
  )
}

function ListaVencimientos({ fetcher, q, alcance, tx, abrir }: { fetcher: Fetcher; q: (p: string) => string; alcance: string; tx: Taxonomia | undefined; abrir: (id: string) => void }) {
  const [semaforo, setSemaforo] = useState('')
  const [tipo, setTipo] = useState('')
  const { data = [], isLoading } = useQuery<Vencimiento[]>({
    queryKey: ['inventario', 'vencimientos', alcance],
    queryFn: () => fetcher(q('/inventario/vencimientos')),
  })
  const filas = data.filter((v) => (!semaforo || v.semaforo === semaforo) && (!tipo || v.tipo === tipo))
  if (isLoading) return <Loader2 className='size-5 animate-spin' />
  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap gap-2'>
        {(['', 'vencido', 'critico', 'proximo', 'al_dia'] as const).map((s) => (
          <Button key={s || 'todos'} size='sm' variant={semaforo === s ? 'default' : 'outline'} onClick={() => setSemaforo(s)}>
            {s ? SEMAFORO[s].texto : 'Todos'} <span className='text-muted-foreground ml-1'>{s ? data.filter((v) => v.semaforo === s).length : data.length}</span>
          </Button>
        ))}
        <Select value={tipo || 'todos'} onValueChange={(v) => setTipo(v === 'todos' ? '' : v)}>
          <SelectTrigger className='ml-auto h-8 w-52'><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value='todos'>Todos los tipos</SelectItem>{Object.entries(tx?.vencimientos || {}).map(([k, n]) => <SelectItem key={k} value={k}>{n}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className='rounded-md border'>
        <Table>
          <TableHeader><TableRow><TableHead>Vence</TableHead><TableHead>Activo</TableHead><TableHead>Qué</TableHead><TableHead className='hidden md:table-cell'>Costo</TableHead><TableHead className='hidden md:table-cell'>Propietario</TableHead><TableHead className='hidden lg:table-cell'>Último aviso</TableHead></TableRow></TableHeader>
          <TableBody>
            {filas.map((v) => (
              <TableRow key={v.id} className='cursor-pointer' onClick={() => abrir(v.activo_id)}>
                <TableCell><Badge variant='outline' className={SEMAFORO[v.semaforo || 'al_dia'].clase}>{fecha(v.fecha)}</Badge><div className='text-muted-foreground text-xs'>{cuandoVence(v.dias)}</div></TableCell>
                <TableCell className='font-medium'>{v.activo_nombre}</TableCell>
                <TableCell className='text-sm'>{tx?.vencimientos[v.tipo] || v.tipo}{v.renovacion_auto ? <div className='text-muted-foreground text-xs'>renovación automática</div> : null}</TableCell>
                <TableCell className='hidden text-sm md:table-cell'>{dinero(v.costo_renovacion, v.moneda)}</TableCell>
                <TableCell className='hidden text-sm md:table-cell'>{v.propietario || <span className='text-muted-foreground'>Sin propietario</span>}</TableCell>
                <TableCell className='text-muted-foreground hidden text-xs lg:table-cell'>{v.ultimo_aviso ? fecha(v.ultimo_aviso) : '-'}</TableCell>
              </TableRow>
            ))}
            {!filas.length ? <TableRow><TableCell colSpan={6} className='text-muted-foreground py-8 text-center'>Sin vencimientos en esta vista.</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function ListaEntregas({ fetcher, q, alcance, abrir }: { fetcher: Fetcher; q: (p: string) => string; alcance: string; abrir: (id: string) => void }) {
  const [pendientes, setPendientes] = useState(true)
  const [persona, setPersona] = useState('')
  const { data = [], isLoading } = useQuery<Asignacion[]>({
    queryKey: ['inventario', 'entregas', alcance, pendientes],
    queryFn: () => fetcher(q(`/inventario/asignaciones${pendientes ? '?pendientes=1' : ''}`)),
  })
  const filas = data.filter((s) => !persona || s.persona.toLowerCase().includes(persona.toLowerCase()))
  if (isLoading) return <Loader2 className='size-5 animate-spin' />
  return (
    <div className='space-y-3'>
      <p className='text-muted-foreground text-sm'>Lo que cada persona tiene en su poder. Es lo que se revisa cuando alguien deja la organización: nada se da de baja en el sistema sin que vuelva lo entregado.</p>
      <div className='flex flex-wrap items-center gap-3'>
        <Input className='h-9 w-64' placeholder='Buscar persona...' value={persona} onChange={(e) => setPersona(e.target.value)} />
        <label className='flex items-center gap-2 text-sm'><Switch checked={pendientes} onCheckedChange={setPendientes} />Solo sin devolver</label>
      </div>
      <div className='rounded-md border'>
        <Table>
          <TableHeader><TableRow><TableHead>Persona</TableHead><TableHead>Activo</TableHead><TableHead>Entregado</TableHead><TableHead>Uso aceptable</TableHead><TableHead>Devuelto</TableHead></TableRow></TableHeader>
          <TableBody>
            {filas.map((s) => (
              <TableRow key={s.id} className='cursor-pointer' onClick={() => abrir(s.activo_id)}>
                <TableCell className='font-medium'>{s.persona}{s.persona_correo ? <div className='text-muted-foreground text-xs'>{s.persona_correo}</div> : null}</TableCell>
                <TableCell>{s.activo_nombre}{s.serie ? <div className='text-muted-foreground text-xs'>S/N {s.serie}</div> : null}</TableCell>
                <TableCell>{fecha(s.entregado_at)}</TableCell>
                <TableCell>{s.acepto_uso ? 'Sí' : <span className='text-yellow-700 dark:text-yellow-400'>Sin registrar</span>}</TableCell>
                <TableCell>{s.devuelto_at ? fecha(s.devuelto_at) : <Badge variant='outline'>Pendiente</Badge>}</TableCell>
              </TableRow>
            ))}
            {!filas.length ? <TableRow><TableCell colSpan={5} className='text-muted-foreground py-8 text-center'>Sin entregas en esta vista.</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function DialogoAlta({ abierto, onClose, tx, fetcher, q, onCreado }: {
  abierto: boolean; onClose: () => void; tx: Taxonomia | undefined; fetcher: Fetcher; q: (p: string) => string; onCreado: (id: string) => void
}) {
  const vacio = { nombre: '', categoria: 'hardware', tipo: 'pc', criticidad: 'media', propietario: '', propietario_correo: '', serie: '', numero_inventario: '', ubicacion: '', cantidad: '1' }
  const [f, setF] = useState(vacio)
  const [enviando, setEnviando] = useState(false)
  const [duplicado, setDuplicado] = useState<string | null>(null)
  useEffect(() => { if (abierto) { setF(vacio); setDuplicado(null) } }, [abierto])  // eslint-disable-line react-hooks/exhaustive-deps
  const tipos = tx?.categorias[f.categoria]?.tipos || {}
  async function crear(forzar = false) {
    setEnviando(true)
    try {
      const r = await fetcher<{ id: string }>(q('/inventario'), { method: 'POST', body: JSON.stringify({ ...f, cantidad: Number(f.cantidad) || 1, forzar }) })
      toast.success('Activo creado: completá sus vencimientos en la ficha')
      onCreado(r.id)
    } catch (e) {
      const err = e as Error & { code?: string }
      if (err.code === 'duplicado') setDuplicado(err.message)
      else toast.error(err.message)
    } finally { setEnviando(false) }
  }
  const campo = (k: keyof typeof vacio, label: string, tipo = 'text') => (
    <div className='space-y-1'><Label className='text-muted-foreground text-xs'>{label}</Label><Input type={tipo} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
  )
  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader><DialogTitle>Nuevo activo</DialogTitle><DialogDescription>Lo esencial para identificarlo. Vencimientos, compra y valoración se completan en la ficha.</DialogDescription></DialogHeader>
        <div className='grid gap-3 sm:grid-cols-2'>
          {campo('nombre', 'Nombre')}
          <div className='grid grid-cols-2 gap-2'>
            <div className='space-y-1'><Label className='text-muted-foreground text-xs'>Categoría</Label>
              <Select value={f.categoria} onValueChange={(v) => setF({ ...f, categoria: v, tipo: Object.keys(tx?.categorias[v]?.tipos || {})[0] || '' })}>
                <SelectTrigger className='w-full'><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(tx?.categorias || {}).map(([k, c]) => <SelectItem key={k} value={k}>{c.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className='space-y-1'><Label className='text-muted-foreground text-xs'>Tipo</Label>
              <Select value={f.tipo} onValueChange={(v) => setF({ ...f, tipo: v })}>
                <SelectTrigger className='w-full'><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(tipos).map(([k, n]) => <SelectItem key={k} value={k}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {campo('propietario', 'Propietario (responde por el activo)')}
          {campo('propietario_correo', 'Correo del propietario (recibe los avisos)', 'email')}
          {campo('serie', 'Número de serie')}
          {campo('numero_inventario', 'N° de inventario')}
          {campo('ubicacion', 'Ubicación')}
          <div className='grid grid-cols-2 gap-2'>
            {campo('cantidad', 'Cantidad', 'number')}
            <div className='space-y-1'><Label className='text-muted-foreground text-xs'>Criticidad</Label>
              <Select value={f.criticidad} onValueChange={(v) => setF({ ...f, criticidad: v })}>
                <SelectTrigger className='w-full'><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(CRITICIDAD).map(([k, c]) => <SelectItem key={k} value={k}>{c.texto}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </div>
        {duplicado ? <p className='flex items-center gap-2 rounded border border-yellow-500/40 bg-yellow-500/5 p-2 text-sm'><AlertTriangle className='size-4' />{duplicado}</p> : null}
        <DialogFooter>
          <Button variant='ghost' onClick={onClose}>Cancelar</Button>
          {duplicado ? <Button variant='outline' disabled={enviando} onClick={() => crear(true)}>Crear igual</Button> : null}
          <Button disabled={!f.nombre.trim() || enviando} onClick={() => crear(false)}>{enviando ? <Loader2 className='mr-1 size-4 animate-spin' /> : null}Crear</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogoImportar({ abierto, onClose, fetcher, q, onListo }: { abierto: boolean; onClose: () => void; fetcher: Fetcher; q: (p: string) => string; onListo: () => void }) {
  const [texto, setTexto] = useState('')
  const [nombre, setNombre] = useState('')
  const [simulacion, setSimulacion] = useState<{ filas: number; columnas: { origen: string; campo: string | null }[]; ignoradas: string[] } | null>(null)
  const [resultado, setResultado] = useState<Record<string, number> | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  useEffect(() => { if (abierto) { setTexto(''); setNombre(''); setSimulacion(null); setResultado(null) } }, [abierto])

  async function leer(archivo: File) {
    setNombre(archivo.name)
    const t = await archivo.text()
    setTexto(t)
    setTrabajando(true)
    try { setSimulacion(await fetcher(q('/inventario/importar'), { method: 'POST', body: JSON.stringify({ csv: t, simular: true }) })) }
    catch (e) { toast.error((e as Error).message); setSimulacion(null) } finally { setTrabajando(false) }
  }
  async function confirmar() {
    setTrabajando(true)
    try {
      const r = await fetcher<{ resumen: Record<string, number> }>(q('/inventario/importar'), { method: 'POST', body: JSON.stringify({ csv: texto }) })
      setResultado(r.resumen); onListo()
    } catch (e) { toast.error((e as Error).message) } finally { setTrabajando(false) }
  }
  const NOMBRES: Record<string, string> = { nuevo: 'nuevos', vinculado: 'ya existían (vinculados)', actualizado: 'actualizados', nuevo_con_duda: 'nuevos con posible duplicado', descartado: 'descartados (sin nombre ni IP)', vencimientos: 'vencimientos cargados' }
  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'><FileSpreadsheet className='size-5' />Importar planilla</DialogTitle>
          <DialogDescription>CSV exportado de Excel o Google Sheets. Se reconocen las columnas habituales en español o inglés (nombre, serie, marca, modelo, IP, ubicación, responsable, garantía, soporte, contrato...). Un equipo que ya existe se completa en vez de duplicarse.</DialogDescription>
        </DialogHeader>
        {resultado ? (
          <div className='space-y-1 text-sm'>
            {Object.entries(resultado).filter(([, n]) => n).map(([k, n]) => <div key={k}><b>{n}</b> {NOMBRES[k] || k}</div>)}
          </div>
        ) : (
          <div className='space-y-3'>
            <Input type='file' accept='.csv,text/csv' onChange={(e) => e.target.files?.[0] && leer(e.target.files[0])} />
            {trabajando ? <Loader2 className='size-4 animate-spin' /> : null}
            {simulacion ? (
              <div className='space-y-2 text-sm'>
                <p><b>{nombre}</b>: {simulacion.filas} fila{simulacion.filas === 1 ? '' : 's'} para importar.</p>
                <div className='flex flex-wrap gap-1'>
                  {simulacion.columnas.map((c) => <Badge key={c.origen} variant={c.campo ? 'secondary' : 'outline'} className={c.campo ? '' : 'opacity-60'}>{c.origen}{c.campo ? ` → ${c.campo.replace('venc_', 'vence: ')}` : ' (se ignora)'}</Badge>)}
                </div>
              </div>
            ) : null}
          </div>
        )}
        <DialogFooter>
          <Button variant='ghost' onClick={onClose}>{resultado ? 'Cerrar' : 'Cancelar'}</Button>
          {!resultado ? <Button disabled={!simulacion || trabajando} onClick={confirmar}>Importar {simulacion?.filas || ''} filas</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface Duda {
  id: string; criterio: string; fuente: string
  a: Record<string, string | null> & { fuentes: { fuente: string }[] }
  b: Record<string, string | null> & { fuentes: { fuente: string }[] }
  discrepancias: { campo: string; valores: Record<string, string> }[]
}

function DialogoDuplicados({ abierto, onClose, fetcher, q, onCambio }: { abierto: boolean; onClose: () => void; fetcher: Fetcher; q: (p: string) => string; onCambio: () => void }) {
  const { data = [], refetch } = useQuery<Duda[]>({ queryKey: ['inventario', 'uniones'], queryFn: () => fetcher(q('/inventario/uniones')), enabled: abierto })
  async function resolver(d: Duda, accion: 'fusionar' | 'descartar', principal?: string) {
    try {
      await fetcher(q(`/inventario/uniones/${d.id}/${accion}`), { method: 'POST', body: JSON.stringify({ principal }) })
      toast.success(accion === 'fusionar' ? 'Activos unidos' : 'Marcados como distintos')
      refetch(); onCambio()
    } catch (e) { toast.error((e as Error).message) }
  }
  const lado = (x: Duda['a'], titulo: string) => (
    <div className='flex-1 rounded border p-2 text-xs'>
      <div className='text-muted-foreground mb-1'>{titulo}</div>
      <div className='font-medium'>{x.nombre}</div>
      {(['ip', 'hostname', 'serie', 'mac', 'so'] as const).map((k) => x[k] ? <div key={k}><span className='text-muted-foreground'>{k}:</span> {x[k]}</div> : null)}
      <div className='text-muted-foreground mt-1'>{x.fuentes.map((f) => FUENTE[f.fuente] || f.fuente).join(', ')}</div>
    </div>
  )
  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='max-h-[85vh] overflow-y-auto sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>Posibles duplicados</DialogTitle>
          <DialogDescription>Activos que se parecen pero no tienen un dato fuerte (serie o MAC) que confirme que son el mismo. Unir no se puede deshacer: lo que colgaba del que se absorbe pasa al que queda.</DialogDescription>
        </DialogHeader>
        {!data.length ? <p className='text-muted-foreground text-sm'>No hay dudas pendientes.</p> : null}
        {data.map((d) => (
          <div key={d.id} className='space-y-2 border-b pb-3'>
            <div className='text-sm'>Coinciden por <b>{d.criterio}</b>{d.discrepancias.length ? <span className='text-yellow-700 dark:text-yellow-400'> · difieren en {d.discrepancias.map((x) => x.campo).join(', ')}</span> : ' · nada se contradice'}</div>
            <div className='flex gap-2'>{lado(d.a, 'Recién llegado')}{lado(d.b, 'Ya estaba')}</div>
            <div className='flex flex-wrap gap-2'>
              <Button size='sm' onClick={() => resolver(d, 'fusionar', d.b.id || undefined)}>Unir (queda el que ya estaba)</Button>
              <Button size='sm' variant='outline' onClick={() => resolver(d, 'fusionar', d.a.id || undefined)}>Unir (queda el recién llegado)</Button>
              <Button size='sm' variant='ghost' onClick={() => resolver(d, 'descartar')}>Son distintos</Button>
            </div>
          </div>
        ))}
      </DialogContent>
    </Dialog>
  )
}
