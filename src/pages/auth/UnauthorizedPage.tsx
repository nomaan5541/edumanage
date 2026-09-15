import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'

export function UnauthorizedPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">You do not have permission to view this page.</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        If you believe this is a mistake, contact your school administrator.
      </p>
      <Button asChild>
        <Link to="/">Go home</Link>
      </Button>
    </div>
  )
}
