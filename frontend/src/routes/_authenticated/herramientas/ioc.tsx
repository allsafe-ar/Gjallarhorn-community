import { createFileRoute } from '@tanstack/react-router'
import { IocView } from '@/features/herramientas/ioc'

export const Route = createFileRoute('/_authenticated/herramientas/ioc')({
  component: IocView,
})
