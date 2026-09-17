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
import type { StudentStatus } from '@/types/database'

interface StudentRow {
  id: string
  admission_no: string
  full_name: string
  roll_no: string | null
  status: StudentStatus
  class_id: string | null
  section_id: string | null
  guardian_name: string | null
  guardian_phone: string | null
  photo_url: string | null
}

interface NamedRow {
  id: string
  name: string
  class_id?: string
}

const admitSchema = z.object({
  admission_no: z.string().min(1, 'Admission number is required.'),
  full_name: z.string().min(2, 'Full name is required.'),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  date_of_birth: z.string().optional(),
  gender: z.enum(['male', 'female', 'other', '']).optional(),
  roll_no: z.string().optional(),
  academic_year_id: z.string().min(1, 'Academic year is required.'),
  class_id: z.string().min(1, 'Class is required.'),
  section_id: z.string().min(1, 'Section is required.'),
  phone: z.string().optional(),
  email: z.string().optional(),
  guardian_name: z.string().optional(),
  guardian_phone: z.string().optional(),
  guardian_email: z.string().optional(),
  guardian_relationship: z.string().optional(),
})

type AdmitValues = z.infer<typeof admitSchema>

const selectClassName =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

function statusVariant(status: StudentStatus) {
  if (status === 'active') return 'success' as const
  if (status === 'inactive') return 'warning' as const
  if (status === 'transferred') return 'secondary' as const
  return 'outline' as const
}

export function StudentsPage() {
  const { primaryRole } = useAuth()
  const schoolId = primaryRole?.schoolId ?? null
  const queryClient = useQueryClient()
  const [search, setSearch] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const [docsStudent, setDocsStudent] = React.useState<StudentRow | null>(null)

  const { data: years = [] } = useQuery({
    queryKey: ['academic-years', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('academic_years')
        .select('id, name')
        .eq('school_id', schoolId as string)
        .order('start_date', { ascending: false })
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

  const { data: students = [], isLoading } = useQuery({
    queryKey: ['students', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('students')
        .select(
          'id, admission_no, full_name, roll_no, status, class_id, section_id, guardian_name, guardian_phone, photo_url',
        )
        .eq('school_id', schoolId as string)
        .order('full_name')
      if (error) throw error
      return data as StudentRow[]
    },
  })

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<AdmitValues>({ resolver: zodResolver(admitSchema) })

  const selectedClassId = watch('class_id')
  const classSections = sections.filter((section) => section.class_id === selectedClassId)

  const admit = useMutation({
    mutationFn: async (values: AdmitValues) => {
      const { error } = await supabase.rpc('admit_student', {
        p_payload: {
          ...values,
          gender: values.gender || null,
        },
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Student admitted.')
      setOpen(false)
      reset()
      void queryClient.invalidateQueries({ queryKey: ['students', schoolId] })
    },
    onError: (err) => toast.error(rpcErrorMessage(err)),
  })

  const filtered = students.filter((student) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      student.full_name.toLowerCase().includes(q) ||
      student.admission_no.toLowerCase().includes(q) ||
      (student.guardian_name ?? '').toLowerCase().includes(q)
    )
  })

  const classNameById = Object.fromEntries(classes.map((row) => [row.id, row.name]))
  const sectionNameById = Object.fromEntries(sections.map((row) => [row.id, row.name]))

  if (!schoolId) {
    return <p className="text-sm text-muted-foreground">No school is associated with your account yet.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Students</h2>
          <p className="text-sm text-muted-foreground">Admit students, keep guardian details, and manage documents.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Admit student</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Admission form</DialogTitle>
              <DialogDescription>Duplicate admission numbers are rejected within this school.</DialogDescription>
            </DialogHeader>
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((values) => admit.mutate(values))} noValidate>
              <Field label="Admission number" error={errors.admission_no?.message}>
                <Input id="admission_no" {...register('admission_no')} />
              </Field>
              <Field label="Full name" error={errors.full_name?.message}>
                <Input id="full_name" {...register('full_name')} />
              </Field>
              <Field label="First name">
                <Input {...register('first_name')} />
              </Field>
              <Field label="Last name">
                <Input {...register('last_name')} />
              </Field>
              <Field label="Date of birth">
                <Input type="date" {...register('date_of_birth')} />
              </Field>
              <Field label="Gender">
                <select className={selectClassName} {...register('gender')}>
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="Academic year" error={errors.academic_year_id?.message}>
                <select className={selectClassName} {...register('academic_year_id')}>
                  <option value="">Select</option>
                  {years.map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Class" error={errors.class_id?.message}>
                <select className={selectClassName} {...register('class_id')}>
                  <option value="">Select</option>
                  {classes.map((klass) => (
                    <option key={klass.id} value={klass.id}>
                      {klass.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Section" error={errors.section_id?.message}>
                <select className={selectClassName} {...register('section_id')}>
                  <option value="">Select</option>
                  {classSections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Roll number">
                <Input {...register('roll_no')} />
              </Field>
              <Field label="Guardian name">
                <Input {...register('guardian_name')} />
              </Field>
              <Field label="Guardian phone">
                <Input {...register('guardian_phone')} />
              </Field>
              <Field label="Guardian relationship">
                <Input {...register('guardian_relationship')} />
              </Field>
              <Field label="Guardian email">
                <Input type="email" {...register('guardian_email')} />
              </Field>
              <DialogFooter className="sm:col-span-2">
                <Button type="submit" disabled={admit.isPending}>
                  {admit.isPending ? 'Saving…' : 'Admit student'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Input
        placeholder="Search name, admission number, or guardian"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      {isLoading ? <p className="text-sm text-muted-foreground">Loading students…</p> : null}
      {!isLoading && filtered.length === 0 ? (
        <Card>
          <CardContent className="pt-5 text-sm text-muted-foreground">
            No students yet. Use Admit student to create the first record.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3">
        {filtered.map((student) => (
          <Card key={student.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">{student.full_name}</CardTitle>
                <CardDescription>
                  {student.admission_no}
                  {student.roll_no ? ` · Roll ${student.roll_no}` : ''}
                  {student.class_id ? ` · ${classNameById[student.class_id] ?? 'Class'}` : ''}
                  {student.section_id ? ` ${sectionNameById[student.section_id] ?? ''}` : ''}
                </CardDescription>
              </div>
              <Badge variant={statusVariant(student.status)}>{student.status}</Badge>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                Guardian: {student.guardian_name ?? '—'}
                {student.guardian_phone ? ` · ${student.guardian_phone}` : ''}
              </span>
              <Button variant="outline" size="sm" onClick={() => setDocsStudent(student)}>
                Documents
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <DocumentsDialog
        student={docsStudent}
        schoolId={schoolId}
        onClose={() => setDocsStudent(null)}
        onChanged={() => void queryClient.invalidateQueries({ queryKey: ['students', schoolId] })}
      />
    </div>
  )
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}

function DocumentsDialog({
  student,
  schoolId,
  onClose,
  onChanged,
}: {
  student: StudentRow | null
  schoolId: string
  onClose: () => void
  onChanged: () => void
}) {
  const [busy, setBusy] = React.useState(false)
  const { data: documents = [] } = useQuery({
    queryKey: ['student-documents', student?.id],
    enabled: !!student,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_documents')
        .select('id, kind, original_filename, created_at, mime_type')
        .eq('student_id', student!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>, kind: 'photo' | 'other') {
    const file = event.target.files?.[0]
    if (!student || !file) return
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowed.includes(file.type)) {
      toast.error('Use JPEG, PNG, WebP, or PDF.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File is too large.')
      return
    }
    setBusy(true)
    try {
      const safeName = file.name.replace(/[^\w.-]+/g, '_')
      const path = `schools/${schoolId}/students/${student.id}/${kind}-${Date.now()}-${safeName}`
      const { error: uploadError } = await supabase.storage.from('student-documents').upload(path, file, {
        contentType: file.type,
        upsert: false,
      })
      if (uploadError) throw uploadError
      const { error: insertError } = await supabase.from('student_documents').insert({
        school_id: schoolId,
        student_id: student.id,
        kind,
        storage_path: path,
        mime_type: file.type,
        file_size: file.size,
        original_filename: file.name,
      })
      if (insertError) throw insertError
      if (kind === 'photo') {
        const { error: photoError } = await supabase.from('students').update({ photo_url: path }).eq('id', student.id)
        if (photoError) throw photoError
      }
      toast.success(kind === 'photo' ? 'Photo saved.' : 'Document saved.')
      onChanged()
    } catch (err) {
      toast.error(rpcErrorMessage(err, 'Upload failed.'))
    } finally {
      setBusy(false)
      event.target.value = ''
    }
  }

  return (
    <Dialog open={!!student} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Documents · {student?.full_name}</DialogTitle>
          <DialogDescription>Files are stored under this school and student only.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Label className="cursor-pointer">
              <span className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm">
                {busy ? 'Uploading…' : 'Upload photo'}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={busy}
                onChange={(event) => void handleUpload(event, 'photo')}
              />
            </Label>
            <Label className="cursor-pointer">
              <span className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm">
                Upload document
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="sr-only"
                disabled={busy}
                onChange={(event) => void handleUpload(event, 'other')}
              />
            </Label>
          </div>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {documents.map((doc) => (
                <li key={doc.id} className="flex justify-between gap-2 rounded-md border px-3 py-2">
                  <span>{doc.original_filename ?? doc.kind}</span>
                  <Badge variant="outline">{doc.kind}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
