import { createFileRoute } from '@tanstack/react-router'
import { OpenVASView } from '@/features/integraciones/openvas'

export const Route = createFileRoute('/_authenticated/soc/openvas')({
  component: OpenVASView,
})
