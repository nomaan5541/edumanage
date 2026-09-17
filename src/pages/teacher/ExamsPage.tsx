import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import type { Database, ExamType } from '@/types/database'

type ExamRow = Database['public']['Tables']['exams']['Row']
type MarksRoster = { student_id: string; admission_no: string; first_name: string; last_name: string | null }

const EXAM_TYPES: ExamType[] = ['FA1', 'FA2', 'MID', 'FA3', 'FA4', 'FINAL']

interface Assignment {
  academic_year_id: string
  class_id: string
  class_name: string
  section_id: string | null
  section_name: string | null
  subject_id: string | null
  subject_name: string | null
}

function useOwnAssignments(schoolId: string | null) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['own-teacher-assignments-exams', schoolId, user?.id],
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
        .select('academic_year_id, class_id, section_id, subject_id, classes(name), sections(name), subjects(name)')
        .eq('teacher_id', teacher.id)
      if (error) throw error
      return data.map((row) => ({
        academic_year_id: row.academic_year_id,
        class_id: row.class_id,
        class_name: (row.classes as unknown as { name: string } | null)?.name ?? 'Unknown class',
        section_id: row.section_id,
        section_name: (row.sections as unknown as { name: string } | null)?.name ?? null,
        subject_id: row.subject_id,
        subject_name: (row.subjects as unknown as { name: string } | null)?.name ?? null,
      }))
    },
    enabled: !!schoolId && !!user?.id,
  })
}

function useExams(schoolId: string | null) {
  return useQuery({
    queryKey: ['exams', schoolId],
    queryFn: async (): Promise<ExamRow[]> => {
      const { data, error } = await supabase
        .from('exams')
        .select('*')
        .eq('school_id', schoolId ?? '')
        .order('exam_date', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!schoolId,
  })
}

export function TeacherExamsPage() {
  const { primaryRole } = useAuth()
  const schoolId = primaryRole?.schoolId ?? null
  const queryClient = useQueryClient()
  const { data: assignments } = useOwnAssignments(schoolId)
  const { data: exams } = useExams(schoolId)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [markingExam, setMarkingExam] = React.useState<ExamRow | null>(null)

  const [assignmentKey, setAssignmentKey] = React.useState('')
  const [examType, setExamType] = React.useState<ExamType>('FA1')
  const [name, setName] = React.useState('')
  const [maxMarks, setMaxMarks] = React.useState('100')
  const [examDate, setExamDate] = React.useState('')
  const [duration, setDuration] = React.useState('')

  const assignment = assignments?.find((a) => `${a.class_id}:${a.section_id ?? ''}:${a.subject_id ?? ''}` === assignmentKey)

  const create = useMutation({
    mutationFn: async () => {
      if (!assignment?.subject_id) throw new Error('Select a class/section/subject assignment.')
      const { error } = await supabase.rpc('create_exam', {
        p_school_id: schoolId!,
        p_academic_year_id: assignment.academic_year_id,
        p_class_id: assignment.class_id,
        p_section_id: assignment.section_id,
        p_subject_id: assignment.subject_id,
        p_exam_type: examType,
        p_name: name,
        p_max_marks: Number(maxMarks),
        p_exam_date: examDate,
        p_duration_minutes: duration ? Number(duration) : null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Exam created.')
      setCreateOpen(false)
      setName('')
      setExamDate('')
      void queryClient.invalidateQueries({ queryKey: ['exams', schoolId] })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create exam.'),
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>Create exam</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create an exam</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Class / Section / Subject</Label>
                <select
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  value={assignmentKey}
                  onChange={(e) => setAssignmentKey(e.target.value)}
                >
                  <option value="">Select…</option>
                  {assignments
                    ?.filter((a) => a.subject_id)
                    .map((a) => (
                      <option
                        key={`${a.class_id}:${a.section_id ?? ''}:${a.subject_id ?? ''}`}
                        value={`${a.class_id}:${a.section_id ?? ''}:${a.subject_id ?? ''}`}
                      >
                        {a.class_name}
                        {a.section_name ? ` - ${a.section_name}` : ''} · {a.subject_name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Exam type</Label>
                <select
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  value={examType}
                  onChange={(e) => setExamType(e.target.value as ExamType)}
                >
                  {EXAM_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. FA1 Mathematics" />
              </div>
              <div className="flex gap-3">
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label>Max marks</Label>
                  <Input type="number" value={maxMarks} onChange={(e) => setMaxMarks(e.target.value)} />
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label>Duration (min)</Label>
                  <Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Exam date</Label>
                <Input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => create.mutate()} disabled={create.isPending || !assignment || !name || !examDate}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {exams?.map((e) => (
          <Card key={e.id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">{e.name}</CardTitle>
                <Badge variant={e.is_published ? 'success' : 'outline'}>
                  {e.is_published ? 'Published' : 'Draft'}
                </Badge>
              </div>
              <CardDescription>
                {e.exam_type} · {e.exam_date} · Max {e.max_marks}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" onClick={() => setMarkingExam(e)}>
                {e.is_published ? 'View marks' : 'Enter marks'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {markingExam ? (
        <MarksDialog schoolId={schoolId!} exam={markingExam} onClose={() => setMarkingExam(null)} />
      ) : null}
    </div>
  )
}

export function MarksDialog({ schoolId, exam, onClose }: { schoolId: string; exam: ExamRow; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: roster } = useQuery({
    queryKey: ['exam-roster', exam.id],
    queryFn: async (): Promise<MarksRoster[]> => {
      const { data, error } = await supabase
        .from('student_enrollments')
        .select('student_id, students(admission_no, first_name, last_name)')
        .eq('academic_year_id', exam.academic_year_id)
        .eq('class_id', exam.class_id)
        .eq('status', 'active')
      if (error) throw error
      return data.map((row) => {
        const student = row.students as unknown as { admission_no: string; first_name: string; last_name: string | null }
        return { student_id: row.student_id, admission_no: student.admission_no, first_name: student.first_name, last_name: student.last_name }
      })
    },
  })

  const { data: existingMarks } = useQuery({
    queryKey: ['exam-marks', exam.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('exam_marks').select('student_id, marks_obtained').eq('exam_id', exam.id)
      if (error) throw error
      return new Map(data.map((m) => [m.student_id, m.marks_obtained]))
    },
  })

  const [drafts, setDrafts] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    const next: Record<string, string> = {}
    for (const [studentId, marks] of existingMarks?.entries() ?? []) {
      next[studentId] = String(marks)
    }
    setDrafts(next)
  }, [existingMarks])

  const save = useMutation({
    mutationFn: async () => {
      const records = Object.entries(drafts)
        .filter(([, v]) => v !== '')
        .map(([student_id, marks]) => ({ student_id, marks_obtained: Number(marks) }))
      const { error } = await supabase.rpc('upsert_exam_marks', {
        p_school_id: schoolId,
        p_exam_id: exam.id,
        p_records: records,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Marks saved.')
      void queryClient.invalidateQueries({ queryKey: ['exam-marks', exam.id] })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to save marks.'),
  })

  const publish = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('publish_exam_results', { p_exam_id: exam.id })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Results published.')
      void queryClient.invalidateQueries({ queryKey: ['exams', schoolId] })
      onClose()
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to publish results.'),
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {exam.name} — marks (max {exam.max_marks})
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {roster?.map((r) => (
            <div key={r.student_id} className="flex items-center justify-between gap-2 text-sm">
              <span>
                {r.first_name} {r.last_name ?? ''} ({r.admission_no})
              </span>
              <Input
                type="number"
                min="0"
                max={exam.max_marks}
                className="w-24"
                disabled={exam.is_published}
                value={drafts[r.student_id] ?? ''}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [r.student_id]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          {!exam.is_published ? (
            <>
              <Button variant="outline" onClick={() => save.mutate()} disabled={save.isPending}>
                Save marks
              </Button>
              <Button onClick={() => publish.mutate()} disabled={publish.isPending}>
                Publish results
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
