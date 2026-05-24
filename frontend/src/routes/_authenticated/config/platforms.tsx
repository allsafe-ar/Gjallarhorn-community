import { createFileRoute } from '@tanstack/react-router'
import { PlatformsView } from '@/features/config/platforms'

export const Route = createFileRoute('/_authenticated/config/platforms')({
  component: PlatformsView,
})
