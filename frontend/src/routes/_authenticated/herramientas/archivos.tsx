import { createFileRoute } from '@tanstack/react-router'
import { ArchivosView } from '@/features/herramientas/archivos'

export const Route = createFileRoute('/_authenticated/herramientas/archivos')({
  component: ArchivosView,
})
