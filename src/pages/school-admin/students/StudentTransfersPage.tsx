import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { toast } from 'sonner'

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
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/lib/auth-context'
import { rpcErrorMessage } from '@/lib/rpc-error'
import { supabase } from '@/lib/supabase'
import type { TransferStatus } from '@/types/database'

const selectClassName =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

interface TransferRow {
  id: string
  source_school_id: string
  destination_school_id: string
  source_student_id: string
  status: TransferStatus
  reason: string | null
  certificate_number: string | null
  certificate_payload: Record<string, unknown> | null
  initiated_at: string
}

interface NamedRow {
  id: string
  name: string
  class_id?: string
}

function statusVariant(status: TransferStatus) {
  if (status === 'completed') return 'success' as const
  if (status === 'rejected') return 'destructive' as const
  if (status === 'pending') return 'warning' as const
  return 'outline' as const
}

export function StudentTransfersPage() {
  const { primaryRole } = useAuth()
  const schoolId = primaryRole?.schoolId ?? null
  const queryClient = useQueryClient()
  const [studentId, setStudentId] = React.useState('')
  const [destCode, setDestCode] = React.useState('')
  const [reason, setReason] = React.useState('')
  const [accepting, setAccepting] = React.useState<TransferRow | null>(null)
  const [certificate, setCertificate] = React.useState<TransferRow | null>(null)

  const { data: students = [] } = useQuery({
    queryKey: ['students', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('students')
        .select('id, full_name, admission_no, status')
        .eq('school_id', schoolId as string)
        .eq('status', 'active')
        .order('full_name')
      if (error) throw error
      return data
    },
  })

  const { data: transfers = [], isLoading } = useQuery({
    queryKey: ['student-transfers', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_transfers')
        .select(
          'id, source_school_id, destination_school_id, source_student_id, status, reason, certificate_number, certificate_payload, initiated_at',
        )
        .order('initiated_at', { ascending: false })
      if (error) throw error
      return data as TransferRow[]
    },
  })

  const outgoing = transfers.filter((row) => row.source_school_id === schoolId)
  const incoming = transfers.filter((row) => row.destination_school_id === schoolId)

  const initiate = useMutation({
    mutationFn: async () => {
      const { data: dest, error: lookupError } = await supabase.rpc('lookup_school_for_transfer', {
        p_school_code: destCode,
      })
      if (lookupError) throw lookupError
      const target = dest?.[0]
      if (!target) throw new Error('This resource is not available.')
      const { error } = await supabase.rpc('initiate_student_transfer', {
        p_student_id: studentId,
        p_destination_school_id: target.id,
        p_reason: reason || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Transfer initiated. The destination school must accept it.')
      setReason('')
      void queryClient.invalidateQueries({ queryKey: ['student-transfers', schoolId] })
    },
    onError: (err) => toast.error(rpcErrorMessage(err)),
  })

  const reject = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('reject_student_transfer', { p_transfer_id: id, p_reason: null })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Transfer rejected.')
      void queryClient.invalidateQueries({ queryKey: ['student-transfers', schoolId] })
    },
    onError: (err) => toast.error(rpcErrorMessage(err)),
  })

  if (!schoolId) {
    return <p className="text-sm text-muted-foreground">No school is associated with your account yet.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Transfers</h2>
        <p className="text-sm text-muted-foreground">
          Cross-school transfers run on the server. This page never writes into another school directly.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Initiate transfer</CardTitle>
          <CardDescription>Look up the destination by school code, then wait for that school to accept.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Student</Label>
            <select className={selectClassName} value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">Select</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.full_name} ({student.admission_no})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Destination school code</Label>
            <Input value={destCode} onChange={(e) => setDestCode(e.target.value)} placeholder="e.g. HYD-002" />
          </div>
          <div className="sm:col-span-2 flex flex-col gap-1.5">
            <Label>Reason</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <Button
            disabled={!studentId || !destCode || initiate.isPending}
            onClick={() => initiate.mutate()}
          >
            {initiate.isPending ? 'Submitting…' : 'Initiate transfer'}
          </Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="outgoing">
        <TabsList>
          <TabsTrigger value="outgoing">Outgoing</TabsTrigger>
          <TabsTrigger value="incoming">Incoming</TabsTrigger>
        </TabsList>
        <TabsContent value="outgoing">
          <TransferList
            rows={outgoing}
            empty="No outgoing transfers."
            loading={isLoading}
            onReject={(id) => reject.mutate(id)}
            onCertificate={setCertificate}
            canReject
          />
        </TabsContent>
        <TabsContent value="incoming">
          <TransferList
            rows={incoming}
            empty="No incoming transfers."
            loading={isLoading}
            onReject={(id) => reject.mutate(id)}
            onAccept={setAccepting}
            onCertificate={setCertificate}
            canReject
            canAccept
          />
        </TabsContent>
      </Tabs>

      <AcceptDialog
        transfer={accepting}
        schoolId={schoolId}
        onClose={() => setAccepting(null)}
        onDone={() => {
          setAccepting(null)
          void queryClient.invalidateQueries({ queryKey: ['student-transfers', schoolId] })
          void queryClient.invalidateQueries({ queryKey: ['students', schoolId] })
        }}
      />

      <Dialog open={!!certificate} onOpenChange={(next) => !next && setCertificate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer certificate</DialogTitle>
            <DialogDescription>Structured record for print. Not a scanned file.</DialogDescription>
          </DialogHeader>
          {certificate?.certificate_payload ? (
            <dl className="grid gap-2 text-sm">
              {Object.entries(certificate.certificate_payload).map(([key, value]) => (
                <div key={key} className="flex justify-between gap-4 border-b py-1">
                  <dt className="text-muted-foreground">{key.replaceAll('_', ' ')}</dt>
                  <dd className="font-medium">{String(value ?? '—')}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">Certificate is available after the destination school accepts.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TransferList({
  rows,
  empty,
  loading,
  onReject,
  onAccept,
  onCertificate,
  canReject,
  canAccept,
}: {
  rows: TransferRow[]
  empty: string
  loading: boolean
  onReject?: (id: string) => void
  onAccept?: (row: TransferRow) => void
  onCertificate: (row: TransferRow) => void
  canReject?: boolean
  canAccept?: boolean
}) {
  if (loading) return <p className="mt-3 text-sm text-muted-foreground">Loading transfers…</p>
  if (rows.length === 0) {
    return (
      <Card className="mt-3">
        <CardContent className="pt-5 text-sm text-muted-foreground">{empty}</CardContent>
      </Card>
    )
  }
  return (
    <div className="mt-3 grid gap-3">
      {rows.map((row) => (
        <Card key={row.id}>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">{row.certificate_number ?? 'Transfer request'}</CardTitle>
              <CardDescription>{new Date(row.initiated_at).toLocaleString()}</CardDescription>
            </div>
            <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {canAccept && row.status === 'pending' ? (
              <Button size="sm" onClick={() => onAccept?.(row)}>
                Accept
              </Button>
            ) : null}
            {canReject && (row.status === 'pending' || row.status === 'initiated') ? (
              <Button size="sm" variant="outline" onClick={() => onReject?.(row.id)}>
                Reject
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => onCertificate(row)}>
              Certificate
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function AcceptDialog({
  transfer,
  schoolId,
  onClose,
  onDone,
}: {
  transfer: TransferRow | null
  schoolId: string
  onClose: () => void
  onDone: () => void
}) {
  const [admissionNo, setAdmissionNo] = React.useState('')
  const [yearId, setYearId] = React.useState('')
  const [classId, setClassId] = React.useState('')
  const [sectionId, setSectionId] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const { data: years = [] } = useQuery({
    queryKey: ['academic-years', schoolId],
    enabled: !!transfer,
    queryFn: async () => {
      const { data, error } = await supabase.from('academic_years').select('id, name').eq('school_id', schoolId)
      if (error) throw error
      return data as NamedRow[]
    },
  })
  const { data: classes = [] } = useQuery({
    queryKey: ['classes', schoolId],
    enabled: !!transfer,
    queryFn: async () => {
      const { data, error } = await supabase.from('classes').select('id, name').eq('school_id', schoolId)
      if (error) throw error
      return data as NamedRow[]
    },
  })
  const { data: sections = [] } = useQuery({
    queryKey: ['sections', schoolId],
    enabled: !!transfer,
    queryFn: async () => {
      const { data, error } = await supabase.from('sections').select('id, name, class_id').eq('school_id', schoolId)
      if (error) throw error
      return data as NamedRow[]
    },
  })

  async function handleAccept() {
    if (!transfer) return
    setBusy(true)
    try {
      const { error } = await supabase.rpc('accept_student_transfer', {
        p_transfer_id: transfer.id,
        p_admission_no: admissionNo,
        p_class_id: classId,
        p_section_id: sectionId,
        p_academic_year_id: yearId,
        p_roll_no: null,
      })
      if (error) throw error
      toast.success('Transfer completed. A transfer certificate was generated.')
      onDone()
    } catch (err) {
      toast.error(rpcErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!transfer} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Accept transfer</DialogTitle>
          <DialogDescription>Creates a new student in this school. Source history stays at the sending school.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>New admission number</Label>
            <Input value={admissionNo} onChange={(e) => setAdmissionNo(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Academic year</Label>
            <select className={selectClassName} value={yearId} onChange={(e) => setYearId(e.target.value)}>
              <option value="">Select</option>
              {years.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Class</Label>
            <select className={selectClassName} value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">Select</option>
              {classes.map((klass) => (
                <option key={klass.id} value={klass.id}>
                  {klass.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Section</Label>
            <select className={selectClassName} value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              <option value="">Select</option>
              {sections
                .filter((section) => section.class_id === classId)
                .map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button disabled={busy || !admissionNo || !yearId || !classId || !sectionId} onClick={() => void handleAccept()}>
            {busy ? 'Accepting…' : 'Accept and enroll'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
