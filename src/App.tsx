import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { TeacherSessionGuard } from '@/components/auth/TeacherSessionGuard'
import { RoleLayout } from '@/components/layout/RoleLayout'
import { AuthProvider } from '@/lib/auth-context'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage'
import { UnauthorizedPage } from '@/pages/auth/UnauthorizedPage'
import { RoleRedirect } from '@/pages/RoleRedirect'
import { AcademicsPage } from '@/pages/school-admin/AcademicsPage'
import { SchoolAdminAttendancePage } from '@/pages/school-admin/attendance/AttendancePage'
import { SchoolAdminExamsPage } from '@/pages/school-admin/exams/ExamsPage'
import { FeesPage } from '@/pages/school-admin/fees/FeesPage'
import { SchoolAdminTimetablePage } from '@/pages/school-admin/timetable/TimetablePage'
import { SchoolAdminDashboardPage } from '@/pages/school-admin/SchoolAdminDashboardPage'
import { SchoolProfilePage } from '@/pages/school-admin/SchoolProfilePage'
import { SetupWizardPage } from '@/pages/school-admin/SetupWizardPage'
import { StudentsPage } from '@/pages/school-admin/students/StudentsPage'
import { SubAdminsPage } from '@/pages/school-admin/SubAdminsPage'
import { TeachersPage } from '@/pages/school-admin/teachers/TeachersPage'
import { AuditLogPage } from '@/pages/shared/AuditLogPage'
import { SchoolsPage } from '@/pages/super-admin/SchoolsPage'
import { SubscriptionRequestsPage } from '@/pages/super-admin/SubscriptionRequestsPage'
import { SuperAdminDashboardPage } from '@/pages/super-admin/SuperAdminDashboardPage'
import { StudentAttendancePage } from '@/pages/student/AttendancePage'
import { StudentFeesPage } from '@/pages/student/FeesPage'
import { StudentHomeworkPage } from '@/pages/student/HomeworkPage'
import { StudentDashboardPage } from '@/pages/student/StudentDashboardPage'
import { StudentResultsPage } from '@/pages/student/ResultsPage'
import { StudentTimetablePage } from '@/pages/student/TimetablePage'
import { TeacherAttendancePage } from '@/pages/teacher/AttendancePage'
import { TeacherDashboardPage } from '@/pages/teacher/TeacherDashboardPage'
import { TeacherExamsPage } from '@/pages/teacher/ExamsPage'
import { TeacherHomeworkPage } from '@/pages/teacher/HomeworkPage'
import { TeacherTimetablePage } from '@/pages/teacher/TimetablePage'

const SUPER_ADMIN_NAV = [
  { label: 'Dashboard', to: '/super-admin' },
  { label: 'Schools', to: '/super-admin/schools' },
  { label: 'Subscription Requests', to: '/super-admin/subscription-requests' },
  { label: 'Audit Log', to: '/super-admin/audit-log' },
]

const SCHOOL_ADMIN_NAV = [
  { label: 'Dashboard', to: '/admin' },
  { label: 'School Profile', to: '/admin/profile' },
  { label: 'Academics', to: '/admin/academics' },
  { label: 'Students', to: '/admin/students' },
  { label: 'Teachers', to: '/admin/teachers' },
  { label: 'Fees', to: '/admin/fees' },
  { label: 'Attendance', to: '/admin/attendance' },
  { label: 'Exams', to: '/admin/exams' },
  { label: 'Timetable', to: '/admin/timetable' },
  { label: 'Sub-Admins', to: '/admin/sub-admins' },
  { label: 'Audit Log', to: '/admin/audit-log' },
  { label: 'Setup Wizard', to: '/admin/setup' },
]

const TEACHER_NAV = [
  { label: 'Dashboard', to: '/teacher' },
  { label: 'Attendance', to: '/teacher/attendance' },
  { label: 'Exams', to: '/teacher/exams' },
  { label: 'Homework', to: '/teacher/homework' },
  { label: 'Timetable', to: '/teacher/timetable' },
]
const STUDENT_NAV = [
  { label: 'Dashboard', to: '/student' },
  { label: 'Fees', to: '/student/fees' },
  { label: 'Attendance', to: '/student/attendance' },
  { label: 'Results', to: '/student/results' },
  { label: 'Homework', to: '/student/homework' },
  { label: 'Timetable', to: '/student/timetable' },
]

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route path="/" element={<RoleRedirect />} />

          <Route
            path="/super-admin"
            element={
              <ProtectedRoute allowedRoles={['super_admin']}>
                <RoleLayout title="Super Admin" navItems={SUPER_ADMIN_NAV} />
              </ProtectedRoute>
            }
          >
            <Route index element={<SuperAdminDashboardPage />} />
            <Route path="schools" element={<SchoolsPage />} />
            <Route path="subscription-requests" element={<SubscriptionRequestsPage />} />
            <Route path="audit-log" element={<AuditLogPage />} />
          </Route>

          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['school_admin', 'sub_admin']}>
                <RoleLayout title="School Admin" navItems={SCHOOL_ADMIN_NAV} />
              </ProtectedRoute>
            }
          >
            <Route index element={<SchoolAdminDashboardPage />} />
            <Route path="setup" element={<SetupWizardPage />} />
            <Route path="profile" element={<SchoolProfilePage />} />
            <Route path="academics" element={<AcademicsPage />} />
            <Route path="students" element={<StudentsPage />} />
            <Route path="teachers" element={<TeachersPage />} />
            <Route path="fees" element={<FeesPage />} />
            <Route path="attendance" element={<SchoolAdminAttendancePage />} />
            <Route path="exams" element={<SchoolAdminExamsPage />} />
            <Route path="timetable" element={<SchoolAdminTimetablePage />} />
            <Route path="sub-admins" element={<SubAdminsPage />} />
            <Route path="audit-log" element={<AuditLogPage />} />
          </Route>

          <Route
            path="/teacher"
            element={
              <ProtectedRoute allowedRoles={['teacher']}>
                <>
                  <TeacherSessionGuard />
                  <RoleLayout title="Teacher" navItems={TEACHER_NAV} />
                </>
              </ProtectedRoute>
            }
          >
            <Route index element={<TeacherDashboardPage />} />
            <Route path="attendance" element={<TeacherAttendancePage />} />
            <Route path="exams" element={<TeacherExamsPage />} />
            <Route path="homework" element={<TeacherHomeworkPage />} />
            <Route path="timetable" element={<TeacherTimetablePage />} />
          </Route>

          <Route
            path="/student"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <RoleLayout title="Student" navItems={STUDENT_NAV} />
              </ProtectedRoute>
            }
          >
            <Route index element={<StudentDashboardPage />} />
            <Route path="fees" element={<StudentFeesPage />} />
            <Route path="attendance" element={<StudentAttendancePage />} />
            <Route path="results" element={<StudentResultsPage />} />
            <Route path="homework" element={<StudentHomeworkPage />} />
            <Route path="timetable" element={<StudentTimetablePage />} />
          </Route>

          <Route path="*" element={<UnauthorizedPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
