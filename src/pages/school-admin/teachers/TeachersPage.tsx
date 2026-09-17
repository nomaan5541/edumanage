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
import { supabase } from '@/lib/supabase'

interface TeacherRow {
  id: string
  user_id: string
  employee_no: string | null
  full_name: string
  phone: string | null
  email: string | null
  status: string
}
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
interface AcademicYear {
  id: string
  name: string
  is_active: boolean
}
interface AssignmentRow {
  id: string
  teacher_id: string
  academic_year_id: string
  class_id: string
  section_id: string | null
  subject_id: string | null
}

function useTeachers(schoolId: string) {
  return useQuery({
    queryKey: ['teachers', schoolId],
    queryFn: async (): Promise<TeacherRow[]> => {
      const { data, error } = await supabase
        .from('teachers')
        .select('id, user_id, employee_no, full_name, phone, email, status')
        .eq('school_id', schoolId)
        .order('full_name')
      if (error) throw error
      return data
    },
  })
}

function useClasses(schoolId: string) {
  return useQuery({
    queryKey: ['classes', schoolId],
    queryFn: async (): Promise<Klass[]> => {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name')
        .eq('school_id', schoolId)
        .order('sort_order')
      if (error) throw error
      return data
    },
  })
}

function useSections(schoolId: string) {
  return useQuery({
    queryKey: ['sections', schoolId],
    queryFn: async (): Promise<Section[]> => {
      const { data, error } = await supabase.from('sections').select('id, name, class_id').eq('school_id', schoolId)
      if (error) throw error
      return data
    },
  })
}

function useSubjects(schoolId: string) {
  return useQuery({
    queryKey: ['subjects', schoolId],
    queryFn: async (): Promise<Subject[]> => {
      const { data, error } = await supabase.from('subjects').select('id, name').eq('school_id', schoolId).order('name')
      if (error) throw error
      return data
    },
  })
}

function useAcademicYears(schoolId: string) {
  return useQuery({
    queryKey: ['academic-years', schoolId],
    queryFn: async (): Promise<AcademicYear[]> => {
      const { data, error } = await supabase
        .from('academic_years')
        .select('id, name, is_active')
        .eq('school_id', schoolId)
        .order('start_date', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

function useAssignments(schoolId: string) {
  return useQuery({
    queryKey: ['teacher-assignments', schoolId],
    queryFn: async (): Promise<AssignmentRow[]> => {
      const { data, error } = await supabase
        .from('teacher_assignments')
        .select('id, teacher_id, academic_year_id, class_id, section_id, subject_id')
        .eq('school_id', schoolId)
      if (error) throw error
      return data
    },
  })
}

const inviteSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  full_name: z.string().min(1, 'Full name is required.'),
  employee_no: z.string().optional(),
  phone: z.string().optional(),
})
type InviteValues = z.infer<typeof inviteSchema>

export function TeachersPage() {
  const { primaryRole } = useAuth()
  const schoolId = primaryRole?.schoolId ?? null
  const queryClient = useQueryClient()
  const [inviteOpen, setInviteOpen] = React.useState(false)
  const [assigningTeacherId, setAssigningTeacherId] = React.useState<string | null>(null)

  const { data: teachers, isLoading } = useTeachers(schoolId ?? '')

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteValues>({ resolver: zodResolver(inviteSchema) })

  const invite = useMutation({
    mutationFn: async (values: InviteValues) => {
      const { error } = await supabase.functions.invoke('invite-school-teacher', {
        body: {
          school_id: schoolId,
          email: values.email,
          full_name: values.full_name,
          employee_no: values.employee_no || undefined,
          phone: values.phone || undefined,
        },
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Teacher invited.')
      setInviteOpen(false)
      reset()
      void queryClient.invalidateQueries({ queryKey: ['teachers', schoolId] })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to invite teacher.'),
  })

  const setStatus = useMutation({
    mutationFn: async ({ teacherId, status }: { teacherId: string; status: 'active' | 'inactive' }) => {
      const { error } = await supabase.from('teachers').update({ status }).eq('id', teacherId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Teacher updated.')
      void queryClient.invalidateQueries({ queryKey: ['teachers', schoolId] })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update teacher.'),
  })

  if (!schoolId) return null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button>New teacher</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite a teacher</DialogTitle>
              <DialogDescription>They'll receive an email invite to set up their account.</DialogDescription>
            </DialogHeader>
            <form className="flex flex-col gap-4" onSubmit={handleSubmit((v) => invite.mutate(v))} noValidate>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...register('email')} />
                {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="full_name">Full name</Label>
                <Input id="full_name" {...register('full_name')} />
                {errors.full_name ? <p className="text-xs text-destructive">{errors.full_name.message}</p> : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="employee_no">Employee No.</Label>
                <Input id="employee_no" {...register('employee_no')} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" {...register('phone')} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={invite.isPending}>
                  {invite.isPending ? 'Inviting…' : 'Send invite'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {!isLoading && teachers?.length === 0 ? (
        <Card>
          <CardContent className="pt-5 text-sm text-muted-foreground">
            No teachers yet. Invite one to get started.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {teachers?.map((t) => (
          <Card key={t.id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">{t.full_name}</CardTitle>
                <Badge variant={t.status === 'active' ? 'success' : 'outline'}>{t.status}</Badge>
              </div>
              <CardDescription>
                {t.email} {t.employee_no ? `· ${t.employee_no}` : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setAssigningTeacherId(t.id)}>
                Manage assignments
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={setStatus.isPending}
                onClick={() =>
                  setStatus.mutate({ teacherId: t.id, status: t.status === 'active' ? 'inactive' : 'active' })
                }
              >
                {t.status === 'active' ? 'Deactivate' : 'Reactivate'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {assigningTeacherId ? (
        <AssignmentsDialog
          schoolId={schoolId}
          teacherId={assigningTeacherId}
          onClose={() => setAssigningTeacherId(null)}
        />
      ) : null}
    </div>
  )
}

function AssignmentsDialog({
  schoolId,
  teacherId,
  onClose,
}: {
  schoolId: string
  teacherId: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { data: years } = useAcademicYears(schoolId)
  const { data: classes } = useClasses(schoolId)
  const { data: sections } = useSections(schoolId)
  const { data: subjects } = useSubjects(schoolId)
  const { data: assignments } = useAssignments(schoolId)

  const [yearId, setYearId] = React.useState('')
  const [classId, setClassId] = React.useState('')
  const [sectionId, setSectionId] = React.useState('')
  const [subjectId, setSubjectId] = React.useState('')

  const effectiveYearId = yearId || years?.find((y) => y.is_active)?.id || years?.[0]?.id || ''

  const teacherAssignments = React.useMemo(
    () => (assignments ?? []).filter((a) => a.teacher_id === teacherId),
    [assignments, teacherId],
  )
  const classById = React.useMemo(() => new Map((classes ?? []).map((c) => [c.id, c])), [classes])
  const sectionById = React.useMemo(() => new Map((sections ?? []).map((s) => [s.id, s])), [sections])
  const subjectById = React.useMemo(() => new Map((subjects ?? []).map((s) => [s.id, s])), [subjects])

  const addAssignment = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('teacher_assignments').insert({
        school_id: schoolId,
        teacher_id: teacherId,
        academic_year_id: effectiveYearId,
        class_id: classId,
        section_id: sectionId || null,
        subject_id: subjectId || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Assignment added.')
      setClassId('')
      setSectionId('')
      setSubjectId('')
      void queryClient.invalidateQueries({ queryKey: ['teacher-assignments', schoolId] })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to add assignment.'),
  })

  const removeAssignment = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase.from('teacher_assignments').delete().eq('id', assignmentId)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['teacher-assignments', schoolId] }),
    onError: (err: Error) => toast.error(err.message || 'Failed to remove assignment.'),
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Teacher assignments</DialogTitle>
          <DialogDescription>
            Assignments control which class/section/subject a teacher may act on (attendance, exams, homework).
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3">
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
            <Label>Section (optional)</Label>
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
            <Label>Subject (optional)</Label>
            <select
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
            >
              <option value="">Class teacher (all subjects)</option>
              {subjects?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <Button
            size="sm"
            onClick={() => addAssignment.mutate()}
            disabled={addAssignment.isPending || !classId || !effectiveYearId}
          >
            Add
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          {teacherAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assignments yet.</p>
          ) : null}
          {teacherAssignments.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
              <span>
                {classById.get(a.class_id)?.name ?? 'Unknown class'}
                {a.section_id ? ` - ${sectionById.get(a.section_id)?.name ?? ''}` : ' (all sections)'}
                {a.subject_id ? ` · ${subjectById.get(a.subject_id)?.name ?? ''}` : ' · Class teacher'}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={removeAssignment.isPending}
                onClick={() => removeAssignment.mutate(a.id)}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
