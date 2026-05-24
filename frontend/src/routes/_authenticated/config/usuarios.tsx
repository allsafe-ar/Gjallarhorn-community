import { createFileRoute } from '@tanstack/react-router'
import { UsuariosView } from '@/features/config/usuarios'

export const Route = createFileRoute('/_authenticated/config/usuarios')({
  component: UsuariosView,
})
