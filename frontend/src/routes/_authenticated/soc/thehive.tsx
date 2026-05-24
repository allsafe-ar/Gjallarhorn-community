import { createFileRoute } from '@tanstack/react-router'
import { TheHiveView } from '@/features/integraciones/thehive'

export const Route = createFileRoute('/_authenticated/soc/thehive')({
  component: TheHiveView,
})
