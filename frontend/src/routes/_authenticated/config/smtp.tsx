import { createFileRoute } from '@tanstack/react-router'
import { SmtpView } from '@/features/config/smtp'

export const Route = createFileRoute('/_authenticated/config/smtp')({
  component: SmtpView,
})
