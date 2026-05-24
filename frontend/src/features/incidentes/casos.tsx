import { useState, useEffect } from 'react'
import { ShieldAlert, Plus, Loader2, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PaginationBar } from '@/components/ui/pagination-bar'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

const SEV_COLORS: Record<string, string> = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#22c55e' }
const TLP_META: Record<number, { label: string; color: string }> = {
  0: { label: 'WHITE', color: '#94a3b8' }, 1: { label: 'GREEN', color: '#22c55e' },
  2: { label: 'AMBER', color: '#f59e0b' }, 3: { label: 'RED', color: '#ef4444' },
}

function fmtDate(d: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function CasosView() {
  const { t } = useTranslation()
  const { auth } = useAuthStore()
  const [cases, setCases] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ title: '', description: '', severity: 'medium', tlp: 2, tags: '' })
  const [creating, setCreating] = useState(false)
  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [filterStatus, setFilterStatus] = useState('__all__')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const SEV_LABELS: Record<string, string> = {
    critical: t('incidents.casos.sev.critical'),
    high: t('incidents.casos.sev.high'),
    medium: t('incidents.casos.sev.medium'),
    low: t('incidents.casos.sev.low'),
  }
  const STAT_LABELS: Record<string, string> = {
    open: t('incidents.casos.stat.open'),
    investigating: t('incidents.casos.stat.investigating'),
    resolved: t('incidents.casos.stat.resolved'),
    closed: t('incidents.casos.stat.closed'),
  }

  async function loadCases() {
    setLoading(true)
    try {
      const d = await apiFetch<{ cases: any[] }>('/cases?limit=100')
      setCases(d.cases || [])
    } catch (e: any) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadCases() }, [])

  async function selectCase(c: any) {
    setSelected(null); setDetailLoading(true); setEditMode(false)
    try {
      const d = await apiFetch<any>(`/cases/${c.id}`)
      setSelected(d.case || d)
      setEditForm({ title: d.case?.title || d.title, description: d.case?.description || d.description || '', severity: d.case?.severity || d.severity, status: d.case?.status || d.status, tlp: d.case?.tlp ?? d.tlp ?? 2 })
    } catch (e: any) { toast.error(e.message) }
    finally { setDetailLoading(false) }
  }

  async function createCase() {
    setCreating(true)
    try {
      await apiFetch('/cases', { method: 'POST', body: JSON.stringify(createForm) })
      toast.success(t('incidents.casos.created')); setShowCreate(false)
      setCreateForm({ title: '', description: '', severity: 'medium', tlp: 2, tags: '' })
      loadCases()
    } catch (e: any) { toast.error(e.message) }
    finally { setCreating(false) }
  }

  async function saveEdits() {
    setSaving(true)
    try {
      await apiFetch(`/cases/${selected.id}`, { method: 'PUT', body: JSON.stringify(editForm) })
      toast.success(t('incidents.casos.saved'))
      await selectCase(selected)
      setEditMode(false)
      loadCases()
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  async function addNote() {
    if (!newNote.trim()) return
    setAddingNote(true)
    try {
      await apiFetch(`/cases/${selected.id}/notes`, { method: 'POST', body: JSON.stringify({ content: newNote }) })
      setNewNote('')
      await selectCase(selected)
    } catch (e: any) { toast.error(e.message) }
    finally { setAddingNote(false) }
  }

  const filtered = filterStatus && filterStatus !== '__all__' ? cases.filter(c => c.status === filterStatus) : cases
  const paged = pageSize === 0 ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div className='p-8'>
      <div className='flex items-start justify-between mb-6'>
        <div>
          <h1 className='text-2xl font-bold flex items-center gap-2'>
            <ShieldAlert className='h-5 w-5 text-primary' />
            {t('incidents.casos.title')}
          </h1>
          <p className='text-sm text-muted-foreground mt-1'>{t('incidents.casos.desc')}</p>
        </div>
        <div className='flex items-center gap-2'>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className='w-36 h-8 text-sm'><SelectValue placeholder={t('incidents.casos.all')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value='__all__'>{t('incidents.casos.all')}</SelectItem>
              {Object.entries(STAT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size='sm' onClick={() => setShowCreate(true)}><Plus className='h-3.5 w-3.5 mr-1' />{t('incidents.casos.new')}</Button>
        </div>
      </div>

      <div className='flex gap-4'>
        <div className='w-80 shrink-0 flex flex-col gap-2'>
          {loading ? (
            <div className='flex items-center gap-2 text-sm text-muted-foreground'><Loader2 className='h-3.5 w-3.5 animate-spin' /> {t('common.loading')}</div>
          ) : paged.map(c => (
            <div
              key={c.id}
              className={cn('rounded-lg border bg-card px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors', selected?.id === c.id && 'border-primary/40 bg-muted/30')}
              onClick={() => selectCase(c)}
            >
              <div className='flex items-center gap-2 mb-1'>
                <div className='w-1.5 h-1.5 rounded-full shrink-0' style={{ background: SEV_COLORS[c.severity] }} />
                <span className='text-xs font-semibold text-muted-foreground'>{STAT_LABELS[c.status]}</span>
              </div>
              <div className='text-sm font-medium truncate'>{c.title}</div>
              <div className='text-[11px] text-muted-foreground mt-0.5'>{fmtDate(c.created_at)}</div>
            </div>
          ))}
          {!loading && filtered.length === 0 && <p className='text-sm text-muted-foreground'>{t('incidents.casos.noCases')}</p>}
          {!loading && filtered.length > 0 && (
            <PaginationBar
              total={filtered.length}
              page={page}
              pageSize={pageSize}
              onPage={setPage}
              onPageSize={s => { setPageSize(s); setPage(1) }}
            />
          )}
        </div>

        <div className='flex-1 min-w-0'>
          {detailLoading && (
            <div className='flex items-center gap-2 text-sm text-muted-foreground'><Loader2 className='h-4 w-4 animate-spin' /> {t('common.loading')}</div>
          )}
          {selected && !detailLoading && (
            <div className='rounded-lg border bg-card px-5 py-4'>
              <div className='flex items-start justify-between mb-4'>
                <div>
                  <div className='flex items-center gap-2 mb-1'>
                    <Badge className='text-[10px]' style={{ background: SEV_COLORS[selected.severity] + '22', color: SEV_COLORS[selected.severity], border: `1px solid ${SEV_COLORS[selected.severity]}44` }}>
                      {SEV_LABELS[selected.severity]}
                    </Badge>
                    <Badge variant='outline' className='text-[10px]'>{STAT_LABELS[selected.status]}</Badge>
                    {selected.tlp != null && (
                      <span className='text-[10px] font-bold rounded px-1.5 py-0.5' style={{ background: TLP_META[selected.tlp]?.color + '22', color: TLP_META[selected.tlp]?.color }}>
                        TLP:{TLP_META[selected.tlp]?.label}
                      </span>
                    )}
                  </div>
                  <h2 className='text-lg font-bold'>{selected.title}</h2>
                  {selected.assigned_to && <p className='text-xs text-muted-foreground'>{t('incidents.casos.assignedTo', { name: selected.assigned_to })}</p>}
                </div>
                <div className='flex gap-2'>
                  <Button variant='outline' size='sm' onClick={() => setEditMode(!editMode)}>
                    {editMode ? t('incidents.casos.cancelEdit') : t('incidents.casos.edit')}
                  </Button>
                </div>
              </div>

              {editMode ? (
                <div className='flex flex-col gap-3 mb-4 p-4 rounded-lg bg-muted/30'>
                  <div><Label className='text-xs mb-1 block text-muted-foreground'>{t('incidents.casos.editTitle')}</Label><Input value={editForm.title} onChange={e => setEditForm((f: any) => ({ ...f, title: e.target.value }))} className='h-8 text-sm' /></div>
                  <div className='grid grid-cols-2 gap-3'>
                    <div><Label className='text-xs mb-1 block text-muted-foreground'>{t('incidents.casos.editSev')}</Label>
                      <Select value={editForm.severity} onValueChange={v => setEditForm((f: any) => ({ ...f, severity: v }))}><SelectTrigger className='h-8 text-sm'><SelectValue /></SelectTrigger><SelectContent>{Object.entries(SEV_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
                    </div>
                    <div><Label className='text-xs mb-1 block text-muted-foreground'>{t('incidents.casos.editStat')}</Label>
                      <Select value={editForm.status} onValueChange={v => setEditForm((f: any) => ({ ...f, status: v }))}><SelectTrigger className='h-8 text-sm'><SelectValue /></SelectTrigger><SelectContent>{Object.entries(STAT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
                    </div>
                  </div>
                  <div><Label className='text-xs mb-1 block text-muted-foreground'>{t('incidents.casos.editDesc')}</Label><Textarea value={editForm.description} onChange={e => setEditForm((f: any) => ({ ...f, description: e.target.value }))} rows={3} className='text-sm' /></div>
                  <Button size='sm' disabled={saving} onClick={saveEdits}>{saving ? <Loader2 className='h-3.5 w-3.5 animate-spin mr-1' /> : null}{t('incidents.casos.saveChanges')}</Button>
                </div>
              ) : (
                selected.description && <p className='text-sm text-muted-foreground mb-4'>{selected.description}</p>
              )}

              <Tabs defaultValue='notas'>
                <TabsList className='mb-4'>
                  <TabsTrigger value='notas'>{t('incidents.casos.tab.notes')}{selected.notes?.length ? ` (${selected.notes.length})` : ''}</TabsTrigger>
                  <TabsTrigger value='observables'>{t('incidents.casos.tab.observables')}{selected.observables?.length ? ` (${selected.observables.length})` : ''}</TabsTrigger>
                  <TabsTrigger value='actividad'>{t('incidents.casos.tab.activity')}</TabsTrigger>
                </TabsList>

                <TabsContent value='notas'>
                  <div className='flex flex-col gap-2 mb-4'>
                    {(selected.notes || []).map((n: any) => (
                      <div key={n.id} className='rounded-lg bg-muted/40 px-3 py-2 text-sm'>
                        <div className='text-xs text-muted-foreground mb-1'>{n.author} · {fmtDate(n.created_at)}</div>
                        <div className='whitespace-pre-wrap'>{n.content}</div>
                      </div>
                    ))}
                    {!selected.notes?.length && <p className='text-sm text-muted-foreground'>{t('incidents.casos.noNotes')}</p>}
                  </div>
                  <div className='flex gap-2'>
                    <Textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder={t('incidents.casos.addNote')} rows={2} className='text-sm flex-1' />
                    <Button size='sm' className='self-end' disabled={addingNote || !newNote.trim()} onClick={addNote}>
                      {addingNote ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : t('incidents.casos.add')}
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value='observables'>
                  {(selected.observables || []).length === 0
                    ? <p className='text-sm text-muted-foreground'>{t('incidents.casos.noObservables')}</p>
                    : (selected.observables || []).map((obs: any) => (
                      <div key={obs.id} className='rounded border px-3 py-2 mb-2 text-sm flex items-center gap-3'>
                        <Badge variant='secondary' className='text-[10px] shrink-0'>{obs.obs_type}</Badge>
                        <span className='font-mono text-xs flex-1 break-all'>{obs.value}</span>
                      </div>
                    ))
                  }
                </TabsContent>

                <TabsContent value='actividad'>
                  <div className='flex flex-col gap-1.5'>
                    {(selected.activity || []).map((a: any, i: number) => (
                      <div key={i} className='flex items-start gap-3 text-sm'>
                        <ChevronRight className='h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0' />
                        <div className='flex-1'>
                          <span className='font-medium'>{a.action_label || a.action}</span>
                          {a.detail && <span className='text-muted-foreground ml-2 text-xs'>{a.detail}</span>}
                        </div>
                        <span className='text-xs text-muted-foreground shrink-0'>{fmtDate(a.ts)}</span>
                      </div>
                    ))}
                    {!selected.activity?.length && <p className='text-sm text-muted-foreground'>{t('incidents.casos.noActivity')}</p>}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className='max-w-md'>
          <DialogHeader><DialogTitle>{t('incidents.casos.newModal')}</DialogTitle></DialogHeader>
          <div className='flex flex-col gap-3 pt-2'>
            <div><Label className='text-xs mb-1 block text-muted-foreground'>{t('incidents.casos.editTitle')}</Label><Input value={createForm.title} onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))} className='h-8 text-sm' /></div>
            <div className='grid grid-cols-2 gap-3'>
              <div><Label className='text-xs mb-1 block text-muted-foreground'>{t('incidents.casos.editSev')}</Label>
                <Select value={createForm.severity} onValueChange={v => setCreateForm(f => ({ ...f, severity: v }))}><SelectTrigger className='h-8 text-sm'><SelectValue /></SelectTrigger><SelectContent>{Object.entries(SEV_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
              </div>
              <div><Label className='text-xs mb-1 block text-muted-foreground'>TLP</Label>
                <Select value={String(createForm.tlp)} onValueChange={v => setCreateForm(f => ({ ...f, tlp: +v }))}><SelectTrigger className='h-8 text-sm'><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TLP_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent></Select>
              </div>
            </div>
            <div><Label className='text-xs mb-1 block text-muted-foreground'>{t('incidents.casos.editDesc')}</Label><Textarea value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} rows={3} className='text-sm' /></div>
            <div className='flex gap-2 pt-1'>
              <Button disabled={creating || !createForm.title} onClick={createCase}>{creating ? <Loader2 className='h-3.5 w-3.5 animate-spin mr-1' /> : null}{t('incidents.casos.create')}</Button>
              <Button variant='ghost' onClick={() => setShowCreate(false)}>{t('incidents.casos.cancel')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
