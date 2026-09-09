import { createFileRoute } from '@tanstack/react-router'
import { MonitoreoView } from '@/features/monitoreo'

export const Route = createFileRoute('/_authenticated/monitoreo/')({
  component: MonitoreoView,
})
