import { createFileRoute } from '@tanstack/react-router'
import { EmailView } from '@/features/herramientas/email'

export const Route = createFileRoute('/_authenticated/herramientas/email')({
  component: EmailView,
})
