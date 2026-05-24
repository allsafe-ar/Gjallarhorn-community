import { createFileRoute } from '@tanstack/react-router'
import { PlaybooksView } from '@/features/incidentes/playbooks'

export const Route = createFileRoute('/_authenticated/incidentes/playbooks')({
  component: PlaybooksView,
})
