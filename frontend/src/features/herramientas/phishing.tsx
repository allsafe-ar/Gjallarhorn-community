import { useState, useEffect, useRef, useCallback } from 'react'
import { Fish, Plus, Loader2, ChevronDown, ChevronUp, Trash2, Upload, Eye, FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { PaginationBar } from '@/components/ui/pagination-bar'
import { useTranslation } from 'react-i18next'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const TOKEN_KEY = 'gjallarhorn_token'

const STATUS_COLOR: Record<string, string> = {
  draft: '#6b7280', sending: '#3b82f6', active: '#22c55e',
  completed: '#8b5cf6', cancelled: '#ef4444', running: '#f59e0b',
}
const EV_COLOR: Record<string, string> = {
  pending: '#6b7280', sent: '#3b82f6', opened: '#f59e0b',
  clicked: '#ef4444', submitted: '#22c55e', error: '#6b7280',
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation()
  const STATUS_LABEL: Record<string, string> = {
    draft: t('phishing.status.draft'), sending: t('phishing.status.sending'),
    active: t('phishing.status.active'), completed: t('phishing.status.completed'),
    cancelled: t('phishing.status.cancelled'), running: t('phishing.status.running'),
  }
  return (
    <span className='text-[10px] font-bold px-2 py-0.5 rounded border' style={{ color: STATUS_COLOR[status] || '#888', borderColor: (STATUS_COLOR[status] || '#888') + '44', background: (STATUS_COLOR[status] || '#888') + '18' }}>
      {STATUS_LABEL[status] || status?.toUpperCase()}
    </span>
  )
}

function HtmlEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className='text-xs text-muted-foreground mb-1.5'>HTML Body</div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={12}
        className='w-full rounded-md border bg-background px-3 py-2 text-xs font-mono resize-y'
        placeholder='<html>...</html>'
      />
    </div>
  )
}

// ── Wizard nueva campaña ───────────────────────────────────────────────────────
function WizardModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation()
  const [step, setStep] = useState(0)
  const [groups, setGroups] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [pages, setPages] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [tplSearch, setTplSearch] = useState('')
  const [tplLang, setTplLang] = useState<'all' | 'EN' | 'ES'>('all')
  const [form, setForm] = useState({
    name: '', smtp_from: '', smtp_from_name: '', redirect_url: '',
    group_id: '', template_id: '', landing_page_id: '',
  })

  const steps = [
    t('phishing.wizard.step1'), t('phishing.wizard.step2'), t('phishing.wizard.step3'),
    t('phishing.wizard.step4'), t('phishing.wizard.step5'),
  ]

  useEffect(() => {
    Promise.all([
      apiFetch<any>('/phishing/groups'),
      apiFetch<any>('/phishing/templates'),
      apiFetch<any>('/phishing/pages'),
    ]).then(([g, tpls, p]) => {
      setGroups(g.groups || []); setTemplates(tpls.templates || [])
      setPages(p.pages || [])
    }).catch(e => toast.error(e.message))
  }, [])

  async function launch(autoLaunch: boolean) {
    if (!form.name) return toast.error(t('phishing.nameRequired'))
    if (!form.group_id) return toast.error(t('phishing.groupRequired'))
    if (!form.template_id) return toast.error(t('phishing.templateRequired'))
    setSaving(true)
    try {
      const d = await apiFetch<any>('/phishing/campaigns', { method: 'POST', body: JSON.stringify(form) })
      if (autoLaunch) {
        const r = await apiFetch<any>(`/phishing/campaigns/${d.id}/launch`, { method: 'POST', body: JSON.stringify({}) })
        toast.success(t('phishing.launched', { n: r.targets }))
      } else {
        toast.success(t('phishing.savedDraft'))
      }
      onDone()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  const selCls = (sel: boolean) => cn(
    'rounded-lg border-2 px-4 py-3 cursor-pointer transition-colors',
    sel ? 'border-primary bg-primary/10' : 'border-border bg-muted/30 hover:border-primary/40'
  )
  const selectedGroup        = groups.find(g => g.id === form.group_id)
  const selectedTemplate     = templates.find(tpl => tpl.id === form.template_id)
  const selectedPage         = pages.find(p => p.id === form.landing_page_id)

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className='max-w-xl'>
        <DialogHeader><DialogTitle>{t('phishing.wizard.title')}</DialogTitle></DialogHeader>
        {/* Step indicators */}
        <div className='flex gap-1 mb-4'>
          {steps.map((s, i) => (
            <div key={i} className={cn('flex-1 text-center text-xs pb-2 border-b-2 transition-colors font-medium',
              i === step ? 'border-primary text-primary font-bold'
              : i < step ? 'border-border text-muted-foreground'
              : 'border-transparent text-muted-foreground/40')}>{s}</div>
          ))}
        </div>

        {/* Step 0: Info básica */}
        {step === 0 && (
          <div className='flex flex-col gap-3'>
            <div><Label className='text-xs text-muted-foreground mb-1.5 block'>{t('phishing.wizard.nameLabel')}</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder='Simulacro IT Q2 2026' className='h-8 text-sm' /></div>
            <div><Label className='text-xs text-muted-foreground mb-1.5 block'>{t('phishing.wizard.fromName')}</Label><Input value={form.smtp_from_name} onChange={e => setForm(f => ({ ...f, smtp_from_name: e.target.value }))} placeholder='IT Department' className='h-8 text-sm' /></div>
            <div><Label className='text-xs text-muted-foreground mb-1.5 block'>{t('phishing.wizard.fromAddr')}</Label><Input value={form.smtp_from} onChange={e => setForm(f => ({ ...f, smtp_from: e.target.value }))} placeholder='it@empresa.com' className='h-8 text-sm' /></div>
            <div><Label className='text-xs text-muted-foreground mb-1.5 block'>{t('phishing.wizard.redirectUrl')} <span className='text-muted-foreground/50'>{t('phishing.wizard.redirectOptional')}</span></Label><Input value={form.redirect_url} onChange={e => setForm(f => ({ ...f, redirect_url: e.target.value }))} placeholder='https://www.empresa.com' className='h-8 text-sm' /></div>
          </div>
        )}

        {/* Step 1: Grupo */}
        {step === 1 && (
          <div className='flex flex-col gap-2 max-h-72 overflow-y-auto'>
            {groups.length === 0 && <p className='text-sm text-muted-foreground'>{t('phishing.noGroups')}</p>}
            {groups.map(g => (
              <div key={g.id} className={selCls(form.group_id === g.id)} onClick={() => setForm(f => ({ ...f, group_id: g.id }))}>
                <div className='text-sm font-semibold'>{g.name}</div>
                <div className='text-xs text-muted-foreground'>{g.description || ''} · {g.target_count} {t('phishing.groups.targets')}</div>
              </div>
            ))}
          </div>
        )}

        {/* Step 2: Plantilla */}
        {step === 2 && (() => {
          const tplFiltered = templates.filter(tpl => {
            if (tplLang !== 'all' && (tpl.language || 'EN').toUpperCase() !== tplLang) return false
            if (tplSearch.trim()) {
              const q = tplSearch.toLowerCase()
              return tpl.name?.toLowerCase().includes(q) || tpl.subject?.toLowerCase().includes(q)
            }
            return true
          })
          const fBtn = (val: typeof tplLang, label: string) => (
            <button onClick={() => setTplLang(val)} className={cn('text-xs font-bold px-2.5 py-1 rounded border transition-colors',
              tplLang === val
                ? val === 'ES' ? 'bg-red-500 border-red-500 text-white'
                  : val === 'EN' ? 'bg-blue-500 border-blue-500 text-white'
                  : 'bg-primary border-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:border-primary/50 bg-transparent'
            )}>{label}</button>
          )
          return (
            <div className='flex flex-col gap-2'>
              <div className='flex items-center gap-2 flex-wrap'>
                <div className='flex gap-1'>{fBtn('all', t('phishing.templates.all'))}{fBtn('EN', 'EN')}{fBtn('ES', 'ES')}</div>
                <Input value={tplSearch} onChange={e => setTplSearch(e.target.value)} placeholder={t('phishing.templates.search')} className='h-7 text-xs flex-1 min-w-0' />
              </div>
              <div className='flex flex-col gap-2 max-h-64 overflow-y-auto'>
                {templates.length === 0 && <p className='text-sm text-muted-foreground'>{t('phishing.noTemplates')}</p>}
                {tplFiltered.length === 0 && templates.length > 0 && <p className='text-sm text-muted-foreground'>{t('phishing.noResults')}</p>}
                {tplFiltered.map(tpl => (
                  <div key={tpl.id} className={cn(selCls(form.template_id === tpl.id), 'flex items-center gap-3')} onClick={() => setForm(f => ({ ...f, template_id: tpl.id }))}>
                    <LangBadge lang={tpl.language || 'EN'} />
                    <div className='flex-1 min-w-0'>
                      <div className='text-sm font-semibold'>{tpl.name}</div>
                      <div className='text-xs text-muted-foreground'>{tpl.subject}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* Step 3: Página */}
        {step === 3 && (
          <div className='flex flex-col gap-2 max-h-72 overflow-y-auto'>
            <div className={selCls(!form.landing_page_id)} onClick={() => setForm(f => ({ ...f, landing_page_id: '' }))}>
              <div className='text-sm font-semibold'>{t('phishing.noLandingPage')}</div>
              <div className='text-xs text-muted-foreground'>{t('phishing.landingNote')}</div>
            </div>
            {pages.map(pg => (
              <div key={pg.id} className={selCls(form.landing_page_id === pg.id)} onClick={() => setForm(f => ({ ...f, landing_page_id: pg.id }))}>
                <div className='text-sm font-semibold'>{pg.name} <code className='text-[10px] bg-muted px-1.5 py-0.5 rounded'>/sim/{pg.slug}</code></div>
                <div className='text-xs text-muted-foreground'>
                  {pg.capture_credentials ? t('phishing.wizard.captureCredentials') : ''}
                  {pg.capture_passwords ? t('phishing.wizard.capturePasswords') : ''}
                  {!pg.capture_credentials && !pg.capture_passwords ? t('phishing.wizard.noCapture') : ''}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Step 4: Revisar */}
        {step === 4 && (
          <div className='flex flex-col gap-2.5 rounded-lg border bg-muted/30 p-4'>
            <div className='text-sm font-semibold mb-1'>{t('phishing.wizard.summary')}</div>
            {[
              [t('phishing.wizard.summaryName'),     form.name || '—'],
              [t('phishing.wizard.summaryGroup'),     selectedGroup ? `${selectedGroup.name} (${selectedGroup.target_count} ${t('phishing.groups.targets')})` : '—'],
              [t('phishing.wizard.summaryTemplate'),  selectedTemplate?.name || '—'],
              [t('phishing.wizard.summaryPage'),      selectedPage ? selectedPage.name : t('phishing.noLandingPage')],
              [t('phishing.wizard.summaryFrom'),      form.smtp_from_name && form.smtp_from ? `${form.smtp_from_name} <${form.smtp_from}>` : t('phishing.wizard.smtpGlobal')],
            ].map(([k, v]) => (
              <div key={k} className='flex gap-3'>
                <span className='text-xs text-muted-foreground w-20 shrink-0'>{k}</span>
                <span className='text-sm font-medium'>{v}</span>
              </div>
            ))}
          </div>
        )}

        {/* Navigation */}
        <div className='flex justify-between mt-4'>
          <Button variant='ghost' onClick={() => step > 0 ? setStep(s => s - 1) : onClose()}>{step === 0 ? t('phishing.cancel') : t('phishing.prev')}</Button>
          <div className='flex gap-2'>
            {step < 4 && <Button onClick={() => setStep(s => s + 1)}>{t('phishing.next')}</Button>}
            {step === 4 && <Button variant='outline' disabled={saving} onClick={() => launch(false)}>{saving ? <Loader2 className='h-3.5 w-3.5 animate-spin mr-1' /> : null}{t('phishing.saveDraft')}</Button>}
            {step === 4 && <Button disabled={saving} onClick={() => launch(true)}>{saving ? <Loader2 className='h-3.5 w-3.5 animate-spin mr-1' /> : null}{t('phishing.launch')}</Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Resultados de campaña ─────────────────────────────────────────────────────
function ResultsView({ campaign, onBack }: { campaign: any; onBack: () => void }) {
  const { t } = useTranslation()
  const [tab, setTab] = useState('events')
  const [events, setEvents] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [timeline, setTimeline] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [credsModal, setCredsModal] = useState<any>(null)

  const STATUS_LABEL: Record<string, string> = {
    draft: t('phishing.status.draft'), sending: t('phishing.status.sending'),
    active: t('phishing.status.active'), completed: t('phishing.status.completed'),
    cancelled: t('phishing.status.cancelled'), running: t('phishing.status.running'),
  }

  useEffect(() => {
    Promise.all([
      apiFetch<any>(`/phishing/campaigns/${campaign.id}/results`),
      apiFetch<any>(`/phishing/campaigns/${campaign.id}/summary`),
      apiFetch<any>(`/phishing/campaigns/${campaign.id}/timeline`),
    ]).then(([r, s, tl]) => {
      setEvents(r.events || []); setSummary(s); setTimeline(tl.timeline || [])
    }).catch(e => toast.error(e.message))
    .finally(() => setLoading(false))
  }, [campaign.id])

  function exportPDF() {
    const doc = new jsPDF({ orientation: 'landscape' })
    doc.setFontSize(16)
    doc.text(`Gjallarhorn — ${t('phishing.pdf.campaignTitle')}: ${campaign.name}`, 14, 18)
    doc.setFontSize(10)
    doc.setTextColor(150)
    doc.text(`${t('phishing.results.col.status')}: ${STATUS_LABEL[campaign.status] || campaign.status}  |  ${t('phishing.pdf.generated')}: ${new Date().toLocaleString()}`, 14, 26)
    if (summary) {
      doc.setTextColor(0)
      doc.setFontSize(11)
      doc.text(`${t('phishing.results.sent')}: ${summary.sent}  ${t('phishing.results.opened')}: ${summary.opened} (${summary.open_rate}%)  ${t('phishing.results.clicked')}: ${summary.clicked} (${summary.click_rate}%)  ${t('phishing.results.credentials')}: ${summary.submitted} (${summary.submit_rate}%)`, 14, 36)
    }
    autoTable(doc, {
      startY: 42,
      head: [[
        t('phishing.results.col.email'), t('phishing.results.col.name'), t('phishing.results.col.status'),
        t('phishing.results.col.sent'), t('phishing.results.col.opened'), t('phishing.results.col.clicked'),
        t('phishing.results.col.creds'), t('phishing.results.col.ip'),
      ]],
      body: events.map(ev => [
        ev.email,
        [ev.first_name, ev.last_name].filter(Boolean).join(' ') || '—',
        (ev.status || '').toUpperCase(),
        ev.sent_at ? new Date(ev.sent_at).toLocaleString() : '—',
        ev.opened_at ? new Date(ev.opened_at).toLocaleString() : '—',
        ev.clicked_at ? new Date(ev.clicked_at).toLocaleString() : '—',
        ev.submitted_data ? '✓' : '—',
        ev.ip || '—',
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 30, 30] },
    })
    const safeName = campaign.name.replace(/[^a-z0-9]/gi, '_')
    doc.save(`Gjallarhorn_Phishing_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  if (loading) return <div className='flex items-center gap-2 text-muted-foreground text-sm p-8'><Loader2 className='h-4 w-4 animate-spin' />{t('phishing.results.loading')}</div>

  return (
    <div>
      <div className='flex items-center gap-3 mb-4'>
        <Button variant='ghost' size='sm' onClick={onBack}>{t('phishing.back')}</Button>
        <div className='text-base font-semibold'>{campaign.name}</div>
        <StatusBadge status={campaign.status} />
        {campaign.status === 'completed' && (
          <Button variant='outline' size='sm' className='ml-auto' onClick={exportPDF}>
            <FileDown className='h-3.5 w-3.5 mr-1.5' />{t('phishing.downloadPdf')}
          </Button>
        )}
      </div>

      {summary && (
        <div className='grid grid-cols-4 gap-3 mb-4'>
          {[
            [t('phishing.results.sent'), summary.sent, '#3b82f6', ''],
            [t('phishing.results.opened'), summary.opened, '#f59e0b', `${summary.open_rate}%`],
            [t('phishing.results.clicked'), summary.clicked, '#ef4444', `${summary.click_rate}%`],
            [t('phishing.results.credentials'), summary.submitted, '#22c55e', `${summary.submit_rate}%`],
          ].map(([l, v, c, sub]) => (
            <div key={l as string} className='rounded-lg border bg-card px-4 py-3'>
              <div className='text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1'>{l as string}</div>
              <div className='text-2xl font-black tabular-nums' style={{ color: c as string }}>{v as number}</div>
              {sub && <div className='text-[11px] text-muted-foreground mt-0.5'>{sub as string}</div>}
            </div>
          ))}
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className='mb-3'>
          <TabsTrigger value='events'>{t('phishing.results.tab.events')}</TabsTrigger>
          <TabsTrigger value='timeline'>{t('phishing.results.tab.timeline')}</TabsTrigger>
        </TabsList>

        <TabsContent value='events'>
          <div className='rounded-lg border overflow-hidden'>
            <table className='w-full text-xs border-collapse'>
              <thead>
                <tr className='bg-muted/50'>
                  {[
                    t('phishing.results.col.email'), t('phishing.results.col.name'), t('phishing.results.col.status'),
                    t('phishing.results.col.sent'), t('phishing.results.col.opened'), t('phishing.results.col.clicked'),
                    t('phishing.results.col.creds'), t('phishing.results.col.ip'),
                  ].map(h => (
                    <th key={h} className='px-3 py-2 text-left font-semibold text-muted-foreground border-b'>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map(ev => (
                  <tr key={ev.id} className='border-b last:border-0 hover:bg-muted/10'>
                    <td className='px-3 py-2 font-medium'>{ev.email}</td>
                    <td className='px-3 py-2 text-muted-foreground'>{[ev.first_name, ev.last_name].filter(Boolean).join(' ') || '—'}</td>
                    <td className='px-3 py-2'><span className='font-bold text-[10px]' style={{ color: EV_COLOR[ev.status] || '#888' }}>{ev.status?.toUpperCase()}</span></td>
                    <td className='px-3 py-2 text-muted-foreground whitespace-nowrap'>{ev.sent_at ? new Date(ev.sent_at).toLocaleString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td className='px-3 py-2 text-muted-foreground whitespace-nowrap'>{ev.opened_at ? new Date(ev.opened_at).toLocaleString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td className='px-3 py-2 text-muted-foreground whitespace-nowrap'>{ev.clicked_at ? new Date(ev.clicked_at).toLocaleString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td className='px-3 py-2'>
                      {ev.submitted_data
                        ? <button onClick={() => setCredsModal({ email: ev.email, data: ev.submitted_data })} className='text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-500'>{t('phishing.results.viewCreds')}</button>
                        : <span className='text-muted-foreground'>—</span>
                      }
                    </td>
                    <td className='px-3 py-2 text-muted-foreground'>{ev.ip || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {events.length === 0 && <div className='text-sm text-muted-foreground p-4'>{t('phishing.results.noEvents')}</div>}
          </div>
        </TabsContent>

        <TabsContent value='timeline'>
          <div className='flex flex-col gap-1.5'>
            {timeline.length === 0 && <p className='text-sm text-muted-foreground'>{t('phishing.results.noEvents')}</p>}
            {timeline.map((ev, i) => (
              <div key={i} className='flex items-center gap-3 rounded-lg border bg-muted/20 px-4 py-2 text-xs'>
                <span className='font-bold w-16 shrink-0' style={{ color: EV_COLOR[ev.type] || '#888' }}>{ev.type?.toUpperCase()}</span>
                <span className='text-muted-foreground flex-1'>{ev.email}</span>
                <span className='text-muted-foreground'>{ev.ts ? new Date(ev.ts).toLocaleString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {credsModal && (
        <Dialog open onOpenChange={() => setCredsModal(null)}>
          <DialogContent className='max-w-sm'>
            <DialogHeader><DialogTitle>{t('phishing.results.credsTitle', { email: credsModal.email })}</DialogTitle></DialogHeader>
            <div className='text-xs text-muted-foreground mb-3'>{t('phishing.results.credsNote')}</div>
            <div className='rounded-lg border bg-muted/30 p-3 space-y-2'>
              {Object.entries(credsModal.data || {}).map(([k, v]) => (
                <div key={k} className='flex gap-3 text-sm'>
                  <span className='text-muted-foreground font-semibold capitalize w-24 shrink-0'>{k}:</span>
                  <span className={cn('font-mono break-all', v === '***' ? 'text-muted-foreground' : '')}>
                    {v === '***' ? t('phishing.results.hiddenPass') : String(v)}
                  </span>
                </div>
              ))}
            </div>
            <div className='text-[10px] text-muted-foreground mt-2'>{t('phishing.results.confidential')}</div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

// ── Campaigns Tab ─────────────────────────────────────────────────────────────
function CampaignsTab() {
  const { t } = useTranslation()
  const { auth } = useAuthStore()
  const isAdmin = ['admin', 'analyst', 'analyst_full', 'phishing_analyst'].includes(auth.user?.role || '')
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [wizard, setWizard] = useState(false)
  const [viewResults, setViewResults] = useState<any>(null)
  const [campPage, setCampPage] = useState(1)
  const [campPageSize, setCampPageSize] = useState(10)

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true)
    apiFetch<any>('/phishing/campaigns')
      .then(d => { setCampaigns(d.campaigns || []) })
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const id = setInterval(() => {
      setCampaigns(prev => {
        if (prev.some(c => c.status === 'sending' || c.status === 'running' || c.status === 'active')) load(true)
        return prev
      })
    }, 8000)
    return () => clearInterval(id)
  }, [load])

  async function launch(c: any) {
    try {
      const r = await apiFetch<any>(`/phishing/campaigns/${c.id}/launch`, { method: 'POST', body: JSON.stringify({}) })
      toast.success(t('phishing.campaigns.launched', { n: r.targets }))
      load()
    } catch (e: any) { toast.error(e.message) }
  }

  async function complete(c: any) {
    try {
      await apiFetch(`/phishing/campaigns/${c.id}/complete`, { method: 'POST', body: JSON.stringify({}) })
      toast.success(t('phishing.campaigns.completed'))
      load()
    } catch (e: any) { toast.error(e.message) }
  }

  async function cancel(c: any) {
    if (!confirm(t('phishing.campaigns.confirmCancel', { name: c.name }))) return
    try {
      await apiFetch(`/phishing/campaigns/${c.id}/cancel`, { method: 'POST', body: JSON.stringify({}) })
      toast.success(t('phishing.campaigns.cancelled'))
      load()
    } catch (e: any) { toast.error(e.message) }
  }

  async function del(c: any) {
    if (!confirm(t('phishing.campaigns.confirmDelete', { name: c.name }))) return
    try {
      await apiFetch(`/phishing/campaigns/${c.id}`, { method: 'DELETE' })
      load()
    } catch (e: any) { toast.error(e.message) }
  }

  if (viewResults) return <ResultsView campaign={viewResults} onBack={() => { setViewResults(null); load() }} />

  if (loading) return <div className='flex items-center gap-2 text-sm text-muted-foreground'><Loader2 className='h-3.5 w-3.5 animate-spin' />{t('common.loading')}</div>

  const pageRows = campPageSize === 0 ? campaigns : campaigns.slice((campPage - 1) * campPageSize, campPage * campPageSize)
  const bar = <PaginationBar total={campaigns.length} page={campPage} pageSize={campPageSize} onPage={setCampPage} onPageSize={setCampPageSize} />

  return (
    <div>
      <div className='flex items-center justify-between mb-4'>
        <span className='text-sm font-semibold'>{t('phishing.campaigns.title')}</span>
        {isAdmin && <Button size='sm' onClick={() => setWizard(true)}><Plus className='h-3.5 w-3.5 mr-1' />{t('phishing.campaigns.new')}</Button>}
      </div>
      {campaigns.length === 0 ? <p className='text-sm text-muted-foreground'>{t('phishing.campaigns.none')}</p> : (
        <div className='flex flex-col gap-3'>
          {bar}
          {pageRows.map(c => {
            const stats = c.stats || {}
            const sent = stats.sent || 0
            return (
              <div key={c.id} className='rounded-lg border bg-card p-4'>
                <div className='flex items-center gap-3 mb-3'>
                  <div className='flex-1 min-w-0'>
                    <span className='font-semibold'>{c.name}</span>
                    {c.group_name && <span className='text-xs text-muted-foreground ml-2'>{c.group_name}</span>}
                  </div>
                  <StatusBadge status={c.status} />
                  <span className='text-[11px] text-muted-foreground'>{new Date(c.created_at).toLocaleDateString()}</span>
                </div>
                <div className='flex items-center gap-6 mb-3'>
                  {[
                    [t('phishing.campaigns.sent'), stats.sent ?? 0, '#3b82f6'],
                    [t('phishing.campaigns.opened'), stats.opened ?? 0, '#f59e0b'],
                    [t('phishing.campaigns.clicked'), stats.clicked ?? 0, '#ef4444'],
                    [t('phishing.campaigns.creds'), stats.submitted ?? 0, '#22c55e'],
                  ].map(([l, v, c]) => (
                    <div key={l as string} className='text-center'>
                      <div className='text-lg font-black tabular-nums' style={{ color: c as string }}>{v as number}</div>
                      <div className='text-[9px] text-muted-foreground uppercase tracking-wide'>{l as string}</div>
                    </div>
                  ))}
                  <div className='ml-auto flex gap-2'>
                    <Button size='sm' variant='outline' className='h-7 text-xs' onClick={() => setViewResults(c)}>{t('phishing.campaigns.viewResults')}</Button>
                    {isAdmin && c.status === 'draft' && <Button size='sm' className='h-7 text-xs' onClick={() => launch(c)}>{t('phishing.campaigns.launch')}</Button>}
                    {isAdmin && (c.status === 'running' || c.status === 'active' || c.status === 'sending') && (
                      <>
                        <Button size='sm' variant='outline' className='h-7 text-xs' onClick={() => complete(c)}>{t('phishing.campaigns.complete')}</Button>
                        <Button size='sm' variant='destructive' className='h-7 text-xs' onClick={() => cancel(c)}>{t('phishing.campaigns.cancel')}</Button>
                      </>
                    )}
                    {isAdmin && (c.status === 'draft' || c.status === 'cancelled') && (
                      <Button size='sm' variant='ghost' className='h-7 text-xs text-destructive hover:text-destructive' onClick={() => del(c)}><Trash2 className='h-3 w-3' /></Button>
                    )}
                  </div>
                </div>
                <div className='flex items-center gap-2 text-[11px] text-muted-foreground'>
                  {c.template_name && <span>{t('phishing.campaigns.template')}: {c.template_name}</span>}
                  {c.page_name && <><span>·</span><span>{t('phishing.campaigns.page')}: {c.page_name}</span></>}
                  {sent > 0 && stats.clicked > 0 && <><span>·</span><span>{t('phishing.campaigns.clickRate')}: {Math.round((stats.clicked / sent) * 100)}%</span></>}
                </div>
              </div>
            )
          })}
          {bar}
        </div>
      )}
      {wizard && <WizardModal onClose={() => setWizard(false)} onDone={() => { setWizard(false); load() }} />}
    </div>
  )
}

// ── Language badge ─────────────────────────────────────────────────────────────
function LangBadge({ lang }: { lang: string }) {
  const isES = lang?.toUpperCase() === 'ES'
  return (
    <span className={cn(
      'text-[10px] font-bold px-2 py-0.5 rounded border w-8 text-center shrink-0',
      isES
        ? 'bg-red-500/15 text-red-400 border-red-500/40'
        : 'bg-blue-500/15 text-blue-400 border-blue-500/40'
    )}>
      {lang?.toUpperCase() || 'EN'}
    </span>
  )
}

// ── Templates Tab ─────────────────────────────────────────────────────────────
function TemplatesTab() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<any[]>([])
  const [preview, setPreview] = useState<any>(null)
  const [langFilter, setLangFilter] = useState<'all' | 'EN' | 'ES'>('all')
  const [search, setSearch] = useState('')

  function load() { apiFetch<any>('/phishing/templates').then(d => setRows(d.templates || [])).catch(e => toast.error(e.message)) }
  useEffect(load, [])

  const filtered = rows.filter(r => {
    if (langFilter !== 'all' && (r.language || 'EN').toUpperCase() !== langFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return r.name?.toLowerCase().includes(q) || r.subject?.toLowerCase().includes(q)
    }
    return true
  })

  async function openPreview(r: any) {
    const d = await apiFetch<any>(`/phishing/templates/${r.id}`).catch(e => { toast.error(e.message); return null })
    if (d) setPreview(d.template)
  }

  const filterBtn = (val: typeof langFilter, label: string) => (
    <button
      onClick={() => setLangFilter(val)}
      className={cn(
        'text-xs font-bold px-3 py-1 rounded border transition-colors',
        langFilter === val
          ? val === 'ES' ? 'bg-red-500 border-red-500 text-white'
            : val === 'EN' ? 'bg-blue-500 border-blue-500 text-white'
            : 'bg-primary border-primary text-primary-foreground'
          : 'border-border text-muted-foreground hover:border-primary/50 bg-transparent'
      )}
    >{label}</button>
  )

  return (
    <div>
      <div className='flex items-center gap-3 mb-4 flex-wrap'>
        <span className='text-sm font-semibold mr-1'>{t('phishing.templates.title')}</span>
        <div className='flex gap-1.5'>
          {filterBtn('all', t('phishing.templates.all'))}
          {filterBtn('EN', 'EN')}
          {filterBtn('ES', 'ES')}
        </div>
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('phishing.templates.search')}
          className='h-7 text-xs w-48'
        />
        <div className='ml-auto'>
          <span className='text-[10px] text-muted-foreground border rounded px-2 py-0.5'>Read-only in Community Edition</span>
        </div>
      </div>
      <div className='flex flex-col gap-2'>
        {filtered.map(r => (
          <div key={r.id} className='rounded-lg border bg-card px-4 py-3 flex items-center gap-3'>
            <LangBadge lang={r.language || 'EN'} />
            <div className='flex-1 min-w-0'>
              <div className='text-sm font-medium'>{r.name}</div>
              <div className='text-xs text-muted-foreground'>{r.subject}</div>
            </div>
            <Button variant='ghost' size='sm' className='h-7 text-xs' onClick={() => openPreview(r)}><Eye className='h-3.5 w-3.5 mr-1' />{t('phishing.templates.preview')}</Button>
          </div>
        ))}
        {filtered.length === 0 && <p className='text-sm text-muted-foreground'>{rows.length === 0 ? t('phishing.templates.none') : t('phishing.templates.noResults')}</p>}
      </div>

      <Dialog open={preview !== null} onOpenChange={open => !open && setPreview(null)}>
        <DialogContent className='max-w-2xl'>
          <DialogHeader><DialogTitle>{t('phishing.templates.previewTitle', { name: preview?.name })}</DialogTitle></DialogHeader>
          <div className='border rounded mt-2 overflow-auto max-h-[70vh]'>
            {preview?.html_body ? <iframe srcDoc={preview.html_body} className='w-full min-h-[400px]' sandbox='allow-same-origin' /> : <p className='p-4 text-sm text-muted-foreground'>{t('phishing.templates.noHtml')}</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
// ── Landing Pages Tab ─────────────────────────────────────────────────────────
function LandingPagesTab() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<any[]>([])
  const [preview, setPreview] = useState<any>(null)
  const [search, setSearch] = useState('')

  function load() { apiFetch<any>('/phishing/pages').then(d => setRows(d.pages || [])).catch(e => toast.error(e.message)) }
  useEffect(load, [])

  const filtered = rows.filter(r => {
    if (search.trim()) return r.name?.toLowerCase().includes(search.toLowerCase()) || r.slug?.toLowerCase().includes(search.toLowerCase())
    return true
  })

  async function openPreview(r: any) {
    try { const d = await apiFetch<any>(`/phishing/pages/${r.id}`); setPreview(d.page) }
    catch (e: any) { toast.error(e.message) }
  }

  return (
    <div>
      <div className='flex items-center gap-3 mb-4 flex-wrap'>
        <div className='mr-1'>
          <div className='text-sm font-semibold'>{t('phishing.landing.title')}</div>
          <div className='text-xs text-muted-foreground mt-0.5'>{t('phishing.landing.desc')}</div>
        </div>
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('phishing.landing.search')} className='h-7 text-xs w-48' />
        <div className='ml-auto'>
          <span className='text-[10px] text-muted-foreground border rounded px-2 py-0.5'>Read-only in Community Edition</span>
        </div>
      </div>
      <div>
        {rows.length === 0 ? <p className='text-sm text-muted-foreground'>{t('phishing.landing.none')}</p> : filtered.length === 0 ? <p className='text-sm text-muted-foreground'>{t('phishing.landing.noResults')}</p> : (
          <div className='rounded-lg border overflow-hidden'>
            <table className='w-full text-xs border-collapse'>
              <thead>
                <tr className='bg-muted/50'>
                  {['', t('phishing.landing.col.name'), t('phishing.landing.col.slug'), t('phishing.landing.col.captureCreds'), t('phishing.landing.col.capturePass'), ''].map(h => (
                    <th key={h} className='px-3 py-2 text-left font-semibold text-muted-foreground border-b'>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className='border-b last:border-0 hover:bg-muted/10'>
                    <td className='px-3 py-2.5'><LangBadge lang={r.language || 'ES'} /></td>
                    <td className='px-3 py-2.5 font-medium'>{r.name}</td>
                    <td className='px-3 py-2.5'><code className='bg-muted px-2 py-0.5 rounded text-[11px]'>/sim/{r.slug}</code></td>
                    <td className='px-3 py-2.5'>{r.capture_credentials ? <span className='text-emerald-500 font-bold'>✓</span> : <span className='text-muted-foreground'>—</span>}</td>
                    <td className='px-3 py-2.5'>{r.capture_passwords ? <span className='text-amber-400 font-bold'>✓</span> : <span className='text-muted-foreground'>—</span>}</td>
                    <td className='px-3 py-2.5 text-right'>
                      <Button variant='ghost' size='sm' className='h-7 text-xs' onClick={() => openPreview(r)}><Eye className='h-3.5 w-3.5 mr-1' />{t('phishing.landing.preview')}</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={preview !== null} onOpenChange={open => !open && setPreview(null)}>
        <DialogContent className='max-w-3xl'>
          <DialogHeader><DialogTitle>{t('phishing.landing.previewTitle', { name: preview?.name })}</DialogTitle></DialogHeader>
          <div className='border rounded mt-2'>
            {preview?.html ? <iframe srcDoc={preview.html} className='w-full min-h-[480px]' sandbox='allow-same-origin' title='preview' /> : <p className='p-4 text-sm text-muted-foreground'>{t('phishing.landing.noHtml')}</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
function GroupsTab() {
  const { t } = useTranslation()
  const { auth } = useAuthStore()
  const isAdmin = ['admin', 'analyst', 'analyst_full', 'phishing_analyst'].includes(auth.user?.role || '')
  const [groups, setGroups] = useState<any[]>([])
  const [expanded, setExpanded] = useState<any>(null)
  const [targets, setTargets] = useState<any[]>([])
  const [modal, setModal] = useState<null | 'new' | any>(null)
  const [form, setForm] = useState({ name: '', description: '' })
  const [tForm, setTForm] = useState({ email: '', first_name: '', last_name: '', position: '', department: '' })
  const [saving, setSaving] = useState(false)
  const csvRef = useRef<HTMLInputElement>(null)

  function load() { apiFetch<any>('/phishing/groups').then(d => setGroups(d.groups || [])).catch(e => toast.error(e.message)) }
  useEffect(load, [])

  async function expandGroup(g: any) {
    if (expanded?.id === g.id) { setExpanded(null); return }
    setExpanded(g)
    const d = await apiFetch<any>(`/phishing/groups/${g.id}/targets`).catch(() => ({ targets: [] }))
    setTargets(d.targets || [])
  }

  async function saveGroup() {
    if (!form.name) return toast.error(t('phishing.groups.nameRequired'))
    setSaving(true)
    try {
      if (modal === 'new') await apiFetch('/phishing/groups', { method: 'POST', body: JSON.stringify(form) })
      else await apiFetch(`/phishing/groups/${modal.id}`, { method: 'PUT', body: JSON.stringify(form) })
      toast.success(modal === 'new' ? t('phishing.groups.created') : t('phishing.groups.updated'))
      setModal(null); load()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  async function addTarget() {
    if (!tForm.email) return toast.error(t('phishing.groups.emailRequired'))
    try {
      await apiFetch(`/phishing/groups/${expanded.id}/targets`, { method: 'POST', body: JSON.stringify(tForm) })
      setTForm({ email: '', first_name: '', last_name: '', position: '', department: '' })
      const d = await apiFetch<any>(`/phishing/groups/${expanded.id}/targets`)
      setTargets(d.targets || []); load()
    } catch (e: any) { toast.error(e.message) }
  }

  async function handleCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !expanded) return
    const token = localStorage.getItem(TOKEN_KEY)
    const fd = new FormData(); fd.append('file', file)
    try {
      const r = await fetch(`/api/phishing/groups/${expanded.id}/import`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      toast.success(t('phishing.groups.imported', { n: d.imported, s: d.skipped }))
      const r2 = await apiFetch<any>(`/phishing/groups/${expanded.id}/targets`)
      setTargets(r2.targets || []); load()
    } catch (e: any) { toast.error(e.message) }
    e.target.value = ''
  }

  return (
    <div>
      <div className='flex items-center justify-between mb-4'>
        <span className='text-sm font-semibold'>{t('phishing.groups.title')}</span>
        {isAdmin && <Button size='sm' onClick={() => { setForm({ name: '', description: '' }); setModal('new') }}><Plus className='h-3.5 w-3.5 mr-1' />{t('phishing.groups.new')}</Button>}
      </div>
      <div className='flex flex-col gap-2'>
        {groups.map(g => (
          <div key={g.id} className='rounded-lg border bg-card overflow-hidden'>
            <div className='px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-muted/30' onClick={() => expandGroup(g)}>
              <div className='flex-1 min-w-0'>
                <span className='text-sm font-medium'>{g.name}</span>
                {g.description && <span className='text-xs text-muted-foreground ml-2'>{g.description}</span>}
              </div>
              <Badge variant='outline' className='text-xs'>{g.target_count} {t('phishing.groups.targets')}</Badge>
              {isAdmin && <Button variant='ghost' size='sm' className='h-6 text-xs' onClick={e => { e.stopPropagation(); setForm({ name: g.name, description: g.description || '' }); setModal(g) }}>{t('phishing.groups.edit')}</Button>}
              {expanded?.id === g.id ? <ChevronUp className='h-4 w-4 text-muted-foreground' /> : <ChevronDown className='h-4 w-4 text-muted-foreground' />}
            </div>
            {expanded?.id === g.id && (
              <div className='border-t px-4 py-3'>
                <div className='flex items-center gap-2 mb-3'>
                  <input type='file' accept='.csv' ref={csvRef} className='hidden' onChange={handleCsv} />
                  <Button variant='outline' size='sm' className='h-7 text-xs' onClick={() => csvRef.current?.click()}><Upload className='h-3 w-3 mr-1' />{t('phishing.groups.importCsv')}</Button>
                  <span className='text-[10px] text-muted-foreground'>{t('phishing.groups.csvNote')}</span>
                </div>
                <div className='grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-1.5 mb-3'>
                  {[
                    ['email', 'email@empresa.com *'],
                    ['first_name', t('phishing.groups.col.name')],
                    ['last_name', t('phishing.groups.col.lastName')],
                    ['position', t('phishing.groups.col.position')],
                    ['department', t('phishing.groups.col.dept')],
                  ].map(([k, ph]) => (
                    <Input key={k} value={(tForm as any)[k]} onChange={e => setTForm(f => ({ ...f, [k]: e.target.value }))} placeholder={ph} className='h-7 text-xs' />
                  ))}
                  <Button size='sm' className='h-7 w-7 p-0' onClick={addTarget}><Plus className='h-3 w-3' /></Button>
                </div>
                {targets.length > 0 && (
                  <table className='w-full text-xs border-collapse'>
                    <thead>
                      <tr className='border-b'>
                        {[
                          t('phishing.groups.col.email'), t('phishing.groups.col.name'),
                          t('phishing.groups.col.lastName'), t('phishing.groups.col.position'),
                          t('phishing.groups.col.dept'), '',
                        ].map(h => <th key={h} className='px-2 py-1.5 text-left text-muted-foreground font-medium'>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {targets.map(tgt => (
                        <tr key={tgt.id} className='border-b last:border-0'>
                          <td className='px-2 py-1.5'>{tgt.email}</td>
                          <td className='px-2 py-1.5 text-muted-foreground'>{tgt.first_name}</td>
                          <td className='px-2 py-1.5 text-muted-foreground'>{tgt.last_name}</td>
                          <td className='px-2 py-1.5 text-muted-foreground'>{tgt.position}</td>
                          <td className='px-2 py-1.5 text-muted-foreground'>{tgt.department}</td>
                          <td className='px-2 py-1.5 text-right'>
                            <button className='text-destructive hover:text-destructive/80' onClick={() => apiFetch(`/phishing/groups/${expanded.id}/targets/${tgt.id}`, { method: 'DELETE' }).then(() => setTargets(p => p.filter(x => x.id !== tgt.id)))}>✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {targets.length === 0 && <p className='text-xs text-muted-foreground'>{t('phishing.groups.noTargets')}</p>}
              </div>
            )}
          </div>
        ))}
        {groups.length === 0 && <p className='text-sm text-muted-foreground'>{t('phishing.groups.none')}</p>}
      </div>
      <Dialog open={modal !== null} onOpenChange={open => !open && setModal(null)}>
        <DialogContent className='max-w-sm'>
          <DialogHeader><DialogTitle>{modal === 'new' ? t('phishing.groups.newTitle') : t('phishing.groups.editTitle')}</DialogTitle></DialogHeader>
          <div className='flex flex-col gap-3 pt-2'>
            <div><Label className='text-xs mb-1 block text-muted-foreground'>{t('phishing.groups.name')}</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className='h-8 text-sm' /></div>
            <div><Label className='text-xs mb-1 block text-muted-foreground'>{t('phishing.groups.descOptional')}</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className='h-8 text-sm' /></div>
            <div className='flex gap-2 pt-1'>
              <Button disabled={saving} onClick={saveGroup}>{modal === 'new' ? t('phishing.groups.create') : t('phishing.groups.save')}</Button>
              <Button variant='ghost' onClick={() => setModal(null)}>{t('phishing.groups.cancel')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Main View ─────────────────────────────────────────────────────────────────
export function PhishingView() {
  const { t } = useTranslation()
  return (
    <div className='p-8'>
      <h1 className='text-2xl font-bold flex items-center gap-2 mb-1'>
        <Fish className='h-5 w-5 text-primary' />
        {t('phishing.title')}
      </h1>
      <p className='text-sm text-muted-foreground mb-6'>{t('phishing.desc')}</p>
      <Tabs defaultValue='campaigns'>
        <TabsList className='mb-6'>
          <TabsTrigger value='campaigns'>{t('phishing.tab.campaigns')}</TabsTrigger>
          <TabsTrigger value='templates'>{t('phishing.tab.templates')}</TabsTrigger>
          <TabsTrigger value='landing'>{t('phishing.tab.landing')}</TabsTrigger>
          <TabsTrigger value='groups'>{t('phishing.tab.groups')}</TabsTrigger>
        </TabsList>
        <TabsContent value='campaigns'><CampaignsTab /></TabsContent>
        <TabsContent value='templates'><TemplatesTab /></TabsContent>
        <TabsContent value='landing'><LandingPagesTab /></TabsContent>
        <TabsContent value='groups'><GroupsTab /></TabsContent>
      </Tabs>
    </div>
  )
}
