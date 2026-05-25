import {
  LayoutDashboard,
  Search,
  FileSearch,
  Mail,
  AlertTriangle,
  Clock,
  Bot,
  ShieldAlert,
  Activity,
  Network,
  ScanLine,
  Key,
} from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  user: { name: '', email: '', avatar: '' },
  teams: [],
  navGroups: [
    {
      title: 'nav.dashboards',
      items: [
        { title: 'nav.dashboard', url: '/dashboard',           icon: LayoutDashboard },
        { title: 'nav.threat',   url: '/inteligencia/threat', icon: ShieldAlert },
        { title: 'nav.apis',     url: '/inteligencia/apis',   icon: Key },
      ],
    },
    {
      title: 'nav.soc',
      roles: ['admin', 'analyst'],
      items: [
        { title: 'nav.wazuh',        url: '/soc/wazuh',        icon: Activity },
        { title: 'nav.velociraptor', url: '/soc/velociraptor', icon: Network },
        { title: 'nav.openvas',      url: '/soc/openvas',      icon: ScanLine },
      ],
    },
    {
      title: 'nav.tools',
      roles: ['admin', 'analyst'],
      items: [
        { title: 'nav.ioc',   url: '/herramientas/ioc',      icon: Search },
        { title: 'nav.files', url: '/herramientas/archivos', icon: FileSearch },
        { title: 'nav.email', url: '/herramientas/email',    icon: Mail },
      ],
    },
    {
      title: 'nav.incidents',
      roles: ['admin', 'analyst'],
      items: [
        { title: 'nav.casos',    url: '/incidentes/casos',    icon: AlertTriangle },
        { title: 'nav.timeline', url: '/incidentes/timeline', icon: Clock },
      ],
    },
    {
      title: 'nav.ai',
      roles: ['admin', 'analyst'],
      items: [
        { title: 'nav.asistente', url: '/ia', icon: Bot },
      ],
    },
  ],
}

export const APP_ICON = ShieldAlert
