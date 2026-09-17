import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

interface AcademicYear {
  id: string
  name: string
  start_date: string
  end_date: string
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
interface Subject {
  id: string
  name: string
  code: string | null
}

function useAcademicYears(schoolId: string) {
  return useQuery({
    queryKey: ['academic-years', schoolId],
    queryFn: async (): Promise<AcademicYear[]> => {
      const { data, error } = await supabase
        .from('academic_years')
        .select('id, name, start_date, end_date, is_active')
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

function useSubjects(schoolId: string) {
  return useQuery({
    queryKey: ['subjects', schoolId],
    queryFn: async (): Promise<Subject[]> => {
      const { data, error } = await supabase
        .from('subjects')
        .select('id, name, code')
        .eq('school_id', schoolId)
        .order('name')
      if (error) throw error
      return data
    },
  })
}

export function AcademicsPage() {
  const { primaryRole } = useAuth()
  const schoolId = primaryRole?.schoolId ?? null
  if (!schoolId) return null

  return (
    <Tabs defaultValue="years">
      <TabsList>
        <TabsTrigger value="years">Academic Years</TabsTrigger>
        <TabsTrigger value="classes">Classes</TabsTrigger>
        <TabsTrigger value="sections">Sections</TabsTrigger>
        <TabsTrigger value="subjects">Subjects</TabsTrigger>
        <TabsTrigger value="mapping">Subject Mapping</TabsTrigger>
      </TabsList>
      <TabsContent value="years">
        <AcademicYearsPanel schoolId={schoolId} />
      </TabsContent>
      <TabsContent value="classes">
        <ClassesPanel schoolId={schoolId} />
      </TabsContent>
      <TabsContent value="sections">
        <SectionsPanel schoolId={schoolId} />
      </TabsContent>
      <TabsContent value="subjects">
        <SubjectsPanel schoolId={schoolId} />
      </TabsContent>
      <TabsContent value="mapping">
        <SubjectMappingPanel schoolId={schoolId} />
      </TabsContent>
    </Tabs>
  )
}

function AcademicYearsPanel({ schoolId }: { schoolId: string }) {
  const queryClient = useQueryClient()
  const { data: years, isLoading } = useAcademicYears(schoolId)
  const [name, setName] = React.useState('')
  const [start, setStart] = React.useState('')
  const [end, setEnd] = React.useState('')

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('academic_years')
        .insert({ school_id: schoolId, name, start_date: start, end_date: end })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Academic year created.')
      setName('')
      setStart('')
      setEnd('')
      void queryClient.invalidateQueries({ queryKey: ['academic-years', schoolId] })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create academic year.'),
  })

  const setActive = useMutation({
    mutationFn: async (yearId: string) => {
      // Not fully transactional (two sequential client calls) - acceptable for a
      // single School Admin managing their own school; a security-definer RPC
      // could tighten this later if concurrent admins become a concern.
      const currentlyActive = years?.find((y) => y.is_active)
      if (currentlyActive && currentlyActive.id !== yearId) {
        const { error } = await supabase
          .from('academic_years')
          .update({ is_active: false })
          .eq('id', currentlyActive.id)
        if (error) throw error
      }
      const { error } = await supabase.from('academic_years').update({ is_active: true }).eq('id', yearId)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['academic-years', schoolId] }),
    onError: (err: Error) => toast.error(err.message || 'Failed to set active academic year.'),
  })

  return (
    <div className="flex flex-col gap-4 pt-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-5">
          <Input placeholder="e.g. 2027-28" value={name} onChange={(e) => setName(e.target.value)} className="w-32" />
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || !name || !start || !end}
          >
            Add academic year
          </Button>
        </CardContent>
      </Card>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {years?.map((y) => (
          <Card key={y.id}>
            <CardContent className="flex items-center justify-between gap-2 pt-5">
              <div>
                <p className="font-medium">{y.name}</p>
                <p className="text-xs text-muted-foreground">
                  {y.start_date} – {y.end_date}
                </p>
              </div>
              {y.is_active ? (
                <Badge variant="success">Active</Badge>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setActive.mutate(y.id)} disabled={setActive.isPending}>
                  Set active
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function ClassesPanel({ schoolId }: { schoolId: string }) {
  const queryClient = useQueryClient()
  const { data: classes, isLoading } = useClasses(schoolId)
  const [name, setName] = React.useState('')

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('classes').insert({ school_id: schoolId, name })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Class added.')
      setName('')
      void queryClient.invalidateQueries({ queryKey: ['classes', schoolId] })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to add class.'),
  })

  return (
    <div className="flex flex-col gap-4 pt-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-5">
          <Input placeholder="e.g. Class 11" value={name} onChange={(e) => setName(e.target.value)} />
          <Button onClick={() => create.mutate()} disabled={create.isPending || !name}>
            Add class
          </Button>
        </CardContent>
      </Card>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      <div className="flex flex-wrap gap-2">
        {classes?.map((c) => (
          <Badge key={c.id} variant="secondary" className="text-sm">
            {c.name}
          </Badge>
        ))}
      </div>
    </div>
  )
}

function SectionsPanel({ schoolId }: { schoolId: string }) {
  const queryClient = useQueryClient()
  const { data: classes } = useClasses(schoolId)
  const { data: sections, isLoading } = useSections(schoolId)
  const [name, setName] = React.useState('')
  const [classId, setClassId] = React.useState('')

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('sections').insert({ school_id: schoolId, class_id: classId, name })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Section added.')
      setName('')
      void queryClient.invalidateQueries({ queryKey: ['sections', schoolId] })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to add section.'),
  })

  return (
    <div className="flex flex-col gap-4 pt-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-5">
          <select
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
          >
            <option value="">Select class…</option>
            {classes?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Input placeholder="e.g. E" value={name} onChange={(e) => setName(e.target.value)} className="w-24" />
          <Button onClick={() => create.mutate()} disabled={create.isPending || !name || !classId}>
            Add section
          </Button>
        </CardContent>
      </Card>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      <div className="flex flex-col gap-2">
        {classes?.map((c) => (
          <div key={c.id} className="flex items-center gap-2 text-sm">
            <span className="font-medium">{c.name}:</span>
            {sections
              ?.filter((s) => s.class_id === c.id)
              .map((s) => (
                <Badge key={s.id} variant="outline">
                  {s.name}
                </Badge>
              ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function SubjectMappingPanel({ schoolId }: { schoolId: string }) {
  const queryClient = useQueryClient()
  const { data: years } = useAcademicYears(schoolId)
  const { data: classes } = useClasses(schoolId)
  const { data: subjects } = useSubjects(schoolId)
  const [yearIdOverride, setYearIdOverride] = React.useState('')
  const [classId, setClassId] = React.useState('')

  // Default to the active academic year until the user explicitly picks one -
  // derived during render rather than synced via an effect.
  const yearId = yearIdOverride || years?.find((y) => y.is_active)?.id || years?.[0]?.id || ''

  const { data: mappedSubjectIds } = useQuery({
    queryKey: ['class-subjects', schoolId, yearId, classId],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from('class_subjects')
        .select('subject_id')
        .eq('school_id', schoolId)
        .eq('academic_year_id', yearId)
        .eq('class_id', classId)
      if (error) throw error
      return new Set(data.map((row) => row.subject_id))
    },
    enabled: !!yearId && !!classId,
  })

  const toggle = useMutation({
    mutationFn: async ({ subjectId, next }: { subjectId: string; next: boolean }) => {
      if (next) {
        const { error } = await supabase
          .from('class_subjects')
          .insert({ school_id: schoolId, academic_year_id: yearId, class_id: classId, subject_id: subjectId })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('class_subjects')
          .delete()
          .eq('school_id', schoolId)
          .eq('academic_year_id', yearId)
          .eq('class_id', classId)
          .eq('subject_id', subjectId)
        if (error) throw error
      }
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['class-subjects', schoolId, yearId, classId] }),
    onError: (err: Error) => toast.error(err.message || 'Failed to update subject mapping.'),
  })

  return (
    <div className="flex flex-col gap-4 pt-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-5">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Academic year</label>
            <select
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={yearId}
              onChange={(e) => setYearIdOverride(e.target.value)}
            >
              {years?.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                  {y.is_active ? ' (active)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Class</label>
            <select
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
            >
              <option value="">Select class…</option>
              {classes?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {classId && yearId ? (
        <Card>
          <CardContent className="flex flex-col gap-2 pt-5">
            {subjects?.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add subjects first, then map them here.</p>
            ) : null}
            {subjects?.map((s) => {
              const isMapped = mappedSubjectIds?.has(s.id) ?? false
              return (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isMapped}
                    disabled={toggle.isPending}
                    onChange={() => toggle.mutate({ subjectId: s.id, next: !isMapped })}
                  />
                  <span>{s.name}</span>
                </label>
              )
            })}
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">Select an academic year and class to map subjects.</p>
      )}
    </div>
  )
}

function SubjectsPanel({ schoolId }: { schoolId: string }) {
  const queryClient = useQueryClient()
  const { data: subjects, isLoading } = useSubjects(schoolId)
  const [name, setName] = React.useState('')

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('subjects').insert({ school_id: schoolId, name })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Subject added.')
      setName('')
      void queryClient.invalidateQueries({ queryKey: ['subjects', schoolId] })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to add subject.'),
  })

  return (
    <div className="flex flex-col gap-4 pt-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-5">
          <Input placeholder="e.g. Physics" value={name} onChange={(e) => setName(e.target.value)} />
          <Button onClick={() => create.mutate()} disabled={create.isPending || !name}>
            Add subject
          </Button>
        </CardContent>
      </Card>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      <div className="flex flex-wrap gap-2">
        {subjects?.map((s) => (
          <Badge key={s.id} variant="secondary" className="text-sm">
            {s.name}
          </Badge>
        ))}
      </div>
    </div>
  )
}
