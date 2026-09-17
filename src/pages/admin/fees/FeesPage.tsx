import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

interface FeeTypeRow {
  id: string
  name: string
  description: string | null
  is_active: boolean
}

interface FeeStructureRow {
  id: string
  amount: string | number
  due_date: string | null
  fee_type_id: string
  class_id: string
  academic_year_id: string
}

interface NamedRow {
  id: string
  name: string
}

function formatInr(amount: string | number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(amount))
}

function mutationErrorMessage(err: unknown, fallback: string) {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string' && err.message) {
    return err.message
  }
  return fallback
}

export function FeesPage() {
  const { primaryRole } = useAuth()
  const schoolId = primaryRole?.schoolId ?? null
  if (!schoolId) return null

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Fee catalog</CardTitle>
          <CardDescription>
            Fee types and class/year amounts for this school. Student dues and payments are not recorded
            here.
          </CardDescription>
        </CardHeader>
      </Card>
      <ReadOnlyBanner schoolId={schoolId} />
      <Tabs defaultValue="types">
        <TabsList>
          <TabsTrigger value="types">Fee types</TabsTrigger>
          <TabsTrigger value="structures">Fee structures</TabsTrigger>
        </TabsList>
        <TabsContent value="types">
          <FeeTypesPanel schoolId={schoolId} />
        </TabsContent>
        <TabsContent value="structures">
          <FeeStructuresPanel schoolId={schoolId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ReadOnlyBanner({ schoolId }: { schoolId: string }) {
  const { data: readOnly } = useQuery({
    queryKey: ['school-read-only', schoolId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_school_read_only', { target_school_id: schoolId })
      if (error) throw error
      return data
    },
  })

  if (!readOnly) return null

  return (
    <Card>
      <CardContent className="pt-5 text-sm text-muted-foreground">
        School is in read-only mode. Subscription renewal is required to make changes. Existing catalog
        rows remain visible.
      </CardContent>
    </Card>
  )
}

function useReadOnly(schoolId: string) {
  return useQuery({
    queryKey: ['school-read-only', schoolId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_school_read_only', { target_school_id: schoolId })
      if (error) throw error
      return Boolean(data)
    },
  })
}

function FeeTypesPanel({ schoolId }: { schoolId: string }) {
  const queryClient = useQueryClient()
  const { data: readOnly } = useReadOnly(schoolId)
  const { data: types, isLoading } = useQuery({
    queryKey: ['fee-types', schoolId],
    queryFn: async (): Promise<FeeTypeRow[]> => {
      const { data, error } = await supabase
        .from('fee_types')
        .select('id, name, description, is_active')
        .eq('school_id', schoolId)
        .order('name')
      if (error) throw error
      return data
    },
  })

  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('create_fee_type', {
        p_school_id: schoolId,
        p_name: name,
        p_description: description.trim() ? description : null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Fee type created.')
      setName('')
      setDescription('')
      void queryClient.invalidateQueries({ queryKey: ['fee-types', schoolId] })
    },
    onError: (err: unknown) => toast.error(mutationErrorMessage(err, 'Failed to create fee type.')),
  })

  const setActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.rpc('update_fee_type', {
        p_fee_type_id: id,
        p_is_active: is_active,
      })
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['fee-types', schoolId] }),
    onError: (err: unknown) => toast.error(mutationErrorMessage(err, 'Failed to update fee type.')),
  })

  const writesBlocked = Boolean(readOnly) || create.isPending || setActive.isPending

  return (
    <div className="flex flex-col gap-4 pt-4">
      <Card>
        <CardContent className="flex flex-col gap-3 pt-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-40 flex-1 flex-col gap-1.5">
              <Label htmlFor="fee-type-name">Name</Label>
              <Input
                id="fee-type-name"
                placeholder="e.g. Tuition"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={writesBlocked}
              />
            </div>
            <div className="flex min-w-48 flex-1 flex-col gap-1.5">
              <Label htmlFor="fee-type-description">Description</Label>
              <Input
                id="fee-type-description"
                placeholder="Optional"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={writesBlocked}
              />
            </div>
            <Button onClick={() => create.mutate()} disabled={writesBlocked || !name.trim()}>
              Add fee type
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {!isLoading && types?.length === 0 ? (
        <p className="text-sm text-muted-foreground">No fee types yet.</p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {types?.map((row) => (
          <Card key={row.id}>
            <CardContent className="flex items-start justify-between gap-3 pt-5">
              <div>
                <p className="font-medium">{row.name}</p>
                {row.description ? <p className="text-sm text-muted-foreground">{row.description}</p> : null}
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge variant={row.is_active ? 'success' : 'secondary'}>
                  {row.is_active ? 'Active' : 'Inactive'}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={writesBlocked}
                  onClick={() => setActive.mutate({ id: row.id, is_active: !row.is_active })}
                >
                  {row.is_active ? 'Deactivate' : 'Reactivate'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function FeeStructuresPanel({ schoolId }: { schoolId: string }) {
  const queryClient = useQueryClient()
  const { data: readOnly } = useReadOnly(schoolId)
  const { data: types } = useQuery({
    queryKey: ['fee-types', schoolId],
    queryFn: async (): Promise<FeeTypeRow[]> => {
      const { data, error } = await supabase
        .from('fee_types')
        .select('id, name, description, is_active')
        .eq('school_id', schoolId)
        .order('name')
      if (error) throw error
      return data
    },
  })
  const { data: classes } = useQuery({
    queryKey: ['classes', schoolId],
    queryFn: async (): Promise<NamedRow[]> => {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name')
        .eq('school_id', schoolId)
        .order('sort_order')
      if (error) throw error
      return data
    },
  })
  const { data: years } = useQuery({
    queryKey: ['academic-years', schoolId],
    queryFn: async (): Promise<NamedRow[]> => {
      const { data, error } = await supabase
        .from('academic_years')
        .select('id, name')
        .eq('school_id', schoolId)
        .order('start_date', { ascending: false })
      if (error) throw error
      return data
    },
  })
  const { data: structures, isLoading } = useQuery({
    queryKey: ['fee-structures', schoolId],
    queryFn: async (): Promise<FeeStructureRow[]> => {
      const { data, error } = await supabase
        .from('fee_structures')
        .select('id, amount, due_date, fee_type_id, class_id, academic_year_id')
        .eq('school_id', schoolId)
        .order('due_date', { ascending: true })
      if (error) throw error
      return data
    },
  })

  const [feeTypeId, setFeeTypeId] = React.useState('')
  const [classId, setClassId] = React.useState('')
  const [yearId, setYearId] = React.useState('')
  const [amount, setAmount] = React.useState('')
  const [dueDate, setDueDate] = React.useState('')

  const typeName = React.useMemo(() => new Map((types ?? []).map((t) => [t.id, t.name])), [types])
  const className = React.useMemo(() => new Map((classes ?? []).map((c) => [c.id, c.name])), [classes])
  const yearName = React.useMemo(() => new Map((years ?? []).map((y) => [y.id, y.name])), [years])
  const activeTypes = types?.filter((t) => t.is_active) ?? []

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('create_fee_structure', {
        p_school_id: schoolId,
        p_fee_type_id: feeTypeId,
        p_class_id: classId,
        p_academic_year_id: yearId,
        p_amount: Number(amount),
        p_due_date: dueDate || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Fee structure created.')
      setAmount('')
      setDueDate('')
      void queryClient.invalidateQueries({ queryKey: ['fee-structures', schoolId] })
    },
    onError: (err: unknown) => toast.error(mutationErrorMessage(err, 'Failed to create fee structure.')),
  })

  const writesBlocked = Boolean(readOnly) || create.isPending
  const canSubmit = Boolean(feeTypeId && classId && yearId && amount !== '' && Number(amount) >= 0)

  return (
    <div className="flex flex-col gap-4 pt-4">
      <Card>
        <CardContent className="flex flex-col gap-3 pt-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="structure-type">Fee type</Label>
              <select
                id="structure-type"
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                value={feeTypeId}
                onChange={(e) => setFeeTypeId(e.target.value)}
                disabled={writesBlocked}
              >
                <option value="">Select type…</option>
                {activeTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="structure-class">Class</Label>
              <select
                id="structure-class"
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                disabled={writesBlocked}
              >
                <option value="">Select class…</option>
                {classes?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="structure-year">Academic year</Label>
              <select
                id="structure-year"
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                value={yearId}
                onChange={(e) => setYearId(e.target.value)}
                disabled={writesBlocked}
              >
                <option value="">Select year…</option>
                {years?.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex w-32 flex-col gap-1.5">
              <Label htmlFor="structure-amount">Amount (₹)</Label>
              <Input
                id="structure-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={writesBlocked}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="structure-due">Due date</Label>
              <Input
                id="structure-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={writesBlocked}
              />
            </div>
            <Button onClick={() => create.mutate()} disabled={writesBlocked || !canSubmit}>
              Add structure
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {!isLoading && structures?.length === 0 ? (
        <p className="text-sm text-muted-foreground">No fee structures yet.</p>
      ) : null}

      <div className="overflow-x-auto">
        <div className="flex min-w-[36rem] flex-col gap-2">
          {structures?.map((row) => (
            <Card key={row.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5 text-sm">
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{typeName.get(row.fee_type_id) ?? 'Fee type'}</span>
                  <span className="text-muted-foreground">
                    {className.get(row.class_id) ?? 'Class'} · {yearName.get(row.academic_year_id) ?? 'Year'}
                    {row.due_date ? ` · due ${row.due_date}` : ''}
                  </span>
                </div>
                <span className="font-medium">{formatInr(row.amount)}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
