import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Clock, LogIn } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function SessionExpiredDialog() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const shown = useRef(false)
  const navigate = useNavigate()
  const { auth } = useAuthStore()

  useEffect(() => {
    function handleExpired() {
      if (!shown.current) {
        shown.current = true
        setOpen(true)
      }
    }
    window.addEventListener('session-expired', handleExpired)
    return () => window.removeEventListener('session-expired', handleExpired)
  }, [])

  function handleAccept() {
    auth.reset()
    shown.current = false
    setOpen(false)
    navigate({ to: '/sign-in', replace: true })
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className='max-w-sm'
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <Clock className='size-5 text-destructive' />
            {t('auth.sessionExpired.title')}
          </DialogTitle>
        </DialogHeader>
        <p className='text-sm text-muted-foreground'>
          {t('auth.sessionExpired.desc')}
        </p>
        <Button onClick={handleAccept} className='w-full mt-1'>
          <LogIn className='size-4 mr-2' />
          {t('auth.sessionExpired.signIn')}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
