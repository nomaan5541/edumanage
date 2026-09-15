import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function StudentDashboardPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome</CardTitle>
        <CardDescription>
          Your attendance, fees, timetable, homework, and results will appear here once the Student module is
          built (Phase 1 rollout in progress) — see docs/status.md.
        </CardDescription>
      </CardHeader>
    </Card>
  )
}
