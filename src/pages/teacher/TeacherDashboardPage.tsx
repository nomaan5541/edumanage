import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function TeacherDashboardPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome</CardTitle>
        <CardDescription>
          Your assigned classes, timetable, attendance tasks, and homework will appear here once the Teacher
          module is built (Phase 1 rollout in progress) — see docs/status.md.
        </CardDescription>
      </CardHeader>
    </Card>
  )
}
