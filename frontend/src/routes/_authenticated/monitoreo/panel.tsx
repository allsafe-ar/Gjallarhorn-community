import { createFileRoute } from '@tanstack/react-router'
import { PanelMonitoreo } from '@/features/monitoreo/panel'

export const Route = createFileRoute('/_authenticated/monitoreo/panel')({
  component: PanelMonitoreo,
})
