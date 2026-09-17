import { useMutation, useQuery } from '@tanstack/react-query'
import * as React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import type { AppRole } from '@/types/database'

type TargetType = 'school' | 'role' | 'class' | 'section' | 'student' | 'teacher'

interface Klass {
  id: string
  name: string
}
interface Section {
  id: string
  name: string
  class_id: string
}
interface StudentOption {
  id: string
  admission_no: string
  first_name: string
}
interface TeacherOption {
  id: string
  full_name: string
}

const ROLES: AppRole[] = ['school_admin', 'sub_admin', 'teacher', 'student']

export function SchoolAdminNotificationsPage() {
  const { primaryRole } = useAuth()
  const schoolId = primaryRole?.schoolId ?? null

  const [title, setTitle] = React.useState('')
  const [body, setBody] = React.useState('')
  const [targetType, setTargetType] = React.useState<TargetType>('school')
  const [targetRole, setTargetRole] = React.useState<AppRole>('student')
  const [classId, setClassId] = React.useState('')
  const [sectionId, setSectionId] = React.useState('')
  const [studentId, setStudentId] = React.useState('')
  const [teacherId, setTeacherId] = React.useState('')

  const { data: classes } = useQuery({
    queryKey: ['classes', schoolId],
    queryFn: async (): Promise<Klass[]> => {
      const { data, error } = await supabase.from('classes').select('id, name').eq('school_id', schoolId ?? '')
      if (error) throw error
      return data
    },
    enabled: !!schoolId,
  })
  const { data: sections } = useQuery({
    queryKey: ['sections', schoolId],
    queryFn: async (): Promise<Section[]> => {
      const { data, error } = await supabase.from('sections').select('id, name, class_id').eq('school_id', schoolId ?? '')
      if (error) throw error
      return data
    },
    enabled: !!schoolId,
  })
  const { data: students } = useQuery({
    queryKey: ['students-options', schoolId],
    queryFn: async (): Promise<StudentOption[]> => {
      const { data, error } = await supabase
        .from('students')
        .select('id, admission_no, first_name')
        .eq('school_id', schoolId ?? '')
      if (error) throw error
      return data
    },
    enabled: !!schoolId && targetType === 'student',
  })
  const { data: teachers } = useQuery({
    queryKey: ['teachers-options', schoolId],
    queryFn: async (): Promise<TeacherOption[]> => {
      const { data, error } = await supabase.from('teachers').select('id, full_name').eq('school_id', schoolId ?? '')
      if (error) throw error
      return data
    },
    enabled: !!schoolId && targetType === 'teacher',
  })

  const send = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('send_notification', {
        p_school_id: schoolId!,
        p_title: title,
        p_body: body,
        p_target_type: targetType,
        p_target_role: targetType === 'role' ? targetRole : null,
        p_target_class_id: targetType === 'class' ? classId : null,
        p_target_section_id: targetType === 'section' ? sectionId : null,
        p_target_student_id: targetType === 'student' ? studentId : null,
        p_target_teacher_id: targetType === 'teacher' ? teacherId : null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Notification sent.')
      setTitle('')
      setBody('')
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to send notification.'),
  })

  if (!schoolId) return null

  const canSend =
    !!title &&
    !!body &&
    (targetType !== 'class' || !!classId) &&
    (targetType !== 'section' || !!sectionId) &&
    (targetType !== 'student' || !!studentId) &&
    (targetType !== 'teacher' || !!teacherId)

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-5">
        <div className="flex flex-col gap-1.5">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Message</Label>
          <Input value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Target</Label>
          <select
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            value={targetType}
            onChange={(e) => setTargetType(e.target.value as TargetType)}
          >
            <option value="school">Entire school</option>
            <option value="role">A role</option>
            <option value="class">A class</option>
            <option value="section">A section</option>
            <option value="student">An individual student</option>
            <option value="teacher">An individual teacher</option>
          </select>
        </div>

        {targetType === 'role' ? (
          <select
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value as AppRole)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        ) : null}

        {targetType === 'class' || targetType === 'section' ? (
          <select
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
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
        ) : null}

        {targetType === 'section' ? (
          <select
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
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
        ) : null}

        {targetType === 'student' ? (
          <select
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
          >
            <option value="">Student…</option>
            {students?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.first_name} ({s.admission_no})
              </option>
            ))}
          </select>
        ) : null}

        {targetType === 'teacher' ? (
          <select
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
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
        ) : null}

        <Button onClick={() => send.mutate()} disabled={send.isPending || !canSend}>
          {send.isPending ? 'Sending…' : 'Send notification'}
        </Button>
      </CardContent>
    </Card>
  )
}
