import { createFileRoute } from '@tanstack/react-router'
import { ThreatIntelView } from '@/features/inteligencia/threat'

export const Route = createFileRoute('/_authenticated/inteligencia/threat')({
  component: ThreatIntelView,
})
