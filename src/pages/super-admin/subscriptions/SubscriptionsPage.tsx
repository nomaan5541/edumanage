import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import type { SubscriptionStatus } from '@/types/database'

interface SchoolRow {
  id: string
  name: string
  school_code: string
}

interface SubscriptionRow {
  id: string
  school_id: string
  plan_name: string
  status: SubscriptionStatus
  start_date: string | null
  expiry_date: string | null
}

function mutationErrorMessage(err: unknown, fallback: string) {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string' && err.message) {
    return err.message
  }
  return fallback
}

function statusVariant(status: SubscriptionStatus) {
  if (status === 'active' || status === 'trial') return 'success' as const
  if (status === 'past_due') return 'warning' as const
  return 'destructive' as const
}

export function SubscriptionsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['school-subscriptions'],
    queryFn: async () => {
      const { data: schools, error: schoolError } = await supabase
        .from('schools')
        .select('id, name, school_code')
        .order('name')
      if (schoolError) throw schoolError

      const { data: subscriptions, error: subError } = await supabase
        .from('subscriptions')
        .select('id, school_id, plan_name, status, start_date, expiry_date')
      if (subError) throw subError

      const bySchool = new Map((subscriptions ?? []).map((row) => [row.school_id, row]))
      return (schools ?? []).map((school) => ({
        school,
        subscription: bySchool.get(school.id) ?? null,
      }))
    },
  })

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>School subscriptions</CardTitle>
          <CardDescription>
            Manual activation only. Record the plan name, start date, and expiry date after off-platform
            payment. School admins cannot change these rows.
          </CardDescription>
        </CardHeader>
      </Card>

      {error ? (
        <p className="text-sm text-destructive">Failed to load subscriptions: {(error as Error).message}</p>
      ) : null}
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {!isLoading && data?.length === 0 ? (
        <Card>
          <CardContent className="pt-5 text-sm text-muted-foreground">
            No schools yet. Create a school first.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map(({ school, subscription }) => (
          <SubscriptionCard key={school.id} school={school} subscription={subscription} />
        ))}
      </div>
    </div>
  )
}

function SubscriptionCard({
  school,
  subscription,
}: {
  school: SchoolRow
  subscription: SubscriptionRow | null
}) {
  const queryClient = useQueryClient()
  const [activateOpen, setActivateOpen] = React.useState(false)
  const [extendOpen, setExtendOpen] = React.useState(false)
  const [planName, setPlanName] = React.useState(subscription?.plan_name ?? 'default')
  const [startDate, setStartDate] = React.useState(subscription?.start_date ?? '')
  const [expiryDate, setExpiryDate] = React.useState(subscription?.expiry_date ?? '')
  const [extendExpiry, setExtendExpiry] = React.useState('')

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['school-subscriptions'] })

  const activate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('activate_school_subscription', {
        p_school_id: school.id,
        p_plan_name: planName,
        p_start_date: startDate,
        p_expiry_date: expiryDate,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Subscription activated.')
      setActivateOpen(false)
      invalidate()
    },
    onError: (err: unknown) => toast.error(mutationErrorMessage(err, 'Failed to activate subscription.')),
  })

  const extend = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('extend_school_subscription', {
        p_school_id: school.id,
        p_expiry_date: extendExpiry,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Subscription extended.')
      setExtendOpen(false)
      setExtendExpiry('')
      invalidate()
    },
    onError: (err: unknown) => toast.error(mutationErrorMessage(err, 'Failed to extend subscription.')),
  })

  const cancel = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('cancel_school_subscription', { p_school_id: school.id })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Subscription cancelled.')
      invalidate()
    },
    onError: (err: unknown) => toast.error(mutationErrorMessage(err, 'Failed to cancel subscription.')),
  })

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{school.name}</CardTitle>
          {subscription ? (
            <Badge variant={statusVariant(subscription.status)}>{subscription.status}</Badge>
          ) : (
            <Badge variant="secondary">none</Badge>
          )}
        </div>
        <CardDescription>{school.school_code}</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {subscription ? (
          <div className="flex flex-col gap-1">
            <span>Plan: {subscription.plan_name}</span>
            <span>
              {subscription.start_date ?? '—'} → {subscription.expiry_date ?? '—'}
            </span>
          </div>
        ) : (
          <span>No subscription row yet.</span>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => {
            setPlanName(subscription?.plan_name ?? 'default')
            setStartDate(subscription?.start_date ?? '')
            setExpiryDate(subscription?.expiry_date ?? '')
            setActivateOpen(true)
          }}
        >
          Activate
        </Button>
        <Button size="sm" variant="outline" disabled={!subscription} onClick={() => setExtendOpen(true)}>
          Extend
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!subscription || subscription.status === 'cancelled' || cancel.isPending}
          onClick={() => cancel.mutate()}
        >
          Cancel
        </Button>
      </CardFooter>

      <Dialog open={activateOpen} onOpenChange={setActivateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Activate subscription</DialogTitle>
            <DialogDescription>
              Sets this school to active with the plan name and dates you enter. This does not collect
              payment.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`plan-${school.id}`}>Plan name</Label>
              <Input id={`plan-${school.id}`} value={planName} onChange={(e) => setPlanName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`start-${school.id}`}>Start date</Label>
              <Input
                id={`start-${school.id}`}
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`expiry-${school.id}`}>Expiry date</Label>
              <Input
                id={`expiry-${school.id}`}
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => activate.mutate()}
              disabled={activate.isPending || !planName.trim() || !startDate || !expiryDate}
            >
              {activate.isPending ? 'Saving…' : 'Activate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={extendOpen} onOpenChange={setExtendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend subscription</DialogTitle>
            <DialogDescription>
              New expiry must be after the current expiry. Status becomes active.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`extend-${school.id}`}>New expiry date</Label>
            <Input
              id={`extend-${school.id}`}
              type="date"
              value={extendExpiry}
              onChange={(e) => setExtendExpiry(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button onClick={() => extend.mutate()} disabled={extend.isPending || !extendExpiry}>
              {extend.isPending ? 'Saving…' : 'Extend'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
