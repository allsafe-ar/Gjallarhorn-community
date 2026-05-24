import { createFileRoute } from '@tanstack/react-router'
import { VelociraptorView } from '@/features/integraciones/velociraptor'

export const Route = createFileRoute('/_authenticated/soc/velociraptor')({
  component: VelociraptorView,
})
