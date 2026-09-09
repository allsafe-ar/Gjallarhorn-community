import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'

/**
 * Insignia de estado, con el mismo criterio de color en toda la sección.
 *
 * "Sin medir" es gris y no verde a propósito: un activo sin chequeos no está sano, está
 * sin observar, y pintarlo de verde da una tranquilidad que no corresponde.
 */
export function EstadoBadge({ estado }: { estado: string }) {
  const { t } = useTranslation()
  const etiqueta = t(`monitoreo.estado.${estado}`)
  if (estado === 'ok') return <Badge variant='default' className='text-xs bg-green-600'>{etiqueta}</Badge>
  if (estado === 'caido') return <Badge variant='destructive' className='text-xs'>{etiqueta}</Badge>
  if (estado === 'degradado')
    return <Badge variant='outline' className='text-xs border-amber-500/60 text-amber-700 dark:text-amber-400'>{etiqueta}</Badge>
  return <Badge variant='secondary' className='text-xs'>{etiqueta}</Badge>
}
