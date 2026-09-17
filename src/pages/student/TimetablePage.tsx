import { useQuery } from '@tanstack/react-query'

import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface EntryView {
  id: string
  day_of_week: number
  period_number: number
  start_time: string
  end_time: string
  subject_name: string
  teacher_name: string
  room: string | null
}

function useOwnEnrollment() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['own-enrollment-for-timetable', user?.id],
    queryFn: async () => {
      const { data: student, error: studentErr } = await supabase
        .from('students')
        .select('id, school_id')
        .eq('user_id', user?.id ?? '')
        .maybeSingle()
      if (studentErr) throw studentErr
      if (!student) return null

      const { data: enrollment, error: enrollErr } = await supabase
        .from('student_enrollments')
        .select('class_id, section_id, academic_year_id')
        .eq('student_id', student.id)
        .eq('status', 'active')
        .maybeSingle()
      if (enrollErr) throw enrollErr
      return enrollment ? { ...enrollment, school_id: student.school_id } : null
    },
    enabled: !!user?.id,
  })
}

export function StudentTimetablePage() {
  const { data: enrollment } = useOwnEnrollment()

  const { data: entries, isLoading } = useQuery({
    queryKey: ['own-class-timetable', enrollment?.class_id, enrollment?.section_id],
    queryFn: async (): Promise<EntryView[]> => {
      const { data, error } = await supabase
        .from('timetable_entries')
        .select(
          'id, room, timetable_slots(day_of_week, period_number, start_time, end_time), subjects(name), teachers(full_name)',
        )
        .eq('class_id', enrollment!.class_id)
        .eq('section_id', enrollment!.section_id!)
      if (error) throw error
      return data
        .map((row) => {
          const slot = row.timetable_slots as unknown as {
            day_of_week: number
            period_number: number
            start_time: string
            end_time: string
          } | null
          if (!slot) return null
          return {
            id: row.id,
            day_of_week: slot.day_of_week,
            period_number: slot.period_number,
            start_time: slot.start_time,
            end_time: slot.end_time,
            subject_name: (row.subjects as unknown as { name: string } | null)?.name ?? '',
            teacher_name: (row.teachers as unknown as { full_name: string } | null)?.full_name ?? '',
            room: row.room,
          }
        })
        .filter((v): v is EntryView => v !== null)
        .sort((a, b) => a.day_of_week - b.day_of_week || a.period_number - b.period_number)
    },
    enabled: !!enrollment?.class_id && !!enrollment?.section_id,
  })

  if (!enrollment) {
    return <p className="text-sm text-muted-foreground">No active class enrollment found.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Timetable</h2>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {!isLoading && entries?.length === 0 ? (
        <p className="text-sm text-muted-foreground">No timetable published yet.</p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {entries?.map((e) => (
          <Card key={e.id}>
            <CardContent className="flex flex-col gap-1 pt-5 text-sm">
              <p className="font-medium">
                {DAYS[e.day_of_week]} · Period {e.period_number} ({e.start_time}–{e.end_time})
              </p>
              <p className="text-muted-foreground">
                {e.subject_name} · {e.teacher_name}
                {e.room ? ` · Room ${e.room}` : ''}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
