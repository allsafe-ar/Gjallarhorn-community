import { createFileRoute } from '@tanstack/react-router'
import { ActivosView } from '@/features/activos'

// Inventario de activos (el mismo módulo que Gjallarhorn Pro y Skuld), con el monitoreo de cada
// equipo como pestaña de su ficha. La vista de monitoreo sigue en /monitoreo.
export const Route = createFileRoute('/_authenticated/activos/')({
  component: ActivosView,
})
