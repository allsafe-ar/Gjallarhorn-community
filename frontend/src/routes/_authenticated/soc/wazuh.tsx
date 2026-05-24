import { createFileRoute } from '@tanstack/react-router'
import { WazuhView } from '@/features/integraciones/wazuh'

export const Route = createFileRoute('/_authenticated/soc/wazuh')({
  component: WazuhView,
})
