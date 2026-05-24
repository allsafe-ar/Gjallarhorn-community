import { useState, useEffect } from 'react'
import { BookOpen, Plus, Loader2, Play, Square } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PaginationBar } from '@/components/ui/pagination-bar'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

const PLAYBOOK_TEMPLATES = [
  { id: 'wazuh_ioc', label: 'Wazuh → IOC → Caso', desc: 'Correlaciona alertas Wazuh críticas, enriquece IPs con threat intel y crea casos automáticos.', trigger_type: 'wazuh_alert', config: { trigger: { type: 'wazuh_alert', level_min: 12 }, actions: [{ type: 'enrich_ioc', score_threshold: 70, create_case: true, case_severity: 'high' }] } },
  { id: 'nessus_critical', label: 'Nessus Vulns Críticas → Caso', desc: 'Importa vulnerabilidades críticas de Nessus/OpenVAS y crea un caso por cada una.', trigger_type: 'nessus_scan', config: { trigger: { type: 'nessus_scan', severity_min: 4 }, actions: [{ type: 'create_case', case_severity: 'critical' }] } },
]

const CORR_STATUS_COLORS: Record<string, string> = { active: '#22c55e', inactive: '#6b7280', error: '#ef4444', running: '#f59e0b' }

export function PlaybooksView() {
  const { t } = useTranslation()
  const { auth } = useAuthStore()
  const isAdmin = auth.user?.role === 'admin'
  const [playbooks, setPlaybooks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [corrStatus, setCorrStatus] = useState<any>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  async function load() {
    setLoading(true)
    try {
      const [pb, cs] = await Promise.all([
        apiFetch<{ playbooks: any[] }>('/playbooks'),
        apiFetch<any>('/correlation/status').catch(() => null),
      ])
      setPlaybooks(pb.playbooks || [])
      setCorrStatus(cs)
    } catch (e: any) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function toggleCorrelation() {
    setToggling('corr')
    try {
      const running = corrStatus?.status === 'active' || corrStatus?.status === 'running'
      await apiFetch(`/correlation/${running ? 'stop' : 'start'}`, { method: 'POST', body: JSON.stringify({}) })
      toast.success(running ? t('incidents.playbooks.stopped') : t('incidents.playbooks.started'))
      load()
    } catch (e: any) { toast.error(e.message) }
    finally { setToggling(null) }
  }

  async function togglePlaybook(pb: any) {
    setToggling(pb.id)
    try {
      await apiFetch(`/playbooks/${pb.id}/toggle`, { method: 'POST', body: JSON.stringify({ enabled: !pb.enabled }) })
      toast.success(pb.enabled ? t('incidents.playbooks.disabled') : t('incidents.playbooks.enabled'))
      load()
    } catch (e: any) { toast.error(e.message) }
    finally { setToggling(null) }
  }

  async function createFromTemplate(tpl: any) {
    setCreating(true)
    try {
      await apiFetch('/playbooks', { method: 'POST', body: JSON.stringify({ name: tpl.label, description: tpl.desc, trigger_type: tpl.trigger_type, config: tpl.config }) })
      toast.success(t('incidents.playbooks.created'))
      load()
    } catch (e: any) { toast.error(e.message) }
    finally { setCreating(false) }
  }

  const isRunning = corrStatus?.status === 'active' || corrStatus?.status === 'running'
  const pagedPlaybooks = pageSize === 0 ? playbooks : playbooks.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div className='p-8'>
      <div className='flex items-start justify-between mb-6'>
        <div>
          <h1 className='text-2xl font-bold flex items-center gap-2'>
            <BookOpen className='h-5 w-5 text-primary' />
            {t('incidents.playbooks.title')}
          </h1>
          <p className='text-sm text-muted-foreground mt-1'>{t('incidents.playbooks.desc')}</p>
        </div>
      </div>

      <div className='rounded-lg border bg-card px-4 py-3 mb-6 flex items-center justify-between'>
        <div>
          <div className='text-sm font-semibold'>{t('incidents.playbooks.engine')}</div>
          <div className='flex items-center gap-2 mt-0.5'>
            <div className='h-2 w-2 rounded-full' style={{ background: corrStatus ? CORR_STATUS_COLORS[corrStatus.status] || '#6b7280' : '#6b7280' }} />
            <span className='text-xs text-muted-foreground capitalize'>{corrStatus?.status || t('incidents.playbooks.unknown')}</span>
            {corrStatus?.rules_loaded != null && <span className='text-xs text-muted-foreground'>· {t('incidents.playbooks.rulesLoaded', { n: corrStatus.rules_loaded })}</span>}
          </div>
        </div>
        {isAdmin && (
          <Button size='sm' variant={isRunning ? 'destructive' : 'default'} disabled={toggling === 'corr'} onClick={toggleCorrelation}>
            {toggling === 'corr' ? <Loader2 className='h-3.5 w-3.5 animate-spin mr-1' /> : isRunning ? <Square className='h-3.5 w-3.5 mr-1' /> : <Play className='h-3.5 w-3.5 mr-1' />}
            {isRunning ? t('incidents.playbooks.stop') : t('incidents.playbooks.start')}
          </Button>
        )}
      </div>

      {loading ? (
        <div className='flex items-center gap-2 text-sm text-muted-foreground'><Loader2 className='h-4 w-4 animate-spin' /> {t('common.loading')}</div>
      ) : (
        <>
          <div className='mb-6'>
            <h2 className='text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3'>{t('incidents.playbooks.active')}</h2>
            {playbooks.length === 0 ? (
              <p className='text-sm text-muted-foreground'>{t('incidents.playbooks.noPlaybooks')}</p>
            ) : (
              <>
                <div className='flex flex-col gap-2 mb-3'>
                  {pagedPlaybooks.map(pb => (
                    <div key={pb.id} className='rounded-lg border bg-card px-4 py-3 flex items-center gap-3'>
                      <div className='h-2 w-2 rounded-full shrink-0' style={{ background: pb.enabled ? '#22c55e' : '#6b7280' }} />
                      <div className='flex-1 min-w-0'>
                        <div className='text-sm font-medium'>{pb.name}</div>
                        {pb.description && <div className='text-xs text-muted-foreground'>{pb.description}</div>}
                      </div>
                      <Badge variant='outline' className='text-[10px]'>{pb.trigger_type}</Badge>
                      <div className='text-xs text-muted-foreground'>{t('incidents.playbooks.executions', { n: pb.executions || 0 })}</div>
                      {isAdmin && (
                        <Button size='sm' variant='outline' className='h-7 text-xs' disabled={toggling === pb.id} onClick={() => togglePlaybook(pb)}>
                          {toggling === pb.id ? <Loader2 className='h-3 w-3 animate-spin' /> : pb.enabled ? t('incidents.playbooks.disable') : t('incidents.playbooks.enable')}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <PaginationBar
                  total={playbooks.length}
                  page={page}
                  pageSize={pageSize}
                  onPage={setPage}
                  onPageSize={s => { setPageSize(s); setPage(1) }}
                />
              </>
            )}
          </div>

          {isAdmin && (
            <div>
              <h2 className='text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3'>{t('incidents.playbooks.templates')}</h2>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                {PLAYBOOK_TEMPLATES.map(tpl => {
                  const exists = playbooks.some(pb => pb.name === tpl.label)
                  return (
                    <div key={tpl.id} className={cn('rounded-lg border bg-card px-4 py-3', exists && 'opacity-50')}>
                      <div className='text-sm font-semibold mb-1'>{tpl.label}</div>
                      <div className='text-xs text-muted-foreground mb-3'>{tpl.desc}</div>
                      <Button size='sm' variant='outline' className='h-7 text-xs' disabled={creating || exists} onClick={() => createFromTemplate(tpl)}>
                        {creating ? <Loader2 className='h-3 w-3 animate-spin mr-1' /> : <Plus className='h-3 w-3 mr-1' />}
                        {exists ? t('incidents.playbooks.alreadyCreated') : t('incidents.playbooks.useTemplate')}
                      </Button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
