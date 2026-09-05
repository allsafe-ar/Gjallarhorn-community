import { useState, useEffect, useCallback } from 'react'
import { ScrollText, RefreshCw, Trash2, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

type LogEntry = { id: number; ts: string; action: string; detail: string; username: string; ip: string; result: 'ok' | 'fail' | 'pending' }

function fmtDate(d: string) {
  if (!d) return '—'
  return new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function AuditoriaView() {
  const { auth } = useAuthStore()
  const { t } = useTranslation()
  const isAdmin = auth.user?.role === 'admin'
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [clearing, setClearing] = useState(false)

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ logs: LogEntry[] }>('/logs')
      setLogs(d.logs || [])
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function clearLogs() {
    if (!confirm(t('config.audit.confirmDelete'))) return
    setClearing(true)
    try {
      await apiFetch('/logs/clear', { method: 'DELETE', body: JSON.stringify({}) })
      toast.success(t('config.audit.cleared'))
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setClearing(false)
    }
  }

  const filtered = filter
    ? logs.filter(l => (l.action + l.detail + l.username + l.result).toLowerCase().includes(filter.toLowerCase()))
    : logs

  const resultColor: Record<string, string> = {
    ok: 'text-emerald-500', fail: 'text-destructive', pending: 'text-amber-700 dark:text-amber-400',
  }

  return (
    <div className='p-8'>
      <div className='flex items-start justify-between mb-6'>
        <div>
          <h1 className='text-2xl font-bold flex items-center gap-2'>
            <ScrollText className='h-5 w-5 text-primary' />
            {t('config.audit.title')}
          </h1>
          <p className='text-sm text-muted-foreground mt-1'>{t('config.audit.desc')}</p>
        </div>
        <div className='flex items-center gap-2'>
          <Input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder={t('config.audit.filter')}
            className='h-8 text-sm w-48'
          />
          <Button variant='outline' size='sm' className='h-8' onClick={load} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
          {isAdmin && (
            <Button variant='destructive' size='sm' className='h-8' onClick={clearLogs} disabled={clearing}>
              {clearing ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : <Trash2 className='h-3.5 w-3.5' />}
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className='flex items-center gap-3 text-muted-foreground'>
          <Loader2 className='h-4 w-4 animate-spin' /> {t('common.loading')}
        </div>
      ) : (
        <div className='rounded-lg border overflow-hidden'>
          <div className='overflow-auto max-h-[calc(100vh-240px)]'>
            <table className='w-full text-xs border-collapse'>
              <thead className='sticky top-0 z-10'>
                <tr className='bg-muted/80 backdrop-blur'>
                  {[t('config.audit.col.date'), t('config.audit.col.action'), t('config.audit.col.detail'), t('config.audit.col.user'), t('config.audit.col.ip'), t('config.audit.col.result')].map(h => (
                    <th key={h} className='px-3 py-2.5 text-left font-semibold text-muted-foreground border-b whitespace-nowrap'>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(l => (
                  <tr key={l.id} className='border-b last:border-0 hover:bg-muted/20 transition-colors'>
                    <td className='px-3 py-2 text-muted-foreground whitespace-nowrap'>{fmtDate(l.ts)}</td>
                    <td className='px-3 py-2 font-medium whitespace-nowrap'>{l.action}</td>
                    <td className='px-3 py-2 text-muted-foreground max-w-xs truncate'>{l.detail}</td>
                    <td className='px-3 py-2 text-muted-foreground'>{l.username}</td>
                    <td className='px-3 py-2 text-muted-foreground font-mono'>{l.ip}</td>
                    <td className='px-3 py-2'>
                      <span className={cn('font-semibold', resultColor[l.result] ?? 'text-muted-foreground')}>
                        {l.result}
                      </span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className='px-4 py-8 text-center text-muted-foreground'>
                      {filter ? t('config.audit.noResults') : t('config.audit.noRecords')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className='text-xs text-muted-foreground mt-2'>
        {t('config.audit.records', { n: filtered.length })}
        {filter ? ` ${t('config.audit.filtered')}` : ''}
      </div>
    </div>
  )
}
