import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type SlotRow = Database['public']['Tables']['timetable_slots']['Row']
type EntryRow = Database['public']['Tables']['timetable_entries']['Row']

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface Klass {
  id: string
  name: string
}
interface Section {
  id: string
  name: string
  class_id: string
}
interface Subject {
  id: string
  name: string
}
interface Teacher {
  id: string
  full_name: string
}
interface AcademicYear {
  id: string
  name: string
  is_active: boolean
}

export function SchoolAdminTimetablePage() {
  const { primaryRole } = useAuth()
  const schoolId = primaryRole?.schoolId ?? null
  const queryClient = useQueryClient()

  const { data: slots } = useQuery({
    queryKey: ['timetable-slots', schoolId],
    queryFn: async (): Promise<SlotRow[]> => {
      const { data, error } = await supabase
        .from('timetable_slots')
        .select('*')
        .eq('school_id', schoolId ?? '')
        .order('day_of_week')
        .order('period_number')
      if (error) throw error
      return data
    },
    enabled: !!schoolId,
  })
  const { data: years } = useQuery({
    queryKey: ['academic-years', schoolId],
    queryFn: async (): Promise<AcademicYear[]> => {
      const { data, error } = await supabase
        .from('academic_years')
        .select('id, name, is_active')
        .eq('school_id', schoolId ?? '')
        .order('start_date', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!schoolId,
  })
  const { data: classes } = useQuery({
    queryKey: ['classes', schoolId],
    queryFn: async (): Promise<Klass[]> => {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name')
        .eq('school_id', schoolId ?? '')
        .order('sort_order')
      if (error) throw error
      return data
    },
    enabled: !!schoolId,
  })
  const { data: sections } = useQuery({
    queryKey: ['sections', schoolId],
    queryFn: async (): Promise<Section[]> => {
      const { data, error } = await supabase
        .from('sections')
        .select('id, name, class_id')
        .eq('school_id', schoolId ?? '')
      if (error) throw error
      return data
    },
    enabled: !!schoolId,
  })
  const { data: subjects } = useQuery({
    queryKey: ['subjects', schoolId],
    queryFn: async (): Promise<Subject[]> => {
      const { data, error } = await supabase.from('subjects').select('id, name').eq('school_id', schoolId ?? '')
      if (error) throw error
      return data
    },
    enabled: !!schoolId,
  })
  const { data: teachers } = useQuery({
    queryKey: ['teachers', schoolId],
    queryFn: async (): Promise<Teacher[]> => {
      const { data, error } = await supabase.from('teachers').select('id, full_name').eq('school_id', schoolId ?? '')
      if (error) throw error
      return data
    },
    enabled: !!schoolId,
  })
  const { data: entries } = useQuery({
    queryKey: ['timetable-entries', schoolId],
    queryFn: async (): Promise<EntryRow[]> => {
      const { data, error } = await supabase.from('timetable_entries').select('*').eq('school_id', schoolId ?? '')
      if (error) throw error
      return data
    },
    enabled: !!schoolId,
  })

  const [newDay, setNewDay] = React.useState('1')
  const [newPeriod, setNewPeriod] = React.useState('1')
  const [newStart, setNewStart] = React.useState('')
  const [newEnd, setNewEnd] = React.useState('')

  const addSlot = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('timetable_slots').insert({
        school_id: schoolId!,
        day_of_week: Number(newDay),
        period_number: Number(newPeriod),
        start_time: newStart,
        end_time: newEnd,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Period added.')
      void queryClient.invalidateQueries({ queryKey: ['timetable-slots', schoolId] })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to add period.'),
  })

  const [yearId, setYearId] = React.useState('')
  const [classId, setClassId] = React.useState('')
  const [sectionId, setSectionId] = React.useState('')
  const [subjectId, setSubjectId] = React.useState('')
  const [teacherId, setTeacherId] = React.useState('')
  const [room, setRoom] = React.useState('')
  const [selectedSlotId, setSelectedSlotId] = React.useState<string | null>(null)

  const effectiveYearId = yearId || years?.find((y) => y.is_active)?.id || years?.[0]?.id || ''

  const assign = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('create_timetable_entry', {
        p_school_id: schoolId!,
        p_academic_year_id: effectiveYearId,
        p_slot_id: selectedSlotId!,
        p_class_id: classId,
        p_section_id: sectionId,
        p_subject_id: subjectId,
        p_teacher_id: teacherId,
        p_room: room || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Timetable entry added.')
      setSelectedSlotId(null)
      void queryClient.invalidateQueries({ queryKey: ['timetable-entries', schoolId] })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to add entry.'),
  })

  const removeEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('timetable_entries').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['timetable-entries', schoolId] }),
    onError: (err: Error) => toast.error(err.message || 'Failed to remove entry.'),
  })

  const classById = React.useMemo(() => new Map((classes ?? []).map((c) => [c.id, c])), [classes])
  const sectionById = React.useMemo(() => new Map((sections ?? []).map((s) => [s.id, s])), [sections])
  const subjectById = React.useMemo(() => new Map((subjects ?? []).map((s) => [s.id, s])), [subjects])
  const teacherById = React.useMemo(() => new Map((teachers ?? []).map((t) => [t.id, t])), [teachers])

  if (!schoolId) return null

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-5">
          <div className="flex flex-col gap-1">
            <Label>Day</Label>
            <select
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={newDay}
              onChange={(e) => setNewDay(e.target.value)}
            >
              {DAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Period</Label>
            <Input type="number" min="1" className="w-20" value={newPeriod} onChange={(e) => setNewPeriod(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Start</Label>
            <Input type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label>End</Label>
            <Input type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} />
          </div>
          <Button onClick={() => addSlot.mutate()} disabled={addSlot.isPending || !newStart || !newEnd}>
            Add period
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        {slots?.map((slot) => (
          <Card key={slot.id}>
            <CardContent className="flex flex-col gap-2 pt-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {DAYS[slot.day_of_week]} · Period {slot.period_number} ({slot.start_time}–{slot.end_time})
                </span>
                <Button variant="outline" size="sm" onClick={() => setSelectedSlotId(slot.id)}>
                  Assign class
                </Button>
              </div>
              <div className="flex flex-col gap-1">
                {entries
                  ?.filter((e) => e.slot_id === slot.id)
                  .map((e) => (
                    <div key={e.id} className="flex items-center justify-between rounded-md border p-2 text-xs">
                      <span>
                        {classById.get(e.class_id)?.name} - {sectionById.get(e.section_id)?.name} ·{' '}
                        {subjectById.get(e.subject_id)?.name} · {teacherById.get(e.teacher_id)?.full_name}
                        {e.room ? ` · Room ${e.room}` : ''}
                      </span>
                      <Button variant="outline" size="sm" onClick={() => removeEntry.mutate(e.id)}>
                        Remove
                      </Button>
                    </div>
                  ))}
              </div>
              {selectedSlotId === slot.id ? (
                <div className="flex flex-wrap items-end gap-2 border-t pt-2">
                  <select
                    className="h-9 rounded-md border border-input bg-transparent px-2 text-xs"
                    value={yearId}
                    onChange={(e) => setYearId(e.target.value)}
                  >
                    {years?.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="h-9 rounded-md border border-input bg-transparent px-2 text-xs"
                    value={classId}
                    onChange={(e) => setClassId(e.target.value)}
                  >
                    <option value="">Class…</option>
                    {classes?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="h-9 rounded-md border border-input bg-transparent px-2 text-xs"
                    value={sectionId}
                    onChange={(e) => setSectionId(e.target.value)}
                  >
                    <option value="">Section…</option>
                    {sections
                      ?.filter((s) => s.class_id === classId)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                  <select
                    className="h-9 rounded-md border border-input bg-transparent px-2 text-xs"
                    value={subjectId}
                    onChange={(e) => setSubjectId(e.target.value)}
                  >
                    <option value="">Subject…</option>
                    {subjects?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="h-9 rounded-md border border-input bg-transparent px-2 text-xs"
                    value={teacherId}
                    onChange={(e) => setTeacherId(e.target.value)}
                  >
                    <option value="">Teacher…</option>
                    {teachers?.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.full_name}
                      </option>
                    ))}
                  </select>
                  <Input placeholder="Room" className="w-20" value={room} onChange={(e) => setRoom(e.target.value)} />
                  <Button
                    size="sm"
                    onClick={() => assign.mutate()}
                    disabled={assign.isPending || !classId || !sectionId || !subjectId || !teacherId || !effectiveYearId}
                  >
                    Assign
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setSelectedSlotId(null)}>
                    Cancel
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
