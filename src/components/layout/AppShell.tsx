import { LogOut } from 'lucide-react'
import * as React from 'react'
import { NavLink } from 'react-router-dom'

import { InstallPromptButton } from '@/components/pwa/InstallPromptButton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'

export interface NavItem {
  label: string
  to: string
}

export function AppShell({
  title,
  navItems,
  children,
}: {
  title: string
  navItems: NavItem[]
  children: React.ReactNode
}) {
  const { user, signOut } = useAuth()
  const initials = (user?.email ?? '?').slice(0, 2).toUpperCase()

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-[1400px]">
      <aside className="glass-surface sticky top-0 hidden h-svh w-64 shrink-0 flex-col gap-6 rounded-none border-r p-5 md:flex">
        <div className="text-lg font-semibold tracking-tight">EduManage</div>
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
                  isActive && 'bg-primary/10 text-primary',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <InstallPromptButton />
        <div className="flex items-center gap-3 border-t pt-4">
          <Avatar>
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user?.email}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => void signOut()} aria-label="Sign out">
            <LogOut />
          </Button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass-surface sticky top-0 z-10 flex items-center justify-between rounded-none border-b px-6 py-4 md:hidden">
          <span className="font-semibold">EduManage</span>
          <Button variant="ghost" size="icon" onClick={() => void signOut()} aria-label="Sign out">
            <LogOut />
          </Button>
        </header>
        <main className="flex-1 p-6">
          <h1 className="mb-6 text-2xl font-semibold tracking-tight">{title}</h1>
          {children}
        </main>
      </div>
    </div>
  )
}
