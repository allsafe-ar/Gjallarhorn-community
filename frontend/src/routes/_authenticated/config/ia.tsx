import { createFileRoute } from '@tanstack/react-router'
import { IaView } from '@/features/config/ia'

export const Route = createFileRoute('/_authenticated/config/ia')({
  component: IaView,
})
