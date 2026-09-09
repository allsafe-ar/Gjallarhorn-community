/**
 * Detalle de un activo: qué se le mide y cómo está cada cosa.
 *
 * Va en un panel lateral y no en una pantalla aparte porque el trabajo real es ir mirando
 * activos de a uno sin perder la lista de vista.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, Loader2, Radar, Check, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { apiFetch } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { EstadoBadge } from './estado'

type Chequeo = {
  id: string; tipo: 'icmp' | 'tcp' | 'http'; destino: string | null
  intervalo_seg: number; timeout_ms: number; umbral_fallos: number; esperado: number
  estado: string | null; fallos_seguidos: number | null; latencia_ms: number | null
  ultimo_ok: string | null; ultimo_error: string | null; medido_at: string | null
}
type Activo = {
  id: string; nombre: string; alias: string | null; ip: string | null; hostname: string | null
  origen: string; criticidad: string; monitoreado: number; notas: string | null
  so: string | null; so_pista: string | null; sondeado_at: string | null
  puertos: { puerto: number; servicio: string }[] | null
}

const VACIO = { tipo: 'icmp' as const, destino: '', intervalo_seg: 60, timeout_ms: 5000, umbral_fallos: 3, esperado: 0 }

export function DetalleActivo({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { t } = useTranslation()
  const { auth } = useAuthStore()
  const qc = useQueryClient()
  const esAdmin = auth.user?.role === 'admin'
  const [form, setForm] = useState<typeof VACIO>(VACIO)
  const [agregando, setAgregando] = useState(false)
  const [editandoAlias, setEditandoAlias] = useState(false)
  const [alias, setAlias] = useState('')

  const { data, isLoading } = useQuery<{ activo: Activo; chequeos: Chequeo[] }>({
    queryKey: ['monitor-chequeos', id],
    queryFn: () => apiFetch(`/monitoreo/activos/${id}/chequeos`),
    enabled: !!id,
  })


  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['monitor-chequeos', id] })
    qc.invalidateQueries({ queryKey: ['monitor-activos'] })
  }

  const crear = useMutation({
    mutationFn: () => apiFetch(`/monitoreo/activos/${id}/chequeos`, {
      method: 'POST', body: JSON.stringify(form),
    }),
    onSuccess: () => { toast.success(t('monitoreo.chequeoCreado')); setAgregando(false); setForm(VACIO); refrescar() },
    onError: (e: Error) => toast.error(e.message),
  })

  const borrar = useMutation({
    mutationFn: (cid: string) => apiFetch(`/monitoreo/chequeos/${cid}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success(t('monitoreo.chequeoBorrado')); refrescar() },
    onError: (e: Error) => toast.error(e.message),
  })

  const sondear = useMutation({
    mutationFn: () => apiFetch<{ so: string | null; puertos: unknown[] }>(`/monitoreo/activos/${id}/sondear`, { method: 'POST' }),
    onSuccess: (r) => { toast.success(t('monitoreo.sondeoListo', { n: r.puertos.length })); refrescar() },
    onError: (e: Error) => toast.error(e.message),
  })

  const guardarAlias = useMutation({
    mutationFn: () => apiFetch(`/monitoreo/activos/${id}`, {
      method: 'PUT', body: JSON.stringify({ alias }),
    }),
    onSuccess: () => { setEditandoAlias(false); refrescar() },
    onError: (e: Error) => toast.error(e.message),
  })

  const alternarMedicion = useMutation({
    mutationFn: (v: boolean) => apiFetch(`/monitoreo/activos/${id}`, {
      method: 'PUT', body: JSON.stringify({ monitoreado: v }),
    }),
    onSuccess: refrescar,
    onError: (e: Error) => toast.error(e.message),
  })

  const a = data?.activo

  return (
    <Sheet open={!!id} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent className='w-full sm:max-w-lg overflow-y-auto'>
        <SheetHeader>
          <SheetTitle>{a ? (a.alias || a.nombre) : '...'}</SheetTitle>
          <SheetDescription>
            {a ? [a.ip || a.hostname, a.origen === 'zabbix' ? 'Zabbix' : t('monitoreo.origenPropio')]
              .filter(Boolean).join(' · ') : ''}
          </SheetDescription>
        </SheetHeader>

        <div className='px-4 pb-6 space-y-5'>
          {/* Un activo de Zabbix llega con la medición propia apagada: el aviso explica por qué. */}
          {a && esAdmin && (
            <div className='flex items-start justify-between gap-3 rounded-md border p-3'>
              <div>
                <Label className='text-sm'>{t('monitoreo.medirDesdeAca')}</Label>
                <p className='text-xs text-muted-foreground mt-0.5'>
                  {a.origen === 'zabbix' ? t('monitoreo.medirZabbixAviso') : t('monitoreo.medirAviso')}
                </p>
              </div>
              <Switch
                checked={!!a.monitoreado}
                onCheckedChange={(v) => alternarMedicion.mutate(v)}
              />
            </div>
          )}


          {/* Alias: el nombre con el que el cliente lo llama. Se edita en el lugar porque
              es lo primero que alguien quiere cambiar al abrir un equipo importado. */}
          {a && esAdmin && (
            <div className='rounded-md border p-3'>
              <Label className='text-xs'>{t('monitoreo.alias')}</Label>
              {editandoAlias ? (
                <div className='mt-1 flex gap-2'>
                  <Input value={alias} onChange={(e) => setAlias(e.target.value)}
                    placeholder={t('monitoreo.aliasEjemplo')} autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') guardarAlias.mutate() }} />
                  <Button size='sm' onClick={() => guardarAlias.mutate()} disabled={guardarAlias.isPending}>
                    <Check className='size-3.5' />
                  </Button>
                </div>
              ) : (
                <div className='mt-1 flex items-center gap-2'>
                  <span className='text-sm'>{a.alias || <span className='text-muted-foreground'>{t('monitoreo.sinAlias')}</span>}</span>
                  <button className='text-muted-foreground hover:text-foreground'
                    onClick={() => { setAlias(a.alias ?? ''); setEditandoAlias(true) }}>
                    <Pencil className='size-3' />
                  </button>
                </div>
              )}
              <p className='mt-1 text-[11px] text-muted-foreground'>{t('monitoreo.aliasAyuda')}</p>
            </div>
          )}

          {/* Qué es y qué expone. Es un sondeo bajo pedido, no un dato permanente. */}
          {a && (
            <div className='rounded-md border p-3'>
              <div className='flex items-center justify-between'>
                <h3 className='text-sm font-semibold'>{t('monitoreo.queEs')}</h3>
                {esAdmin && (
                  <Button size='sm' variant='outline' onClick={() => sondear.mutate()} disabled={sondear.isPending}>
                    {sondear.isPending ? <Loader2 className='size-3.5 animate-spin' /> : <Radar className='size-3.5' />}
                    {t('monitoreo.sondear')}
                  </Button>
                )}
              </div>
              {!a.sondeado_at ? (
                <p className='mt-2 text-xs text-muted-foreground'>{t('monitoreo.sinSondeo')}</p>
              ) : (
                <div className='mt-2 space-y-2 text-sm'>
                  <div>
                    <span className='text-muted-foreground'>{t('monitoreo.so')}: </span>
                    {a.so || t('monitoreo.soDesconocido')}
                    {/* El TTL es una pista, no un dato: se dice de dónde sale para que
                        nadie lo tome como declaración del fabricante. */}
                    {a.so_pista && <span className='ml-1 text-xs text-muted-foreground'>({t('monitoreo.estimado')}, {a.so_pista})</span>}
                  </div>
                  <div>
                    <span className='text-muted-foreground'>{t('monitoreo.puertos')}: </span>
                    {Array.isArray(a.puertos) && a.puertos.length ? (
                      <span className='inline-flex flex-wrap gap-1 align-middle'>
                        {a.puertos.map((p) => (
                          <Badge key={p.puerto} variant='outline' className='text-xs'>
                            {p.puerto} · {p.servicio}
                          </Badge>
                        ))}
                      </span>
                    ) : t('monitoreo.sinPuertos')}
                  </div>
                  <p className='text-[11px] text-muted-foreground'>
                    {t('monitoreo.sondeadoEl', { fecha: new Date(a.sondeado_at).toLocaleString('es-AR') })}
                  </p>
                </div>
              )}
            </div>
          )}

          <div>
            <div className='mb-2 flex items-center justify-between'>
              <h3 className='text-sm font-semibold'>{t('monitoreo.chequeos')}</h3>
              {esAdmin && !agregando && (
                <Button size='sm' variant='outline' onClick={() => setAgregando(true)}>
                  <Plus className='size-3.5' />{t('monitoreo.agregarChequeo')}
                </Button>
              )}
            </div>

            {isLoading ? (
              <p className='text-sm text-muted-foreground py-4'>
                <Loader2 className='size-3.5 animate-spin inline mr-2' />{t('common.loading')}
              </p>
            ) : !data?.chequeos.length ? (
              <p className='text-sm text-muted-foreground py-4'>{t('monitoreo.sinChequeos')}</p>
            ) : (
              <div className='space-y-2'>
                {data.chequeos.map((c) => (
                  <div key={c.id} className='rounded-md border p-3 text-sm'>
                    <div className='flex items-center justify-between gap-2'>
                      <div className='flex items-center gap-2'>
                        <Badge variant='outline' className='text-xs uppercase'>{c.tipo}</Badge>
                        {c.destino && <span className='font-mono text-xs text-muted-foreground'>{c.destino}</span>}
                        <EstadoBadge estado={c.estado ?? 'desconocido'} />
                      </div>
                      {esAdmin && (
                        <button
                          className='text-muted-foreground hover:text-destructive'
                          onClick={() => borrar.mutate(c.id)}
                          title={t('monitoreo.borrarChequeo')}
                        >
                          <Trash2 className='size-3.5' />
                        </button>
                      )}
                    </div>
                    <p className='mt-1.5 text-xs text-muted-foreground'>
                      {t('monitoreo.cada', { seg: c.intervalo_seg })} ·{' '}
                      {t('monitoreo.umbralN', { n: c.umbral_fallos })}
                      {c.latencia_ms != null && ` · ${c.latencia_ms} ms`}
                    </p>
                    {c.ultimo_error && (
                      <p className='mt-1 text-xs text-red-600'>{c.ultimo_error}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {agregando && (
              <div className='mt-3 space-y-3 rounded-md border p-3'>
                <div className='grid grid-cols-2 gap-3'>
                  <div>
                    <Label className='text-xs'>{t('monitoreo.tipo')}</Label>
                    <Select value={form.tipo} onValueChange={(v) => setForm(f => ({ ...f, tipo: v as typeof form.tipo }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value='icmp'>{t('monitoreo.tipoIcmp')}</SelectItem>
                        <SelectItem value='tcp'>{t('monitoreo.tipoTcp')}</SelectItem>
                        <SelectItem value='http'>{t('monitoreo.tipoHttp')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.tipo !== 'icmp' && (
                    <div>
                      <Label className='text-xs'>
                        {form.tipo === 'tcp' ? t('monitoreo.puerto') : t('monitoreo.ruta')}
                      </Label>
                      <Input
                        value={form.destino}
                        placeholder={form.tipo === 'tcp' ? '443' : '/'}
                        onChange={(e) => setForm(f => ({ ...f, destino: e.target.value }))}
                      />
                    </div>
                  )}
                </div>
                <div className='grid grid-cols-2 gap-3'>
                  <div>
                    <Label className='text-xs'>{t('monitoreo.intervalo')}</Label>
                    <Input type='number' min={20} value={form.intervalo_seg}
                      onChange={(e) => setForm(f => ({ ...f, intervalo_seg: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <Label className='text-xs'>{t('monitoreo.umbral')}</Label>
                    <Input type='number' min={1} value={form.umbral_fallos}
                      onChange={(e) => setForm(f => ({ ...f, umbral_fallos: Number(e.target.value) }))} />
                    <p className='mt-1 text-[11px] text-muted-foreground'>{t('monitoreo.umbralAyuda')}</p>
                  </div>
                </div>
                <div className='flex justify-end gap-2'>
                  <Button variant='outline' size='sm' onClick={() => { setAgregando(false); setForm(VACIO) }}>
                    {t('common.cancel')}
                  </Button>
                  <Button size='sm' onClick={() => crear.mutate()} disabled={crear.isPending}>
                    {crear.isPending && <Loader2 className='size-3.5 animate-spin mr-1' />}
                    {t('monitoreo.crear')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
