import { useState, useEffect, useCallback } from 'react'
import { KeyRound, Eye, EyeOff, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'

const SERVICES = [
  { key: 'virustotal',     label: 'VirusTotal',           desc: 'Hash / IP / Domain / URL analysis' },
  { key: 'abuseipdb',      label: 'AbuseIPDB',            desc: 'IP abuse confidence score' },
  { key: 'shodan',         label: 'Shodan',               desc: 'Internet device intelligence + C2 detection' },
  { key: 'alienvault',     label: 'AlienVault OTX',       desc: 'Open Threat Exchange pulses' },
  { key: 'greynoise',      label: 'GreyNoise',            desc: 'IP noise / riot classification' },
  { key: 'safebrowsing',   label: 'Google Safe Browsing', desc: 'URL / domain phishing & malware blocklist' },
  { key: 'urlscan',        label: 'URLScan.io',           desc: 'URL & domain screenshot + verdict' },
  { key: 'criminalip',     label: 'Criminal IP',          desc: 'IP threat intelligence score' },
  { key: 'ipqualityscore', label: 'IPQualityScore',       desc: 'Fraud & proxy / VPN scoring' },
  { key: 'threatfox',      label: 'Abuse.ch (ThreatFox)', desc: 'IOC sharing platform' },
  { key: 'hybrid',         label: 'Hybrid Analysis',      desc: 'Malware sandbox (free tier)' },
]

type ApiKeyEntry = { key: string; configured: boolean }
type EditMap = Record<string, string>
type ShowMap = Record<string, boolean>

export function ApiKeysView() {
  const { t } = useTranslation()
  const [configured, setConfigured] = useState<Record<string, boolean>>({})
  const [edits, setEdits] = useState<EditMap>({})
  const [show, setShow] = useState<ShowMap>({})
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ keys: Record<string, string> | ApiKeyEntry[] }>('/settings/api-keys')
      const keys = (data as any).keys || {}
      const cfg: Record<string, boolean> = {}
      if (Array.isArray(keys)) {
        for (const entry of keys) cfg[entry.key] = entry.configured
      } else {
        for (const k of Object.keys(keys)) cfg[k] = keys[k] === '***configured***'
      }
      setConfigured(cfg)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleSave() {
    setSaving(true)
    try {
      await apiFetch('/settings/api-keys', {
        method: 'PUT',
        body: JSON.stringify({ keys: edits }),
      })
      toast.success(t('config.apikeys.saved'))
      const newCfg = { ...configured }
      for (const [k, v] of Object.entries(edits)) {
        newCfg[k] = v !== '' && v !== 'REMOVE'
      }
      setConfigured(newCfg)
      setEdits({})
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const hasEdits = Object.keys(edits).length > 0

  if (loading) {
    return (
      <div className='flex items-center gap-3 p-8 text-muted-foreground'>
        <Loader2 className='h-4 w-4 animate-spin' /> {t('common.loading')}
      </div>
    )
  }

  return (
    <div className='p-8 max-w-3xl'>
      <div className='flex items-start justify-between mb-6'>
        <div>
          <h1 className='text-2xl font-bold flex items-center gap-2'>
            <KeyRound className='h-5 w-5 text-primary' />
            {t('config.apikeys.title')}
          </h1>
          <p className='text-sm text-muted-foreground mt-1'>
            {t('config.apikeys.desc')}
          </p>
        </div>
        {hasEdits && (
          <div className='flex gap-2'>
            <Button variant='ghost' size='sm' onClick={() => setEdits({})}>{t('config.apikeys.discard')}</Button>
            <Button size='sm' disabled={saving} onClick={handleSave}>
              {saving ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : t('config.apikeys.save')}
            </Button>
          </div>
        )}
      </div>

      <div className='flex flex-col gap-3'>
        {SERVICES.map(svc => {
          const isConfigured = configured[svc.key]
          const editVal = edits[svc.key] ?? ''
          const showVal = show[svc.key]

          return (
            <div key={svc.key} className='rounded-lg border bg-card px-4 py-3 grid grid-cols-[1fr_2fr_auto] gap-4 items-center'>
              <div>
                <div className='text-sm font-semibold'>{svc.label}</div>
                <div className='text-[11px] text-muted-foreground mt-0.5'>{svc.desc}</div>
              </div>
              <div className='relative'>
                <Input
                  type={showVal ? 'text' : 'password'}
                  value={editVal}
                  onChange={e => setEdits(prev => ({ ...prev, [svc.key]: e.target.value }))}
                  placeholder={isConfigured ? t('config.apikeys.placeholder') : t('config.apikeys.new')}
                  className='pr-9 text-sm h-8'
                />
                <button
                  type='button'
                  className='absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground'
                  onClick={() => setShow(s => ({ ...s, [svc.key]: !s[svc.key] }))}
                >
                  {showVal ? <EyeOff className='h-3.5 w-3.5' /> : <Eye className='h-3.5 w-3.5' />}
                </button>
              </div>
              <div className='flex items-center gap-2 justify-end'>
                {isConfigured ? (
                  <span className='flex items-center gap-1 text-[11px] font-semibold text-emerald-500 whitespace-nowrap'>
                    <CheckCircle2 className='h-3 w-3' /> {t('config.apikeys.configured')}
                  </span>
                ) : (
                  <span className='flex items-center gap-1 text-[11px] text-muted-foreground whitespace-nowrap'>
                    <XCircle className='h-3 w-3' /> {t('config.apikeys.notConfigured')}
                  </span>
                )}
                {isConfigured && (
                  <Button
                    variant='ghost'
                    size='sm'
                    className='h-6 text-[11px] text-destructive hover:text-destructive px-2'
                    onClick={() => setEdits(prev => ({ ...prev, [svc.key]: 'REMOVE' }))}
                  >
                    {t('config.apikeys.delete')}
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {hasEdits && (
        <div className='flex gap-2 mt-6'>
          <Button disabled={saving} onClick={handleSave}>
            {saving ? <Loader2 className='h-4 w-4 animate-spin mr-2' /> : null}
            {t('config.apikeys.save')}
          </Button>
          <Button variant='ghost' onClick={() => setEdits({})}>{t('config.apikeys.discard')}</Button>
        </div>
      )}
    </div>
  )
}
