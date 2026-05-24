import { useState, useEffect } from 'react'
import { Network, ChevronDown, ChevronUp, Loader2, Circle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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

const PLATFORM_ORDER = ['thehive', 'wazuh', 'velociraptor', 'openvas', 'nessus'] as const
type PlatformKey = (typeof PLATFORM_ORDER)[number]

const PLATFORM_META: Record<PlatformKey, {
  name: string; abbr: string; desc: string; color: string
  fields: { key: string; label: string; type?: string; sensitive?: boolean; placeholder?: string }[]
}> = {
  thehive:      { name: 'TheHive',        abbr: 'TH', color: '#f59e0b', desc: 'Case & Alert Management',              fields: [{ key: 'url', label: 'URL', placeholder: 'http://localhost:9000' }, { key: 'api_key', label: 'API Key', type: 'password', sensitive: true }] },
  wazuh:        { name: 'Wazuh',           abbr: 'WZ', color: '#3b82f6', desc: 'Security Monitoring / SIEM',           fields: [{ key: 'url', label: 'URL', placeholder: 'https://localhost:55000' }, { key: 'username', label: 'Username', placeholder: 'wazuh-wui' }, { key: 'password', label: 'Password', type: 'password', sensitive: true }] },
  velociraptor: { name: 'Velociraptor',    abbr: 'VR', color: '#8b5cf6', desc: 'DFIR — Forensics & Incident Response', fields: [{ key: 'url', label: 'URL', placeholder: 'https://localhost:8889' }, { key: 'username', label: 'Usuario', placeholder: 'admin' }, { key: 'password', label: 'Contraseña', type: 'password', sensitive: true }] },
  openvas:      { name: 'OpenVAS / GVM',   abbr: 'OV', color: '#22c55e', desc: 'Vulnerability Scanner (Greenbone)',    fields: [{ key: 'url', label: 'URL (proxy :9391)', placeholder: 'http://localhost:9391' }, { key: 'api_key', label: 'GMP Password', type: 'password', sensitive: true }] },
  nessus:       { name: 'Nessus',          abbr: 'NS', color: '#ef4444', desc: 'Vulnerability Management (Tenable)',   fields: [{ key: 'url', label: 'URL', placeholder: 'https://localhost:8834' }, { key: 'api_key', label: 'Access Key', type: 'password', sensitive: true }, { key: 'extra_secretKey', label: 'Secret Key', type: 'password', sensitive: true }] },
}

type PlatformData = {
  platform: string; enabled: boolean; url?: string; username?: string
  last_status?: string; last_message?: string; last_check?: string
  extra_config?: Record<string, string>
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    connected: 'text-emerald-500', error: 'text-destructive',
    unconfigured: 'text-muted-foreground', unknown: 'text-muted-foreground',
    checking: 'text-amber-400',
  }
  return <Circle className={cn('h-2 w-2 fill-current', colors[status] ?? 'text-muted-foreground')} />
}

function PlatformCard({ platform, initialData, isAdmin }: {
  platform: PlatformKey; initialData?: PlatformData; isAdmin: boolean
}) {
  const meta = PLATFORM_META[platform]
  const { t } = useTranslation()
  const [form, setForm] = useState<Record<string, string>>({})
  const [enabled, setEnabled] = useState(!!(initialData?.enabled))
  const [status, setStatus] = useState(initialData?.last_status || 'unknown')
  const [message, setMessage] = useState(initialData?.last_message || '')
  const [lastCheck, setLastCheck] = useState(initialData?.last_check || '')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    setEnabled(!!(initialData?.enabled))
    setStatus(initialData?.last_status || 'unknown')
    setMessage(initialData?.last_message || '')
    setLastCheck(initialData?.last_check || '')
    if (isAdmin && initialData) {
      const f: Record<string, string> = { url: initialData.url || '', username: initialData.username || '' }
      if (platform === 'nessus') f.extra_secretKey = initialData.extra_config?.secretKey || ''
      setForm(f)
    } else {
      setForm({ url: initialData?.url || '' })
    }
  }, [initialData, isAdmin, platform])

  async function handleToggle(val: boolean) {
    if (!isAdmin) return
    setToggling(true)
    try {
      await apiFetch(`/platforms/${platform}/toggle`, { method: 'POST', body: JSON.stringify({ enabled: val }) })
      setEnabled(val)
      toast.info(`${meta.name} ${val ? t('config.platforms.enabledToast') : t('config.platforms.disabledToast')}`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setToggling(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const body: Record<string, unknown> = { url: form.url, username: form.username, verify_ssl: 0, enabled: enabled ? 1 : 0 }
      if (form.api_key) body.api_key = form.api_key
      if (form.password) body.password = form.password
      if (platform === 'nessus' && form.extra_secretKey) body.extra_config = { secretKey: form.extra_secretKey }
      await apiFetch(`/platforms/${platform}`, { method: 'PUT', body: JSON.stringify(body) })
      toast.success(`${meta.name} ${t('common.save').toLowerCase()}`)
      setForm(prev => ({ ...prev, api_key: '', password: '', extra_secretKey: '' }))
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true); setStatus('checking')
    try {
      const r = await apiFetch<{ status: string; message: string }>(`/platforms/${platform}/test`, { method: 'POST', body: JSON.stringify({}) })
      setStatus(r.status); setMessage(r.message); setLastCheck(new Date().toISOString())
      toast[r.status === 'connected' ? 'success' : 'error'](`${meta.name}: ${r.message}`)
    } catch (e: any) {
      setStatus('error'); setMessage(e.message); toast.error(e.message)
    } finally {
      setTesting(false)
    }
  }

  const stLabels: Record<string, string> = {
    connected: t('dashboard.status.connected'),
    error: t('dashboard.status.error'),
    unconfigured: t('dashboard.status.notConfigured'),
    unknown: t('dashboard.status.unknown'),
    checking: t('dashboard.verifying'),
  }

  return (
    <div className={cn('rounded-lg border bg-card overflow-hidden transition-opacity', !enabled && 'opacity-70')}>
      <div className='relative'>
        <div className='absolute top-0 left-0 right-0 h-0.5' style={{ background: enabled ? meta.color : 'transparent' }} />
      </div>
      <div className='px-4 pt-4 pb-3'>
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-3'>
            {isAdmin && (
              <Switch
                checked={enabled}
                onCheckedChange={handleToggle}
                disabled={toggling}
                className='scale-90'
              />
            )}
            <span
              className='text-[11px] font-black rounded px-1.5 py-0.5 tracking-wide'
              style={{ background: (enabled ? meta.color : '#888') + '22', color: enabled ? meta.color : '#888' }}
            >
              {meta.abbr}
            </span>
            <div>
              <span className='text-sm font-semibold'>{meta.name}</span>
              <span className='text-xs text-muted-foreground ml-2'>{meta.desc}</span>
            </div>
          </div>
          <div className='flex items-center gap-3'>
            {enabled && (
              <div className='flex items-center gap-1.5 text-xs'>
                {testing ? (
                  <Loader2 className='h-3 w-3 animate-spin text-muted-foreground' />
                ) : (
                  <StatusDot status={status} />
                )}
                <span className={cn('font-medium',
                  status === 'connected' ? 'text-emerald-500' :
                  status === 'error' ? 'text-destructive' : 'text-muted-foreground'
                )}>
                  {stLabels[status] || status}
                </span>
                {lastCheck && (
                  <span className='text-muted-foreground text-[10px]'>
                    ({new Date(lastCheck).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })})
                  </span>
                )}
              </div>
            )}
            <button
              className='text-muted-foreground hover:text-foreground p-1'
              onClick={() => setExpanded(e => !e)}
            >
              {expanded ? <ChevronUp className='h-4 w-4' /> : <ChevronDown className='h-4 w-4' />}
            </button>
          </div>
        </div>

        {expanded && (
          <div className='mt-4 pt-4 border-t'>
            {!isAdmin && (
              <p className='text-sm text-muted-foreground mb-3'>
                {form.url ? `URL: ${form.url}` : t('config.platforms.urlNotConfigured')}
              </p>
            )}
            {isAdmin && (
              <>
                <div className='grid grid-cols-2 gap-3 mb-4'>
                  {meta.fields.map(f => (
                    <div key={f.key}>
                      <Label className='text-xs mb-1 block'>
                        {f.label}{f.sensitive ? ` ${t('config.platforms.emptyUrl')}` : ''}
                      </Label>
                      <Input
                        type={f.type || 'text'}
                        value={form[f.key] || ''}
                        onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                        placeholder={f.sensitive ? '••••••••' : f.placeholder}
                        className='h-8 text-sm'
                      />
                    </div>
                  ))}
                </div>
                <div className='flex gap-2'>
                  <Button size='sm' disabled={saving} onClick={handleSave}>
                    {saving ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : t('config.platforms.save')}
                  </Button>
                  <Button size='sm' variant='outline' disabled={testing} onClick={handleTest}>
                    {testing ? <Loader2 className='h-3.5 w-3.5 animate-spin mr-1' /> : null}
                    {t('config.platforms.testConnection')}
                  </Button>
                </div>
              </>
            )}
            {!isAdmin && (
              <Button size='sm' variant='outline' disabled={testing} onClick={handleTest}>
                {testing ? <Loader2 className='h-3.5 w-3.5 animate-spin mr-1' /> : null}
                {t('config.platforms.testConnection')}
              </Button>
            )}
            {message && (
              <p className={cn('text-xs mt-3', status === 'connected' ? 'text-emerald-500' : 'text-muted-foreground')}>
                {message}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function PlatformsView() {
  const { auth } = useAuthStore()
  const { t } = useTranslation()
  const isAdmin = auth.user?.role === 'admin'
  const [platforms, setPlatforms] = useState<PlatformData[]>([])
  const [loading, setLoading] = useState(true)
  const [checkInterval, setCheckInterval] = useState('0')
  const [savingInterval, setSavingInterval] = useState(false)

  const CHECK_INTERVALS = [
    { value: '0',    label: t('dashboard.interval.manual') },
    { value: '300',  label: '5 min' },
    { value: '600',  label: '10 min' },
    { value: '1800', label: '30 min' },
    { value: '3600', label: '1h' },
  ]

  useEffect(() => {
    Promise.all([
      apiFetch<{ platforms: PlatformData[] }>('/platforms').then(d => setPlatforms(d.platforms || [])),
      apiFetch<{ interval: string }>('/settings/platform-check-interval').then(d => setCheckInterval(d.interval || '0')).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  const platformMap = Object.fromEntries(platforms.map(p => [p.platform, p]))

  async function handleIntervalChange(val: string) {
    setCheckInterval(val)
    setSavingInterval(true)
    try {
      await apiFetch('/settings/platform-check-interval', { method: 'PUT', body: JSON.stringify({ interval: val }) })
      const label = CHECK_INTERVALS.find(o => o.value === val)?.label
      toast.success(val === '0' ? t('config.platforms.manualVerify') : t('config.platforms.autoVerifyLabel', { label }))
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSavingInterval(false)
    }
  }

  return (
    <div className='p-8 max-w-3xl'>
      <div className='mb-6'>
        <h1 className='text-2xl font-bold flex items-center gap-2'>
          <Network className='h-5 w-5 text-primary' />
          {t('config.platforms.title')}
        </h1>
        <p className='text-sm text-muted-foreground mt-1'>
          {t('config.platforms.desc')}
          {!isAdmin && ` ${t('config.platforms.adminOnly')}`}
        </p>
      </div>

      <div className='rounded-lg border bg-card px-4 py-3 mb-6 flex items-center justify-between gap-4'>
        <div>
          <div className='text-sm font-semibold'>{t('config.platforms.autoVerify')}</div>
          <div className='text-xs text-muted-foreground mt-0.5'>{t('config.platforms.pingFreq')}</div>
        </div>
        <div className='flex items-center gap-2'>
          {savingInterval && <Loader2 className='h-3.5 w-3.5 animate-spin text-muted-foreground' />}
          <Select value={checkInterval} onValueChange={handleIntervalChange} disabled={!isAdmin || savingInterval}>
            <SelectTrigger className='w-40 h-8 text-sm'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHECK_INTERVALS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className='flex items-center gap-3 text-muted-foreground'>
          <Loader2 className='h-4 w-4 animate-spin' /> {t('common.loading')}
        </div>
      ) : (
        <div className='flex flex-col gap-3'>
          {PLATFORM_ORDER.map(p => (
            <PlatformCard
              key={p}
              platform={p}
              initialData={platformMap[p] as PlatformData | undefined}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}
    </div>
  )
}
