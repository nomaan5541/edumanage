import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type NotificationRow = Database['public']['Functions']['get_my_notifications']['Returns'][number]

const POLL_INTERVAL_MS = 30_000

export function NotificationBell() {
  const { primaryRole } = useAuth()
  const schoolId = primaryRole?.schoolId ?? null
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)

  const { data: notifications } = useQuery({
    queryKey: ['my-notifications', schoolId],
    queryFn: async (): Promise<NotificationRow[]> => {
      const { data, error } = await supabase.rpc('get_my_notifications', { p_school_id: schoolId! })
      if (error) throw error
      return data
    },
    enabled: !!schoolId,
    refetchInterval: POLL_INTERVAL_MS,
  })

  const markRead = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase.rpc('mark_notification_read', { p_notification_id: notificationId })
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['my-notifications', schoolId] }),
  })

  const unreadCount = notifications?.filter((n) => !n.is_read).length ?? 0

  if (!schoolId) return null

  return (
    <>
      <Button variant="ghost" size="icon" className="relative" onClick={() => setOpen(true)} aria-label="Notifications">
        <Bell />
        {unreadCount > 0 ? (
          <Badge variant="destructive" className="absolute -right-1 -top-1 h-5 min-w-5 justify-center px-1 text-[10px]">
            {unreadCount > 9 ? '9+' : unreadCount}
          </Badge>
        ) : null}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Notifications</DialogTitle>
            <DialogDescription>In-app notifications only - email/SMS delivery is not yet enabled.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {notifications?.length === 0 ? (
              <p className="text-sm text-muted-foreground">No notifications yet.</p>
            ) : null}
            {notifications?.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => !n.is_read && markRead.mutate(n.id)}
                className={`flex flex-col gap-1 rounded-md border p-3 text-left text-sm ${
                  n.is_read ? 'opacity-60' : 'border-primary/40 bg-primary/5'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{n.title}</span>
                  <span className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-muted-foreground">{n.body}</p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
