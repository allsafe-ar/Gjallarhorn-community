import { Brain } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function IaView() {
  const { t } = useTranslation()
  return (
    <div className='p-6 max-w-lg'>
      <div className='flex items-center gap-3 mb-4'>
        <Brain className='h-6 w-6 text-muted-foreground' />
        <h1 className='text-xl font-bold'>{t('config.ia.title', { defaultValue: 'AI Module' })}</h1>
      </div>
      <div className='rounded-lg border bg-muted/30 p-6 text-center'>
        <Brain className='h-10 w-10 text-muted-foreground mx-auto mb-3' />
        <p className='text-sm font-semibold mb-1'>Not available in Community Edition</p>
        <p className='text-xs text-muted-foreground'>
          The AI analysis module (IOC enrichment, file analysis, email forensics) is available in Gjallarhorn Pro.
        </p>
      </div>
    </div>
  )
}
