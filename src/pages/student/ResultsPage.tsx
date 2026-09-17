import { useQuery } from '@tanstack/react-query'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type ResultRow = Database['public']['Functions']['get_student_exam_results']['Returns'][number]

function useOwnStudentRecord() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['own-student-record', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('students')
        .select('id, school_id')
        .eq('user_id', user?.id ?? '')
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!user?.id,
  })
}

function useActiveEnrollmentYear(studentId: string | undefined) {
  return useQuery({
    queryKey: ['own-active-enrollment-year', studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_enrollments')
        .select('academic_year_id')
        .eq('student_id', studentId ?? '')
        .eq('status', 'active')
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!studentId,
  })
}

export function StudentResultsPage() {
  const { data: student } = useOwnStudentRecord()
  const { data: enrollment } = useActiveEnrollmentYear(student?.id)

  const { data: results, isLoading } = useQuery({
    queryKey: ['own-exam-results', student?.id, enrollment?.academic_year_id],
    queryFn: async (): Promise<ResultRow[]> => {
      const { data, error } = await supabase.rpc('get_student_exam_results', {
        p_school_id: student!.school_id,
        p_student_id: student!.id,
        p_academic_year_id: enrollment!.academic_year_id,
      })
      if (error) throw error
      return data
    },
    enabled: !!student?.id && !!enrollment?.academic_year_id,
  })

  if (!student) {
    return <p className="text-sm text-muted-foreground">No student record linked to this account yet.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Results</h2>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {!isLoading && results?.length === 0 ? (
        <p className="text-sm text-muted-foreground">No published results yet.</p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {results?.map((r) => (
          <Card key={r.exam_id}>
            <CardContent className="flex flex-col gap-1 pt-5">
              <div className="flex items-center justify-between">
                <p className="font-medium">
                  {r.subject_name} — {r.exam_type}
                </p>
                <Badge variant={r.marks_obtained / r.max_marks >= 0.4 ? 'success' : 'destructive'}>
                  {r.marks_obtained} / {r.max_marks}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {r.exam_name} · {r.exam_date}
              </p>
              {r.remarks ? <p className="text-xs text-muted-foreground">Remarks: {r.remarks}</p> : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
