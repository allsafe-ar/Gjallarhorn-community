/**
 * HelpTip - ícono de ayuda con panel flotante.
 *
 * Mismo patrón que el HelpTip de Skuld y Heimdall y el HelpPopover de Gungnir,
 * para que la ayuda se vea y se use igual en todos los sistemas de AllSafe.
 *
 * Los textos explican QUÉ es y QUÉ hacer, pensando en quien no trabaja el sistema
 * todos los días: el analista que entra a una sección puntual, o quien mira el
 * panel una vez por semana.
 */
import { HelpCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export function HelpTip({ title, description, tips, side = 'right' }: {
  title: string
  description: string
  tips?: string[]
  side?: 'top' | 'right' | 'bottom' | 'left'
}) {
  const { t } = useTranslation()
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type='button'
          className='text-muted-foreground/60 hover:text-primary transition-colors shrink-0 align-middle inline-flex'
          aria-label={`${t('help.aria')}: ${title}`}
          onClick={(e) => e.stopPropagation()}
        >
          <HelpCircle className='h-4 w-4' />
        </button>
      </PopoverTrigger>
      <PopoverContent side={side} align='start' sideOffset={8}
        className='w-80 p-0 overflow-hidden shadow-xl'>
        <div className='flex items-center gap-2 px-4 py-3 border-b bg-muted/50'>
          <HelpCircle className='h-3.5 w-3.5 text-muted-foreground shrink-0' />
          <p className='text-xs font-semibold flex-1'>{title}</p>
        </div>
        <div className='px-4 py-3 space-y-3'>
          <p className='text-xs text-muted-foreground leading-relaxed'>{description}</p>
          {tips && tips.length > 0 && (
            <div className='space-y-1.5'>
              <p className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70'>
                {t('help.howTo')}
              </p>
              <ul className='space-y-1'>
                {tips.map((tip, i) => (
                  <li key={i} className='flex items-start gap-2'>
                    <span className='mt-1.5 h-1 w-1 rounded-full bg-muted-foreground/50 shrink-0' />
                    <span className='text-[11px] text-muted-foreground/90 leading-snug'>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default HelpTip
