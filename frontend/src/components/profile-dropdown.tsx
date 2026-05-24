import { Link } from '@tanstack/react-router'
import useDialogState from '@/hooks/use-dialog-state'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SignOutDialog } from '@/components/sign-out-dialog'
import { useAuthStore } from '@/stores/auth-store'

export function ProfileDropdown() {
  const [open, setOpen] = useDialogState()
  const { auth } = useAuthStore()
  const user = auth.user
  const displayName = user?.nombre || user?.username || '—'
  const initials = displayName.slice(0, 2).toUpperCase()
  const role = user?.role?.toUpperCase() ?? ''

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button className='flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-accent transition-colors outline-none'>
            <Avatar className='h-8 w-8 rounded-lg'>
              <AvatarFallback className='rounded-lg bg-primary text-primary-foreground text-xs font-bold'>
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className='hidden sm:grid text-start leading-tight'>
              <span className='text-sm font-semibold truncate max-w-32'>{displayName}</span>
              <span className='text-xs text-muted-foreground'>{role}</span>
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className='w-44' align='end' forceMount>
          <DropdownMenuItem asChild>
            <Link to='/perfil'>Mi cuenta</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant='destructive' onClick={() => setOpen(true)}>
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SignOutDialog open={!!open} onOpenChange={setOpen} />
    </>
  )
}
