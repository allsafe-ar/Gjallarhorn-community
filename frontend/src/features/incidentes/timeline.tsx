import { useState, useEffect } from 'react'
import { Clock, Loader2, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
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
import { cn } from '@/lib/utils'

const SRC_COLORS: Record<string, string> = {
  wazuh: '#3b82f6', ioc: '#8b5cf6', file: '#22c55e', email: '#f59e0b',
  nessus: '#ef4444', thehive: '#f59e0b', phishing: '#f97316',
}
const SEV_COLORS: Record<string, string> = {
  critical: '#ef4444', high: '#ef4444', medium: '#f59e0b', low: '#6b7280',
}

function fmtDate(d: string) {
  if (!d) return '—'
  return new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function TimelineView() {
  const { t } = useTranslation()
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('__all__')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const EVT_LABELS: Record<string, string> = {
    IOC_INVESTIGATED: t('incidents.timeline.iocInvestigated'),
    IOC_ENRICHED: t('incidents.timeline.iocEnriched'),
    FILE_ANALYZED: t('incidents.timeline.fileAnalyzed'),
    EMAIL_ANALYZED: t('incidents.timeline.emailAnalyzed'),
    CASE_AUTO_CREATED: t('incidents.timeline.caseAutoCreated'),
    VULN_CASE_CREATED: t('incidents.timeline.vulnCase'),
    CAMPAIGN_LAUNCHED: t('incidents.timeline.campaignLaunched'),
    CAMPAIGN_COMPLETED: t('incidents.timeline.campaignCompleted'),
  }

  async function load() {
    setLoading(true)
    try {
      const src = filter && filter !== '__all__' ? `&source=${filter}` : ''
      const d = await apiFetch<{ events: any[] }>(`/timeline?limit=200${src}`)
      setEvents(d.events || [])
      setPage(1)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filter])

  const paged = pageSize === 0 ? events : events.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div className='p-8'>
      <div className='flex items-start justify-between mb-6'>
        <div>
          <h1 className='text-2xl font-bold flex items-center gap-2'>
            <Clock className='h-5 w-5 text-primary' />
            {t('incidents.timeline.title')}
          </h1>
          <p className='text-sm text-muted-foreground mt-1'>{t('incidents.timeline.desc')}</p>
        </div>
        <div className='flex items-center gap-2'>
          <Select value={filter} onValueChange={v => { setFilter(v); setPage(1) }}>
            <SelectTrigger className='w-40 h-8 text-sm'>
              <SelectValue placeholder={t('incidents.timeline.allSources')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='__all__'>{t('incidents.timeline.allSources')}</SelectItem>
              {['wazuh', 'ioc', 'file', 'email', 'nessus', 'thehive', 'phishing'].map(s => (
                <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant='outline' size='sm' className='h-8' onClick={load} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className='flex items-center gap-3 text-muted-foreground'>
          <Loader2 className='h-4 w-4 animate-spin' /> {t('common.loading')}
        </div>
      ) : events.length === 0 ? (
        <div className='rounded-lg border bg-card px-5 py-16 text-center text-muted-foreground'>
          {t('incidents.timeline.noEvents')}
        </div>
      ) : (
        <>
          <div className='rounded-lg border bg-card overflow-hidden mb-4'>
            {paged.map((ev, i) => {
              const d = typeof ev.data === 'string' ? JSON.parse(ev.data || '{}') : (ev.data || {})
              const srcColor = SRC_COLORS[ev.source] || '#6b7280'
              const sevColor = SEV_COLORS[ev.severity] || '#6b7280'
              return (
                <div key={ev.id} className={cn('flex gap-3 items-start px-4 py-3', i < paged.length - 1 && 'border-b')}>
                  <div className='w-0.5 self-stretch rounded mt-1 shrink-0' style={{ background: sevColor }} />
                  <div className='w-14 shrink-0'>
                    <span className='text-[10px] font-black rounded px-1.5 py-0.5' style={{ background: srcColor + '22', color: srcColor }}>
                      {ev.source?.toUpperCase()}
                    </span>
                  </div>
                  <div className='flex-1 min-w-0'>
                    <div className='flex items-center gap-2 mb-0.5'>
                      <span className='text-sm font-semibold'>{EVT_LABELS[ev.event_type] || ev.event_type}</span>
                      {ev.severity && <span className='text-[10px] font-bold' style={{ color: sevColor }}>{ev.severity.toUpperCase()}</span>}
                    </div>
                    <div className='text-xs text-muted-foreground truncate'>
                      {d.ioc || d.filename || d.subject || d.campaign || d.ip || d.vuln
                        ? <span className='font-mono text-foreground'>{d.ioc || d.filename || d.subject || d.campaign || d.ip || d.vuln}</span>
                        : null}
                      {d.score != null && (
                        <span className='ml-2'>Score: <span style={{ color: d.score >= 70 ? '#ef4444' : d.score >= 40 ? '#f59e0b' : '#22c55e' }}>{d.score}</span></span>
                      )}
                      {d.analyst && <span className='ml-2'>· {d.analyst}</span>}
                    </div>
                  </div>
                  <div className='text-[11px] text-muted-foreground shrink-0 whitespace-nowrap'>{fmtDate(ev.ts)}</div>
                </div>
              )
            })}
          </div>

          <PaginationBar
            total={events.length}
            page={page}
            pageSize={pageSize}
            onPage={setPage}
            onPageSize={s => { setPageSize(s); setPage(1) }}
          />
        </>
      )}
    </div>
  )
}
