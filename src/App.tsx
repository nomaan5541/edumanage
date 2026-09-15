import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { RoleLayout } from '@/components/layout/RoleLayout'
import { AuthProvider } from '@/lib/auth-context'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage'
import { UnauthorizedPage } from '@/pages/auth/UnauthorizedPage'
import { RoleRedirect } from '@/pages/RoleRedirect'
import { AcademicsPage } from '@/pages/school-admin/AcademicsPage'
import { SchoolAdminDashboardPage } from '@/pages/school-admin/SchoolAdminDashboardPage'
import { SetupWizardPage } from '@/pages/school-admin/SetupWizardPage'
import { SubAdminsPage } from '@/pages/school-admin/SubAdminsPage'
import { AuditLogPage } from '@/pages/shared/AuditLogPage'
import { SchoolsPage } from '@/pages/super-admin/SchoolsPage'
import { SuperAdminDashboardPage } from '@/pages/super-admin/SuperAdminDashboardPage'
import { StudentDashboardPage } from '@/pages/student/StudentDashboardPage'
import { TeacherDashboardPage } from '@/pages/teacher/TeacherDashboardPage'

const SUPER_ADMIN_NAV = [
  { label: 'Dashboard', to: '/super-admin' },
  { label: 'Schools', to: '/super-admin/schools' },
  { label: 'Audit Log', to: '/super-admin/audit-log' },
]

const SCHOOL_ADMIN_NAV = [
  { label: 'Dashboard', to: '/admin' },
  { label: 'Academics', to: '/admin/academics' },
  { label: 'Sub-Admins', to: '/admin/sub-admins' },
  { label: 'Audit Log', to: '/admin/audit-log' },
  { label: 'Setup Wizard', to: '/admin/setup' },
]

const TEACHER_NAV = [{ label: 'Dashboard', to: '/teacher' }]
const STUDENT_NAV = [{ label: 'Dashboard', to: '/student' }]

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
            <Route path="academics" element={<AcademicsPage />} />
            <Route path="sub-admins" element={<SubAdminsPage />} />
            <Route path="audit-log" element={<AuditLogPage />} />
          </Route>

          <Route
            path="/teacher"
            element={
              <ProtectedRoute allowedRoles={['teacher']}>
                <RoleLayout title="Teacher" navItems={TEACHER_NAV} />
              </ProtectedRoute>
            }
          >
            <Route index element={<TeacherDashboardPage />} />
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
          </Route>

          <Route path="*" element={<UnauthorizedPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
