import { createFileRoute } from '@tanstack/react-router'
import { AsistenteView } from '@/features/ia/asistente'

export const Route = createFileRoute('/_authenticated/ia/')({
  component: AsistenteView,
})
