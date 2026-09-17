import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { toast } from 'sonner'

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type HomeworkRow = Database['public']['Tables']['homework']['Row']
type MaterialRow = Database['public']['Tables']['study_materials']['Row']

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
    queryKey: ['own-teacher-assignments-homework', schoolId, user?.id],
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

export function TeacherHomeworkPage() {
  const { primaryRole } = useAuth()
  const schoolId = primaryRole?.schoolId ?? null
  if (!schoolId) return null

  return (
    <Tabs defaultValue="homework">
      <TabsList>
        <TabsTrigger value="homework">Homework</TabsTrigger>
        <TabsTrigger value="materials">Study Materials</TabsTrigger>
      </TabsList>
      <TabsContent value="homework">
        <HomeworkPanel schoolId={schoolId} />
      </TabsContent>
      <TabsContent value="materials">
        <MaterialsPanel schoolId={schoolId} />
      </TabsContent>
    </Tabs>
  )
}

function HomeworkPanel({ schoolId }: { schoolId: string }) {
  const queryClient = useQueryClient()
  const { data: assignments } = useOwnAssignments(schoolId)
  const [open, setOpen] = React.useState(false)
  const [assignmentKey, setAssignmentKey] = React.useState('')
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [dueDate, setDueDate] = React.useState('')
  const [attachmentUrl, setAttachmentUrl] = React.useState('')

  const assignment = assignments?.find(
    (a) => `${a.class_id}:${a.section_id ?? ''}:${a.subject_id ?? ''}` === assignmentKey,
  )

  const { data: homework, isLoading } = useQuery({
    queryKey: ['homework', schoolId],
    queryFn: async (): Promise<HomeworkRow[]> => {
      const { data, error } = await supabase
        .from('homework')
        .select('*')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })

  const create = useMutation({
    mutationFn: async () => {
      if (!assignment?.subject_id) throw new Error('Select a class/section/subject assignment.')
      const { error } = await supabase.from('homework').insert({
        school_id: schoolId,
        academic_year_id: assignment.academic_year_id,
        class_id: assignment.class_id,
        section_id: assignment.section_id,
        subject_id: assignment.subject_id,
        title,
        description: description || null,
        due_date: dueDate || null,
        attachment_url: attachmentUrl || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Homework posted.')
      setOpen(false)
      setTitle('')
      setDescription('')
      setDueDate('')
      setAttachmentUrl('')
      void queryClient.invalidateQueries({ queryKey: ['homework', schoolId] })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to post homework.'),
  })

  return (
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Post homework</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Post homework</DialogTitle>
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
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Description</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Due date</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Attachment link (optional)</Label>
                <Input value={attachmentUrl} onChange={(e) => setAttachmentUrl(e.target.value)} placeholder="https://…" />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => create.mutate()} disabled={create.isPending || !assignment || !title}>
                Post
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {homework?.map((h) => (
          <Card key={h.id}>
            <CardHeader>
              <CardTitle className="text-base">{h.title}</CardTitle>
              <CardDescription>{h.due_date ? `Due ${h.due_date}` : 'No due date'}</CardDescription>
            </CardHeader>
            {h.description ? (
              <CardContent className="text-sm text-muted-foreground">{h.description}</CardContent>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  )
}

function MaterialsPanel({ schoolId }: { schoolId: string }) {
  const queryClient = useQueryClient()
  const { data: assignments } = useOwnAssignments(schoolId)
  const [assignmentKey, setAssignmentKey] = React.useState('')
  const [title, setTitle] = React.useState('')
  const [file, setFile] = React.useState<File | null>(null)

  const assignment = assignments?.find((a) => `${a.class_id}:${a.section_id ?? ''}` === assignmentKey)

  const { data: materials, isLoading } = useQuery({
    queryKey: ['study-materials', schoolId],
    queryFn: async (): Promise<MaterialRow[]> => {
      const { data, error } = await supabase
        .from('study_materials')
        .select('*')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })

  const upload = useMutation({
    mutationFn: async () => {
      if (!file || !assignment) throw new Error('Select a class and a file.')
      const path = `${schoolId}/${assignment.class_id}/${Date.now()}-${file.name}`
      const { error: uploadErr } = await supabase.storage.from('study-materials').upload(path, file)
      if (uploadErr) throw uploadErr

      const { error } = await supabase.from('study_materials').insert({
        school_id: schoolId,
        class_id: assignment.class_id,
        section_id: assignment.section_id,
        subject_id: assignment.subject_id,
        title: title || file.name,
        storage_path: path,
        file_size: file.size,
        mime_type: file.type,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Material uploaded.')
      setTitle('')
      setFile(null)
      void queryClient.invalidateQueries({ queryKey: ['study-materials', schoolId] })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to upload material.'),
  })

  return (
    <div className="flex flex-col gap-4 pt-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-5">
          <div className="flex flex-col gap-1">
            <Label>Class / Section</Label>
            <select
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={assignmentKey}
              onChange={(e) => setAssignmentKey(e.target.value)}
            >
              <option value="">Select…</option>
              {assignments?.map((a) => (
                <option key={`${a.class_id}:${a.section_id ?? ''}`} value={`${a.class_id}:${a.section_id ?? ''}`}>
                  {a.class_name}
                  {a.section_name ? ` - ${a.section_name}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label>File</Label>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
          </div>
          <Button onClick={() => upload.mutate()} disabled={upload.isPending || !assignment || !file}>
            {upload.isPending ? 'Uploading…' : 'Upload'}
          </Button>
        </CardContent>
      </Card>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      <div className="flex flex-col gap-2">
        {materials?.map((m) => (
          <Card key={m.id}>
            <CardContent className="flex items-center justify-between pt-5 text-sm">
              <span>{m.title}</span>
              <span className="text-xs text-muted-foreground">
                {m.mime_type} · {m.file_size ? `${Math.round(m.file_size / 1024)} KB` : ''}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
