import { useState, useEffect } from 'react'
import { useLayout } from '@/context/layout-provider'
import { useAuthStore } from '@/stores/auth-store'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'
import { AppTitle } from './app-title'
import { sidebarData } from './data/sidebar-data'
import { NavGroup } from './nav-group'
import { NavUser } from './nav-user'
import { type NavGroup as NavGroupType } from './types'
import { apiFetch } from '@/lib/api'

const PLATFORM_URLS: Record<string, string> = {
  wazuh: '/soc/wazuh',
  velociraptor: '/soc/velociraptor',
  openvas: '/soc/openvas',
}

const BOTTOM_GROUPS: string[] = []

export function AppSidebar() {
  const { collapsible, variant } = useLayout()
  const { auth } = useAuthStore()

  const [enabledPlatforms, setEnabledPlatforms] = useState<Record<string, boolean>>({})
  const [aiEnabled, setAiEnabled] = useState(false)

  useEffect(() => {
    apiFetch('/platforms').then((r: any) => {
      const map: Record<string, boolean> = {}
      ;(r.platforms ?? []).forEach((p: any) => { map[p.platform] = p.enabled })
      setEnabledPlatforms(map)
    }).catch(() => {})

    apiFetch('/ai/settings').then((r: any) => {
      setAiEnabled(!!r.enabled)
    }).catch(() => {})
  }, [])

  const analystRoles = ['admin', 'analyst']

  const filteredGroups: NavGroupType[] = sidebarData.navGroups
    .map((group) => {
      if (group.title === 'nav.dashboards') {
        const items = group.items.filter(item =>
          item.title === 'nav.dashboard' ||
          analystRoles.includes(auth.user?.role || '')
        )
        return { ...group, items }
      }

      if (group.title === 'nav.soc') {
        const items = group.items.filter(
          (item) =>
            Object.entries(PLATFORM_URLS).some(
              ([key, url]) => url === item.url && enabledPlatforms[key]
            )
        )
        if (items.length === 0) return null
        return { ...group, items }
      }

      if (group.title === 'nav.ai') {
        if (!aiEnabled) return null
      }

      return group
    })
    .filter(Boolean) as NavGroupType[]

  const topGroups = filteredGroups.filter((g) => !BOTTOM_GROUPS.includes(g.title))
  const bottomGroups = filteredGroups.filter((g) => BOTTOM_GROUPS.includes(g.title))

  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      <SidebarHeader>
        <AppTitle />
      </SidebarHeader>
      <SidebarContent>
        {topGroups.map((props) => (
          <NavGroup key={props.title} {...props} />
        ))}
        <div className='mt-auto'>
          {bottomGroups.map((props) => (
            <NavGroup key={props.title} {...props} />
          ))}
        </div>
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={sidebarData.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
