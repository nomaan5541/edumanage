import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth-context'
import { rpcErrorMessage } from '@/lib/rpc-error'
import { supabase } from '@/lib/supabase'
import type { TeacherStatus } from '@/types/database'

const selectClassName =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

interface TeacherRow {
  id: string
  employee_code: string
  full_name: string
  email: string | null
  phone: string | null
  status: TeacherStatus
  user_id: string | null
}

interface NamedRow {
  id: string
  name: string
  class_id?: string
}

interface AssignmentRow {
  id: string
  teacher_id: string
  academic_year_id: string
  class_id: string
  section_id: string
  subject_id: string
}

const createSchema = z.object({
  employee_code: z.string().min(1, 'Employee code is required.'),
  full_name: z.string().min(2, 'Full name is required.'),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  date_of_joining: z.string().optional(),
  invite_portal: z.boolean().optional(),
})

type CreateValues = z.infer<typeof createSchema>

export function TeachersPage() {
  const { primaryRole } = useAuth()
  const schoolId = primaryRole?.schoolId ?? null
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const [assignTeacher, setAssignTeacher] = React.useState<TeacherRow | null>(null)

  const { data: teachers = [], isLoading } = useQuery({
    queryKey: ['teachers', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teachers')
        .select('id, employee_code, full_name, email, phone, status, user_id')
        .eq('school_id', schoolId as string)
        .order('full_name')
      if (error) throw error
      return data as TeacherRow[]
    },
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateValues>({ resolver: zodResolver(createSchema) })

  const createTeacher = useMutation({
    mutationFn: async (values: CreateValues) => {
      if (values.invite_portal && values.email) {
        const { error } = await supabase.functions.invoke('create-teacher', {
          body: {
            teacher: {
              employee_code: values.employee_code,
              full_name: values.full_name,
              first_name: values.first_name,
              last_name: values.last_name,
              phone: values.phone,
              email: values.email,
              date_of_joining: values.date_of_joining,
            },
          },
        })
        if (error) throw error
        return
      }
      const { error } = await supabase.rpc('create_teacher', {
        p_payload: {
          employee_code: values.employee_code,
          full_name: values.full_name,
          first_name: values.first_name,
          last_name: values.last_name,
          phone: values.phone,
          email: values.email,
          date_of_joining: values.date_of_joining,
        },
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Teacher saved.')
      setOpen(false)
      reset()
      void queryClient.invalidateQueries({ queryKey: ['teachers', schoolId] })
    },
    onError: (err) => toast.error(rpcErrorMessage(err)),
  })

  if (!schoolId) {
    return <p className="text-sm text-muted-foreground">No school is associated with your account yet.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Teachers</h2>
          <p className="text-sm text-muted-foreground">Staff records, class assignments, and portal invites.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Add teacher</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New teacher</DialogTitle>
              <DialogDescription>Create a staff record. Invite a portal account only when an email is provided.</DialogDescription>
            </DialogHeader>
            <form className="flex flex-col gap-3" onSubmit={handleSubmit((values) => createTeacher.mutate(values))} noValidate>
              <div className="flex flex-col gap-1.5">
                <Label>Employee code</Label>
                <Input {...register('employee_code')} />
                {errors.employee_code ? <p className="text-xs text-destructive">{errors.employee_code.message}</p> : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Full name</Label>
                <Input {...register('full_name')} />
                {errors.full_name ? <p className="text-xs text-destructive">{errors.full_name.message}</p> : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>Phone</Label>
                  <Input {...register('phone')} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Email</Label>
                  <Input type="email" {...register('email')} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Date of joining</Label>
                <Input type="date" {...register('date_of_joining')} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" {...register('invite_portal')} className="accent-current" />
                Invite portal account (requires email)
              </label>
              <DialogFooter>
                <Button type="submit" disabled={createTeacher.isPending}>
                  {createTeacher.isPending ? 'Saving…' : 'Save teacher'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading teachers…</p> : null}
      {!isLoading && teachers.length === 0 ? (
        <Card>
          <CardContent className="pt-5 text-sm text-muted-foreground">No teachers yet.</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3">
        {teachers.map((teacher) => (
          <Card key={teacher.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">{teacher.full_name}</CardTitle>
                <CardDescription>
                  {teacher.employee_code}
                  {teacher.email ? ` · ${teacher.email}` : ''}
                </CardDescription>
              </div>
              <Badge variant={teacher.status === 'active' ? 'success' : 'warning'}>{teacher.status}</Badge>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setAssignTeacher(teacher)}>
                Assignments
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <AssignmentsDialog
        teacher={assignTeacher}
        schoolId={schoolId}
        onClose={() => setAssignTeacher(null)}
      />
    </div>
  )
}

function AssignmentsDialog({
  teacher,
  schoolId,
  onClose,
}: {
  teacher: TeacherRow | null
  schoolId: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [yearId, setYearId] = React.useState('')
  const [classId, setClassId] = React.useState('')
  const [sectionId, setSectionId] = React.useState('')
  const [subjectId, setSubjectId] = React.useState('')

  const { data: years = [] } = useQuery({
    queryKey: ['academic-years', schoolId],
    enabled: !!teacher,
    queryFn: async () => {
      const { data, error } = await supabase.from('academic_years').select('id, name').eq('school_id', schoolId)
      if (error) throw error
      return data as NamedRow[]
    },
  })
  const { data: classes = [] } = useQuery({
    queryKey: ['classes', schoolId],
    enabled: !!teacher,
    queryFn: async () => {
      const { data, error } = await supabase.from('classes').select('id, name').eq('school_id', schoolId)
      if (error) throw error
      return data as NamedRow[]
    },
  })
  const { data: sections = [] } = useQuery({
    queryKey: ['sections', schoolId],
    enabled: !!teacher,
    queryFn: async () => {
      const { data, error } = await supabase.from('sections').select('id, name, class_id').eq('school_id', schoolId)
      if (error) throw error
      return data as NamedRow[]
    },
  })
  const { data: subjects = [] } = useQuery({
    queryKey: ['subjects', schoolId],
    enabled: !!teacher,
    queryFn: async () => {
      const { data, error } = await supabase.from('subjects').select('id, name').eq('school_id', schoolId)
      if (error) throw error
      return data as NamedRow[]
    },
  })
  const { data: assignments = [] } = useQuery({
    queryKey: ['teacher-assignments', teacher?.id],
    enabled: !!teacher,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teacher_assignments')
        .select('id, teacher_id, academic_year_id, class_id, section_id, subject_id')
        .eq('teacher_id', teacher!.id)
      if (error) throw error
      return data as AssignmentRow[]
    },
  })

  const addAssignment = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('teacher_assignments').insert({
        school_id: schoolId,
        teacher_id: teacher!.id,
        academic_year_id: yearId,
        class_id: classId,
        section_id: sectionId,
        subject_id: subjectId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Assignment saved.')
      void queryClient.invalidateQueries({ queryKey: ['teacher-assignments', teacher?.id] })
    },
    onError: (err) => toast.error(rpcErrorMessage(err)),
  })

  async function removeAssignment(id: string) {
    const { error } = await supabase.from('teacher_assignments').delete().eq('id', id)
    if (error) {
      toast.error(rpcErrorMessage(error))
      return
    }
    toast.success('Assignment removed.')
    void queryClient.invalidateQueries({ queryKey: ['teacher-assignments', teacher?.id] })
  }

  const nameOf = (rows: NamedRow[], id: string) => rows.find((row) => row.id === id)?.name ?? id

  return (
    <Dialog open={!!teacher} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assignments · {teacher?.full_name}</DialogTitle>
          <DialogDescription>Class, section, and subject for the selected academic year.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <select className={selectClassName} value={yearId} onChange={(e) => setYearId(e.target.value)}>
            <option value="">Year</option>
            {years.map((year) => (
              <option key={year.id} value={year.id}>
                {year.name}
              </option>
            ))}
          </select>
          <select className={selectClassName} value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">Class</option>
            {classes.map((klass) => (
              <option key={klass.id} value={klass.id}>
                {klass.name}
              </option>
            ))}
          </select>
          <select className={selectClassName} value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">Section</option>
            {sections
              .filter((section) => section.class_id === classId)
              .map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
          </select>
          <select className={selectClassName} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">Subject</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </div>
        <Button
          disabled={addAssignment.isPending || !yearId || !classId || !sectionId || !subjectId}
          onClick={() => addAssignment.mutate()}
        >
          {addAssignment.isPending ? 'Saving…' : 'Add assignment'}
        </Button>
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No assignments yet.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {assignments.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                <span>
                  {nameOf(years, row.academic_year_id)} · {nameOf(classes, row.class_id)} {nameOf(sections, row.section_id)} ·{' '}
                  {nameOf(subjects, row.subject_id)}
                </span>
                <Button size="sm" variant="ghost" onClick={() => void removeAssignment(row.id)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
