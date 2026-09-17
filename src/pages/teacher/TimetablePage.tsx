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
  class_name: string
  section_name: string
  subject_name: string
  room: string | null
}

function useOwnTimetable(schoolId: string | null) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['own-timetable', schoolId, user?.id],
    queryFn: async (): Promise<EntryView[]> => {
      const { data: teacher, error: teacherErr } = await supabase
        .from('teachers')
        .select('id')
        .eq('school_id', schoolId ?? '')
        .eq('user_id', user?.id ?? '')
        .maybeSingle()
      if (teacherErr) throw teacherErr
      if (!teacher) return []

      const { data, error } = await supabase
        .from('timetable_entries')
        .select('id, room, timetable_slots(day_of_week, period_number, start_time, end_time), classes(name), sections(name), subjects(name)')
        .eq('teacher_id', teacher.id)
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
            class_name: (row.classes as unknown as { name: string } | null)?.name ?? '',
            section_name: (row.sections as unknown as { name: string } | null)?.name ?? '',
            subject_name: (row.subjects as unknown as { name: string } | null)?.name ?? '',
            room: row.room,
          }
        })
        .filter((v): v is EntryView => v !== null)
        .sort((a, b) => a.day_of_week - b.day_of_week || a.period_number - b.period_number)
    },
    enabled: !!schoolId && !!user?.id,
  })
}

export function TeacherTimetablePage() {
  const { primaryRole } = useAuth()
  const schoolId = primaryRole?.schoolId ?? null
  const { data: entries, isLoading } = useOwnTimetable(schoolId)

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">My Timetable</h2>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {!isLoading && entries?.length === 0 ? (
        <p className="text-sm text-muted-foreground">No timetable entries assigned yet.</p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {entries?.map((e) => (
          <Card key={e.id}>
            <CardContent className="flex flex-col gap-1 pt-5 text-sm">
              <p className="font-medium">
                {DAYS[e.day_of_week]} · Period {e.period_number} ({e.start_time}–{e.end_time})
              </p>
              <p className="text-muted-foreground">
                {e.class_name} - {e.section_name} · {e.subject_name}
                {e.room ? ` · Room ${e.room}` : ''}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
