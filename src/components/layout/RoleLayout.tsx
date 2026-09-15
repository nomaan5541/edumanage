import { Outlet } from 'react-router-dom'

import { AppShell, type NavItem } from '@/components/layout/AppShell'

export function RoleLayout({ title, navItems }: { title: string; navItems: NavItem[] }) {
  return (
    <AppShell title={title} navItems={navItems}>
      <Outlet />
    </AppShell>
  )
}
