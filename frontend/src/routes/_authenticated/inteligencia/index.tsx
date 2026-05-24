import { createFileRoute } from '@tanstack/react-router'
import { InteligenciaView } from '@/features/inteligencia'

export const Route = createFileRoute('/_authenticated/inteligencia/')({
  component: InteligenciaView,
})
