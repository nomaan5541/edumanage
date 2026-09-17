import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth-context'
import { rpcErrorMessage } from '@/lib/rpc-error'
import { supabase } from '@/lib/supabase'

const selectClassName =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

interface NamedRow {
  id: string
  name: string
  class_id?: string
}

interface StudentRow {
  id: string
  full_name: string
  admission_no: string
  academic_year_id: string | null
  class_id: string | null
  status: string
}

export function StudentPromotionPage() {
  const { primaryRole } = useAuth()
  const schoolId = primaryRole?.schoolId ?? null
  const queryClient = useQueryClient()

  const [sourceYearId, setSourceYearId] = React.useState('')
  const [sourceClassId, setSourceClassId] = React.useState('')
  const [destYearId, setDestYearId] = React.useState('')
  const [destClassId, setDestClassId] = React.useState('')
  const [destSectionId, setDestSectionId] = React.useState('')
  const [selected, setSelected] = React.useState<Set<string>>(new Set())

  const { data: years = [] } = useQuery({
    queryKey: ['academic-years', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('academic_years')
        .select('id, name')
        .eq('school_id', schoolId as string)
        .order('start_date')
      if (error) throw error
      return data as NamedRow[]
    },
  })

  const { data: classes = [] } = useQuery({
    queryKey: ['classes', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name')
        .eq('school_id', schoolId as string)
        .order('sort_order')
      if (error) throw error
      return data as NamedRow[]
    },
  })

  const { data: sections = [] } = useQuery({
    queryKey: ['sections', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sections')
        .select('id, name, class_id')
        .eq('school_id', schoolId as string)
        .order('name')
      if (error) throw error
      return data as NamedRow[]
    },
  })

  const { data: students = [] } = useQuery({
    queryKey: ['students-promote', schoolId, sourceYearId, sourceClassId],
    enabled: !!schoolId && !!sourceYearId,
    queryFn: async () => {
      let query = supabase
        .from('students')
        .select('id, full_name, admission_no, academic_year_id, class_id, status')
        .eq('school_id', schoolId as string)
        .eq('status', 'active')
        .eq('academic_year_id', sourceYearId)
      if (sourceClassId) query = query.eq('class_id', sourceClassId)
      const { data, error } = await query.order('full_name')
      if (error) throw error
      return data as StudentRow[]
    },
  })

  const destSections = sections.filter((section) => section.class_id === destClassId)

  const promote = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('promote_students', {
        p_student_ids: Array.from(selected),
        p_source_academic_year_id: sourceYearId,
        p_destination_academic_year_id: destYearId,
        p_destination_class_id: destClassId,
        p_destination_section_id: destSectionId,
      })
      if (error) throw error
      return data
    },
    onSuccess: (count) => {
      toast.success(`Promoted ${count} student${count === 1 ? '' : 's'}. Prior-year enrollments were left unchanged.`)
      setSelected(new Set())
      void queryClient.invalidateQueries({ queryKey: ['students'] })
      void queryClient.invalidateQueries({ queryKey: ['students-promote'] })
    },
    onError: (err) => toast.error(rpcErrorMessage(err)),
  })

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  if (!schoolId) {
    return <p className="text-sm text-muted-foreground">No school is associated with your account yet.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Promotion</h2>
        <p className="text-sm text-muted-foreground">
          Creates a new enrollment in the destination year. Historical records stay as they are.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mapping</CardTitle>
          <CardDescription>Choose source students and the destination class/section.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Source academic year</Label>
            <select className={selectClassName} value={sourceYearId} onChange={(e) => setSourceYearId(e.target.value)}>
              <option value="">Select</option>
              {years.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Source class (optional filter)</Label>
            <select className={selectClassName} value={sourceClassId} onChange={(e) => setSourceClassId(e.target.value)}>
              <option value="">All classes</option>
              {classes.map((klass) => (
                <option key={klass.id} value={klass.id}>
                  {klass.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Destination academic year</Label>
            <select className={selectClassName} value={destYearId} onChange={(e) => setDestYearId(e.target.value)}>
              <option value="">Select</option>
              {years.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Destination class</Label>
            <select className={selectClassName} value={destClassId} onChange={(e) => setDestClassId(e.target.value)}>
              <option value="">Select</option>
              {classes.map((klass) => (
                <option key={klass.id} value={klass.id}>
                  {klass.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Destination section</Label>
            <select className={selectClassName} value={destSectionId} onChange={(e) => setDestSectionId(e.target.value)}>
              <option value="">Select</option>
              {destSections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Students</CardTitle>
          <CardDescription>{selected.size} selected</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {students.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active students in the source year/class.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {students.map((student) => (
                <li key={student.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.has(student.id)}
                      onChange={() => toggle(student.id)}
                      className="accent-current"
                    />
                    <span className="font-medium">{student.full_name}</span>
                    <span className="text-muted-foreground">{student.admission_no}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <Button
            disabled={promote.isPending || selected.size === 0 || !destYearId || !destClassId || !destSectionId}
            onClick={() => promote.mutate()}
          >
            {promote.isPending ? 'Promoting…' : 'Promote selected'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
