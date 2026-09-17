import { useQuery } from '@tanstack/react-query'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

export function TeacherDashboardPage() {
  const { user } = useAuth()
  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['my-teacher-assignments', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: teacher, error: teacherError } = await supabase
        .from('teachers')
        .select('id')
        .eq('user_id', user!.id)
        .maybeSingle()
      if (teacherError) throw teacherError
      if (!teacher) return []
      const { data, error } = await supabase
        .from('teacher_assignments')
        .select('id, class_id, section_id, subject_id, academic_year_id')
        .eq('teacher_id', teacher.id)
      if (error) throw error
      return data
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assigned classes</CardTitle>
        <CardDescription>Only classes you are assigned to appear here.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading assignments…</p> : null}
        {!isLoading && assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No class assignments yet.</p>
        ) : null}
        {assignments.length > 0 ? (
          <p className="text-sm">{assignments.length} assignment{assignments.length === 1 ? '' : 's'}.</p>
        ) : null}
      </CardContent>
    </Card>
  )
}
