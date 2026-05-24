import { Link } from '@tanstack/react-router'
import { ExternalLink, LayoutGrid, ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from '@/components/ui/sidebar'

export function AppTitle() {
  const { setOpenMobile } = useSidebar()
  const { t } = useTranslation()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div className='flex items-center'>
          <SidebarMenuButton
            size='lg'
            className='hover:bg-transparent active:bg-transparent flex-1 min-w-0'
            asChild
          >
            <Link to='/' onClick={() => setOpenMobile(false)} className='flex items-center gap-2'>
              <div className='flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shrink-0'>
                <ShieldAlert className='size-4' />
              </div>
              <div className='grid flex-1 text-start text-sm leading-tight min-w-0'>
                <span className='truncate font-bold flex items-center gap-1.5' style={{ color: '#3b82f6' }}>
                  Gjallarhorn
                  <span className='text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-muted text-muted-foreground'>Community</span>
                </span>
                <span className='truncate text-xs text-muted-foreground'>{t('nav.blueteam')}</span>
              </div>
            </Link>
          </SidebarMenuButton>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant='ghost'
                size='icon'
                className='h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground'
              >
                <LayoutGrid className='size-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='start' className='w-48'>
              <DropdownMenuLabel className='text-xs text-muted-foreground uppercase tracking-wide'>
                {t('nav.allsafe.systems')}
              </DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <a href='https://sgsi.allsafe.com.ar' target='_blank' rel='noreferrer'>
                  <ExternalLink className='size-4' />
                  SGSI
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href='https://crm.allsafe.com.ar' target='_blank' rel='noreferrer'>
                  <ExternalLink className='size-4' />
                  CRM
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href='https://arp.allsafe.com.ar' target='_blank' rel='noreferrer'>
                  <ExternalLink className='size-4' />
                  ARP
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href='https://allsafe.com.ar' target='_blank' rel='noreferrer'>
                  <ExternalLink className='size-4' />
                  Web
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
