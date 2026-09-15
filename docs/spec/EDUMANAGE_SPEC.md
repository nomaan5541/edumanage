EDUMANAGE — ULTIMATE MASTER PROJECT SPECIFICATION
MULTI-SCHOOL SCHOOL MANAGEMENT SAAS PLATFORM

DOCUMENT TYPE:
Master Product Requirements + Software Architecture + Database Contract +
Security Specification + RBAC Contract + UI/UX Specification + API Contract +
Business Rules + Workflow Specification + QA/Acceptance Specification +
AI Coding-Agent Instruction Set

PROJECT:
EduManage

SOURCE REPOSITORY:
https://github.com/nomaan5541/complete-blueprint-kit.git

DOCUMENT DATE:
15 September 2026

PURPOSE:
This document is the authoritative specification for understanding,
modernizing, rebuilding, extending, testing, and maintaining EduManage.

0. ABSOLUTE AI CODING AGENT RULES
THIS SECTION HAS THE HIGHEST PRIORITY.
The AI coding agent must treat this document as the PRODUCT CONTRACT.

RULE 0.1 — DO NOT INVENT REQUIREMENTS
Do not invent features that contradict this document.

RULE 0.2 — DO NOT DELETE EXISTING FUNCTIONALITY
Before removing or replacing any existing feature, identify it and determine
whether it is: intentionally obsolete, duplicated, insecure, broken, or
explicitly marked LEGACY. Do not remove a feature merely because it is
inconvenient to implement.

RULE 0.3 — DO NOT BREAK MULTI-TENANCY
Never weaken, bypass, remove, or disable school-level isolation.
RLS is a security boundary, not merely a UI filter.

RULE 0.4 — UI FILTERING IS NOT SECURITY
Filtering by school_id in React is NOT considered sufficient. Every
tenant-sensitive operation must also be protected server-side through
Postgres RLS, secure RPCs, Edge Functions, or equivalent server enforcement.

RULE 0.5 — NEVER TRUST CLIENT INPUT
The frontend must never be treated as authoritative for: role, school_id,
payment amount, subscription status, permissions, student ownership, teacher
assignments, exam ownership, attendance authorization, administrative
privileges.

RULE 0.6 — NEVER EXPOSE SERVICE-ROLE CREDENTIALS
Service-role keys and privileged credentials must never be shipped to React,
browser JavaScript, local storage, public environment variables, or client
bundles.

RULE 0.7 — NEVER CREATE A PARENT PORTAL
There is intentionally NO Parent Portal. Do not introduce parent login,
parent dashboard, parent role, parent billing portal, or parent attendance
portal unless the product owner explicitly changes this requirement.

RULE 0.8 — SUPER ADMIN ACCOUNT CREATION RESTRICTION
Super Admin may create: School, School Admin. Super Admin must NOT directly
create Teacher or Student. Teachers and students are created within their
respective schools by authorized School Admin/Sub-Admin workflows.

RULE 0.9 — PRESERVE READ-ONLY EXPIRY BEHAVIOR
Subscription expiry must NOT completely lock users out. Expired schools
remain able to: login, view data, view historical records, view receipts,
view reports, export permitted information. Expired schools must NOT be able
to perform ordinary state-changing operations.

RULE 0.10 — SECURITY OVER CONVENIENCE
If a proposed implementation conflicts with security, choose the secure
implementation and document the reason.

RULE 0.11 — DATABASE IS SOURCE OF TRUTH
Where frontend state and database state disagree, database rules win.

RULE 0.12 — DO NOT SILENTLY CHANGE BUSINESS LOGIC
Any change to payment rules, role permissions, subscription behavior,
academic-year behavior, exam behavior, attendance rules, student promotion,
or school isolation must be explicitly documented.

RULE 0.13 — EVERY MUTATION MUST HAVE AUTHORIZATION
Every create/update/delete operation must answer: WHO is performing the
action? WHICH SCHOOL do they belong to? WHAT resource are they modifying? DO
they have permission? IS the school active? IS the resource owned by the
same school? IS the operation allowed in the current academic year? IS the
operation auditable?

RULE 0.14 — NO SECURITY THROUGH HIDDEN UI
Hiding a button does not constitute authorization. The backend must enforce
the same restriction.

RULE 0.15 — DO NOT CLAIM A FEATURE IS COMPLETE WITHOUT TESTING IT
A feature is only considered COMPLETE after: implementation, database
verification, authorization verification, error handling, UI verification,
acceptance test.

1. PRODUCT IDENTITY
Product: EduManage
Category: Multi-tenant School Management SaaS / School ERP
Target Market: Private schools in Telangana, India.
Primary Board: Telangana SSC.
Target Education Range: Nursery, LKG, UKG, Class 1–10.
Typical Sections: A, B, C, D.
The system must remain flexible enough to support additional classes,
sections, boards, and academic structures in the future.

2. PRODUCT VISION
EduManage should provide a single platform through which multiple
independent schools can operate independently while a central platform
operator manages the SaaS infrastructure. Each school must behave like an
isolated organization. School A must never see School B's students,
teachers, fees, attendance, examinations, documents, notifications,
meetings, reports, backups, credentials, storage, or audit logs unless a
privileged platform-level operation explicitly permits access. The system
should feel like a modern premium SaaS product rather than a traditional
school ERP.

3. CORE PRODUCT PRINCIPLES
1. Security first. 2. Multi-tenancy first. 3. Database-enforced
authorization. 4. Simple workflows for non-technical school staff. 5.
Mobile-first student experience. 6. Professional administrative experience.
7. Historical academic data must never be accidentally destroyed. 8. Every
sensitive action must be auditable. 9. Expired subscriptions become
read-only rather than inaccessible. 10. Every important action should
provide clear success/error feedback.

4. TENANCY ARCHITECTURE
Central tenant entity: schools. Every school-owned entity must contain
`school_id UUID NOT NULL REFERENCES schools(id)` unless there is a
documented architectural reason not to. The application must use a
consistent tenant-resolution mechanism. Possible resolution sources: 1.
authenticated user's profile 2. authenticated user's staff/student record 3.
secure database helper functions 4. verified server-side role. Never trust a
client-provided school_id. If a request contains school_id: validate it,
compare it with authenticated tenant, reject mismatches.
Super Admin is platform-level. School Admin is tenant-level. Teacher is
tenant-level and assignment-scoped. Student is tenant-level and
identity-scoped. Sub-Admin is tenant-level and permission-scoped.

5. ROLE ARCHITECTURE
Canonical roles: super_admin, school_admin, sub_admin, teacher, student. If
legacy database architecture cannot immediately introduce sub_admin into the
enum, create a secure compatibility layer without weakening permissions. Do
NOT simply treat every delegated administrator as full school_admin.

6. ROLE DEFINITIONS

6.1 SUPER ADMIN
Purpose: Platform owner/operator.
Can: create schools, update schools, suspend schools, activate schools,
expire schools, manage plans, manage subscriptions, approve renewal
requests, view platform analytics, view platform revenue, manage platform
configuration, create School Admin accounts, manage platform-wide themes,
inspect platform audit events, export platform reports.
Cannot directly create: teachers, students — unless a future explicit
platform-management feature is introduced.

6.2 SCHOOL ADMIN
Purpose: Full administrator of one school.
Can manage: school profile, academic years, classes, sections, subjects,
subject mappings, teachers, students, admissions, fees, attendance, exams,
marks, homework, study materials, timetable, notifications, meetings,
reports, documents, ID cards, backups, delegated administrators, school
settings.
Cannot: access another school, create another school, manage platform-wide
subscriptions, change Super Admin roles.

6.3 SUB-ADMIN
Purpose: Delegated school administrator. Must be assigned granular
permissions, e.g.: students.read/create/update/export,
teachers.read/create/update, attendance.read/create/update,
fees.read/create/update/export, exams.read/create/update/publish,
reports.read/export, notifications.create.
The permission system must support: allow, deny, module-level permission,
action-level permission, school scope only.
Sub-Admin must NEVER receive: school creation, platform administration,
platform subscription management, cross-school access, Super Admin access.

6.4 TEACHER
Teacher permissions are assignment-based. A teacher should only manage
assigned classes, sections, subjects, and students unless explicitly granted
additional permission. Teacher can: mark attendance, create homework, upload
materials, create permitted exams, enter marks, monitor permitted online
exams, view assigned students, view timetable, send permitted class
notifications, participate in meetings.

6.5 STUDENT
Student is self-service and identity-scoped. Student can view: own profile,
attendance, results, fees, timetable, homework, materials, notifications, ID
card, permitted meetings, school information. Student can use: AI Assistant,
Online Exams. Student cannot: access another student's private data, modify
marks, modify attendance, modify fees, access admin functions.

7. COMPLETE MODULE ARCHITECTURE
01 Authentication, 02 Multi-tenancy, 03 RBAC, 04 Sub-Admin Permissions, 05
School Management, 06 Academic Years, 07 Classes, 08 Sections, 09 Subjects,
10 Subject Mapping, 11 Admissions, 12 Student Master, 13 Student Documents,
14 Student Promotion, 15 Student Transfer, 16 Student Archive, 17 Teacher
Management, 18 Teacher Assignments, 19 Teacher Session Security, 20
Attendance, 21 Face Attendance, 22 Fees, 23 Fee Structures, 24 Fee Payments,
25 Receipts, 26 Fee Dues, 27 Exams, 28 Question Bank, 29 Online Exams, 30
Marks, 31 Results, 32 Report Cards, 33 AI Report Cards, 34 Homework, 35
Study Materials, 36 Timetable, 37 Notifications, 38 Email, 39 SMS, 40 Push
Notifications, 41 Meetings, 42 School Calendar, 43 ID Card Studio, 44
Reports, 45 Backup, 46 Restore, 47 Audit Logs, 48 Subscription Management,
49 Platform Payments, 50 Google Workspace, 51 AI Assistant, 52 AI Analytics,
53 PWA, 54 Settings, 55 Legal/Compliance, 56 Monitoring/Health, 57 System
Administration.

8. AUTHENTICATION
Authentication must use secure Supabase Auth or the approved authentication
provider. Required flows: Login, Logout, Password reset, Session
restoration, Expired session handling, Unauthorized access handling,
Role-based redirect, Account activation/deactivation, Credential creation,
Credential reset. Never expose passwords after account creation. Temporary
credentials should be securely generated, displayed only when appropriate,
and never stored in plaintext unnecessarily.

9. TEACHER ONE-SESSION SECURITY
This is REQUIRED. A teacher may have only one active authenticated session.
Recommended entity: teacher_sessions (id, teacher_id, user_id, school_id,
session_token_hash, device_identifier, created_at, last_seen_at, expires_at,
revoked_at, ip_hash, user_agent_hash, status).
Login sequence: 1. Teacher enters credentials. 2. Authentication succeeds.
3. Server identifies teacher. 4. Server checks active session. 5. Existing
active session: OPTION A reject new login OR OPTION B revoke previous
session and activate new session. 6. New session record created. 7. Every
protected teacher request validates active session. 8. Logout revokes
session. 9. Session timeout revokes session. 10. Password reset revokes all
sessions. 11. Teacher deactivation revokes all sessions. The chosen behavior
must be configurable but secure. Never implement this only in React.

10. SCHOOL ONBOARDING
Super Admin creates School + School Admin. School creation must support:
name, legal name, address, district, state, country, phone, email, website,
logo, principal/head information, board, school code, plan, subscription
dates, status. After creation, School Admin receives secure
credentials/invitation. First login redirects to Setup Wizard.

11. SETUP WIZARD
Step 1 School information, Step 2 Academic year, Step 3 Classes, Step 4
Sections, Step 5 Subjects, Step 6 School configuration, Step 7 Admin
confirmation, Step 8 Finish. Telangana defaults should be available but
editable: Nursery, LKG, UKG, Class 1–10; default sections A/B/C/D; default
subjects configurable by class. Never hard-code school configuration in a
way that prevents future customization.

12. ACADEMIC YEAR ENGINE
Academic years are first-class entities (e.g. 2026-27, 2027-28). Each school
can have multiple academic years; only one should normally be active. Every
academic record must be associated with the correct academic year.
Historical data must remain immutable unless explicitly edited by an
authorized administrator. Changing the active academic year must NEVER
rewrite historical data. Promotion creates a new academic enrollment rather
than modifying historical records.

13. STUDENT MASTER DATA
Student record should support identity, admission, academic, guardian,
contact, documents, photo, status, portal account, academic enrollment.
Recommended fields: id, school_id, user_id, admission_no, roll_no,
full_name, first_name, middle_name, last_name, date_of_birth, gender,
blood_group, nationality, address, phone, email, photo_url, class_id,
section_id, academic_year_id, guardian_name, guardian_phone, guardian_email,
guardian_relationship, admission_date, status, created_at, updated_at.
Sensitive fields must receive appropriate protection.

14. STUDENT ADMISSION
1. Open admission form. 2. Enter personal information. 3. Enter academic
information. 4. Enter guardian information. 5. Upload documents. 6.
Upload/capture photo. 7. Validate. 8. Detect duplicates. 9. Create student.
10. Optionally create portal account. 11. Generate admission confirmation.
12. Write audit event. Duplicate admission numbers must be rejected within a
school. Cross-school duplicate admission numbers may be allowed unless
global uniqueness is explicitly required.

15. STUDENT PROMOTION
Must support: bulk selection, source/destination academic year,
source/destination class, section mapping, student selection, promotion
status, rollback where safe (e.g. Class 9 2026-27 → Class 10 2027-28).
Historical Class 9 records must remain untouched. Promotion must not
duplicate students incorrectly.

16. STUDENT TRANSFER
Transfers between schools are privileged operations. A normal School Admin
must not bypass RLS to write directly into another school. Cross-school
transfer must use a secure server-side workflow: 1. Source school initiates
transfer. 2. Transfer record created. 3. Destination school accepts. 4.
Server validates both schools. 5. Student academic enrollment changes. 6.
Historical records are preserved. 7. Transfer certificate is generated. 8.
Audit trail is written.

17. FEES ENGINE
Must support: fee types, fee structures, academic year, class, student,
installments, due dates, discounts, concessions, fines, waivers, payment
modes, receipts, refunds, failed/pending payments, payment references,
outstanding balance, payment history.
Core formula: OUTSTANDING = TOTAL_DUE + FINES - DISCOUNTS - CONCESSIONS -
VERIFIED_PAYMENTS. The backend must calculate authoritative balances.
Frontend calculations are only previews.

18. FEE OVERPAYMENT PROTECTION
Must be server-enforced. The system must reject payment > outstanding
balance unless the business rule explicitly allows advance payments. Use
database constraints where practical, transaction/RPC, row locking where
necessary, idempotency keys. Two simultaneous payment requests must not
allow an overpayment race (e.g. balance ₹10,000; request A ₹8,000, request B
₹5,000 — system must not accept both). The database transaction must
serialize the balance check.

19. PAYMENT IDEMPOTENCY
Every payment operation should support an idempotency key/reference.
Retrying the same request must not create duplicate payments. Payment
states: pending, paid, failed, refunded, cancelled. State transitions must
be controlled.

20. RECEIPTS
Every successful payment must have a unique receipt number. Receipt should
contain: school logo, name, address, contact, student name, admission
number, class, section, academic year, fee type, amount, payment date,
payment mode, transaction/reference ID, receipt number, authorized signature
area, generated timestamp. Receipt must be printable and PDF-compatible.

21. EXAM SYSTEM
Supported examinations: FA1, FA2, MID, FA3, FA4, FINAL. System must support
exam creation, scheduling, class, section, subject, maximum marks, duration,
instructions, question bank, MCQ, subjective marks, question images, answer
options, correct answer, marks per question, negative marking optional,
publication, result locking.

22. ONLINE EXAM ENGINE
Must support: start exam, timer, question navigation, answer selection,
autosave, resume after refresh, network failure recovery, submit,
auto-submit, server-side grading, attempt locking, result generation. Never
rely only on browser timer — server must validate exam timing. Student must
not be able to manipulate score, submission timestamp, correct answers, or
attempt status.

23. EXAM SECURITY
Correct answers must never be sent to the browser before submission. Exam
APIs must not expose answer keys to students. After submission, the attempt
becomes locked, answers become immutable, and score becomes
server-generated. If retry is allowed, it must be an explicit exam setting.

24. ATTENDANCE
Statuses: present, absent, late, excused. Must support daily/class/section
attendance, date filtering, monthly summary, percentage, correction, audit
trail, export. Duplicate attendance for the same student/date/academic year
must be prevented. Teacher may only mark attendance for authorized classes.

25. ABSENCE NOTIFICATIONS
When a student is marked absent, the system may trigger SMS/email/in-app
notification. Notification should be idempotent — do not send multiple
absence messages because the same attendance request was retried. Delivery
status should be recorded.

26. FACE ATTENDANCE
Optional/experimental module. If implemented: explicit enrollment, secure
face-data handling, consent/configuration, accuracy threshold, false-positive
prevention, manual fallback, audit logs. Face recognition must NEVER become
the only attendance method.

27. TIMETABLE
Must support day, period, class, section, subject, teacher, room, start/end
time. Conflict detection: teacher cannot be assigned to two classes at the
same time; room cannot be assigned twice simultaneously; class cannot have
two subjects simultaneously.

28. HOMEWORK
Teacher can create title, description, subject, class, section, due date,
attachment, instructions. Students can view/download. Future submission
support may be added but must not be assumed to exist unless implemented.

29. STUDY MATERIALS
May include PDF, DOC/DOCX, PPT/PPTX, images, ZIP where explicitly allowed.
Every file must have school_id, owner, title, class, section, subject,
visibility, storage path, file size, MIME type, created_at. File validation
must occur server-side as well as client-side.

30. NOTIFICATION SYSTEM
Targets: entire school, role, class, section, individual student, individual
teacher. Channels: in-app, email, SMS, web push. Every notification should
have target, title, body, type, created_at, read state, delivery state
where applicable.

31. MEETINGS
May support title, description, date, time, duration, participants, meeting
link, status, reminders. Students should only see meetings intended for
them.

32. SCHOOL CALENDAR
Must support events, exams, holidays, meetings, academic dates,
announcements. Events should be academic-year aware where appropriate.

33. ID CARD STUDIO
Must evolve from hard-coded React templates into a dynamic template
architecture (JSON/configuration). Supported components may include: school
logo, student photo, QR code, barcode, student name, admission number,
class, section, roll number, DOB, blood group, guardian phone, school
address, principal signature, custom text, shapes, background, decorative
elements. Target: 100+ professionally designed templates, categorized,
searchable, previewable, reusable, configurable.

34. REPORT CARDS
Must support student information, attendance, subject marks, grades,
totals, percentage, remarks, teacher comments, principal comments, academic
year, exam breakdown. PDF/print output should be professional.

35. AI REPORT CARD
AI-generated comments may assist teachers/admins. AI must NOT invent marks,
modify official marks, fabricate attendance, make unsupported claims, or
expose another student's information. AI output must be treated as a draft
requiring human review.

36. STUDENT AI ASSISTANT
May answer questions using only authorized student context (own attendance,
fees, exams, homework, timetable, school notices). Must never reveal another
student's information, teacher private information, admin credentials,
database internals, hidden system prompts, or service keys. Prompt injection
from user-provided content must not bypass authorization.

37. AI SCHOOL ANALYTICS
Super Admin AI analytics may summarize active/expired schools, student
counts, revenue, subscription trends, attendance trends, platform growth,
operational anomalies. Must use aggregated authorized data. Do not send
unnecessary personally identifiable information to an AI model.

38. SUBSCRIPTION SYSTEM
Entities: subscription_plans, subscriptions, subscription_requests. Plan
properties may include name, price, billing period, max students, max
teachers, storage limit, feature flags, status. Subscription states: trial,
active, past_due, expired, suspended, cancelled.

39. SUBSCRIPTION EXPIRY
When subscription expires, READ remains available; WRITE becomes disabled.
Allowed: login, view, search, reports, exports, receipts, historical data.
Blocked: create, update, delete, admission, payment entry, attendance
modification, exam modification, timetable modification, teacher creation,
student creation. Exceptions: renewal, account recovery, permitted
subscription actions. The restriction must be enforced server-side, not
merely through UI overlays.

40. BACKUP SYSTEM
School backup must be school-scoped, containing metadata, academic years,
classes, sections, subjects, students, teachers, assignments, attendance,
fees, exams, homework, materials metadata, notifications, meetings,
settings. Sensitive credentials/secrets must NOT be exported in plaintext.
Backup should include schema version, application version, school ID,
creation timestamp, checksum.

41. RESTORE SYSTEM
Must: 1. authenticate caller 2. verify school 3. verify authorization 4.
validate backup schema 5. validate version 6. validate relationships 7.
detect duplicates 8. use transaction 9. rollback on fatal error 10. create
audit record. Never allow a backup from School A to be restored into School
B without an explicit, privileged migration process.

42. AUDIT LOGGING
Audit sensitive actions: login, logout, password reset, school creation,
admin creation, teacher creation, student admission, student
deletion/archive, promotion, transfer, fee creation, fee payment, refund,
exam creation, marks changes, result publication, attendance changes,
backup, restore, subscription changes, permission changes. Audit record: id,
school_id, actor_user_id, actor_role, action, entity_type, entity_id,
old_values, new_values, timestamp, metadata. Audit logs should be
append-oriented and protected from ordinary mutation.

43. STORAGE SECURITY
Storage paths must be tenant-scoped, e.g.
schools/{school_id}/students/{student_id}/photo.ext. Never allow a user to
download arbitrary storage objects merely by guessing a path. Use
authorization-aware access. File uploads must validate extension, MIME,
size, ownership, destination path.

44. SECURITY THREAT MODEL
The system must defend against cross-tenant access, IDOR, privilege
escalation, role spoofing, school_id manipulation, JWT misuse, service-role
exposure, SQL injection, XSS, CSRF where applicable, malicious file upload,
unauthorized storage access, duplicate payment race conditions, exam answer
leakage, session theft, session fixation, brute-force login, notification
abuse, API replay, prompt injection, data leakage through AI.

45. RLS REQUIREMENTS
RLS must be enabled on all tenant-sensitive tables. Policies must be tested
for SELECT, INSERT, UPDATE, DELETE. Test cases must include: School A user
accessing School B — expected DENIED. Do not depend on hidden routes,
frontend filtering, or disabled buttons.

46. DATABASE ARCHITECTURE
At minimum, account for entities such as: schools, profiles, user_roles,
school_roles, permissions, role_permissions, academic_years, classes,
sections, subjects, class_subjects, students, student_documents,
student_enrollments, teachers, teacher_assignments, teacher_sessions,
attendance, fee_types, fee_structures, fee_payments, payment_history, exams,
exam_questions, exam_options, exam_marks, grade_systems,
student_exam_attempts, student_answers, homework, study_materials,
timetable_slots, timetable_entries, notifications, notification_deliveries,
meetings, school_events, id_card_templates, subscriptions,
subscription_plans, subscription_requests, audit_logs, backup_metadata.
Actual existing schema must be inspected and reconciled against this model.
Do not create duplicate tables merely because a conceptual entity is listed.

47. DATABASE CONTRACT
For EVERY table document: table name, purpose, primary key, foreign keys,
columns, data types, nullability, defaults, unique constraints, check
constraints, indexes, RLS enabled, RLS policies, triggers, RPC dependencies,
audit requirements, delete behavior, archival behavior. No table should be
described merely as "exists".

48. DATABASE INTEGRITY
Use primary key, foreign key, unique, check, and not-null constraints,
indexes, transactions, RPCs, triggers where justified. Examples: payment
amount > 0; fee amount >= 0; exam max marks > 0; attendance status must be
valid; academic year dates must be valid; school_id must never unexpectedly
change.

49. API / EDGE FUNCTION CONTRACT
Every Edge Function must document: name, purpose, authentication
requirement, allowed roles, input schema, output schema, errors, database
operations, RLS implications, service-role usage, idempotency behavior,
audit behavior, rate limits, timeout behavior. Functions include:
create-user-account, create-school-admin, bulk-import-students,
create-plan-checkout, restore-backup, send-notification, send-absence-sms,
send-school-email, student-chat, ai-school-analytics, google-calendar-ops,
google-docs-ops, google-drive-ops, google-sheets-ops.

50. ERROR HANDLING
Errors must be human-readable, e.g.: Unauthorized: "You do not have
permission to perform this action." Cross-school: "This resource is not
available." Read-only: "School is in read-only mode. Subscription renewal
is required to make changes." Duplicate admission: "Admission number
already exists." Overpayment: "Payment exceeds the remaining balance."
Session: "Your teacher account is active on another device." Network:
"Connection lost. Your changes will retry when the connection is restored."
Never expose raw SQL errors to end users.

51. IMPORT SYSTEM
Bulk student import must support CSV and Excel where supported. Pipeline:
upload → parse → validate → preview → duplicate detection → error report →
confirmation → transaction/batched insert → summary. Display successful,
skipped, failed; every failed row should explain why.

52. EXPORT SYSTEM
Exports may include CSV, PDF, JSON, Excel where supported. Must respect
school isolation, role permissions, academic year, sensitive-field
restrictions.

53. UI/UX DESIGN SYSTEM
Design language: Premium iOS-inspired glass/liquid interface —
translucent surfaces, subtle blur, layered depth, soft shadows, rounded
corners, smooth transitions, restrained gradients, excellent typography,
premium spacing, high-quality empty states, responsive layouts. DO NOT USE
harsh neon, excessive glow, childish school graphics, cluttered dashboards,
unnecessary animations, inaccessible low-contrast text. The design should
feel professional, modern, premium, calm, fast, trustworthy.

54. RESPONSIVE DESIGN
Desktop: full sidebar/navigation. Tablet: adaptive sidebar. Mobile: bottom
navigation where appropriate. Student portal must be strongly mobile-first.
Touch targets must be sufficiently large. Tables must become cards,
horizontally scrollable, or responsive data layouts where appropriate.

55. ACCESSIBILITY
Support keyboard navigation, focus states, ARIA labels, semantic HTML,
contrast, screen readers, reduced motion, accessible forms, accessible
error messages. Do not rely on color alone to communicate status.

56. PERFORMANCE
Avoid unnecessary database queries, repeated API requests, large bundle
imports, full-table scans, unnecessary rerenders. Use pagination, indexes,
query caching, lazy loading, code splitting, optimized images, virtualized
lists for large datasets where necessary. The application should remain
usable with thousands of students.

57. SCALABILITY
Architecture should support multiple schools, thousands of students per
school, large attendance datasets, large payment histories, large exam
datasets, large document collections. Do not build assumptions that only 50
students or one school will exist.

58. OFFLINE/PWA
PWA support should include installability, manifest, icons, offline
indication, safe caching. Do NOT cache sensitive data insecurely. Offline
actions involving payments, authentication, permissions, marks, or official
attendance must not silently commit without server verification.

59. NOTIFICATION DELIVERY
Support delivery states: queued, processing, sent, delivered, failed.
Retries must be controlled. Repeated events must not spam users.

60. GOOGLE WORKSPACE
Optional integrations: Google Calendar, Drive, Docs, Sheets. OAuth tokens
must be securely stored. Never expose OAuth secrets to the frontend. If
integration fails, core EduManage functionality must continue working.

61. PLATFORM SUPER ADMIN DASHBOARD
Should include total/active/expired/suspended schools, total students,
total teachers, revenue, subscription renewals, recent schools, recent
payments, growth charts, system health. Potential future metrics:
retention, churn, MRR, school activity, feature usage, failed payments.

62. SCHOOL ADMIN DASHBOARD
Should provide student/teacher count, attendance percentage, fee
collection, outstanding fees, upcoming exams, homework, notifications,
calendar, quick actions. Dashboard must respect selected academic year.

63. TEACHER DASHBOARD
Show assigned classes, today's timetable, attendance tasks, homework,
upcoming exams, recent notices, student performance, meetings. Only
authorized data.

64. STUDENT DASHBOARD
Show attendance percentage, fee due, next exam, homework, timetable,
notifications, results, AI Assistant, school announcements. Must remain
lightweight and mobile-friendly.

65. ROUTING CONTRACT
Every route must define path, role, page, purpose, data source,
permissions, read-only behavior, loading/error/empty state. No route should
be accessible solely because a user manually types its URL.

66. ROUTE SECURITY
Test: Student → /admin; Teacher → /admin; School Admin → /admin; School A
Teacher → School B URL; School A Student → School B student ID. All must be
rejected or return authorized empty results.

67. SCREEN-BY-SCREEN SPECIFICATION
Every screen must document screen name, route, role, header, navigation,
cards, tables, filters, search, forms, buttons, modals, empty/error/loading/
success states, permissions, API calls, database tables, audit events,
mobile behavior, read-only behavior. Applies to EVERY screen.

68. BUTTON/ACTION CONTRACT
Every interactive control must document name, purpose, visible roles,
permission, validation, API/RPC, success/error behavior, loading state,
audit event, read-only behavior. Example: "Record Payment" — Role: School
Admin / permitted Sub-Admin; Validation: amount > 0 and amount <=
authoritative outstanding balance; Backend: record_fee_payment RPC; Success:
payment created + receipt generated; Audit: fee_payment.created.

69. STATE MACHINES
Important entities must have documented state transitions. Subscription:
trial → active → past_due → expired → renewed. Payment: pending → paid;
pending → failed; paid → refunded. Exam: draft → scheduled → active →
submitted → published → locked. Meeting: scheduled → active → completed;
scheduled → cancelled. Student: active → inactive → archived. Transfer:
initiated → pending → accepted → completed, or initiated → rejected.

70. DATA OWNERSHIP
Every entity must have a documented owner. Student/Teacher/Fee: School owns
record. Attendance: School owns record; teacher may create for assigned
class. Exam: School owns record; teacher/admin may operate according to
permissions.

71. AUDIT REQUIREMENTS
Any action that changes official records must be auditable (marks,
attendance, fees, admissions, permissions = YES). Viewing normal dashboard =
normally NO.

72. PRIVACY
Minimize collection of personal data. Only collect information needed for
the product. Protect phone numbers, email, addresses, student documents,
photos, guardian data, financial information.

73. DATA RETENTION
Historical academic records should not be casually deleted. Prefer archive,
soft-delete, status transitions for important educational records. Hard
deletion should require appropriate permission and safeguards.

74. MIGRATION STRATEGY
When modernizing the existing repository: 1. Inventory existing code. 2.
Inventory existing database. 3. Compare implementation with this
specification. 4. Classify: CURRENT, PARTIALLY IMPLEMENTED, REQUIRED,
LEGACY, BROKEN, CONFLICTING. 5. Create migration plan. 6. Implement database
changes. 7. Implement backend/security. 8. Implement frontend. 9. Test. 10.
Document. Do not blindly rewrite everything.

75. LEGACY CODE POLICY
For each legacy component document: file, purpose, current usage,
dependencies, replacement, migration status, removal risk.

76. OBSERVABILITY
Provide visibility into application errors, Edge Function errors,
authentication failures, payment failures, notification failures, backup
failures, restore failures. Avoid logging sensitive data — never log
passwords, access tokens, service keys, payment secrets.

77. RATE LIMITING
Rate-limit sensitive operations: login, password reset, AI requests,
notifications, SMS, email, payment operations, bulk imports,
backup/restore.

78. AI COST CONTROL
AI calls should avoid sending unnecessary context. Student AI should
retrieve only relevant student data. Use token limits, context limits,
caching where appropriate, request throttling, model fallback. Do not
include entire school databases in AI prompts.

79. AI SAFETY
AI must never be allowed to change official marks, attendance, fees,
subscriptions, permissions; create admin accounts; execute arbitrary SQL;
access secrets. AI may recommend actions, but privileged state changes must
go through authorized deterministic application workflows.

80. CONFIGURATION
Configuration should be centralized: maximum upload size, session timeout,
exam duration, notification limits, AI limits, subscription limits,
attendance rules. Do not scatter hard-coded business values throughout
React components.

81. FEATURE FLAGS
Optional/experimental features should use feature flags: face attendance,
Google Workspace, web push, student online payments, advanced AI analytics.
Do not display fake "coming soon" functionality unless intentionally
desired.

82. NO PLACEHOLDER FUNCTIONALITY
Do not create fake buttons, dead buttons, fake statistics, fake API
responses, placeholder dashboards, mock success messages in production, or
"coming soon" labels unless the product owner explicitly requests a
prototype state. If a feature is unavailable, the implementation status
must be documented.

83. SEARCH & FILTERING
Major list screens should support search, filters, sorting, pagination,
academic year, class, section, status. Search should be performant and
server-aware where datasets are large.

84. REPORTING
Reports should support academic, attendance, financial, student, teacher,
exam, subscription, audit categories, and must respect role permissions and
school isolation.

85. SECURITY ACCEPTANCE TESTS
SEC-001: School A cannot read School B. SEC-002: School A cannot insert
school_id=B. SEC-003: School A cannot update School B. SEC-004: Student
cannot access another student's data. SEC-005: Teacher cannot access another
school's class. SEC-006: Sub-Admin cannot escalate permissions. SEC-007:
School Admin cannot create a school. SEC-008: Super Admin cannot
accidentally operate as tenant user without explicit platform authorization.
SEC-009: Service-role credentials are absent from frontend bundle. SEC-010:
Exam correct answers are not exposed before submission.

86. PAYMENT ACCEPTANCE TESTS
PAY-001: Create ₹25,000 fee. PAY-002: Pay ₹15,000 → balance = ₹10,000.
PAY-003: Attempt ₹15,000 payment → rejected. PAY-004: Send duplicate request
→ one payment only. PAY-005: Send two simultaneous payments → database
prevents overpayment race. PAY-006: Generate receipt → unique receipt.
PAY-007: Refund paid transaction → ledger reflects refund.

87. SESSION ACCEPTANCE TESTS
SES-001: Teacher logs in on Device A. SES-002: Teacher logs in on Device B →
per policy: reject B OR revoke A. SES-003: Old Device A attempts API request
→ session rejected. SES-004: Teacher logs out → session revoked. SES-005:
Password reset → all active teacher sessions revoked.

88. SUB-ADMIN ACCEPTANCE TESTS
SUB-001: Create Sub-Admin. SUB-002: Grant attendance permission → attendance
available. SUB-003: Do not grant fees permission → fees inaccessible.
SUB-004: Attempt direct fee API → server rejects. SUB-005: Attempt school
creation → server rejects.

89. SUBSCRIPTION ACCEPTANCE TESTS
SUBS-001: Expire subscription → read-only. SUBS-002: View students →
allowed. SUBS-003: Export report → allowed. SUBS-004: Create student →
rejected server-side. SUBS-005: Renew subscription → write permissions
restored.

90. ONLINE EXAM ACCEPTANCE TESTS
EXAM-001: Student starts exam. EXAM-002: Timer starts server-authoritatively.
EXAM-003: Refresh page → attempt resumes. EXAM-004: Network disconnect →
local answer recovery where safe. EXAM-005: Submit → server grades.
EXAM-006: Submit again → idempotent/no duplicate submission. EXAM-007:
Attempt to modify score → rejected.

91. BACKUP ACCEPTANCE TESTS
BACK-001: School A creates backup. BACK-002: Backup contains only School A
data. BACK-003: Backup does not contain service secrets. BACK-004: Restore
valid backup → records restored. BACK-005: Attempt School A backup as
School B → rejected.

92. COMPLETE MASTER TEST TARGET
The project should eventually contain at least 150+ meaningful automated or
documented acceptance tests, expanded across authentication, RBAC, RLS,
sub-admin, schools, academic years, students, teachers, attendance, fees,
exams, online exams, homework, materials, timetable, notifications,
meetings, ID cards, reports, backup, restore, subscriptions, AI, PWA,
accessibility, performance, security, error handling, concurrency.

93. REQUIRED DOCUMENTATION GENERATED BY AI
01 Product Overview, 02 Architecture, 03 Database Schema, 04 ER Diagram, 05
RLS Matrix, 06 Role Matrix, 07 Permission Matrix, 08 Route Matrix, 09
Screen Inventory, 10 Component Inventory, 11 Function Inventory, 12 Edge
Function API Contract, 13 Storage Architecture, 14 Notification
Architecture, 15 Payment Architecture, 16 Subscription State Machine, 17
Exam State Machine, 18 Attendance Workflow, 19 Fee Workflow, 20 Admission
Workflow, 21 Promotion Workflow, 22 Transfer Workflow, 23 Backup/Restore
Workflow, 24 Teacher Session Workflow, 25 AI Architecture, 26 Security
Threat Model, 27 Error Catalog, 28 Acceptance Tests, 29 Migration Plan, 30
Deployment Guide, 31 Environment Variables, 32 Operational Runbook, 33
Disaster Recovery Plan, 34 Changelog.

94. ENVIRONMENT VARIABLES
Frontend may contain only public configuration: VITE_SUPABASE_URL,
VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_PROJECT_ID. Server-only: Stripe
secret, SMS credentials, Email credentials, AI credentials, Google OAuth
secrets, service-role credentials. These must never be bundled into the
frontend.

95. DEPLOYMENT
Production deployment must verify database migrations, RLS, Edge Functions,
environment variables, storage policies, authentication, PWA, email, SMS,
payments, Google integrations, AI functions. Before production: run
security tests, database tests, acceptance tests; verify no secrets in
bundle; verify production URLs; verify backup.

96. DISASTER RECOVERY
Define backup frequency, retention, restore procedure, restore
verification, failure recovery, rollback strategy. Backups must be tested
by actually restoring a test environment. A backup that has never been
restored should NOT be assumed reliable.

97. DATA MIGRATION
Never destroy original data before successful validation. Migration
process: backup → schema migration → data migration → integrity validation
→ RLS validation → application validation → acceptance tests → production
cutover.

98. CURRENT VS REQUIRED STATUS SYSTEM
Every feature must have exactly one primary implementation status: CURRENT,
PARTIALLY_IMPLEMENTED, REQUIRED, LEGACY, BROKEN, CONFLICTING, DEPRECATED.
Do not mark a feature CURRENT merely because a page exists — only if its
full intended behavior works.

99. CURRENT KNOWN GAPS
1. Teacher one-session locking. 2. Granular Sub-Admin permission UI. 3.
Dynamic 100+ ID card templates. 4. Database-level fee overpayment
protection. 5. Robust cross-school transfer workflow. 6. Google Workspace
completion. 7. Face attendance hardening. 8. Student online payment if
explicitly approved. 9. Automated absence notification scheduling if
required. 10. Complete screen-by-screen UI specification. 11. Complete
table-by-table database specification. 12. Complete API contract. 13.
Complete security test suite. 14. Complete acceptance test suite. 15.
Complete state-machine definitions. 16. Complete migration/reconciliation of
legacy queries. 17. Academic-year fallback hardening.

100. CONFLICT RESOLUTION
Known conflict: Student Transfer currently suggests cross-school transfer
while normal RLS prevents cross-school writes. Resolution: do NOT bypass
RLS from the frontend — implement a controlled server-side transfer
workflow. Known conflict: ID-card system claims 100+ templates while fewer
exist. Resolution: do not claim 100+ until 100+ working dynamic templates
actually exist. Known conflict: Transport exists partially. Resolution: do
not expand into a full transportation system unless explicitly requested.
Known conflict: No Parent Portal. Resolution: keep Parent Portal absent.

101. UI QUALITY STANDARD
Every screen should feel production-ready: no broken layouts, no
overflowing tables, no inconsistent spacing, no missing loading states, no
dead buttons, no unexplained errors, no fake data, no accidental browser
alerts, no unstyled raw inputs, no inconsistent typography. Use reusable
design-system components.

102. COMPONENT ARCHITECTURE
Avoid duplicating buttons, dialogs, tables, forms, cards, loaders,
permission checks, error handling, file upload logic, notifications,
pagination, search, filters. Build reusable components.

103. FRONTEND DATA ARCHITECTURE
Use predictable query/mutation patterns: query caching, invalidation after
mutations, optimistic updates only where safe, loading states, retry logic,
error boundaries, stale-data handling. Do not put sensitive authorization
logic only inside React state.

104. BUSINESS LOGIC LOCATION
UI: presentation + interaction. Hooks: client data orchestration. Edge
Functions: privileged server workflows. RPC: transactional database
operations. Database: integrity + authorization + constraints. Do not
implement critical financial/security logic solely in React.

105. FINANCIAL INTEGRITY
Never trust client fee balance, client payment amount, client receipt
number, or client subscription state. Server/database calculates
authoritative values.

106. HISTORICAL DATA INTEGRITY
Never overwrite historical marks, attendance, fees, or academic enrollments
without permission, audit, and an appropriate correction workflow.

107. AUDITABLE ADMINISTRATION
Permission changes must be logged, e.g. Admin A grants Sub-Admin B
fees.update → audit actor=Admin A, target=Sub-Admin B, permission=
fees.update, timestamp=...

108. SECURITY REVIEW CHECKLIST
RLS enabled and tested; cross-school tests passed; role escalation tested;
service keys hidden; storage protected; file uploads validated; payment
concurrency tested; exam answer leakage tested; session lock tested;
password reset revokes sessions; audit logs working; backups tested;
restore tested; rate limiting considered; AI authorization tested; AI
prompt injection considered; sensitive logs removed.

109. PERFORMANCE REVIEW CHECKLIST
Pagination; indexes; query caching; lazy loading; optimized assets; no N+1
queries; large student/attendance/fee/exam datasets tested; mobile
performance tested.

110. FINAL AI AGENT OPERATING PROCEDURE
When asked to modify EduManage: 1. Understand the requested change. 2.
Identify affected modules. 3. Identify affected database tables. 4. Identify
affected RLS policies. 5. Identify affected roles. 6. Identify affected
routes. 7. Identify affected Edge Functions/RPCs. 8. Identify affected audit
events. 9. Identify migration requirements. 10. Implement backend/security
first where appropriate. 11. Implement frontend. 12. Test normal behavior.
13. Test unauthorized behavior. 14. Test cross-school behavior. 15. Test
expired subscription behavior. 16. Test mobile behavior. 17. Update
documentation. 18. Report exactly what changed.

111. CHANGE REPORT FORMAT
Every AI coding task must finish with: CHANGED (files, database, routes,
components, functions); SECURITY (RLS changes, permissions, validation);
DATABASE (migrations, constraints, indexes); TESTED (successful/failure
tests); KNOWN LIMITATIONS (anything unfinished). DO NOT CLAIM SUCCESS IF
TESTING WAS NOT PERFORMED.

112. FINAL DEFINITION OF DONE
EduManage is NOT production-ready merely because pages load, forms exist,
buttons work, dashboards look good. Production-ready means authentication,
RBAC, sub-admin permissions, RLS, multi-tenancy, database constraints,
race-safe payments, secure exams, teacher session lock, subscription
read-only enforcement, backups, restores, audit logs, secure storage,
scoped AI data, responsive UI, accessibility, error handling, and
acceptance tests ALL work, and documentation matches the real
implementation.

113. FINAL PRODUCT RULES — NON-NEGOTIABLE
1. Multi-school isolation is mandatory. 2. RLS must never be removed. 3.
Parent Portal must not be added. 4. Super Admin creates only School Admin
accounts. 5. School Admin controls their own school. 6. Sub-Admin is
permission-based. 7. Teachers are assignment-scoped. 8. Students are
identity-scoped. 9. Teacher one-session security is required. 10. Fees must
be transaction-safe. 11. Overpayments must be blocked server-side. 12.
Duplicate payments must be prevented. 13. Online exam answers must be
secure. 14. Official marks must be server-controlled. 15. Historical
academic data must be preserved. 16. Expired subscriptions become
read-only. 17. Read-only must be enforced server-side. 18. Backups must be
school-scoped. 19. Restores must be validated and transactional. 20.
Sensitive actions must be audited. 21. Storage must be school-scoped. 22.
Secrets must remain server-side. 23. AI must respect authorization. 24. AI
must not directly perform privileged mutations. 25. No fake functionality.
26. No fake statistics. 27. No fake "100+ templates" claim until
implemented. 28. No dead buttons. 29. No undocumented security bypasses.
30. No silent business-rule changes. 31. Every important feature must have
acceptance tests. 32. Every production feature must have clear error
handling. 33. Every tenant-sensitive API must enforce authorization. 34.
Database constraints must protect critical business rules. 35. The
implementation must be scalable beyond a single school.

114. MASTER IMPLEMENTATION STATUS
The AI must maintain a continuously updated status table (feature, status,
implementation, database, RLS, roles, routes, tests, known issues) using
statuses CURRENT, PARTIAL, REQUIRED, LEGACY, BROKEN, CONFLICTING,
DEPRECATED. See `docs/status.md` in this repository.

115. FINAL INSTRUCTION TO THE AI
Treat this document as the authoritative specification for EduManage. Do
not merely create a visually impressive frontend — build a complete,
secure, multi-tenant school management platform. Prioritize: 1. Security 2.
Data isolation 3. Database integrity 4. Authorization 5. Correct business
logic 6. Reliability 7. Auditability 8. Performance 9. Usability 10.
Premium UI. The system must be designed so that a malicious user cannot
gain access to another school's information merely by changing a URL, UUID,
request body, JWT-related client state, browser storage, or frontend
parameters. The final implementation must be consistent across database,
RLS, RPC, Edge Functions, Auth, RBAC, routes, components, UI, business
logic, audit, and tests. If the existing repository conflicts with this
specification, do NOT silently choose one — identify the conflict, explain
existing behavior, required behavior, security implications, recommended
migration, and implementation status, then implement the safest
specification-compliant solution.

END OF EDUMANAGE ULTIMATE MASTER SPECIFICATION

---
ADDENDUM — PHASE 1 SCOPE DECISIONS (product owner, 15 Sep 2026)
These decisions refine (not contradict) the specification above for the
current build phase; see docs/plan/PHASE_1_PLAN.md for full detail.

- Cross-platform: all business logic/authorization must live server-side
  (Postgres RLS/RPC + Edge Functions) so a future Flutter Android app and a
  Tauri desktop app can reuse it without reimplementing rules. Tauri will
  wrap the same React web build; Flutter will call the same RPC/Edge
  Function contracts.
- Subscription billing is manual and Super-Admin-only in Phase 1: schools
  pay off-platform, Super Admin verifies payment and activates/extends the
  subscription (plan, start date, expiry date), audit-logged. No in-app
  Stripe checkout for schools in Phase 1. School Admin cannot change their
  own subscription.
- Phase 1 module scope: Foundation (auth, multi-tenancy/RLS, RBAC +
  Sub-Admin permissions, school setup wizard, academic years/classes/
  sections/subjects, audit logs) + Student Master/Admissions/Documents/
  Promotion/Transfer + Teacher Management/Assignments/One-Session Security
  + Fees/Fee Structures/Payments (server-side overpayment protection) +
  Receipts (PDF) + manual Subscription activation + Attendance + offline
  Exams (FA1/FA2/MID/FA3/FA4/FINAL) with marks entry + Homework + Study
  Materials + Timetable + Notifications (in-app/email; SMS/push stubbed
  behind a provider interface) + Backup/Restore + Reports & Exports + Super
  Admin platform dashboard + PWA/offline support.
- Deferred to later phases: Online Exam Engine, Report Cards & AI Report
  Cards, Face Attendance, Meetings + School Calendar, ID Card Studio,
  Student AI Assistant, AI School Analytics, Google Workspace integration,
  the actual Flutter Android app, the actual Tauri desktop packaging,
  automatic/Stripe subscription billing.
