import { createFileRoute } from '@tanstack/react-router'
import { NessusView } from '@/features/integraciones/nessus'

export const Route = createFileRoute('/_authenticated/soc/nessus')({
  component: NessusView,
})
