import { useState, useEffect } from 'react'
import { User, Lock, Shield, Globe, Image } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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

function generateTOTPSecret(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let s = ''; const arr = new Uint8Array(20); crypto.getRandomValues(arr)
  arr.forEach(b => { s += chars[b % 32] }); return s
}
function getOtpAuthUri(secret: string, username: string): string {
  return `otpauth://totp/Gjallarhorn:${encodeURIComponent(username)}?secret=${secret}&issuer=Gjallarhorn&algorithm=SHA1&digits=6&period=30`
}

export function PerfilView() {
  const user = useAuthStore(s => s.user)
  const { t, i18n } = useTranslation()
  const [has2FA, setHas2FA] = useState(false)
  const [passForm, setPassForm] = useState({ current: '', next: '', confirm: '' })
  const [passSaving, setPassSaving] = useState(false)
  const [totpSetup, setTotpSetup] = useState<{ secret: string; uri: string } | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [totpSaving, setTotpSaving] = useState(false)
  const [totpError, setTotpError] = useState('')
  const [removePass, setRemovePass] = useState('')
  const [removing, setRemoving] = useState(false)
  const [lang, setLang] = useState(localStorage.getItem('lang') || 'es')

  useEffect(() => {
    apiFetch('/auth/me').then((d: any) => setHas2FA(d.has2FA)).catch(() => {})
  }, [])

  function handleLangChange(v: string) {
    setLang(v)
    localStorage.setItem('lang', v)
    i18n.changeLanguage(v)
    toast.success(t('perfil.lang.updated'))
  }

  async function handleChangePass(e: React.FormEvent) {
    e.preventDefault()
    if (passForm.next !== passForm.confirm) { toast.error(t('perfil.changePass.noMatch')); return }
    if (passForm.next.length < 8) { toast.error(t('perfil.changePass.tooShort')); return }
    setPassSaving(true)
    try {
      await apiFetch('/auth/change-password', { method: 'POST', body: { currentPassword: passForm.current, newPassword: passForm.next } })
      toast.success(t('perfil.changePass.success')); setPassForm({ current: '', next: '', confirm: '' })
    } catch (e: any) { toast.error(e.message) } finally { setPassSaving(false) }
  }

  function startTOTP() {
    const s = generateTOTPSecret()
    setTotpSetup({ secret: s, uri: getOtpAuthUri(s, user?.username || '') })
    setTotpCode(''); setTotpError('')
  }

  async function handleSaveTOTP() {
    if (totpCode.length !== 6) { setTotpError(t('perfil.2fa.enter6digits')); return }
    setTotpSaving(true); setTotpError('')
    try {
      await apiFetch('/auth/setup-totp', { method: 'POST', body: { totpSecret: totpSetup!.secret, totpToken: totpCode } })
      toast.success(t('perfil.2fa.activated')); setHas2FA(true); setTotpSetup(null)
    } catch (e: any) { setTotpError(e.message); setTotpCode('') } finally { setTotpSaving(false) }
  }

  async function handleRemove2FA(e: React.FormEvent) {
    e.preventDefault()
    if (!removePass) { toast.error(t('perfil.2fa.enterPass')); return }
    setRemoving(true)
    try {
      await apiFetch('/auth/remove-totp', { method: 'DELETE', body: { password: removePass } })
      toast.success(t('perfil.2fa.deactivated')); setHas2FA(false); setRemovePass('')
    } catch (e: any) { toast.error(e.message) } finally { setRemoving(false) }
  }

  const ROLE_LABELS: Record<string, string> = {
    admin: t('perfil.role.admin'),
    analyst: t('perfil.role.analyst'),
    viewer: t('perfil.role.viewer'),
  }

  const isAdmin = user?.role === 'admin'

  return (
    <div className='p-8 max-w-2xl'>
      <h1 className='text-2xl font-bold mb-1 flex items-center gap-2'>
        <User className='h-5 w-5 text-primary' />
        {t('perfil.title')}
      </h1>
      <p className='text-sm text-muted-foreground mb-8'>
        {user?.nombre} — <span className='font-mono'>{user?.username}</span> — {ROLE_LABELS[user?.role || ''] || user?.role}
      </p>

      {/* Cambiar contraseña */}
      <div className='rounded-lg border bg-card px-5 py-5 mb-4'>
        <h2 className='text-sm font-semibold mb-4 flex items-center gap-2'>
          <Lock className='h-4 w-4 text-muted-foreground' />
          {t('perfil.changePass.title')}
        </h2>
        <form onSubmit={handleChangePass} className='flex flex-col gap-3'>
          <div className='flex flex-col gap-1.5'>
            <Label>{t('perfil.changePass.current')}</Label>
            <Input type='password' value={passForm.current} onChange={e => setPassForm(f => ({ ...f, current: e.target.value }))} placeholder='••••••••' />
          </div>
          <div className='flex flex-col gap-1.5'>
            <Label>{t('perfil.changePass.new')}</Label>
            <Input type='password' value={passForm.next} onChange={e => setPassForm(f => ({ ...f, next: e.target.value }))} placeholder='••••••••' />
          </div>
          <div className='flex flex-col gap-1.5'>
            <Label>{t('perfil.changePass.confirm')}</Label>
            <Input type='password' value={passForm.confirm} onChange={e => setPassForm(f => ({ ...f, confirm: e.target.value }))} placeholder='••••••••' />
          </div>
          <Button type='submit' disabled={passSaving} className='w-fit'>
            {passSaving ? t('perfil.changePass.saving') : t('perfil.changePass.btn')}
          </Button>
        </form>
      </div>

      {/* 2FA */}
      <div className='rounded-lg border bg-card px-5 py-5 mb-4'>
        <div className='flex items-center justify-between mb-4'>
          <h2 className='text-sm font-semibold flex items-center gap-2'>
            <Shield className='h-4 w-4 text-muted-foreground' />
            {t('perfil.2fa.title')}
          </h2>
          <Badge variant={has2FA ? 'default' : 'secondary'} className='text-[10px]'>
            {has2FA ? t('perfil.2fa.active') : t('perfil.2fa.inactive')}
          </Badge>
        </div>

        {!has2FA && !totpSetup && (
          <>
            <p className='text-sm text-muted-foreground mb-4'>
              {t('perfil.2fa.protect')}
            </p>
            <Button variant='outline' size='sm' onClick={startTOTP}>{t('perfil.2fa.enableBtn')}</Button>
          </>
        )}

        {!has2FA && totpSetup && (
          <>
            <p className='text-sm text-muted-foreground mb-4'>
              {t('perfil.2fa.scan')}
            </p>
            <div className='flex gap-6 items-start mb-5'>
              <div className='bg-white p-3 rounded-lg shrink-0'>
                <QRCodeSVG value={totpSetup.uri} size={160} />
              </div>
              <div className='flex-1'>
                <div className='text-[11px] text-muted-foreground mb-1.5'>{t('perfil.2fa.manualSecret')}</div>
                <div className='font-mono text-xs bg-muted px-3 py-2 rounded border break-all tracking-wider mb-4'>
                  {totpSetup.secret}
                </div>
                <div className='flex flex-col gap-1.5'>
                  <Label>{t('perfil.2fa.codeLabel')}</Label>
                  <Input
                    value={totpCode}
                    onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder='000000'
                    className='text-center text-xl tracking-widest font-mono w-36'
                  />
                </div>
              </div>
            </div>
            {totpError && <p className='text-sm text-destructive mb-3'>{totpError}</p>}
            <div className='flex gap-2'>
              <Button onClick={handleSaveTOTP} disabled={totpCode.length !== 6 || totpSaving} size='sm'>
                {totpSaving ? t('perfil.2fa.verifying') : t('perfil.2fa.confirm')}
              </Button>
              <Button variant='ghost' size='sm' onClick={() => { setTotpSetup(null); setTotpCode(''); setTotpError('') }}>
                {t('perfil.2fa.cancel')}
              </Button>
            </div>
          </>
        )}

        {has2FA && (
          <>
            <p className='text-sm text-muted-foreground mb-4'>
              {t('perfil.2fa.deactivate')}
            </p>
            <form onSubmit={handleRemove2FA} className='flex gap-2 items-end'>
              <div className='flex flex-col gap-1.5 flex-1'>
                <Label>{t('perfil.2fa.currentPass')}</Label>
                <Input type='password' value={removePass} onChange={e => setRemovePass(e.target.value)} placeholder='••••••••' />
              </div>
              <Button type='submit' variant='destructive' size='sm' disabled={removing}>
                {removing ? t('perfil.2fa.disabling') : t('perfil.2fa.disableBtn')}
              </Button>
            </form>
          </>
        )}
      </div>

      {/* Idioma */}
      <div className='rounded-lg border bg-card px-5 py-5 mb-4'>
        <h2 className='text-sm font-semibold mb-4 flex items-center gap-2'>
          <Globe className='h-4 w-4 text-muted-foreground' />
          {t('perfil.lang.title')}
        </h2>
        <div className='flex items-center gap-3'>
          <span className='text-sm text-muted-foreground'>{t('perfil.lang.label')}</span>
          <Select value={lang} onValueChange={handleLangChange}>
            <SelectTrigger className='w-40'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='es'>Español</SelectItem>
              <SelectItem value='en'>English</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Branding (admin only) */}
      {isAdmin && (
        <div className='rounded-lg border bg-card px-5 py-5'>
          <h2 className='text-sm font-semibold mb-3 flex items-center gap-2'>
            <Image className='h-4 w-4 text-muted-foreground' />
            {t('perfil.branding.title')}
          </h2>
          <p className='text-sm text-muted-foreground mb-4'>
            {t('perfil.branding.desc')}
          </p>
        </div>
      )}
    </div>
  )
}
