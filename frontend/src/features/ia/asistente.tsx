import { useState, useEffect } from 'react'
import { Brain, Loader2, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

type AiStatus = {
  status: 'connected' | 'configured' | 'disabled' | 'error'
  provider?: string; model?: string; models?: string[]
  modelInstalled?: boolean; error?: string; enabled?: boolean
}

const STATUS_COLORS: Record<string, string> = {
  connected: '#22c55e', configured: '#8b5cf6', disabled: '#6b7280', error: '#ef4444',
}

export function AsistenteView() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<AiStatus>('/ai/status')
      .then(setStatus)
      .catch(() => setStatus({ status: 'error' }))
      .finally(() => setLoading(false))
  }, [])

  const STATUS_LABELS: Record<string, string> = {
    connected: t('ia.status.connected'),
    configured: t('ia.status.configured'),
    disabled: t('ia.status.disabled'),
    error: t('ia.status.error'),
  }

  return (
    <div className='p-8 max-w-3xl'>
      <div className='flex items-center gap-3 mb-2'>
        <h1 className='text-2xl font-bold flex items-center gap-2'>
          <Brain className='h-5 w-5 text-primary' />
          {t('ia.title')}
        </h1>
        <Badge variant='outline' className='text-[10px] font-bold tracking-wider border-amber-400/40 text-amber-400'>
          {t('ia.experimental')}
        </Badge>
      </div>
      <p className='text-sm text-muted-foreground mb-8'>
        {t('ia.desc')}
      </p>

      {loading ? (
        <div className='flex items-center gap-2 text-sm text-muted-foreground'><Loader2 className='h-4 w-4 animate-spin' />{t('common.loading')}</div>
      ) : (
        <>
          <div className='grid grid-cols-2 md:grid-cols-4 gap-3 mb-6'>
            {[
              { label: t('ia.card.status'), value: STATUS_LABELS[status?.status || 'error'], color: STATUS_COLORS[status?.status || 'error'] },
              { label: t('ia.card.provider'), value: status?.provider === 'ollama' ? 'Ollama (local)' : status?.provider || '—', color: undefined },
              { label: t('ia.card.model'), value: status?.model || '—', mono: true, color: undefined },
              { label: t('ia.card.available'), value: String(status?.models?.length ?? 0), color: undefined },
            ].map(({ label, value, color, mono }) => (
              <div key={label} className='rounded-lg border bg-card px-4 py-3'>
                <div className='text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2'>{label}</div>
                <div className={cn('text-base font-bold', mono && 'font-mono text-sm')} style={color ? { color } : {}}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          {status?.models && status.models.length > 0 && (
            <div className='rounded-lg border bg-card px-4 py-3 mb-6'>
              <div className='text-sm font-semibold mb-3'>{t('ia.installedModels')}</div>
              <div className='flex flex-wrap gap-2'>
                {status.models.map(m => (
                  <span
                    key={m}
                    className={cn(
                      'text-xs font-mono px-2.5 py-1 rounded border',
                      m === status.model
                        ? 'border-primary/40 bg-primary/10 text-primary font-semibold'
                        : 'border-border text-muted-foreground'
                    )}
                  >
                    {m}{m === status.model ? ' ✓' : ''}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className='rounded-lg border bg-card px-4 py-4 mb-4'>
            <div className='text-sm font-semibold mb-4'>{t('ia.howToUse')}</div>
            <div className='flex flex-col gap-3'>
              {[
                { section: t('ia.usage.ioc'), desc: t('ia.usage.iocDesc') },
                { section: t('ia.usage.files'), desc: t('ia.usage.filesDesc') },
                { section: t('ia.usage.email'), desc: t('ia.usage.emailDesc') },
              ].map(item => (
                <div key={item.section} className='flex gap-4 rounded-lg bg-muted/40 px-4 py-3'>
                  <div className='text-sm font-semibold text-primary shrink-0 w-44'>{item.section}</div>
                  <div className='text-sm text-muted-foreground leading-relaxed'>{item.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {status?.status === 'error' && (
            <div className='rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive'>
              {t('ia.error.noConnection')}
            </div>
          )}
          {status?.modelInstalled === false && (
            <div className='rounded-lg border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-sm text-amber-400'>
              {t('ia.error.modelNotInstalled', { model: status.model })}
            </div>
          )}
          {status?.status === 'disabled' && (
            <div className='rounded-lg border border-muted bg-muted/30 px-4 py-3 text-sm text-muted-foreground'>
              {t('ia.error.disabled')}
            </div>
          )}
        </>
      )}
    </div>
  )
}
