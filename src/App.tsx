import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { RoleLayout } from '@/components/layout/RoleLayout'
import { AuthProvider } from '@/lib/auth-context'
import { LoginPage } from '@/pages/auth/LoginPage'
import { UnauthorizedPage } from '@/pages/auth/UnauthorizedPage'
import { RoleRedirect } from '@/pages/RoleRedirect'
import { SchoolAdminDashboardPage } from '@/pages/school-admin/SchoolAdminDashboardPage'
import { SetupWizardPage } from '@/pages/school-admin/SetupWizardPage'
import { StudentsPage } from '@/pages/school-admin/students/StudentsPage'
import { StudentPromotionPage } from '@/pages/school-admin/students/StudentPromotionPage'
import { StudentTransfersPage } from '@/pages/school-admin/students/StudentTransfersPage'
import { TeachersPage } from '@/pages/school-admin/teachers/TeachersPage'
import { SchoolsPage } from '@/pages/super-admin/SchoolsPage'
import { SuperAdminDashboardPage } from '@/pages/super-admin/SuperAdminDashboardPage'
import { StudentDashboardPage } from '@/pages/student/StudentDashboardPage'
import { TeacherDashboardPage } from '@/pages/teacher/TeacherDashboardPage'

const SUPER_ADMIN_NAV = [
  { label: 'Dashboard', to: '/super-admin' },
  { label: 'Schools', to: '/super-admin/schools' },
]

const SCHOOL_ADMIN_NAV = [
  { label: 'Dashboard', to: '/admin' },
  { label: 'Students', to: '/admin/students' },
  { label: 'Promotion', to: '/admin/students/promotion' },
  { label: 'Transfers', to: '/admin/students/transfers' },
  { label: 'Teachers', to: '/admin/teachers' },
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
            <Route path="students" element={<StudentsPage />} />
            <Route path="students/promotion" element={<StudentPromotionPage />} />
            <Route path="students/transfers" element={<StudentTransfersPage />} />
            <Route path="teachers" element={<TeachersPage />} />
            <Route path="setup" element={<SetupWizardPage />} />
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
