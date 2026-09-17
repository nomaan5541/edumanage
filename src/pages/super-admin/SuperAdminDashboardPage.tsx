import { useQuery } from '@tanstack/react-query'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'

async function fetchSchoolCounts() {
  const { data, error } = await supabase.from('schools').select('status')
  if (error) throw error
  const counts = { total: data.length, active: 0, suspended: 0, expired: 0 }
  for (const row of data) {
    counts[row.status as 'active' | 'suspended' | 'expired'] += 1
  }
  return counts
}

async function fetchPlatformMetrics() {
  const [{ count: students }, { count: teachers }, { data: payments }] = await Promise.all([
    supabase.from('students').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('teachers').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('fee_payments').select('amount'),
  ])
  const revenue = (payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0)
  return { students: students ?? 0, teachers: teachers ?? 0, revenue }
}

export function SuperAdminDashboardPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['school-counts'], queryFn: fetchSchoolCounts })
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['platform-metrics'],
    queryFn: fetchPlatformMetrics,
  })

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Total schools" value={isLoading ? '—' : (data?.total ?? 0)} />
      <StatCard label="Active" value={isLoading ? '—' : (data?.active ?? 0)} />
      <StatCard label="Suspended" value={isLoading ? '—' : (data?.suspended ?? 0)} />
      <StatCard label="Expired" value={isLoading ? '—' : (data?.expired ?? 0)} />
      <StatCard label="Total students" value={metricsLoading ? '—' : (metrics?.students ?? 0)} />
      <StatCard label="Total teachers" value={metricsLoading ? '—' : (metrics?.teachers ?? 0)} />
      <StatCard
        label="Total revenue collected"
        value={metricsLoading ? '—' : `₹${metrics?.revenue.toLocaleString() ?? 0}`}
      />
      {error ? (
        <Card className="sm:col-span-2 lg:col-span-4">
          <CardContent className="pt-5 text-sm text-destructive">
            Could not load school counts: {(error as Error).message}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  )
}
