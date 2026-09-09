import { createFileRoute } from '@tanstack/react-router'
import { TableroMonitoreo } from '@/features/monitoreo/tablero'

export const Route = createFileRoute('/_authenticated/monitoreo/tablero')({
  component: TableroMonitoreo,
})
