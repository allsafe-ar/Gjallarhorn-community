import { useState, useEffect, useCallback } from 'react'
import { Shield, Plus, Loader2, RefreshCw } from 'lucide-react'
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
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

const SEV_COLORS: Record<number, string> = { 1: '#22c55e', 2: '#f59e0b', 3: '#ef4444', 4: '#7c3aed' }
const SEV_LABELS: Record<number, string> = { 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Critical' }

function fmtDate(val: string | number | undefined) {
  if (!val) return '—'
  const d = new Date(typeof val === 'number' ? val : val)
  return isNaN(d.getTime()) ? String(val) : d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

function SevBadge({ value, text }: { value: number; text: string }) {
  const color = SEV_COLORS[value] || '#6b7280'
  return (
    <span className='inline-flex items-center gap-1 text-xs font-semibold' style={{ color }}>
      <span className='inline-block w-1.5 h-1.5 rounded-full' style={{ background: color }} />
      {text}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === 'Open' || status === 'New' ? 'destructive'
    : status === 'Resolved' || status === 'Closed' ? 'default'
    : 'secondary'
  return <Badge variant={variant} className='text-[10px]'>{status}</Badge>
}

type TheHiveCase = {
  _id: string; caseId?: string; title: string; severity: number
  status: string; owner?: string; assignee?: string; _createdAt?: string; createdAt?: string
}
type TheHiveAlert = {
  _id: string; type?: string; title: string; severity: number
  status: string; source?: string; _createdAt?: string; createdAt?: string
}

type ColDef<T> = {
  key: string; label: string; muted?: boolean
  render?: (row: T) => React.ReactNode
}

function SocTable<T extends Record<string, any>>({ cols, rows, keyField, emptyMsg }: {
  cols: ColDef<T>[]; rows: T[]; keyField: string; emptyMsg: string
}) {
  if (rows.length === 0) {
    return <div className='rounded-lg border bg-card px-4 py-8 text-sm text-center text-muted-foreground'>{emptyMsg}</div>
  }
  return (
    <div className='rounded-lg border bg-card overflow-hidden'>
      <table className='w-full text-sm'>
        <thead>
          <tr className='border-b bg-muted/40'>
            {cols.map(c => (
              <th key={c.key} className='text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground'>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row[keyField] ?? i} className={cn('border-b last:border-0 hover:bg-muted/20 transition-colors')}>
              {cols.map(c => (
                <td key={c.key} className={cn('px-3 py-2.5', c.muted && 'text-muted-foreground text-xs')}>
                  {c.render ? c.render(row) : row[c.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function TheHiveView() {
  const { t } = useTranslation()
  const user = useAuthStore(s => s.user)
  const [cases, setCases] = useState<TheHiveCase[]>([])
  const [alerts, setAlerts] = useState<TheHiveAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', severity: '2', tags: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [cr, ar] = await Promise.all([
        apiFetch('/soc/thehive/cases?limit=50'),
        apiFetch('/soc/thehive/alerts?limit=50'),
      ])
      setCases(cr.cases || []); setAlerts(ar.alerts || [])
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    try {
      const body = {
        title: form.title,
        description: form.description,
        severity: Number(form.severity),
        tags: form.tags ? form.tags.split(',').map(tag => tag.trim()) : [],
      }
      const r = await apiFetch('/soc/thehive/cases', { method: 'POST', body })
      if (r.ok) { toast.success(t('soc.thehive.dialog.create')); setModal(false); load() }
      else toast.error(r.error || t('common.error'))
    } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }

  const canCreate = user?.role === 'admin' || user?.role === 'analyst'

  return (
    <div className='p-8 max-w-6xl'>
      <div className='flex items-center justify-between mb-6'>
        <div>
          <h1 className='text-2xl font-bold flex items-center gap-2'>
            <Shield className='h-5 w-5' style={{ color: '#f59e0b' }} />
            {t('soc.thehive.title')}
          </h1>
          <p className='text-sm text-muted-foreground mt-1'>{t('soc.thehive.subtitle')}</p>
        </div>
        <div className='flex gap-2'>
          <Button variant='outline' size='sm' onClick={load}>
            <RefreshCw className='h-3.5 w-3.5 mr-1.5' />{t('soc.thehive.update')}
          </Button>
          {canCreate && (
            <Button size='sm' onClick={() => setModal(true)}>
              <Plus className='h-3.5 w-3.5 mr-1.5' />{t('soc.thehive.newCase')}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className='rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-6'>
          {error}
        </div>
      )}

      {loading ? (
        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Loader2 className='h-4 w-4 animate-spin' />{t('common.loading')}
        </div>
      ) : (
        <Tabs defaultValue='cases'>
          <TabsList className='mb-4'>
            <TabsTrigger value='cases'>
              {t('soc.thehive.tab.cases')} <span className='ml-1.5 text-[10px] bg-muted px-1.5 py-0.5 rounded-full'>{cases.length}</span>
            </TabsTrigger>
            <TabsTrigger value='alerts'>
              {t('soc.thehive.tab.alerts')} <span className='ml-1.5 text-[10px] bg-muted px-1.5 py-0.5 rounded-full'>{alerts.length}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value='cases'>
            <SocTable
              cols={[
                { key: 'id', label: t('soc.thehive.col.id'), render: r => r.caseId || r._id?.slice(-6) || '—' },
                { key: 'title', label: t('soc.thehive.col.title'), render: r => <span className='font-medium'>{r.title || '—'}</span> },
                { key: 'severity', label: t('soc.thehive.col.severity'), render: r => <SevBadge value={r.severity} text={SEV_LABELS[r.severity] || String(r.severity)} /> },
                { key: 'status', label: t('soc.thehive.col.status'), render: r => <StatusBadge status={r.status || '—'} /> },
                { key: 'owner', label: t('soc.thehive.col.assigned'), muted: true, render: r => r.owner || r.assignee || '—' },
                { key: 'date', label: t('soc.thehive.col.created'), muted: true, render: r => fmtDate(r._createdAt || r.createdAt) },
              ]}
              rows={cases}
              keyField='_id'
              emptyMsg={t('soc.thehive.noCases')}
            />
          </TabsContent>

          <TabsContent value='alerts'>
            <SocTable
              cols={[
                { key: 'type', label: t('soc.thehive.col.type'), render: r => r.type || '—' },
                { key: 'title', label: t('soc.thehive.col.title'), render: r => <span className='font-medium'>{r.title || '—'}</span> },
                { key: 'severity', label: t('soc.thehive.col.severity'), render: r => <SevBadge value={r.severity} text={SEV_LABELS[r.severity] || '—'} /> },
                { key: 'status', label: t('soc.thehive.col.status'), render: r => <StatusBadge status={r.status || '—'} /> },
                { key: 'source', label: t('soc.thehive.col.source'), muted: true, render: r => r.source || '—' },
                { key: 'date', label: t('soc.thehive.col.date'), muted: true, render: r => fmtDate(r._createdAt || r.createdAt) },
              ]}
              rows={alerts}
              keyField='_id'
              emptyMsg={t('soc.thehive.noAlerts')}
            />
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className='max-w-lg'>
          <DialogHeader>
            <DialogTitle>{t('soc.thehive.dialog.title')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className='flex flex-col gap-4 mt-2'>
            <div className='flex flex-col gap-1.5'>
              <Label>{t('soc.thehive.dialog.titleField')}</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder='Incidente de seguridad…' />
            </div>
            <div className='flex flex-col gap-1.5'>
              <Label>{t('soc.thehive.dialog.desc')}</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder='Descripción del incidente…' />
            </div>
            <div className='flex flex-col gap-1.5'>
              <Label>{t('soc.thehive.dialog.severity')}</Label>
              <Select value={form.severity} onValueChange={v => setForm(f => ({ ...f, severity: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value='1'>Low</SelectItem>
                  <SelectItem value='2'>Medium</SelectItem>
                  <SelectItem value='3'>High</SelectItem>
                  <SelectItem value='4'>Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='flex flex-col gap-1.5'>
              <Label>{t('soc.thehive.dialog.tags')}</Label>
              <Input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder='malware, phishing, brute-force' />
            </div>
            <div className='flex gap-2 justify-end'>
              <Button type='button' variant='ghost' onClick={() => setModal(false)}>{t('soc.thehive.dialog.cancel')}</Button>
              <Button type='submit' disabled={!form.title || saving}>
                {saving && <Loader2 className='h-3.5 w-3.5 mr-1.5 animate-spin' />}
                {t('soc.thehive.dialog.create')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
