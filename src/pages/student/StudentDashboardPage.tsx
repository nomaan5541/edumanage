import { useQuery } from '@tanstack/react-query'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

export function StudentDashboardPage() {
  const { user } = useAuth()
  const { data: student, isLoading } = useQuery({
    queryKey: ['my-student', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('students')
        .select('full_name, admission_no, status')
        .eq('user_id', user!.id)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{student?.full_name ?? 'Welcome'}</CardTitle>
        <CardDescription>
          {student
            ? `Admission ${student.admission_no} · ${student.status}`
            : 'Your own student record will appear here when your school links this account.'}
        </CardDescription>
      </CardHeader>
      {isLoading ? (
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </CardContent>
      ) : null}
    </Card>
  )
}
