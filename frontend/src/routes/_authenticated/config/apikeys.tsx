import { createFileRoute } from '@tanstack/react-router'
import { ApiKeysView } from '@/features/config/api-keys'

export const Route = createFileRoute('/_authenticated/config/apikeys')({
  component: ApiKeysView,
})
