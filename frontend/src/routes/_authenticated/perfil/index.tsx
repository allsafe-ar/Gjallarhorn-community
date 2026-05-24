import { createFileRoute } from '@tanstack/react-router'
import { PerfilView } from '@/features/perfil'

export const Route = createFileRoute('/_authenticated/perfil/')({
  component: PerfilView,
})
