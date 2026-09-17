import { useQuery } from '@tanstack/react-query'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { MarksDialog } from '@/pages/teacher/ExamsPage'
import type { Database } from '@/types/database'

type ExamRow = Database['public']['Tables']['exams']['Row']

export function SchoolAdminExamsPage() {
  const { primaryRole } = useAuth()
  const schoolId = primaryRole?.schoolId ?? null
  const [markingExam, setMarkingExam] = React.useState<ExamRow | null>(null)

  const { data: exams, isLoading } = useQuery({
    queryKey: ['exams', schoolId],
    queryFn: async (): Promise<ExamRow[]> => {
      const { data, error } = await supabase
        .from('exams')
        .select('*')
        .eq('school_id', schoolId ?? '')
        .order('exam_date', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!schoolId,
  })

  if (!schoolId) return null

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Exams are created by teachers for their assigned classes. This view lets you oversee marks entry and
        publication across the whole school.
      </p>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {!isLoading && exams?.length === 0 ? (
        <Card>
          <CardContent className="pt-5 text-sm text-muted-foreground">No exams created yet.</CardContent>
        </Card>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {exams?.map((e) => (
          <Card key={e.id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">{e.name}</CardTitle>
                <Badge variant={e.is_published ? 'success' : 'outline'}>
                  {e.is_published ? 'Published' : 'Draft'}
                </Badge>
              </div>
              <CardDescription>
                {e.exam_type} · {e.exam_date} · Max {e.max_marks}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" onClick={() => setMarkingExam(e)}>
                {e.is_published ? 'View marks' : 'Enter marks'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {markingExam ? (
        <MarksDialog schoolId={schoolId} exam={markingExam} onClose={() => setMarkingExam(null)} />
      ) : null}
    </div>
  )
}
