import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth-context'
import { exportToCsv } from '@/lib/csv-export'
import { supabase } from '@/lib/supabase'
import type { AttendanceStatus, Database } from '@/types/database'

type RosterRow = Database['public']['Functions']['get_class_attendance']['Returns'][number]

interface Klass {
  id: string
  name: string
}
interface Section {
  id: string
  name: string
  class_id: string
}
interface AcademicYear {
  id: string
  name: string
  is_active: boolean
}

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'late', label: 'Late' },
  { value: 'excused', label: 'Excused' },
]

export function SchoolAdminAttendancePage() {
  const { primaryRole } = useAuth()
  const schoolId = primaryRole?.schoolId ?? null
  const queryClient = useQueryClient()

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

  const [yearId, setYearId] = React.useState('')
  const [classId, setClassId] = React.useState('')
  const [sectionId, setSectionId] = React.useState('')
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10))

  const effectiveYearId = yearId || years?.find((y) => y.is_active)?.id || years?.[0]?.id || ''

  const { data: roster, isLoading } = useQuery({
    queryKey: ['admin-class-attendance', schoolId, classId, sectionId, date, effectiveYearId],
    queryFn: async (): Promise<RosterRow[]> => {
      const { data, error } = await supabase.rpc('get_class_attendance', {
        p_school_id: schoolId!,
        p_academic_year_id: effectiveYearId,
        p_class_id: classId,
        p_section_id: sectionId || null,
        p_date: date,
      })
      if (error) throw error
      return data
    },
    enabled: !!schoolId && !!classId && !!effectiveYearId,
  })

  const correct = useMutation({
    mutationFn: async ({ studentId, status }: { studentId: string; status: AttendanceStatus }) => {
      const { error } = await supabase.rpc('mark_attendance', {
        p_school_id: schoolId!,
        p_academic_year_id: effectiveYearId,
        p_class_id: classId,
        p_section_id: sectionId || null,
        p_attendance_date: date,
        p_records: [{ student_id: studentId, status }],
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Attendance corrected.')
      void queryClient.invalidateQueries({ queryKey: ['admin-class-attendance'] })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to correct attendance.'),
  })

  if (!schoolId) return null

  const exportCsv = () => {
    exportToCsv(
      `attendance-${date}`,
      (roster ?? []).map((r) => ({
        admission_no: r.admission_no,
        name: `${r.first_name} ${r.last_name ?? ''}`.trim(),
        status: r.status ?? 'not marked',
        date,
      })),
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-5">
          <div className="flex flex-col gap-1">
            <Label>Academic year</Label>
            <select
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={effectiveYearId}
              onChange={(e) => setYearId(e.target.value)}
            >
              {years?.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Class</Label>
            <select
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
            >
              <option value="">Select…</option>
              {classes?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Section</Label>
            <select
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
            >
              <option value="">All sections</option>
              {sections
                ?.filter((s) => s.class_id === classId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="admin-date">Date</Label>
            <input
              id="admin-date"
              type="date"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={exportCsv} disabled={!roster?.length}>
            Export CSV
          </Button>
        </CardContent>
      </Card>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {classId && !isLoading && roster?.length === 0 ? (
        <p className="text-sm text-muted-foreground">No students enrolled in this class/section.</p>
      ) : null}

      <div className="flex flex-col gap-2">
        {roster?.map((r) => (
          <div key={r.student_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
            <span>
              {r.first_name} {r.last_name ?? ''} ({r.admission_no}) — current: {r.status ?? 'not marked'}
            </span>
            <div className="flex gap-1">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={correct.isPending}
                  onClick={() => correct.mutate({ studentId: r.student_id, status: opt.value })}
                  className={`rounded-md border px-2 py-1 text-xs ${
                    r.status === opt.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
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
