import { createFileRoute } from '@tanstack/react-router'
import { SandboxView } from '@/features/herramientas/sandbox'

export const Route = createFileRoute('/_authenticated/herramientas/sandbox')({
  component: SandboxView,
})
