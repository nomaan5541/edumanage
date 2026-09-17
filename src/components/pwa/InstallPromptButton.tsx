import { Download } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * Renders nothing until the browser signals the app is installable, then shows a
 * small "Install app" button. Safe to mount anywhere (e.g. the app shell) - it's a
 * no-op on browsers/platforms that never fire beforeinstallprompt (e.g. iOS Safari,
 * or when already installed).
 */
export function InstallPromptButton() {
  const [installEvent, setInstallEvent] = React.useState<BeforeInstallPromptEvent | null>(null)

  React.useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (!installEvent) return null

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await installEvent.prompt()
        const { outcome } = await installEvent.userChoice
        if (outcome === 'accepted') setInstallEvent(null)
      }}
    >
      <Download />
      Install app
    </Button>
  )
}
