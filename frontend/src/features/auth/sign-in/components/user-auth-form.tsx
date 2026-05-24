import { useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, LogIn, Mail, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/auth-store'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/password-input'
import type { SgsiUser } from '@/stores/auth-store'
import i18n from '@/i18n'

function makeLoginSchema() {
  return z.object({
    username: z.string().min(1, i18n.t('auth.signin.usernameRequired')),
    password: z.string().min(1, i18n.t('auth.signin.passwordRequired')),
  })
}

interface UserAuthFormProps extends React.HTMLAttributes<HTMLDivElement> {
  redirectTo?: string
}

type Step = 'login' | '2fa' | 'forgot'

export function UserAuthForm({ className, redirectTo }: UserAuthFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep] = useState<Step>('login')
  const [pending2fa, setPending2fa] = useState<{ userId: number | string } | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [totpError, setTotpError] = useState('')
  const [forgotUser, setForgotUser] = useState('')
  const [forgotSent, setForgotSent] = useState(false)
  const navigate = useNavigate()
  const { auth } = useAuthStore()
  const { t } = useTranslation()

  const loginForm = useForm<z.infer<ReturnType<typeof makeLoginSchema>>>({
    resolver: zodResolver(makeLoginSchema()),
    defaultValues: { username: '', password: '' },
  })

  function handleLoginSuccess(token: string, user: SgsiUser) {
    auth.setAccessToken(token)
    auth.setUser(user)
    toast.success(t('auth.signin.welcome', { name: user.nombre || user.username }))
    navigate({ to: redirectTo || '/', replace: true })
  }

  async function onLoginSubmit(data: z.infer<ReturnType<typeof makeLoginSchema>>) {
    setIsLoading(true)
    try {
      const res = await apiFetch<{
        token?: string
        user?: SgsiUser
        needs2fa?: boolean
        userId?: number | string
      }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: data.username, password: data.password }),
      })
      if (res.needs2fa && res.userId != null) {
        setPending2fa({ userId: res.userId })
        setTotpCode('')
        setTotpError('')
        setStep('2fa')
        return
      }
      if (res.token && res.user) {
        handleLoginSuccess(res.token, res.user)
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('auth.signin.loginError'))
    } finally {
      setIsLoading(false)
    }
  }

  async function onTotpSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!pending2fa || totpCode.length !== 6) return
    setIsLoading(true)
    setTotpError('')
    try {
      const res = await apiFetch<{ token?: string; user?: SgsiUser }>('/auth/verify-totp', {
        method: 'POST',
        body: JSON.stringify({ userId: pending2fa.userId, token: totpCode }),
      })
      if (res.token && res.user) {
        handleLoginSuccess(res.token, res.user)
      }
    } catch (e: unknown) {
      setTotpError(e instanceof Error ? e.message : t('auth.signin.invalidCode'))
      setTotpCode('')
    } finally {
      setIsLoading(false)
    }
  }

  function handleForgot() {
    if (!forgotUser.trim()) return
    const subject = encodeURIComponent('AllSafe SGSI - Recuperación de contraseña')
    const body = encodeURIComponent(
      `Estimado Administrador,\n\nEl usuario "${forgotUser.trim()}" solicita la recuperación de su contraseña en el sistema AllSafe SGSI.\n\nPor favor, restablezca la contraseña del usuario indicado.\n\nGracias.`
    )
    window.location.href = `mailto:alaniz.emiliano@allsafe.com.ar?subject=${subject}&body=${body}`
    setForgotSent(true)
  }

  if (step === 'forgot') {
    return (
      <div className={cn('grid gap-4', className)}>
        <div className='flex flex-col items-center gap-2 text-center mb-1'>
          <Mail className='size-10 text-primary' />
          <p className='text-sm font-semibold'>{t('auth.recovery.title')}</p>
        </div>
        {forgotSent ? (
          <div className='rounded-md bg-muted p-3 text-sm text-center text-muted-foreground'>
            Se abrió tu cliente de correo con la solicitud para el usuario{' '}
            <strong className='text-foreground'>{forgotUser}</strong>. Enviá el mail para que el
            administrador restablezca tu contraseña.
          </div>
        ) : (
          <>
            <div className='space-y-1.5'>
              <label className='text-sm font-medium'>{t('auth.signin.usernameLabel')}</label>
              <Input
                placeholder={t('auth.signin.usernameHelper')}
                value={forgotUser}
                onChange={(e) => setForgotUser(e.target.value)}
                autoFocus
              />
            </div>
            <Button onClick={handleForgot} disabled={!forgotUser.trim()}>
              <Mail />
              {t('auth.recovery.submit')}
            </Button>
          </>
        )}
        <button
          type='button'
          className='text-xs text-muted-foreground hover:underline text-center'
          onClick={() => {
            setStep('login')
            setForgotUser('')
            setForgotSent(false)
          }}
        >
          {t('auth.recovery.back')}
        </button>
      </div>
    )
  }

  if (step === '2fa') {
    return (
      <form onSubmit={onTotpSubmit} className={cn('grid gap-4', className)}>
        <div className='flex flex-col items-center gap-2 text-center mb-2'>
          <ShieldCheck className='size-10 text-primary' />
          <p className='text-sm text-muted-foreground'>
            {t('auth.2fa.desc')}
          </p>
        </div>
        <div className='space-y-1.5'>
          <label className='text-sm font-medium'>{t('auth.2fa.codeLabel')}</label>
          <Input
            placeholder='000000'
            maxLength={6}
            inputMode='numeric'
            autoComplete='one-time-code'
            autoFocus
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
            className='text-center text-2xl tracking-widest font-mono'
          />
          {totpError && <p className='text-sm text-destructive'>{totpError}</p>}
        </div>
        <Button type='submit' className='mt-1' disabled={isLoading || totpCode.length !== 6}>
          {isLoading ? <Loader2 className='animate-spin' /> : <ShieldCheck />}
          {t('auth.2fa.verify')}
        </Button>
        <button
          type='button'
          className='text-xs text-muted-foreground hover:underline text-center'
          onClick={() => setStep('login')}
        >
          {t('auth.recovery.back')}
        </button>
      </form>
    )
  }

  return (
    <Form {...loginForm}>
      <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className={cn('grid gap-3', className)}>
        <FormField
          control={loginForm.control}
          name='username'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.signin.username')}</FormLabel>
              <FormControl>
                <Input placeholder='usuario' autoComplete='username' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={loginForm.control}
          name='password'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.signin.password')}</FormLabel>
              <FormControl>
                <PasswordInput placeholder='••••••••' autoComplete='current-password' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button className='mt-1' disabled={isLoading}>
          {isLoading ? <Loader2 className='animate-spin' /> : <LogIn />}
          {t('auth.signin.login')}
        </Button>
        <button
          type='button'
          className='text-xs text-muted-foreground hover:underline text-center'
          onClick={() => setStep('forgot')}
        >
          {t('auth.signin.forgotPassword')}
        </button>
      </form>
    </Form>
  )
}
