import { useQuery } from '@tanstack/react-query'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type FeeSummaryRow = Database['public']['Functions']['get_student_fee_summary']['Returns'][number]
type PaymentRow = Database['public']['Tables']['fee_payments']['Row']

function useOwnStudentRecord() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['own-student-record', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('students')
        .select('id, school_id')
        .eq('user_id', user?.id ?? '')
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!user?.id,
  })
}

function useActiveEnrollmentYear(schoolId: string | undefined, studentId: string | undefined) {
  return useQuery({
    queryKey: ['own-active-enrollment', studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_enrollments')
        .select('academic_year_id')
        .eq('student_id', studentId ?? '')
        .eq('status', 'active')
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!schoolId && !!studentId,
  })
}

export function StudentFeesPage() {
  const { data: student } = useOwnStudentRecord()
  const { data: enrollment } = useActiveEnrollmentYear(student?.school_id, student?.id)

  const { data: summary, isLoading } = useQuery({
    queryKey: ['own-fee-summary', student?.id, enrollment?.academic_year_id],
    queryFn: async (): Promise<FeeSummaryRow[]> => {
      const { data, error } = await supabase.rpc('get_student_fee_summary', {
        p_school_id: student!.school_id,
        p_student_id: student!.id,
        p_academic_year_id: enrollment!.academic_year_id,
      })
      if (error) throw error
      return data
    },
    enabled: !!student?.id && !!enrollment?.academic_year_id,
  })

  const { data: payments } = useQuery({
    queryKey: ['own-payments', student?.id],
    queryFn: async (): Promise<PaymentRow[]> => {
      const { data, error } = await supabase
        .from('fee_payments')
        .select('*')
        .eq('student_id', student!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!student?.id,
  })

  if (!student) {
    return <p className="text-sm text-muted-foreground">No student record linked to this account yet.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Fees</h2>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {summary?.map((row) => (
          <Card key={row.fee_type_id}>
            <CardHeader>
              <CardTitle className="text-base">{row.fee_type_name}</CardTitle>
              <CardDescription>
                Due ₹{row.total_due} · Paid ₹{row.verified_payments}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant={row.outstanding > 0 ? 'destructive' : 'success'}>Outstanding ₹{row.outstanding}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <h3 className="text-base font-semibold">Payment history</h3>
      <div className="flex flex-col gap-2">
        {payments?.length === 0 ? <p className="text-sm text-muted-foreground">No payments recorded yet.</p> : null}
        {payments?.map((p) => (
          <Card key={p.id}>
            <CardContent className="flex items-center justify-between pt-5 text-sm">
              <div>
                <p className="font-medium">Receipt {p.receipt_no}</p>
                <p className="text-xs text-muted-foreground">
                  ₹{p.amount} via {p.payment_mode} on {new Date(p.created_at).toLocaleDateString()}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                Print
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
