import { createFileRoute } from '@tanstack/react-router'
import { TimelineView } from '@/features/incidentes/timeline'

export const Route = createFileRoute('/_authenticated/incidentes/timeline')({
  component: TimelineView,
})
