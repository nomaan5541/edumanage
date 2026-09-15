import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

async function fetchAcademicSummary(schoolId: string) {
  const [{ count: years }, { count: classes }, { count: sections }, { count: subjects }] = await Promise.all([
    supabase.from('academic_years').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    supabase.from('classes').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    supabase.from('sections').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    supabase.from('subjects').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
  ])
  return { years: years ?? 0, classes: classes ?? 0, sections: sections ?? 0, subjects: subjects ?? 0 }
}

export function SchoolAdminDashboardPage() {
  const { primaryRole } = useAuth()
  const schoolId = primaryRole?.schoolId ?? null

  const { data, isLoading } = useQuery({
    queryKey: ['academic-summary', schoolId],
    queryFn: () => fetchAcademicSummary(schoolId as string),
    enabled: !!schoolId,
  })

  const setupIncomplete = !isLoading && data?.years === 0

  return (
    <div className="flex flex-col gap-4">
      {setupIncomplete ? (
        <Card>
          <CardHeader>
            <CardTitle>Finish setting up your school</CardTitle>
            <CardDescription>Create your first academic year, classes, sections, and subjects.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/admin/setup">Open Setup Wizard</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Academic years" value={isLoading ? '—' : (data?.years ?? 0)} />
        <StatCard label="Classes" value={isLoading ? '—' : (data?.classes ?? 0)} />
        <StatCard label="Sections" value={isLoading ? '—' : (data?.sections ?? 0)} />
        <StatCard label="Subjects" value={isLoading ? '—' : (data?.subjects ?? 0)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Students, teachers, attendance, and fees</CardTitle>
          <CardDescription>These modules land as Phase 1 rollout continues — see docs/status.md.</CardDescription>
        </CardHeader>
      </Card>
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
