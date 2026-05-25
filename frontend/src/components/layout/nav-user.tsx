import { useState } from 'react'
import { ChevronsUpDown, KeyRound, Plug, Bot, UserCog, ClipboardList, Settings2, Bug, Loader2 } from 'lucide-react'
import { Link, useLocation } from '@tanstack/react-router'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { useAuthStore } from '@/stores/auth-store'
import { useTranslation } from 'react-i18next'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'

const CONFIG_ITEMS = [
  { titleKey: 'nav.config.apikeys',   url: '/config/apikeys',   icon: KeyRound },
  { titleKey: 'nav.config.platforms', url: '/config/platforms', icon: Plug },
  { titleKey: 'nav.config.ia',        url: '/config/ia',        icon: Bot },
  { titleKey: 'nav.config.users',     url: '/config/usuarios',  icon: UserCog },
  { titleKey: 'nav.config.audit',     url: '/config/auditoria', icon: ClipboardList },
]

const ADMIN_ONLY_KEYS = ['nav.config.users', 'nav.config.audit']

export function NavUser(_props: { user?: { name: string; email: string; avatar: string } }) {
  const { isMobile } = useSidebar()
  const { auth } = useAuthStore()
  const { t } = useTranslation()
  const isAdmin = auth.user?.role === 'admin'
  const location = useLocation()

  const [bugOpen, setBugOpen] = useState(false)
  const [bugCategory, setBugCategory] = useState('bug')
  const [bugTitle, setBugTitle] = useState('')
  const [bugDesc, setBugDesc] = useState('')
  const [bugSending, setBugSending] = useState(false)

  async function sendBugReport() {
    if (!bugDesc.trim()) return
    setBugSending(true)
    try {
      await apiFetch('/bug-report', {
        method: 'POST',
        body: JSON.stringify({ category: bugCategory, title: bugTitle, description: bugDesc, url: location.pathname }),
      })
      toast.success(t('bugreport.sent'))
      setBugOpen(false)
      setBugTitle('')
      setBugDesc('')
      setBugCategory('bug')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBugSending(false)
    }
  }

  const visibleConfig = CONFIG_ITEMS.filter(
    item => !ADMIN_ONLY_KEYS.includes(item.titleKey) || isAdmin
  )

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size='lg'
              className='data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'
            >
              <div className='flex aspect-square size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground shrink-0'>
                <Settings2 className='size-4' />
              </div>
              <div className='grid flex-1 text-start text-sm leading-tight min-w-0'>
                <span className='truncate font-semibold'>{t('nav.config.admin')}</span>
                <span className='truncate text-xs text-muted-foreground'>{t('nav.config.system')}</span>
              </div>
              <ChevronsUpDown className='ml-auto size-4 shrink-0' />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className='w-[--radix-dropdown-menu-trigger-width] min-w-52 rounded-lg'
            side={isMobile ? 'bottom' : 'right'}
            align='end'
            sideOffset={4}
          >
            <DropdownMenuLabel className='text-xs text-muted-foreground uppercase tracking-wide font-semibold px-2 py-1.5'>
              {t('nav.config.config')}
            </DropdownMenuLabel>
            <DropdownMenuGroup>
              {visibleConfig.map(item => (
                <DropdownMenuItem key={item.url} asChild>
                  <Link to={item.url} className='flex items-center gap-2'>
                    <item.icon className='size-4' />
                    {t(item.titleKey)}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => setBugOpen(true)} className='text-muted-foreground'>
                <Bug className='size-4' />
                {t('bugreport.menu')}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>

      <Dialog open={bugOpen} onOpenChange={setBugOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              <Bug className='size-4' />
              {t('bugreport.title')}
            </DialogTitle>
          </DialogHeader>
          <div className='space-y-3 py-1'>
            <div className='space-y-1'>
              <Label className='text-xs'>{t('bugreport.category')}</Label>
              <Select value={bugCategory} onValueChange={setBugCategory}>
                <SelectTrigger className='h-8 text-sm'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='bug'>{t('bugreport.cat.bug')}</SelectItem>
                  <SelectItem value='mejora'>{t('bugreport.cat.improvement')}</SelectItem>
                  <SelectItem value='otro'>{t('bugreport.cat.other')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-1'>
              <Label className='text-xs'>{t('bugreport.titleLabel')}</Label>
              <Input
                className='h-8 text-sm'
                placeholder={t('bugreport.titlePlaceholder')}
                value={bugTitle}
                onChange={e => setBugTitle(e.target.value)}
              />
            </div>
            <div className='space-y-1'>
              <Label className='text-xs'>{t('bugreport.desc')} <span className='text-destructive'>*</span></Label>
              <Textarea
                className='text-sm min-h-24 resize-none'
                placeholder={t('bugreport.descPlaceholder')}
                value={bugDesc}
                onChange={e => setBugDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant='outline' size='sm' onClick={() => setBugOpen(false)} disabled={bugSending}>
              {t('common.cancel')}
            </Button>
            <Button size='sm' onClick={sendBugReport} disabled={bugSending || !bugDesc.trim()}>
              {bugSending && <Loader2 className='size-3.5 mr-1.5 animate-spin' />}
              {t('bugreport.send')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarMenu>
  )
}
