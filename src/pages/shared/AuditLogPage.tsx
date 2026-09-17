import { useQuery } from '@tanstack/react-query'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'

interface AuditLogRow {
  id: string
  action: string
  entity_type: string
  entity_id: string | null
  actor_role: string | null
  created_at: string
}

async function fetchAuditLogs(): Promise<AuditLogRow[]> {
  // RLS already scopes this to the caller's own school (or all schools for
  // super_admin) - see audit_logs_select in 20260915160600_audit_logs.sql.
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, action, entity_type, entity_id, actor_role, created_at')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return data
}

export function AuditLogPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['audit-logs'], queryFn: fetchAuditLogs })

  return (
    <div className="flex flex-col gap-4">
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {error ? <p className="text-sm text-destructive">Failed to load audit log: {(error as Error).message}</p> : null}
      {!isLoading && data?.length === 0 ? (
        <Card>
          <CardContent className="pt-5 text-sm text-muted-foreground">
            No audited actions yet. Sensitive actions (school/admin creation, permission changes, payments, etc.)
            will appear here as they happen.
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-col gap-2">
        {data?.map((row) => (
          <Card key={row.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{row.action}</Badge>
                <span className="text-muted-foreground">
                  {row.entity_type}
                  {row.entity_id ? ` · ${row.entity_id}` : ''}
                </span>
                {row.actor_role ? <span className="text-muted-foreground">by {row.actor_role}</span> : null}
              </div>
              <span className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
