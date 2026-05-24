import { createFileRoute } from '@tanstack/react-router'
import { CasosView } from '@/features/incidentes/casos'

export const Route = createFileRoute('/_authenticated/incidentes/casos')({
  component: CasosView,
})
