import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'

interface RequestRow {
  id: string
  school_id: string
  plan_name: string
  status: string
  requested_at: string
  notes: string | null
}
interface SchoolOption {
  id: string
  name: string
}

function useSchools() {
  return useQuery({
    queryKey: ['schools-options'],
    queryFn: async (): Promise<SchoolOption[]> => {
      const { data, error } = await supabase.from('schools').select('id, name')
      if (error) throw error
      return data
    },
  })
}

function useSubscriptionRequests() {
  return useQuery({
    queryKey: ['all-subscription-requests'],
    queryFn: async (): Promise<RequestRow[]> => {
      const { data, error } = await supabase
        .from('subscription_requests')
        .select('id, school_id, plan_name, status, requested_at, notes')
        .order('requested_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function SubscriptionRequestsPage() {
  const queryClient = useQueryClient()
  const { data: requests, isLoading } = useSubscriptionRequests()
  const { data: schools } = useSchools()
  const [expiryByRequest, setExpiryByRequest] = React.useState<Record<string, string>>({})

  const schoolById = React.useMemo(() => new Map((schools ?? []).map((s) => [s.id, s])), [schools])

  const approve = useMutation({
    mutationFn: async (requestId: string) => {
      const expiryDate = expiryByRequest[requestId]
      if (!expiryDate) throw new Error('Pick an expiry date before approving.')
      const { error } = await supabase.rpc('approve_subscription_renewal', {
        p_request_id: requestId,
        p_expiry_date: expiryDate,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Subscription activated.')
      void queryClient.invalidateQueries({ queryKey: ['all-subscription-requests'] })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to approve renewal.'),
  })

  const reject = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase.rpc('reject_subscription_renewal', { p_request_id: requestId })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Request rejected.')
      void queryClient.invalidateQueries({ queryKey: ['all-subscription-requests'] })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to reject renewal.'),
  })

  const pending = requests?.filter((r) => r.status === 'pending') ?? []
  const resolved = requests?.filter((r) => r.status !== 'pending') ?? []

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Pending renewal requests</h2>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {!isLoading && pending.length === 0 ? (
        <Card>
          <CardContent className="pt-5 text-sm text-muted-foreground">No pending requests.</CardContent>
        </Card>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {pending.map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle className="text-base">{schoolById.get(r.school_id)?.name ?? r.school_id}</CardTitle>
              <CardDescription>
                {r.plan_name} · requested {new Date(r.requested_at).toLocaleDateString()}
                {r.notes ? ` · ${r.notes}` : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <Label>Expiry date</Label>
                <Input
                  type="date"
                  value={expiryByRequest[r.id] ?? ''}
                  onChange={(e) => setExpiryByRequest((prev) => ({ ...prev, [r.id]: e.target.value }))}
                />
              </div>
              <Button size="sm" onClick={() => approve.mutate(r.id)} disabled={approve.isPending}>
                Approve
              </Button>
              <Button variant="outline" size="sm" onClick={() => reject.mutate(r.id)} disabled={reject.isPending}>
                Reject
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="mt-4 text-lg font-semibold">History</h2>
      <div className="flex flex-col gap-2">
        {resolved.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
            <span>
              {schoolById.get(r.school_id)?.name ?? r.school_id} · {r.plan_name}
            </span>
            <Badge variant={r.status === 'approved' ? 'success' : 'destructive'}>{r.status}</Badge>
          </div>
        ))}
      </div>
    </div>
  )
}
