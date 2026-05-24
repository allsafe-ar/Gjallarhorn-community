import { createFileRoute } from '@tanstack/react-router'
import { AuditoriaView } from '@/features/config/auditoria'

export const Route = createFileRoute('/_authenticated/config/auditoria')({
  component: AuditoriaView,
})
