import { useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

// Telangana defaults per Spec Section 11 — editable, not hard-coded elsewhere in the app.
const DEFAULT_CLASSES = ['Nursery', 'LKG', 'UKG', ...Array.from({ length: 10 }, (_, i) => `Class ${i + 1}`)]
const DEFAULT_SECTIONS = ['A', 'B', 'C', 'D']
const DEFAULT_SUBJECTS = ['English', 'Telugu', 'Hindi', 'Mathematics', 'Science', 'Social Studies', 'EVS', 'Computer Science']

const STEPS = ['Academic Year', 'Classes', 'Sections', 'Subjects', 'Finish'] as const

function CheckboxList({
  options,
  selected,
  onToggle,
}: {
  options: string[]
  selected: Set<string>
  onToggle: (value: string) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {options.map((option) => (
        <label
          key={option}
          className={cn(
            'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm',
            selected.has(option) ? 'border-primary bg-primary/5' : 'border-border',
          )}
        >
          <input type="checkbox" checked={selected.has(option)} onChange={() => onToggle(option)} className="accent-current" />
          {option}
        </label>
      ))}
    </div>
  )
}

export function SetupWizardPage() {
  const { primaryRole } = useAuth()
  const schoolId = primaryRole?.schoolId ?? null
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [stepIndex, setStepIndex] = React.useState(0);
  const [busy, setBusy] = React.useState(false)

  const [yearName, setYearName] = React.useState('2026-27')
  const [startDate, setStartDate] = React.useState('2026-06-01')
  const [endDate, setEndDate] = React.useState('2027-04-30')
  const [academicYearId, setAcademicYearId] = React.useState<string | null>(null)

  const [selectedClasses, setSelectedClasses] = React.useState<Set<string>>(new Set(DEFAULT_CLASSES))
  const [customClass, setCustomClass] = React.useState('')

  const [selectedSections, setSelectedSections] = React.useState<Set<string>>(new Set(DEFAULT_SECTIONS))

  const [selectedSubjects, setSelectedSubjects] = React.useState<Set<string>>(new Set(DEFAULT_SUBJECTS))
  const [customSubject, setCustomSubject] = React.useState('')

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, value: string) {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    setter(next)
  }

  async function handleCreateAcademicYear() {
    if (!schoolId) return
    setBusy(true)
    try {
      const { data, error } = await supabase
        .from('academic_years')
        .insert({ school_id: schoolId, name: yearName, start_date: startDate, end_date: endDate, is_active: true })
        .select('id')
        .single()
      if (error) throw error
      setAcademicYearId(data.id)
      setStepIndex(1)
    } catch (err) {
      toast.error((err as Error).message || 'Failed to create academic year.')
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateClasses() {
    if (!schoolId) return
    setBusy(true)
    try {
      const rows = Array.from(selectedClasses).map((name, index) => ({ school_id: schoolId, name, sort_order: index }))
      if (rows.length === 0) throw new Error('Select at least one class.')
      const { error } = await supabase.from('classes').insert(rows)
      if (error) throw error
      setStepIndex(2)
    } catch (err) {
      toast.error((err as Error).message || 'Failed to create classes.')
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateSections() {
    if (!schoolId) return
    setBusy(true)
    try {
      const { data: classes, error: classesError } = await supabase
        .from('classes')
        .select('id')
        .eq('school_id', schoolId)
      if (classesError) throw classesError

      const rows = classes.flatMap((klass) =>
        Array.from(selectedSections).map((name) => ({ school_id: schoolId, class_id: klass.id, name })),
      )
      if (rows.length > 0) {
        const { error } = await supabase.from('sections').insert(rows)
        if (error) throw error
      }
      setStepIndex(3)
    } catch (err) {
      toast.error((err as Error).message || 'Failed to create sections.')
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateSubjects() {
    if (!schoolId) return
    setBusy(true)
    try {
      const rows = Array.from(selectedSubjects).map((name) => ({ school_id: schoolId, name }))
      if (rows.length > 0) {
        const { error } = await supabase.from('subjects').insert(rows)
        if (error) throw error
      }
      setStepIndex(4)
    } catch (err) {
      toast.error((err as Error).message || 'Failed to create subjects.')
    } finally {
      setBusy(false)
    }
  }

  function handleFinish() {
    void queryClient.invalidateQueries()
    navigate('/admin')
  }

  if (!schoolId) {
    return <p className="text-sm text-muted-foreground">No school is associated with your account yet.</p>
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <ol className="flex flex-wrap gap-2 text-xs font-medium text-muted-foreground">
        {STEPS.map((step, index) => (
          <li
            key={step}
            className={cn(
              'rounded-full border px-3 py-1',
              index === stepIndex && 'border-primary bg-primary/10 text-primary',
              index < stepIndex && 'border-success/40 bg-success/10 text-success',
            )}
          >
            {index + 1}. {step}
          </li>
        ))}
      </ol>

      {stepIndex === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Academic Year</CardTitle>
            <CardDescription>Every academic record will be tied to this academic year.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="year-name">Name</Label>
              <Input id="year-name" value={yearName} onChange={(e) => setYearName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="start-date">Start date</Label>
                <Input id="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="end-date">End date</Label>
                <Input id="end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <Button onClick={() => void handleCreateAcademicYear()} disabled={busy || !!academicYearId}>
              {academicYearId ? 'Created' : busy ? 'Creating…' : 'Create & continue'}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {stepIndex === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Classes</CardTitle>
            <CardDescription>Telangana defaults are pre-selected — deselect or add your own.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <CheckboxList
              options={Array.from(new Set([...DEFAULT_CLASSES, ...selectedClasses]))}
              selected={selectedClasses}
              onToggle={(value) => toggle(selectedClasses, setSelectedClasses, value)}
            />
            <div className="flex gap-2">
              <Input placeholder="Add a custom class" value={customClass} onChange={(e) => setCustomClass(e.target.value)} />
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (!customClass.trim()) return
                  setSelectedClasses(new Set([...selectedClasses, customClass.trim()]))
                  setCustomClass('')
                }}
              >
                Add
              </Button>
            </div>
            <Button onClick={() => void handleCreateClasses()} disabled={busy}>
              {busy ? 'Creating…' : 'Create & continue'}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {stepIndex === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>Sections</CardTitle>
            <CardDescription>These sections will be created for every class above.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <CheckboxList
              options={DEFAULT_SECTIONS}
              selected={selectedSections}
              onToggle={(value) => toggle(selectedSections, setSelectedSections, value)}
            />
            <Button onClick={() => void handleCreateSections()} disabled={busy}>
              {busy ? 'Creating…' : 'Create & continue'}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {stepIndex === 3 ? (
        <Card>
          <CardHeader>
            <CardTitle>Subjects</CardTitle>
            <CardDescription>You can map subjects to specific classes later from the Academics page.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <CheckboxList
              options={Array.from(new Set([...DEFAULT_SUBJECTS, ...selectedSubjects]))}
              selected={selectedSubjects}
              onToggle={(value) => toggle(selectedSubjects, setSelectedSubjects, value)}
            />
            <div className="flex gap-2">
              <Input
                placeholder="Add a custom subject"
                value={customSubject}
                onChange={(e) => setCustomSubject(e.target.value)}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (!customSubject.trim()) return
                  setSelectedSubjects(new Set([...selectedSubjects, customSubject.trim()]))
                  setCustomSubject('')
                }}
              >
                Add
              </Button>
            </div>
            <Button onClick={() => void handleCreateSubjects()} disabled={busy}>
              {busy ? 'Creating…' : 'Create & continue'}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {stepIndex === 4 ? (
        <Card>
          <CardHeader>
            <CardTitle>You're all set</CardTitle>
            <CardDescription>
              Academic year, classes, sections, and subjects have been created for your school.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleFinish}>Go to dashboard</Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
