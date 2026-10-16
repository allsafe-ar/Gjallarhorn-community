import {
  ChartColumn,
  Gauge,
  Boxes,
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

// Frentes del menú: el 1 en el acento intenso, el 2 en el apagado; los grupos sin frente son
// generales. Ver grupos-menu.tsx.
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
        { title: 'nav.monitoreo_tablero', url: '/monitoreo/tablero', icon: ChartColumn },
      ],
    },
    {
      title: 'nav.soc',
      frente: 1,
      roles: ['admin', 'analyst'],
      items: [
        { title: 'nav.wazuh',        url: '/soc/wazuh',        icon: Activity },
        { title: 'nav.velociraptor', url: '/soc/velociraptor', icon: Network },
        { title: 'nav.openvas',      url: '/soc/openvas',      icon: ScanLine },
      ],
    },
    {
      title: 'nav.tools',
      frente: 2,
      roles: ['admin', 'analyst'],
      items: [
        { title: 'nav.monitoreo', url: '/monitoreo',             icon: Gauge },
        { title: 'nav.monitoreo_panel', url: '/monitoreo/panel', icon: Activity },
        { title: 'nav.ioc',   url: '/herramientas/ioc',      icon: Search },
        { title: 'nav.files', url: '/herramientas/archivos', icon: FileSearch },
        { title: 'nav.sandbox', url: '/herramientas/sandbox', icon: Boxes },
        { title: 'nav.email', url: '/herramientas/email',    icon: Mail },
      ],
    },
    {
      title: 'nav.incidents',
      frente: 2,
      roles: ['admin', 'analyst'],
      items: [
        { title: 'nav.casos',    url: '/incidentes/casos',    icon: AlertTriangle },
        { title: 'nav.timeline', url: '/incidentes/timeline', icon: Clock },
      ],
    },
    {
      title: 'nav.ai',
      frente: 2,
      roles: ['admin', 'analyst'],
      items: [
        { title: 'nav.asistente', url: '/ia', icon: Bot },
      ],
    },
  ],
}

export const APP_ICON = ShieldAlert
