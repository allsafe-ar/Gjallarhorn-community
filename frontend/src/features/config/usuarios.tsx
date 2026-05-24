import { useState, useEffect, useCallback } from 'react'
import { Users, Plus, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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

const ROLES = ['admin', 'analyst', 'analyst_full', 'phishing_analyst', 'viewer'] as const
type Role = (typeof ROLES)[number]

type User = {
  id: string; username: string; nombre: string; role: Role
  enabled: boolean; has2FA: boolean; created_at: string
}

type UserForm = { username: string; password: string; role: Role; nombre: string }

const EMPTY_FORM: UserForm = { username: '', password: '', role: 'analyst', nombre: '' }

function fmtDate(d: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function UsuariosView() {
  const { t } = useTranslation()
  const { auth } = useAuthStore()
  const currentId = auth.user?.id
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<null | 'create' | User>(null)
  const [form, setForm] = useState<UserForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const ROLE_LABELS: Record<Role, string> = {
    admin: t('perfil.role.admin'),
    analyst: t('perfil.role.analyst'),
    analyst_full: t('perfil.role.analyst_full'),
    phishing_analyst: t('perfil.role.phishing_analyst'),
    viewer: t('perfil.role.viewer'),
  }

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ users: User[] }>('/users')
      setUsers(d.users || [])
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function openCreate() { setForm(EMPTY_FORM); setModal('create') }
  function openEdit(u: User) { setForm({ username: u.username, password: '', role: u.role, nombre: u.nombre }); setModal(u) }

  async function handleSave() {
    setSaving(true)
    try {
      if (modal === 'create') {
        await apiFetch('/users/create', { method: 'POST', body: JSON.stringify(form) })
        toast.success(t('config.users.created'))
      } else {
        await apiFetch(`/users/${(modal as User).id}`, { method: 'PUT', body: JSON.stringify(form) })
        toast.success(t('config.users.updated'))
      }
      setModal(null)
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(u: User) {
    if (!confirm(t('config.users.confirmDelete', { username: u.username }))) return
    try {
      await apiFetch(`/users/${u.id}`, { method: 'DELETE', body: JSON.stringify({}) })
      toast.success(t('config.users.deleted'))
      load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  async function handleToggle(u: User) {
    try {
      await apiFetch(`/users/${u.id}/toggle`, { method: 'PUT', body: JSON.stringify({}) })
      load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  async function handleReset2FA(u: User) {
    if (!confirm(t('config.users.confirmReset2fa', { username: u.username }))) return
    try {
      await apiFetch(`/users/${u.id}/totp`, { method: 'DELETE', body: JSON.stringify({}) })
      toast.success(t('config.users.2faReset'))
      load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  return (
    <div className='p-8'>
      <div className='flex items-start justify-between mb-6'>
        <div>
          <h1 className='text-2xl font-bold flex items-center gap-2'>
            <Users className='h-5 w-5 text-primary' />
            {t('config.users.title')}
          </h1>
          <p className='text-sm text-muted-foreground mt-1'>{t('config.users.desc')}</p>
        </div>
        <Button size='sm' onClick={openCreate}>
          <Plus className='h-4 w-4 mr-1' /> {t('config.users.new')}
        </Button>
      </div>

      {loading ? (
        <div className='flex items-center gap-3 text-muted-foreground'>
          <Loader2 className='h-4 w-4 animate-spin' /> {t('common.loading')}
        </div>
      ) : (
        <div className='rounded-lg border overflow-hidden'>
          <table className='w-full text-sm border-collapse'>
            <thead>
              <tr className='bg-muted/50'>
                {[
                  t('config.users.col.user'), t('config.users.col.name'), t('config.users.col.role'),
                  t('config.users.col.2fa'), t('config.users.col.status'), t('config.users.col.created'),
                  t('config.users.col.actions'),
                ].map(h => (
                  <th key={h} className='px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground border-b'>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className='border-b last:border-0 hover:bg-muted/30 transition-colors'>
                  <td className='px-4 py-2.5 font-medium'>{u.username}</td>
                  <td className='px-4 py-2.5 text-muted-foreground'>{u.nombre || '—'}</td>
                  <td className='px-4 py-2.5'>
                    <Badge variant={u.role === 'admin' ? 'destructive' : 'secondary'} className='text-[10px]'>
                      {ROLE_LABELS[u.role] || u.role}
                    </Badge>
                  </td>
                  <td className='px-4 py-2.5'>
                    <Badge variant={u.has2FA ? 'default' : 'outline'} className='text-[10px]'>
                      {u.has2FA ? t('config.users.active') : t('config.users.inactive')}
                    </Badge>
                  </td>
                  <td className='px-4 py-2.5'>
                    <Badge variant={u.enabled ? 'default' : 'destructive'} className='text-[10px]'>
                      {u.enabled ? t('config.users.enabled') : t('config.users.blocked')}
                    </Badge>
                  </td>
                  <td className='px-4 py-2.5 text-muted-foreground text-xs'>{fmtDate(u.created_at)}</td>
                  <td className='px-4 py-2.5'>
                    <div className='flex gap-1 flex-wrap'>
                      <Button variant='ghost' size='sm' className='h-6 text-[11px] px-2' onClick={() => openEdit(u)}>
                        {t('config.users.edit')}
                      </Button>
                      {u.id !== currentId && (
                        <Button variant='ghost' size='sm' className='h-6 text-[11px] px-2' onClick={() => handleToggle(u)}>
                          {u.enabled ? t('config.users.block') : t('config.users.enable')}
                        </Button>
                      )}
                      {u.has2FA && (
                        <Button variant='ghost' size='sm' className='h-6 text-[11px] px-2' onClick={() => handleReset2FA(u)}>
                          {t('config.users.reset2fa')}
                        </Button>
                      )}
                      {u.id !== currentId && (
                        <Button variant='ghost' size='sm' className='h-6 text-[11px] px-2 text-destructive hover:text-destructive' onClick={() => handleDelete(u)}>
                          {t('config.users.delete')}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={modal !== null} onOpenChange={open => !open && setModal(null)}>
        <DialogContent className='max-w-sm'>
          <DialogHeader>
            <DialogTitle>
              {modal === 'create'
                ? t('config.users.newTitle')
                : t('config.users.editTitle', { username: (modal as User)?.username })}
            </DialogTitle>
          </DialogHeader>
          <div className='flex flex-col gap-3 pt-2'>
            <div>
              <Label className='text-xs mb-1.5 block text-muted-foreground'>{t('config.users.fullName')}</Label>
              <Input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder='Juan Pérez' className='h-8 text-sm' />
            </div>
            <div>
              <Label className='text-xs mb-1.5 block text-muted-foreground'>{t('config.users.username')}</Label>
              <Input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder='jperez' className='h-8 text-sm' />
            </div>
            <div>
              <Label className='text-xs mb-1.5 block text-muted-foreground'>
                {modal === 'create' ? t('config.users.password') : t('config.users.passwordPlaceholder')}
              </Label>
              <Input type='password' value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder='••••••••' className='h-8 text-sm' />
            </div>
            <div>
              <Label className='text-xs mb-1.5 block text-muted-foreground'>{t('config.users.rol')}</Label>
              <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v as Role }))}>
                <SelectTrigger className='h-8 text-sm'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className='flex gap-2 pt-2'>
              <Button disabled={saving} onClick={handleSave}>
                {saving ? <Loader2 className='h-3.5 w-3.5 animate-spin mr-2' /> : null}
                {t('config.users.save')}
              </Button>
              <Button variant='ghost' onClick={() => setModal(null)}>{t('config.users.cancel')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
