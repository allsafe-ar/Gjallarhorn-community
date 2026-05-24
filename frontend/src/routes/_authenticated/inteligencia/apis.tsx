import { createFileRoute } from '@tanstack/react-router'
import { ApisView } from '@/features/inteligencia/apis'

export const Route = createFileRoute('/_authenticated/inteligencia/apis')({
  component: ApisView,
})
