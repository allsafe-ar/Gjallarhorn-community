import { createFileRoute } from '@tanstack/react-router'
import { PhishingView } from '@/features/herramientas/phishing'

export const Route = createFileRoute('/_authenticated/herramientas/phishing')({
  component: PhishingView,
})
