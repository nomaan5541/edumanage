import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

interface AcademicYear {
  id: string
  name: string
  is_active: boolean
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
interface StudentRow {
  id: string
  admission_no: string
  first_name: string
  middle_name: string | null
  last_name: string | null
  guardian_name: string | null
  guardian_phone: string | null
  status: string
}
interface EnrollmentRow {
  student_id: string
  academic_year_id: string
  class_id: string
  section_id: string | null
  roll_no: string | null
  status: string
}

function fullName(s: Pick<StudentRow, 'first_name' | 'middle_name' | 'last_name'>) {
  return [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(' ')
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

function useStudents(schoolId: string) {
  return useQuery({
    queryKey: ['students', schoolId],
    queryFn: async (): Promise<StudentRow[]> => {
      const { data, error } = await supabase
        .from('students')
        .select('id, admission_no, first_name, middle_name, last_name, guardian_name, guardian_phone, status')
        .eq('school_id', schoolId)
        .neq('status', 'archived')
        .order('admission_no')
      if (error) throw error
      return data
    },
  })
}

function useActiveEnrollments(schoolId: string) {
  return useQuery({
    queryKey: ['student-enrollments-active', schoolId],
    queryFn: async (): Promise<EnrollmentRow[]> => {
      const { data, error } = await supabase
        .from('student_enrollments')
        .select('student_id, academic_year_id, class_id, section_id, roll_no, status')
        .eq('school_id', schoolId)
        .eq('status', 'active')
      if (error) throw error
      return data
    },
  })
}

export function StudentsPage() {
  const { primaryRole } = useAuth()
  const schoolId = primaryRole?.schoolId ?? null
  if (!schoolId) return null

  return (
    <Tabs defaultValue="roster">
      <TabsList>
        <TabsTrigger value="roster">Students</TabsTrigger>
        <TabsTrigger value="promotion">Promotion</TabsTrigger>
        <TabsTrigger value="transfer">Transfer</TabsTrigger>
      </TabsList>
      <TabsContent value="roster">
        <RosterPanel schoolId={schoolId} />
      </TabsContent>
      <TabsContent value="promotion">
        <PromotionPanel schoolId={schoolId} />
      </TabsContent>
      <TabsContent value="transfer">
        <TransferPanel schoolId={schoolId} />
      </TabsContent>
    </Tabs>
  )
}

const admissionSchema = z.object({
  admission_no: z.string().min(1, 'Admission number is required.'),
  first_name: z.string().min(1, 'First name is required.'),
  middle_name: z.string().optional(),
  last_name: z.string().optional(),
  date_of_birth: z.string().optional(),
  gender: z.string().optional(),
  guardian_name: z.string().optional(),
  guardian_phone: z.string().optional(),
  academic_year_id: z.string().min(1, 'Academic year is required.'),
  class_id: z.string().min(1, 'Class is required.'),
  section_id: z.string().optional(),
  roll_no: z.string().optional(),
})
type AdmissionValues = z.infer<typeof admissionSchema>

function RosterPanel({ schoolId }: { schoolId: string }) {
  const queryClient = useQueryClient()
  const { data: years } = useAcademicYears(schoolId)
  const { data: classes } = useClasses(schoolId)
  const { data: sections } = useSections(schoolId)
  const { data: students, isLoading } = useStudents(schoolId)
  const { data: enrollments } = useActiveEnrollments(schoolId)
  const [open, setOpen] = React.useState(false)
  const [docsStudentId, setDocsStudentId] = React.useState<string | null>(null)

  const enrollmentByStudent = React.useMemo(
    () => new Map((enrollments ?? []).map((e) => [e.student_id, e])),
    [enrollments],
  )
  const classById = React.useMemo(() => new Map((classes ?? []).map((c) => [c.id, c])), [classes])
  const sectionById = React.useMemo(() => new Map((sections ?? []).map((s) => [s.id, s])), [sections])

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<AdmissionValues>({
    resolver: zodResolver(admissionSchema),
    defaultValues: { academic_year_id: years?.find((y) => y.is_active)?.id ?? '' },
  })
  const classId = watch('class_id')

  const admit = useMutation({
    mutationFn: async (values: AdmissionValues) => {
      const { error } = await supabase.rpc('create_student_admission', {
        p_school_id: schoolId,
        p_student: {
          admission_no: values.admission_no,
          first_name: values.first_name,
          middle_name: values.middle_name || null,
          last_name: values.last_name || null,
          date_of_birth: values.date_of_birth || null,
          gender: values.gender || null,
          guardian_name: values.guardian_name || null,
          guardian_phone: values.guardian_phone || null,
        },
        p_academic_year_id: values.academic_year_id,
        p_class_id: values.class_id,
        p_section_id: values.section_id || null,
        p_roll_no: values.roll_no || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Student admitted.')
      setOpen(false)
      reset()
      void queryClient.invalidateQueries({ queryKey: ['students', schoolId] })
      void queryClient.invalidateQueries({ queryKey: ['student-enrollments-active', schoolId] })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to admit student.'),
  })

  return (
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Admit student</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Admit a new student</DialogTitle>
              <DialogDescription>Creates the student record and their first class enrollment.</DialogDescription>
            </DialogHeader>
            <form className="flex flex-col gap-4" onSubmit={handleSubmit((v) => admit.mutate(v))} noValidate>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="admission_no">Admission No.</Label>
                  <Input id="admission_no" {...register('admission_no')} />
                  {errors.admission_no ? (
                    <p className="text-xs text-destructive">{errors.admission_no.message}</p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="first_name">First name</Label>
                  <Input id="first_name" {...register('first_name')} />
                  {errors.first_name ? <p className="text-xs text-destructive">{errors.first_name.message}</p> : null}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="middle_name">Middle name</Label>
                  <Input id="middle_name" {...register('middle_name')} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="last_name">Last name</Label>
                  <Input id="last_name" {...register('last_name')} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="date_of_birth">Date of birth</Label>
                  <Input id="date_of_birth" type="date" {...register('date_of_birth')} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="gender">Gender</Label>
                  <Input id="gender" {...register('gender')} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="guardian_name">Guardian name</Label>
                  <Input id="guardian_name" {...register('guardian_name')} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="guardian_phone">Guardian phone</Label>
                  <Input id="guardian_phone" {...register('guardian_phone')} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="academic_year_id">Academic year</Label>
                  <select
                    id="academic_year_id"
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                    {...register('academic_year_id')}
                  >
                    <option value="">Select…</option>
                    {years?.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.name}
                        {y.is_active ? ' (active)' : ''}
                      </option>
                    ))}
                  </select>
                  {errors.academic_year_id ? (
                    <p className="text-xs text-destructive">{errors.academic_year_id.message}</p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="class_id">Class</Label>
                  <select
                    id="class_id"
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                    {...register('class_id')}
                  >
                    <option value="">Select…</option>
                    {classes?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {errors.class_id ? <p className="text-xs text-destructive">{errors.class_id.message}</p> : null}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="section_id">Section</Label>
                  <select
                    id="section_id"
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                    {...register('section_id')}
                  >
                    <option value="">None</option>
                    {sections
                      ?.filter((s) => s.class_id === classId)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="roll_no">Roll no.</Label>
                  <Input id="roll_no" {...register('roll_no')} />
                </div>
              </div>

              <DialogFooter>
                <Button type="submit" disabled={admit.isPending}>
                  {admit.isPending ? 'Admitting…' : 'Admit student'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {!isLoading && students?.length === 0 ? (
        <Card>
          <CardContent className="pt-5 text-sm text-muted-foreground">
            No students yet. Admit one to get started.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {students?.map((s) => {
          const enrollment = enrollmentByStudent.get(s.id)
          const klass = enrollment ? classById.get(enrollment.class_id) : undefined
          const section = enrollment?.section_id ? sectionById.get(enrollment.section_id) : undefined
          return (
            <Card key={s.id}>
              <CardContent className="flex flex-col gap-1 pt-5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{fullName(s)}</p>
                  <Badge variant={s.status === 'active' ? 'success' : 'outline'}>{s.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Admission No: {s.admission_no}</p>
                <p className="text-xs text-muted-foreground">
                  {klass ? klass.name : 'Unassigned'}
                  {section ? ` - ${section.name}` : ''}
                  {enrollment?.roll_no ? ` · Roll ${enrollment.roll_no}` : ''}
                </p>
                {s.guardian_name ? (
                  <p className="text-xs text-muted-foreground">
                    Guardian: {s.guardian_name} {s.guardian_phone ? `(${s.guardian_phone})` : ''}
                  </p>
                ) : null}
                <Button variant="outline" size="sm" className="mt-2 w-fit" onClick={() => setDocsStudentId(s.id)}>
                  Documents
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {docsStudentId ? (
        <StudentDocumentsDialog schoolId={schoolId} studentId={docsStudentId} onClose={() => setDocsStudentId(null)} />
      ) : null}
    </div>
  )
}

interface DocumentRow {
  id: string
  doc_type: string
  storage_path: string
  file_size: number | null
  mime_type: string | null
  created_at: string
}

function StudentDocumentsDialog({
  schoolId,
  studentId,
  onClose,
}: {
  schoolId: string
  studentId: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [docType, setDocType] = React.useState('')
  const [file, setFile] = React.useState<File | null>(null)

  const { data: documents, isLoading } = useQuery({
    queryKey: ['student-documents', studentId],
    queryFn: async (): Promise<DocumentRow[]> => {
      const { data, error } = await supabase
        .from('student_documents')
        .select('id, doc_type, storage_path, file_size, mime_type, created_at')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })

  const upload = useMutation({
    mutationFn: async () => {
      if (!file || !docType) throw new Error('Pick a document type and a file.')
      const path = `${schoolId}/${studentId}/${Date.now()}-${file.name}`
      const { error: uploadErr } = await supabase.storage.from('student-documents').upload(path, file)
      if (uploadErr) throw uploadErr

      const { error } = await supabase.from('student_documents').insert({
        school_id: schoolId,
        student_id: studentId,
        doc_type: docType,
        storage_path: path,
        file_size: file.size,
        mime_type: file.type,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Document uploaded.')
      setDocType('')
      setFile(null)
      void queryClient.invalidateQueries({ queryKey: ['student-documents', studentId] })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to upload document.'),
  })

  const download = useMutation({
    mutationFn: async (path: string) => {
      const { data, error } = await supabase.storage.from('student-documents').createSignedUrl(path, 60)
      if (error) throw error
      return data.signedUrl
    },
    onSuccess: (url) => window.open(url, '_blank'),
  })

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Student documents</DialogTitle>
          <DialogDescription>Birth certificate, transfer certificate, ID proof, etc.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-end gap-2">
          <Input placeholder="Document type" value={docType} onChange={(e) => setDocType(e.target.value)} />
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
          <Button size="sm" onClick={() => upload.mutate()} disabled={upload.isPending || !file || !docType}>
            Upload
          </Button>
        </div>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        <div className="flex flex-col gap-2">
          {documents?.map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
              <span>{d.doc_type}</span>
              <Button variant="outline" size="sm" onClick={() => download.mutate(d.storage_path)}>
                Download
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PromotionPanel({ schoolId }: { schoolId: string }) {
  const queryClient = useQueryClient()
  const { data: years } = useAcademicYears(schoolId)
  const { data: classes } = useClasses(schoolId)
  const { data: sections } = useSections(schoolId)
  const { data: students } = useStudents(schoolId)
  const { data: enrollments } = useActiveEnrollments(schoolId)

  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [destYear, setDestYear] = React.useState('')
  const [destClass, setDestClass] = React.useState('')
  const [destSection, setDestSection] = React.useState('')

  const enrollmentByStudent = React.useMemo(
    () => new Map((enrollments ?? []).map((e) => [e.student_id, e])),
    [enrollments],
  )
  const classById = React.useMemo(() => new Map((classes ?? []).map((c) => [c.id, c])), [classes])

  const toggle = (studentId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(studentId)) next.delete(studentId)
      else next.add(studentId)
      return next
    })
  }

  const promote = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('promote_students', {
        p_school_id: schoolId,
        p_student_ids: Array.from(selected),
        p_dest_academic_year_id: destYear,
        p_dest_class_id: destClass,
        p_dest_section_id: destSection || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Students promoted.')
      setSelected(new Set())
      void queryClient.invalidateQueries({ queryKey: ['student-enrollments-active', schoolId] })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to promote students.'),
  })

  return (
    <div className="flex flex-col gap-4 pt-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-5">
          <div className="flex flex-col gap-1">
            <Label>Destination year</Label>
            <select
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={destYear}
              onChange={(e) => setDestYear(e.target.value)}
            >
              <option value="">Select…</option>
              {years?.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Destination class</Label>
            <select
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={destClass}
              onChange={(e) => setDestClass(e.target.value)}
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
            <Label>Destination section</Label>
            <select
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={destSection}
              onChange={(e) => setDestSection(e.target.value)}
            >
              <option value="">None</option>
              {sections
                ?.filter((s) => s.class_id === destClass)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </div>
          <Button
            onClick={() => promote.mutate()}
            disabled={promote.isPending || selected.size === 0 || !destYear || !destClass}
          >
            {promote.isPending ? 'Promoting…' : `Promote ${selected.size} student(s)`}
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        {students?.map((s) => {
          const enrollment = enrollmentByStudent.get(s.id)
          const klass = enrollment ? classById.get(enrollment.class_id) : undefined
          return (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
              <span>
                {fullName(s)} ({s.admission_no}) - {klass?.name ?? 'Unassigned'}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

interface SchoolOption {
  id: string
  name: string
}
interface TransferRow {
  id: string
  source_school_id: string
  destination_school_id: string
  student_id: string
  status: string
  notes: string | null
  created_at: string
}

function TransferPanel({ schoolId }: { schoolId: string }) {
  const queryClient = useQueryClient()
  const { data: students } = useStudents(schoolId)
  const { data: years } = useAcademicYears(schoolId)
  const { data: classes } = useClasses(schoolId)
  const { data: sections } = useSections(schoolId)

  const { data: schools } = useQuery({
    queryKey: ['schools-options-transfer'],
    queryFn: async (): Promise<SchoolOption[]> => {
      const { data, error } = await supabase.from('schools').select('id, name').neq('id', schoolId)
      if (error) throw error
      return data
    },
  })

  const { data: outgoing } = useQuery({
    queryKey: ['outgoing-transfers', schoolId],
    queryFn: async (): Promise<TransferRow[]> => {
      const { data, error } = await supabase
        .from('student_transfers')
        .select('*')
        .eq('source_school_id', schoolId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
  const { data: incoming } = useQuery({
    queryKey: ['incoming-transfers', schoolId],
    queryFn: async (): Promise<TransferRow[]> => {
      const { data, error } = await supabase
        .from('student_transfers')
        .select('*')
        .eq('destination_school_id', schoolId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })

  const [studentId, setStudentId] = React.useState('')
  const [destSchoolId, setDestSchoolId] = React.useState('')
  const [notes, setNotes] = React.useState('')

  const initiate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('initiate_student_transfer', {
        p_source_school_id: schoolId,
        p_student_id: studentId,
        p_destination_school_id: destSchoolId,
        p_notes: notes || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Transfer initiated.')
      setStudentId('')
      setNotes('')
      void queryClient.invalidateQueries({ queryKey: ['outgoing-transfers', schoolId] })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to initiate transfer.'),
  })

  const [acceptingId, setAcceptingId] = React.useState<string | null>(null)
  const [newAdmissionNo, setNewAdmissionNo] = React.useState('')
  const [acceptYear, setAcceptYear] = React.useState('')
  const [acceptClass, setAcceptClass] = React.useState('')
  const [acceptSection, setAcceptSection] = React.useState('')

  const accept = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('accept_student_transfer', {
        p_transfer_id: acceptingId!,
        p_new_admission_no: newAdmissionNo,
        p_academic_year_id: acceptYear,
        p_class_id: acceptClass,
        p_section_id: acceptSection || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Transfer accepted.')
      setAcceptingId(null)
      setNewAdmissionNo('')
      void queryClient.invalidateQueries({ queryKey: ['incoming-transfers', schoolId] })
      void queryClient.invalidateQueries({ queryKey: ['students', schoolId] })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to accept transfer.'),
  })

  const reject = useMutation({
    mutationFn: async (transferId: string) => {
      const { error } = await supabase.rpc('reject_student_transfer', { p_transfer_id: transferId })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Transfer rejected.')
      void queryClient.invalidateQueries({ queryKey: ['incoming-transfers', schoolId] })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to reject transfer.'),
  })

  return (
    <div className="flex flex-col gap-4 pt-4">
      <Card>
        <CardContent className="flex flex-col gap-3 pt-5">
          <p className="text-sm font-medium">Initiate outgoing transfer</p>
          <div className="flex flex-wrap items-end gap-2">
            <select
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            >
              <option value="">Student…</option>
              {students?.map((s) => (
                <option key={s.id} value={s.id}>
                  {fullName(s)} ({s.admission_no})
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={destSchoolId}
              onChange={(e) => setDestSchoolId(e.target.value)}
            >
              <option value="">Destination school…</option>
              {schools?.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.name}
                </option>
              ))}
            </select>
            <Input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <Button onClick={() => initiate.mutate()} disabled={initiate.isPending || !studentId || !destSchoolId}>
              Initiate
            </Button>
          </div>
        </CardContent>
      </Card>

      <div>
        <p className="mb-2 text-sm font-medium">Outgoing transfers</p>
        <div className="flex flex-col gap-2">
          {outgoing?.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
              <span>{fullName(students?.find((s) => s.id === t.student_id) ?? { first_name: 'Student', middle_name: null, last_name: null })}</span>
              <Badge variant={t.status === 'accepted' ? 'success' : t.status === 'rejected' ? 'destructive' : 'outline'}>
                {t.status}
              </Badge>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Incoming transfer requests</p>
        <div className="flex flex-col gap-2">
          {incoming?.length === 0 ? <p className="text-sm text-muted-foreground">None pending.</p> : null}
          {incoming?.map((t) => (
            <Card key={t.id}>
              <CardContent className="flex flex-col gap-2 pt-5 text-sm">
                <span>Transfer request {t.notes ? `- ${t.notes}` : ''}</span>
                {acceptingId === t.id ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <Input
                      placeholder="New admission no."
                      value={newAdmissionNo}
                      onChange={(e) => setNewAdmissionNo(e.target.value)}
                    />
                    <select
                      className="h-9 rounded-md border border-input bg-transparent px-2 text-xs"
                      value={acceptYear}
                      onChange={(e) => setAcceptYear(e.target.value)}
                    >
                      <option value="">Year…</option>
                      {years?.map((y) => (
                        <option key={y.id} value={y.id}>
                          {y.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className="h-9 rounded-md border border-input bg-transparent px-2 text-xs"
                      value={acceptClass}
                      onChange={(e) => setAcceptClass(e.target.value)}
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
                      value={acceptSection}
                      onChange={(e) => setAcceptSection(e.target.value)}
                    >
                      <option value="">Section…</option>
                      {sections
                        ?.filter((s) => s.class_id === acceptClass)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                    <Button
                      size="sm"
                      onClick={() => accept.mutate()}
                      disabled={accept.isPending || !newAdmissionNo || !acceptYear || !acceptClass}
                    >
                      Confirm accept
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setAcceptingId(t.id)}>
                      Accept
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => reject.mutate(t.id)} disabled={reject.isPending}>
                      Reject
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
