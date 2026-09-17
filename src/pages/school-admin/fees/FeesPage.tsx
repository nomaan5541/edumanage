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
import type { Database } from '@/types/database'

type FeeSummaryRow = Database['public']['Functions']['get_student_fee_summary']['Returns'][number]

interface Klass {
  id: string
  name: string
}
interface AcademicYear {
  id: string
  name: string
  is_active: boolean
}
interface FeeType {
  id: string
  name: string
  description: string | null
}
interface FeeStructure {
  id: string
  academic_year_id: string
  class_id: string
  fee_type_id: string
  amount: number
  due_date: string | null
}
interface StudentOption {
  id: string
  admission_no: string
  first_name: string
  middle_name: string | null
  last_name: string | null
}
interface SubscriptionRow {
  status: string
  plan_name: string
  expiry_date: string | null
}
interface SubscriptionRequestRow {
  id: string
  plan_name: string
  status: string
  requested_at: string
  notes: string | null
}

function studentName(s: Pick<StudentOption, 'first_name' | 'middle_name' | 'last_name'>) {
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

function useFeeTypes(schoolId: string) {
  return useQuery({
    queryKey: ['fee-types', schoolId],
    queryFn: async (): Promise<FeeType[]> => {
      const { data, error } = await supabase
        .from('fee_types')
        .select('id, name, description')
        .eq('school_id', schoolId)
        .order('name')
      if (error) throw error
      return data
    },
  })
}

function useFeeStructures(schoolId: string) {
  return useQuery({
    queryKey: ['fee-structures', schoolId],
    queryFn: async (): Promise<FeeStructure[]> => {
      const { data, error } = await supabase
        .from('fee_structures')
        .select('id, academic_year_id, class_id, fee_type_id, amount, due_date')
        .eq('school_id', schoolId)
      if (error) throw error
      return data
    },
  })
}

function useStudentOptions(schoolId: string) {
  return useQuery({
    queryKey: ['students-options', schoolId],
    queryFn: async (): Promise<StudentOption[]> => {
      const { data, error } = await supabase
        .from('students')
        .select('id, admission_no, first_name, middle_name, last_name')
        .eq('school_id', schoolId)
        .eq('status', 'active')
        .order('admission_no')
      if (error) throw error
      return data
    },
  })
}

export function FeesPage() {
  const { primaryRole } = useAuth()
  const schoolId = primaryRole?.schoolId ?? null
  if (!schoolId) return null

  return (
    <Tabs defaultValue="structure">
      <TabsList>
        <TabsTrigger value="structure">Fee Structure</TabsTrigger>
        <TabsTrigger value="payments">Record Payment</TabsTrigger>
        <TabsTrigger value="subscription">Subscription</TabsTrigger>
      </TabsList>
      <TabsContent value="structure">
        <FeeStructurePanel schoolId={schoolId} />
      </TabsContent>
      <TabsContent value="payments">
        <PaymentsPanel schoolId={schoolId} />
      </TabsContent>
      <TabsContent value="subscription">
        <SubscriptionPanel schoolId={schoolId} />
      </TabsContent>
    </Tabs>
  )
}

function FeeStructurePanel({ schoolId }: { schoolId: string }) {
  const queryClient = useQueryClient()
  const { data: years } = useAcademicYears(schoolId)
  const { data: classes } = useClasses(schoolId)
  const { data: feeTypes, isLoading: loadingTypes } = useFeeTypes(schoolId)
  const { data: structures } = useFeeStructures(schoolId)

  const [typeName, setTypeName] = React.useState('')
  const [yearId, setYearId] = React.useState('')
  const [classId, setClassId] = React.useState('')
  const [feeTypeId, setFeeTypeId] = React.useState('')
  const [amount, setAmount] = React.useState('')
  const [dueDate, setDueDate] = React.useState('')

  const effectiveYearId = yearId || years?.find((y) => y.is_active)?.id || years?.[0]?.id || ''

  const addFeeType = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('fee_types').insert({ school_id: schoolId, name: typeName })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Fee type added.')
      setTypeName('')
      void queryClient.invalidateQueries({ queryKey: ['fee-types', schoolId] })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to add fee type.'),
  })

  const setStructure = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('fee_structures').upsert(
        {
          school_id: schoolId,
          academic_year_id: effectiveYearId,
          class_id: classId,
          fee_type_id: feeTypeId,
          amount: Number(amount),
          due_date: dueDate || null,
        },
        { onConflict: 'academic_year_id,class_id,fee_type_id' },
      )
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Fee structure saved.')
      setAmount('')
      setDueDate('')
      void queryClient.invalidateQueries({ queryKey: ['fee-structures', schoolId] })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to save fee structure.'),
  })

  const classById = React.useMemo(() => new Map((classes ?? []).map((c) => [c.id, c])), [classes])
  const feeTypeById = React.useMemo(() => new Map((feeTypes ?? []).map((f) => [f.id, f])), [feeTypes])

  return (
    <div className="flex flex-col gap-4 pt-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fee types</CardTitle>
          <CardDescription>e.g. Tuition, Transport, Lab</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <Input placeholder="e.g. Tuition Fee" value={typeName} onChange={(e) => setTypeName(e.target.value)} />
          <Button onClick={() => addFeeType.mutate()} disabled={addFeeType.isPending || !typeName}>
            Add fee type
          </Button>
        </CardContent>
        {!loadingTypes ? (
          <CardContent className="flex flex-wrap gap-2 pt-0">
            {feeTypes?.map((f) => (
              <Badge key={f.id} variant="secondary">
                {f.name}
              </Badge>
            ))}
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Set amount per class</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
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
            <Label>Fee type</Label>
            <select
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={feeTypeId}
              onChange={(e) => setFeeTypeId(e.target.value)}
            >
              <option value="">Select…</option>
              {feeTypes?.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Amount (₹)</Label>
            <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-32" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Due date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <Button
            onClick={() => setStructure.mutate()}
            disabled={setStructure.isPending || !classId || !feeTypeId || !amount || !effectiveYearId}
          >
            Save
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        {structures
          ?.filter((s) => s.academic_year_id === effectiveYearId)
          .map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
              <span>
                {classById.get(s.class_id)?.name ?? 'Unknown class'} · {feeTypeById.get(s.fee_type_id)?.name ?? ''}
              </span>
              <span className="font-medium">
                ₹{s.amount} {s.due_date ? `· due ${s.due_date}` : ''}
              </span>
            </div>
          ))}
      </div>
    </div>
  )
}

function PaymentsPanel({ schoolId }: { schoolId: string }) {
  const queryClient = useQueryClient()
  const { data: years } = useAcademicYears(schoolId)
  const { data: students } = useStudentOptions(schoolId)
  const [yearId, setYearId] = React.useState('')
  const [studentId, setStudentId] = React.useState('')
  const [feeTypeId, setFeeTypeId] = React.useState('')
  const [amount, setAmount] = React.useState('')
  const [paymentMode, setPaymentMode] = React.useState('cash')
  const [lastReceipt, setLastReceipt] = React.useState<Database['public']['Tables']['fee_payments']['Row'] | null>(
    null,
  )

  const effectiveYearId = yearId || years?.find((y) => y.is_active)?.id || years?.[0]?.id || ''

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['student-fee-summary', schoolId, studentId, effectiveYearId],
    queryFn: async (): Promise<FeeSummaryRow[]> => {
      const { data, error } = await supabase.rpc('get_student_fee_summary', {
        p_school_id: schoolId,
        p_student_id: studentId,
        p_academic_year_id: effectiveYearId,
      })
      if (error) throw error
      return data
    },
    enabled: !!studentId && !!effectiveYearId,
  })

  const recordPayment = useMutation({
    mutationFn: async () => {
      const idempotencyKey = crypto.randomUUID()
      const { data, error } = await supabase.rpc('record_fee_payment', {
        p_school_id: schoolId,
        p_student_id: studentId,
        p_academic_year_id: effectiveYearId,
        p_fee_type_id: feeTypeId,
        p_amount: Number(amount),
        p_payment_mode: paymentMode,
        p_idempotency_key: idempotencyKey,
      })
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      toast.success(`Payment recorded. Receipt ${data.receipt_no}`)
      setLastReceipt(data)
      setAmount('')
      void queryClient.invalidateQueries({ queryKey: ['student-fee-summary', schoolId, studentId, effectiveYearId] })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to record payment.'),
  })

  return (
    <div className="flex flex-col gap-4 pt-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-5">
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
            <Label>Student</Label>
            <select
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            >
              <option value="">Select…</option>
              {students?.map((s) => (
                <option key={s.id} value={s.id}>
                  {studentName(s)} ({s.admission_no})
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {loadingSummary ? <p className="text-sm text-muted-foreground">Loading fee summary…</p> : null}

      {summary && summary.length > 0 ? (
        <div className="flex flex-col gap-2">
          {summary.map((row) => (
            <div key={row.fee_type_id} className="flex items-center justify-between rounded-md border p-3 text-sm">
              <div>
                <p className="font-medium">{row.fee_type_name}</p>
                <p className="text-xs text-muted-foreground">
                  Due ₹{row.total_due} + fines ₹{row.fines} - discount ₹{row.discounts} - concession ₹
                  {row.concessions} - paid ₹{row.verified_payments}
                </p>
              </div>
              <Badge variant={row.outstanding > 0 ? 'destructive' : 'success'}>Outstanding ₹{row.outstanding}</Badge>
            </div>
          ))}
        </div>
      ) : null}

      {summary && summary.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Record a payment</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label>Fee type</Label>
              <select
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                value={feeTypeId}
                onChange={(e) => setFeeTypeId(e.target.value)}
              >
                <option value="">Select…</option>
                {summary.map((row) => (
                  <option key={row.fee_type_id} value={row.fee_type_id}>
                    {row.fee_type_name} (outstanding ₹{row.outstanding})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Amount (₹)</Label>
              <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-32" />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Mode</Label>
              <select
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="upi">UPI</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cheque">Cheque</option>
                <option value="other">Other</option>
              </select>
            </div>
            <Button
              onClick={() => recordPayment.mutate()}
              disabled={recordPayment.isPending || !feeTypeId || !amount}
            >
              {recordPayment.isPending ? 'Recording…' : 'Record payment'}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {lastReceipt ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Receipt {lastReceipt.receipt_no}</CardTitle>
            <CardDescription>
              ₹{lastReceipt.amount} via {lastReceipt.payment_mode} on{' '}
              {new Date(lastReceipt.created_at).toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              Print receipt
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function SubscriptionPanel({ schoolId }: { schoolId: string }) {
  const queryClient = useQueryClient()
  const [notes, setNotes] = React.useState('')

  const { data: subscription } = useQuery({
    queryKey: ['subscription', schoolId],
    queryFn: async (): Promise<SubscriptionRow | null> => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('status, plan_name, expiry_date')
        .eq('school_id', schoolId)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  const { data: requests } = useQuery({
    queryKey: ['subscription-requests', schoolId],
    queryFn: async (): Promise<SubscriptionRequestRow[]> => {
      const { data, error } = await supabase
        .from('subscription_requests')
        .select('id, plan_name, status, requested_at, notes')
        .eq('school_id', schoolId)
        .order('requested_at', { ascending: false })
      if (error) throw error
      return data
    },
  })

  const requestRenewal = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('request_subscription_renewal', {
        p_school_id: schoolId,
        p_plan_name: 'default',
        p_notes: notes || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Renewal request sent to Super Admin.')
      setNotes('')
      void queryClient.invalidateQueries({ queryKey: ['subscription-requests', schoolId] })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to request renewal.'),
  })

  const hasPending = requests?.some((r) => r.status === 'pending') ?? false

  return (
    <div className="flex flex-col gap-4 pt-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current subscription</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Badge variant={subscription?.status === 'active' ? 'success' : 'outline'}>
            {subscription?.status ?? 'trial'}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {subscription?.plan_name ?? 'default'}
            {subscription?.expiry_date ? ` · expires ${subscription.expiry_date}` : ''}
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Request renewal</CardTitle>
          <CardDescription>Sent to the Super Admin for manual activation.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <Input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <Button onClick={() => requestRenewal.mutate()} disabled={requestRenewal.isPending || hasPending}>
            {hasPending ? 'Request pending' : 'Request renewal'}
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        {requests?.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
            <span>
              {r.plan_name} · requested {new Date(r.requested_at).toLocaleDateString()}
              {r.notes ? ` · ${r.notes}` : ''}
            </span>
            <Badge variant={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'destructive' : 'outline'}>
              {r.status}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  )
}
