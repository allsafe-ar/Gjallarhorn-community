import { useState, useEffect } from 'react'
import { Mail, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'

type SmtpConfig = {
  host?: string; port?: number; secure?: boolean; ignore_cert?: boolean
  user?: string; from_address?: string; from_name?: string
  send_rate?: number; has_pass?: boolean
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='mb-4'>
      <Label className='text-xs mb-1.5 block text-muted-foreground'>{label}</Label>
      {children}
    </div>
  )
}

export function SmtpView() {
  const { t } = useTranslation()
  const [cfg, setCfg] = useState<SmtpConfig>({})
  const [pass, setPass] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    apiFetch<{ config: SmtpConfig }>('/phishing/smtp')
      .then(d => { setCfg(d.config || {}) })
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [])

  function set<K extends keyof SmtpConfig>(k: K, v: SmtpConfig[K]) {
    setCfg(prev => ({ ...prev, [k]: v }))
  }

  async function save() {
    setSaving(true)
    try {
      await apiFetch('/phishing/smtp', { method: 'PUT', body: JSON.stringify({ ...cfg, pass: pass || undefined }) })
      toast.success(t('config.smtp.saved'))
      if (pass) { setPass(''); setCfg(c => ({ ...c, has_pass: true })) }
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function test() {
    setTesting(true)
    try {
      const d = await apiFetch<{ ok: boolean; message: string }>('/phishing/smtp/test', { method: 'POST', body: JSON.stringify({}) })
      toast[d.ok ? 'success' : 'error'](d.message)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <div className='flex items-center gap-3 p-8 text-muted-foreground'>
        <Loader2 className='h-4 w-4 animate-spin' /> {t('common.loading')}
      </div>
    )
  }

  return (
    <div className='p-8 max-w-xl'>
      <div className='mb-6'>
        <h1 className='text-2xl font-bold flex items-center gap-2'>
          <Mail className='h-5 w-5 text-primary' />
          {t('config.smtp.title')}
        </h1>
        <p className='text-sm text-muted-foreground mt-1'>
          {t('config.smtp.desc')}
        </p>
      </div>

      <div className='rounded-lg border bg-card px-5 py-4'>
        <Field label={t('config.smtp.host')}>
          <Input
            value={cfg.host || ''}
            onChange={e => set('host', e.target.value)}
            placeholder='smtp.gmail.com'
            className='h-8 text-sm'
          />
        </Field>

        <div className='grid grid-cols-[2fr_1fr_1fr] gap-3 mb-4'>
          <Field label={t('config.smtp.port')}>
            <Input
              type='number'
              value={cfg.port || 587}
              onChange={e => set('port', +e.target.value)}
              className='h-8 text-sm'
            />
          </Field>
          <div className='flex flex-col justify-end pb-1 gap-2'>
            <label className='flex items-center gap-2 text-sm cursor-pointer'>
              <Checkbox
                checked={!!cfg.secure}
                onCheckedChange={v => set('secure', !!v)}
              />
              SSL/TLS
            </label>
          </div>
          <div className='flex flex-col justify-end pb-1 gap-2'>
            <label className='flex items-center gap-2 text-sm cursor-pointer'>
              <Checkbox
                checked={!!cfg.ignore_cert}
                onCheckedChange={v => set('ignore_cert', !!v)}
              />
              {t('config.smtp.ignoreCert')}
            </label>
          </div>
        </div>

        <Field label={t('config.smtp.user')}>
          <Input
            value={cfg.user || ''}
            onChange={e => set('user', e.target.value)}
            placeholder='user@dominio.com'
            className='h-8 text-sm'
          />
        </Field>

        <Field label={cfg.has_pass ? t('config.smtp.passwordPlaceholder') : t('config.smtp.password')}>
          <Input
            type='password'
            value={pass}
            onChange={e => setPass(e.target.value)}
            placeholder='••••••••'
            className='h-8 text-sm'
          />
        </Field>

        <Field label='From address'>
          <Input
            value={cfg.from_address || ''}
            onChange={e => set('from_address', e.target.value)}
            placeholder='phishing@empresa.com'
            className='h-8 text-sm'
          />
        </Field>

        <Field label='From name'>
          <Input
            value={cfg.from_name || ''}
            onChange={e => set('from_name', e.target.value)}
            placeholder='IT Security'
            className='h-8 text-sm'
          />
        </Field>

        <Field label={t('config.smtp.sendRate')}>
          <Input
            type='number'
            value={cfg.send_rate || 10}
            onChange={e => set('send_rate', +e.target.value)}
            min={1}
            max={100}
            className='h-8 text-sm w-28'
          />
        </Field>

        <div className='flex gap-2 mt-2'>
          <Button disabled={saving} onClick={save}>
            {saving ? <Loader2 className='h-3.5 w-3.5 animate-spin mr-2' /> : null}
            {t('config.smtp.save')}
          </Button>
          <Button variant='outline' disabled={testing} onClick={test}>
            {testing ? <Loader2 className='h-3.5 w-3.5 animate-spin mr-2' /> : null}
            {t('config.smtp.testConnection')}
          </Button>
        </div>
      </div>
    </div>
  )
}
