import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import type { AttendanceStatus, Database } from '@/types/database'

type RosterRow = Database['public']['Functions']['get_class_attendance']['Returns'][number]

interface Assignment {
  academic_year_id: string
  class_id: string
  class_name: string
  section_id: string | null
  section_name: string | null
}

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'late', label: 'Late' },
  { value: 'excused', label: 'Excused' },
]

function useOwnAssignments(schoolId: string | null) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['own-teacher-assignments', schoolId, user?.id],
    queryFn: async (): Promise<Assignment[]> => {
      const { data: teacher, error: teacherErr } = await supabase
        .from('teachers')
        .select('id')
        .eq('school_id', schoolId ?? '')
        .eq('user_id', user?.id ?? '')
        .maybeSingle()
      if (teacherErr) throw teacherErr
      if (!teacher) return []

      const { data, error } = await supabase
        .from('teacher_assignments')
        .select('academic_year_id, class_id, section_id, classes(name), sections(name)')
        .eq('teacher_id', teacher.id)
      if (error) throw error
      return data.map((row) => ({
        academic_year_id: row.academic_year_id,
        class_id: row.class_id,
        class_name: (row.classes as unknown as { name: string } | null)?.name ?? 'Unknown class',
        section_id: row.section_id,
        section_name: (row.sections as unknown as { name: string } | null)?.name ?? null,
      }))
    },
    enabled: !!schoolId && !!user?.id,
  })
}

export function TeacherAttendancePage() {
  const { primaryRole } = useAuth()
  const schoolId = primaryRole?.schoolId ?? null
  const queryClient = useQueryClient()
  const { data: assignments } = useOwnAssignments(schoolId)
  const [assignmentKey, setAssignmentKey] = React.useState('')
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10))
  const [drafts, setDrafts] = React.useState<Record<string, AttendanceStatus>>({})

  const assignment = assignments?.find((a) => `${a.class_id}:${a.section_id ?? ''}` === assignmentKey)

  const { data: roster, isLoading } = useQuery({
    queryKey: ['class-attendance', schoolId, assignment?.class_id, assignment?.section_id, date],
    queryFn: async (): Promise<RosterRow[]> => {
      const { data, error } = await supabase.rpc('get_class_attendance', {
        p_school_id: schoolId!,
        p_academic_year_id: assignment!.academic_year_id,
        p_class_id: assignment!.class_id,
        p_section_id: assignment!.section_id,
        p_date: date,
      })
      if (error) throw error
      return data
    },
    enabled: !!schoolId && !!assignment,
  })

  React.useEffect(() => {
    const next: Record<string, AttendanceStatus> = {}
    for (const row of roster ?? []) {
      next[row.student_id] = (row.status as AttendanceStatus) ?? 'present'
    }
    setDrafts(next)
  }, [roster])

  const submit = useMutation({
    mutationFn: async () => {
      const records = Object.entries(drafts).map(([student_id, status]) => ({ student_id, status }))
      const { error } = await supabase.rpc('mark_attendance', {
        p_school_id: schoolId!,
        p_academic_year_id: assignment!.academic_year_id,
        p_class_id: assignment!.class_id,
        p_section_id: assignment!.section_id,
        p_attendance_date: date,
        p_records: records,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Attendance saved.')
      void queryClient.invalidateQueries({ queryKey: ['class-attendance'] })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to save attendance.'),
  })

  if (!schoolId) return null

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-5">
          <div className="flex flex-col gap-1">
            <Label>Class / Section</Label>
            <select
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={assignmentKey}
              onChange={(e) => setAssignmentKey(e.target.value)}
            >
              <option value="">Select…</option>
              {assignments?.map((a) => (
                <option key={`${a.class_id}:${a.section_id ?? ''}`} value={`${a.class_id}:${a.section_id ?? ''}`}>
                  {a.class_name}
                  {a.section_name ? ` - ${a.section_name}` : ' (all sections)'}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="date">Date</Label>
            <input
              id="date"
              type="date"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending || !assignment || !roster?.length}>
            {submit.isPending ? 'Saving…' : 'Save attendance'}
          </Button>
        </CardContent>
      </Card>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading roster…</p> : null}
      {assignment && !isLoading && roster?.length === 0 ? (
        <p className="text-sm text-muted-foreground">No students enrolled in this class/section yet.</p>
      ) : null}

      <div className="flex flex-col gap-2">
        {roster?.map((r) => (
          <div key={r.student_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
            <span>
              {r.first_name} {r.last_name ?? ''} ({r.admission_no})
            </span>
            <div className="flex gap-1">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDrafts((prev) => ({ ...prev, [r.student_id]: opt.value }))}
                  className={`rounded-md border px-2 py-1 text-xs ${
                    drafts[r.student_id] === opt.value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
