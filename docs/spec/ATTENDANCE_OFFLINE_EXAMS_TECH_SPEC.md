# Attendance and Offline Exams Technical Specification

## Summary
This specification defines the Phase 1 Attendance and Offline Exams module. It locks the module-owned database, authorization, RPC, audit, export, route, test, and rollout contracts. It does not implement the module.

The module depends on the Students & Teachers task in issue #1. That task owns `students`, `teachers`, `teacher_assignments`, and `student_enrollments`. Those tables do not exist on `main` at the time of this specification. This document does not create substitute tables.

## Factory context
- `factory_task_uid=01a0a623-3079-751b-a626-929420e7aaea`
- `ticket_source=adhoc`
- `ticket_id=5d418581-6dee-4eee-a096-d6f07ce28a37`
- `ticket_ref=adhoc:5d418581-6dee-4eee-a096-d6f07ce28a37`
- Tracking issue: [#2](https://github.com/nomaan5541/edumanage/issues/2)
- Hard dependency: [#1](https://github.com/nomaan5541/edumanage/issues/1)

## Current state
- `main` contains the foundation migrations through `supabase/migrations/20260915160800_school_onboarding_rpc.sql`.
- The permission catalog already contains `attendance.read`, `attendance.create`, `attendance.update`, `exams.read`, `exams.create`, `exams.update`, and `exams.publish`.
- The helpers `public.has_permission`, `public.is_school_read_only`, and `public.write_audit_log` already exist.
- The academic tables `academic_years`, `classes`, `sections`, `subjects`, and `class_subjects` already exist.
- Routes use `/admin/*`, while School Admin page files use `src/pages/school-admin/*`.
- `RoleLayout` renders `AppShell`. `ProtectedRoute` is only a user-experience gate. RLS and RPC checks remain the security boundary.
- No attendance or exam table, migration, page, or open pull request exists.
- No durable Students & Teachers branch or pull request exists on GitHub at the time of writing. Its Factory task is in implementation.
## Requester decisions
- Write and approve the shared schema, RPC, and route contracts before implementation.
- Treat the Students & Teachers module's merged tables as authoritative.
- Do not create parallel student, teacher, or assignment tables.
- Write this specification before the sibling merge, but mark sibling-shape assumptions as provisional.
- Start implementation only after the specification is approved and the sibling tables exist on `main`.
- Use `src/pages/school-admin/*` for School Admin pages and `/admin/*` for their routes.
- Limit export scope to attendance by month/class/section.
- Use lightweight client CSV and browser print/Save as PDF unless an established repository utility appears before implementation.

## Locked module-owned contracts

### Migration boundaries
- Add new migration files only.
- Do not edit an existing foundation migration.
- Select migration timestamps after all Students & Teachers migrations that have merged into `main`.
- Apply migrations in this order:
  1. Attendance/exam enums, tables, indexes, constraints, and integrity triggers.
  2. Dependency adapter helpers and RLS policies.
  3. Attendance/exam write RPCs, grants, and table DML revocations.
- If another module uses a selected timestamp before this work merges, rename the new migration. Do not rewrite the other module's migration history.

### Enums
Create these enums:

```sql
create type public.attendance_status as enum (
  'present', 'absent', 'late', 'excused'
);

create type public.offline_exam_type as enum (
  'FA1', 'FA2', 'MID', 'FA3', 'FA4', 'FINAL'
);

create type public.offline_exam_status as enum (
  'draft', 'published'
);
```

The API and TypeScript types must use these exact values.

### `public.attendance`
Purpose: Store one official daily attendance result for one student in one academic year.

Columns:
- `id uuid primary key default gen_random_uuid()`
- `school_id uuid not null references public.schools(id) on delete restrict`
- `student_id uuid not null references public.students(id) on delete restrict`
- `academic_year_id uuid not null references public.academic_years(id) on delete restrict`
- `class_id uuid not null references public.classes(id) on delete restrict`
- `section_id uuid not null references public.sections(id) on delete restrict`
- `attendance_date date not null`
- `status public.attendance_status not null`
- `note text null`
- `marked_by_user_id uuid not null references auth.users(id) on delete restrict`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints and triggers:
- Add `constraint attendance_student_date_year_key unique (student_id, attendance_date, academic_year_id)`.
- Add a check that `note` is null or `btrim(note) <> ''`.
- Use the existing `public.set_updated_at()` trigger for `updated_at`.
- Add `public.enforce_attendance_scope()` as a `before insert or update` trigger.
- `enforce_attendance_scope()` must reject a row unless the student, academic year, class, and section belong to `school_id`.
- The trigger must reject a row unless the section belongs to `class_id`.
- The trigger must reject a row unless the student has a valid enrollment for the exact academic year, class, and section.
- The trigger must reject `attendance_date` outside the academic year's inclusive `start_date..end_date`.
- The trigger must reject changes to `school_id`, `student_id`, `academic_year_id`, `class_id`, `section_id`, `attendance_date`, and `marked_by_user_id` after insertion. Corrections may change only `status`, `note`, and `updated_at`.

Indexes:
- `(school_id, academic_year_id, class_id, section_id, attendance_date)`
- `(student_id, academic_year_id, attendance_date desc)`
- The unique constraint supplies the duplicate-prevention index.

Delete and retention behavior:
- Do not define a DELETE policy or delete RPC.
- Attendance is historical academic data. Phase 1 corrections update the row through the correction RPC and preserve the old value in the audit log.

### `public.exams`
Purpose: Define one offline exam for one academic year, class, section, subject, and supported exam type.

Columns:
- `id uuid primary key default gen_random_uuid()`
- `school_id uuid not null references public.schools(id) on delete restrict`
- `academic_year_id uuid not null references public.academic_years(id) on delete restrict`
- `class_id uuid not null references public.classes(id) on delete restrict`
- `section_id uuid not null references public.sections(id) on delete restrict`
- `subject_id uuid not null references public.subjects(id) on delete restrict`
- `exam_type public.offline_exam_type not null`
- `title text not null`
- `exam_date date not null`
- `max_marks numeric(7,2) not null`
- `instructions text null`
- `status public.offline_exam_status not null default 'draft'`
- `created_by_user_id uuid not null references auth.users(id) on delete restrict`
- `published_by_user_id uuid null references auth.users(id) on delete restrict`
- `published_at timestamptz null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints and triggers:
- Add `constraint exams_max_marks_positive check (max_marks > 0)`.
- Add checks that `btrim(title) <> ''` and `instructions` is null or not blank.
- Add a publication-shape check:
  - A `draft` row has null `published_by_user_id` and null `published_at`.
  - A `published` row has non-null `published_by_user_id` and non-null `published_at`.
- Add `constraint exams_scope_type_key unique (school_id, academic_year_id, class_id, section_id, subject_id, exam_type)`.
- Use the existing `public.set_updated_at()` trigger.
- Add `public.enforce_exam_scope()` as a `before insert or update` trigger.
- `enforce_exam_scope()` must verify that the year, class, section, and subject belong to `school_id`.
- The trigger must verify that the section belongs to the class.
- The trigger must verify that `class_subjects` maps the subject to the class and academic year.
- The trigger must reject `exam_date` outside the academic year's inclusive date range.
- The trigger must reject changes to scope columns, `exam_type`, and creator after insertion.
- The trigger must permit only the `draft -> published` status transition and must enforce the publication-shape check.

Indexes:
- `(school_id, academic_year_id, class_id, section_id, exam_date)`
- `(school_id, status, exam_date)`
- The unique constraint supplies the scope/type index.

Delete and retention behavior:
- Do not define a DELETE policy or delete RPC.
- A published exam is immutable in Phase 1.
- Phase 1 has no unpublish or reopen transition.

### `public.exam_marks`
Purpose: Store one student's result for one offline exam.

Columns:
- `id uuid primary key default gen_random_uuid()`
- `school_id uuid not null references public.schools(id) on delete restrict`
- `exam_id uuid not null references public.exams(id) on delete restrict`
- `student_id uuid not null references public.students(id) on delete restrict`
- `marks numeric(7,2) null`
- `is_absent boolean not null default false`
- `remarks text null`
- `entered_by_user_id uuid not null references auth.users(id) on delete restrict`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints and triggers:
- Add `constraint exam_marks_exam_student_key unique (exam_id, student_id)`.
- Add a check that enforces exactly one result shape:
  - `is_absent = true` and `marks is null`; or
  - `is_absent = false` and `marks is not null` and `marks >= 0`.
- Add a check that `remarks` is null or not blank.
- Use the existing `public.set_updated_at()` trigger.
- Add `public.enforce_exam_mark_scope_and_range()` as a `before insert or update` trigger.
- The trigger must verify that the exam and student belong to `school_id`.
- The trigger must verify that the student has a valid enrollment in the exam's academic year, class, and section.
- The trigger must reject a non-null mark greater than the exam's authoritative `max_marks`.
- The trigger must reject every insert or update when the exam is not `draft`.
- The trigger must reject changes to `school_id`, `exam_id`, `student_id`, and `entered_by_user_id` after insertion.

Indexes:
- `(school_id, student_id, created_at desc)`
- `(exam_id)`
- The unique constraint supplies the exam/student index.

Delete and retention behavior:
- Do not define a DELETE policy or delete RPC.
- Saving a draft mark updates an existing row. Omitting a student from a later batch does not delete that student's row.

### `public.attendance_monthly_summary`
Create a view with `(security_invoker = true)`. The view must rely on `public.attendance` RLS and must not bypass it.

Columns:
- `school_id`
- `student_id`
- `academic_year_id`
- `class_id`
- `section_id`
- `month_start`, computed as the first date of the month
- `present_count`
- `absent_count`
- `late_count`
- `excused_count`
- `attended_days`, computed as `present_count + late_count`
- `counted_days`, computed as `present_count + absent_count + late_count`
- `percentage`, computed as:
  - null when `counted_days = 0`
  - otherwise `round(attended_days * 100.0 / counted_days, 2)`

An excused day is visible in its own count. It is excluded from both the numerator and denominator. This formula is an assumption that requires requester approval.

Grant SELECT on the view to `authenticated`. Do not grant any write privilege.

## Provisional sibling-schema contracts
These assumptions are provisional until the Students & Teachers work merges. The merged tables are authoritative.

### Required capabilities
The merged sibling module must make these relationships possible without a parallel table:
- A student primary key maps to one school.
- An authenticated student user maps to their own student row.
- A student's enrollment can be checked for an academic year, class, and section.
- A teacher primary key maps to one school.
- An authenticated teacher user maps to their teacher row.
- A teacher assignment can be checked for an academic year, class, and section.
- A subject-specific teacher assignment can be checked for an academic year, class, section, and subject.
- Inactive students, teachers, enrollments, or assignments can be distinguished from active ones.

### Expected columns
The implementation may use different sibling column names only inside the adapter helpers. It must not change the module-owned table or RPC contracts without a specification revision.

Expected `students` capability:
- `id uuid`
- `school_id uuid`
- A nullable user-account link equivalent to `user_id uuid`
- An active/inactive state

Expected `student_enrollments` capability:
- `student_id uuid`
- `school_id uuid`
- `academic_year_id uuid`
- `class_id uuid`
- `section_id uuid`
- An active/current state that does not erase historical enrollments

Expected `teachers` capability:
- `id uuid`
- `school_id uuid`
- A user-account link equivalent to `user_id uuid`
- An active/inactive state

Expected `teacher_assignments` capability:
- `teacher_id uuid`
- `school_id uuid`
- `academic_year_id uuid`
- `class_id uuid`
- `section_id uuid`
- `subject_id uuid`
- An active/inactive state

### Locked adapter helpers
Implement these module-owned helpers after inspecting the merged sibling schema:
- `public.attendance_exam_student_is_enrolled(target_student_id uuid, target_school_id uuid, target_academic_year_id uuid, target_class_id uuid, target_section_id uuid) returns boolean`
- `public.attendance_exam_current_user_is_student(target_student_id uuid, target_school_id uuid) returns boolean`
- `public.attendance_exam_teacher_has_class_scope(target_school_id uuid, target_academic_year_id uuid, target_class_id uuid, target_section_id uuid) returns boolean`
- `public.attendance_exam_teacher_has_subject_scope(target_school_id uuid, target_academic_year_id uuid, target_class_id uuid, target_section_id uuid, target_subject_id uuid) returns boolean`

Each helper must be `stable security definer set search_path = public`.

Each helper must return false when:
- `auth.uid()` is null where caller identity is required.
- The supplied school differs from the caller's school.
- A referenced row is missing or inactive.
- A referenced row belongs to another school.
- An enrollment or assignment does not match every supplied scope field.

Grant helper execution to `authenticated`. Revoke execution from `public` and `anon`.

### Dependency verification before implementation
After issue #1 merges, the implementation agent must:
1. Fetch and integrate the current `origin/main`.
2. Record the Students & Teachers merge commit and migration names in this document or the implementation PR.
3. Inspect `pg_catalog`, `information_schema.columns`, foreign keys, unique constraints, RLS policies, and table comments for the four sibling tables.
4. Confirm the required capabilities above with SQL acceptance tests.
5. Implement the adapter helpers against the real schema.
6. Stop and request a specification revision if any required capability is absent.
7. Never add a second student, teacher, enrollment, or assignment table to resolve a mismatch.

Add dependency contract tests under `supabase/tests/attendance_offline_exams_dependency_test.sql`. The tests must fail clearly when the sibling schema cannot support an exact school, enrollment, or assignment check.

## Authorization and RLS

### General rules
- Enable RLS on `attendance`, `exams`, and `exam_marks`.
- All client mutations use SECURITY DEFINER RPCs.
- Define no direct INSERT, UPDATE, or DELETE policy on module tables.
- Revoke INSERT, UPDATE, DELETE, and TRUNCATE from `authenticated` and `anon`.
- Grant SELECT to `authenticated`.
- Grant no module table privileges to `anon`.
- Never trust a client-supplied school, teacher, creator, publisher, or actor identifier.
- Read-only mode never blocks SELECT or export.
- RLS must distinguish roles explicitly. `public.is_school_member` alone is not sufficient because students and teachers are school members with narrower scopes.

### `attendance` SELECT policy
Allow a row when one branch is true:
- `public.has_permission(school_id, 'attendance.read')`; or
- `public.attendance_exam_teacher_has_class_scope(school_id, academic_year_id, class_id, section_id)`; or
- `public.attendance_exam_current_user_is_student(student_id, school_id)`.

Result:
- School Admin and Super Admin pass through `has_permission`.
- A Sub-Admin needs `attendance.read`.
- A teacher sees only assigned class/section/year rows.
- A student sees only their own rows.

### `exams` SELECT policy
Allow a row when one branch is true:
- `public.has_permission(school_id, 'exams.read')`; or
- `public.attendance_exam_teacher_has_subject_scope(school_id, academic_year_id, class_id, section_id, subject_id)`; or
- `status = 'published'` and there is a sibling `students` row for which both `public.attendance_exam_current_user_is_student(students.id, school_id)` and `public.attendance_exam_student_is_enrolled(students.id, school_id, academic_year_id, class_id, section_id)` are true.

A student must not see a draft exam through this policy.

### `exam_marks` SELECT policy
Allow a row when one branch is true:
- The caller has `exams.read` for `school_id`; or
- The linked exam is in the caller teacher's exact subject assignment scope; or
- The row belongs to the current student and the linked exam has `status = 'published'`.

The student branch must check publication in RLS. A React filter is not sufficient.

### SECURITY DEFINER requirements
Every module RPC must:
- Use `language plpgsql security definer set search_path = public`.
- Reject an unauthenticated caller.
- Resolve the school from the caller and/or locked target row.
- Reject a cross-school target with `This resource is not available.`
- Check the exact permission or teacher assignment inside the function.
- Call `public.is_school_read_only(v_school_id)` before any write.
- Raise `School is in read-only mode. Subscription renewal is required to make changes.` when read-only.
- Lock an existing target row with `for update` before changing it.
- Validate every input before the first write.
- Perform a batch atomically. One invalid entry rejects the whole batch.
- Call `public.write_audit_log` inside the same transaction.
- Expose no raw SQL error to the UI.
- Revoke execution from `public` and `anon`.
- Grant execution to `authenticated`.

## Write RPC contracts

### `public.mark_attendance`
Signature:

```sql
public.mark_attendance(
  p_academic_year_id uuid,
  p_class_id uuid,
  p_section_id uuid,
  p_attendance_date date,
  p_entries jsonb
) returns setof public.attendance
```

Input entry shape:

```json
{
  "student_id": "uuid",
  "status": "present",
  "note": "optional non-blank text"
}
```

Rules:
- Resolve `school_id` from `public.current_user_school_id()`.
- Permit `attendance.create` or an active teacher assignment for the exact year/class/section.
- Reject an empty array, a non-array value, malformed entries, or duplicate student IDs in the payload.
- Validate every student enrollment before insertion.
- Set `marked_by_user_id = auth.uid()`.
- Insert only. Do not use `on conflict do update`.
- Let `attendance_student_date_year_key` enforce final duplicate safety.
- Convert the uniqueness failure to `Attendance already exists for this student and date. Use the correction action.`
- Write one `attendance.created` audit event per inserted row.
- Return inserted rows in input order.

### `public.correct_attendance`
Signature:

```sql
public.correct_attendance(
  p_attendance_id uuid,
  p_status public.attendance_status,
  p_note text default null
) returns public.attendance
```

Rules:
- Lock the attendance row.
- Resolve school and scope from the locked row.
- Permit `attendance.update` or an active teacher assignment for the row's exact year/class/section.
- Reject a no-op correction.
- Update only `status`, `note`, and `updated_at`.
- Write one `attendance.corrected` audit event.
- Put the full old and new official row values in `old_values` and `new_values`.
- Include `attendance_date`, `academic_year_id`, `class_id`, and `section_id` in audit metadata.

### `public.create_offline_exam`
Signature:

```sql
public.create_offline_exam(
  p_academic_year_id uuid,
  p_class_id uuid,
  p_section_id uuid,
  p_subject_id uuid,
  p_exam_type public.offline_exam_type,
  p_title text,
  p_exam_date date,
  p_max_marks numeric,
  p_instructions text default null
) returns public.exams
```

Rules:
- Resolve `school_id` from `public.current_user_school_id()`.
- Permit `exams.create` or an active teacher assignment for the exact year/class/section/subject.
- Validate the academic and class-subject scope.
- Set status to `draft`.
- Set `created_by_user_id = auth.uid()`.
- Convert a scope/type uniqueness failure to `This exam type already exists for the selected year, class, section, and subject.`
- Write one `exam.created` audit event with the created row in `new_values`.

### `public.update_offline_exam`
Signature:

```sql
public.update_offline_exam(
  p_exam_id uuid,
  p_title text,
  p_exam_date date,
  p_max_marks numeric,
  p_instructions text default null
) returns public.exams
```

Rules:
- Lock the exam row.
- Permit `exams.update` or an active teacher assignment for the exam's exact scope.
- Reject an exam whose status is not `draft`.
- Do not change scope, type, creator, status, or publication fields.
- Reject a lower `max_marks` when an existing non-absent mark exceeds the new value.
- Write one `exam.updated` audit event with full old and new row values.

### `public.save_offline_exam_marks`
Signature:

```sql
public.save_offline_exam_marks(
  p_exam_id uuid,
  p_entries jsonb
) returns setof public.exam_marks
```

Input entry shapes:

```json
{
  "student_id": "uuid",
  "marks": 72.5,
  "is_absent": false,
  "remarks": "optional non-blank text"
}
```

```json
{
  "student_id": "uuid",
  "marks": null,
  "is_absent": true,
  "remarks": "optional non-blank text"
}
```

Rules:
- Lock the exam row.
- Permit `exams.update` or an active teacher assignment for the exam's exact scope.
- Reject an exam whose status is not `draft`.
- Reject an empty array, a non-array value, malformed entries, or duplicate student IDs in the payload.
- Validate every student against the exam enrollment scope.
- Validate `0 <= marks <= exams.max_marks` for every non-absent entry.
- Upsert by `(exam_id, student_id)`.
- Preserve the original `entered_by_user_id` when updating a row. The audit actor records the later editor.
- Write `exam_mark.created` for each inserted row.
- Write `exam_mark.updated` for each changed row with full old and new values.
- Do not audit or update a byte-identical entry.
- Return affected rows in input order.

### `public.publish_offline_exam`
Signature:

```sql
public.publish_offline_exam(
  p_exam_id uuid
) returns public.exams
```

Rules:
- Lock the exam row.
- Require `public.has_permission(school_id, 'exams.publish')`.
- An assignment-scoped teacher without this permission cannot publish.
- Reject an exam whose status is not `draft`.
- Require exactly one `exam_marks` row for every active student enrollment in the exam's year/class/section.
- Reject marks for a student outside that roster.
- Permit absent students through the explicit `is_absent` result shape.
- Revalidate all mark ranges while the exam row is locked.
- Set `status = 'published'`, `published_by_user_id = auth.uid()`, and `published_at = now()`.
- Write one `exam.published` audit event.
- Include the roster count, numeric-result count, absent count, and publication timestamp in metadata.
- Publication is atomic and irreversible in Phase 1.

## Audit contract
The audit action names are locked:
- `attendance.created`
- `attendance.corrected`
- `exam.created`
- `exam.updated`
- `exam_mark.created`
- `exam_mark.updated`
- `exam.published`

Use entity types `attendance`, `exam`, and `exam_mark`.

Audit records must:
- Use the official row UUID as `entity_id`.
- Use `to_jsonb(row)` for complete old and new official values.
- Avoid student names, contact details, or free-form UI state in metadata.
- Be written in the same transaction as the official change.
- Remain append-only through the existing `audit_logs` protections.

## Read-only contract
- Every write RPC must call `public.is_school_read_only`.
- RLS and revocations prevent clients from bypassing RPC guards with direct table writes.
- School Admin, Sub-Admin, teacher, and student reads continue under normal RLS when a school is read-only.
- Attendance CSV and print/PDF exports continue when a school is read-only.
- The UI disables mutation controls and displays the repository-standard renewal message.
- The backend rejection remains authoritative when a client bypasses the disabled control.

## Export contract
Phase 1 exports only an attendance month/class/section report.

### Authorization
- School Admin and Super Admin may export through `attendance.read`.
- A Sub-Admin needs `attendance.read`.
- A teacher may export only an assigned year/class/section.
- A student export is out of scope.
- Export queries use normal authenticated Supabase access. They do not use a service-role key.

### CSV
- Implement CSV in the client without a new dependency.
- Query the authorized attendance rows and `attendance_monthly_summary`.
- Join only the minimum authorized student display fields from the merged Students & Teachers schema.
- Emit UTF-8 with a byte-order mark for spreadsheet compatibility.
- Escape quotes, commas, and line breaks according to RFC 4180.
- Use one row per student.
- Include school name, academic year, class, section, month, student identifier, admission/roll identifier when available, student name, each status count, counted days, attended days, and percentage.
- Use the filename `attendance-<academic-year>-<class>-<section>-<yyyy-mm>.csv` after filesystem-safe normalization.

### Print/PDF
- Render the same report data in a print-only layout.
- Include school identity, filters, generated timestamp, roster rows, status counts, and percentage.
- Use browser print and `@media print`; the user selects “Save as PDF”.
- Do not add a PDF library in Phase 1.
- Do not claim that the app produces a binary PDF server-side.

## React route and page contracts

### Shared rules
- Add all routes in `src/App.tsx`.
- Render them through the existing `RoleLayout` and `AppShell`.
- Reuse `src/components/ui/*` and the existing glass design system.
- Extend `src/types/database.ts` with the new enums, tables, view, and RPC signatures. Regenerate types from the local database when available, then preserve any required manual type sections.
- Use TanStack Query for server data and invalidation after successful RPCs.
- Never calculate an official mark or attendance mutation only in React.
- Every page must show accessible loading, empty, success, validation-error, authorization-error, network-error, and read-only states.
- Mutation controls must have pending states and prevent duplicate submission.
- Tables must remain usable on mobile through cards or horizontal scrolling.

### `/admin/attendance`
- File: `src/pages/school-admin/AttendancePage.tsx`
- Allowed route roles: `school_admin`, `sub_admin`
- Read permission: `attendance.read`
- Create permission: `attendance.create`
- Correction permission: `attendance.update`
- Functions: choose academic year/month/date/class/section, load the valid roster, mark one complete daily batch, review monthly summaries, correct one row, export CSV, and open the print view.
- A Sub-Admin without `attendance.read` sees an authorization state and no data.
- Create and correction controls are independently hidden or disabled when their permissions are absent.

### `/teacher/attendance`
- File: `src/pages/teacher/AttendancePage.tsx`
- Allowed route role: `teacher`
- Scope: assigned academic years/classes/sections only
- Functions: the same attendance workflow within assignment scope.
- Empty state: “No attendance assignments are available.”
- Direct navigation does not widen server scope.

### `/admin/exams`
- File: `src/pages/school-admin/OfflineExamsPage.tsx`
- Allowed route roles: `school_admin`, `sub_admin`
- Read permission: `exams.read`
- Create permission: `exams.create`
- Edit and mark permission: `exams.update`
- Publish permission: `exams.publish`
- Functions: filter exams, create a draft, edit draft metadata, enter marks/absence, review completeness, and publish.
- The publish confirmation states that publication is irreversible in Phase 1.

### `/teacher/exams`
- File: `src/pages/teacher/OfflineExamsPage.tsx`
- Allowed route role: `teacher`
- Scope: exact assigned academic year/class/section/subject
- Functions: create and edit drafts and save marks within scope.
- The teacher page has no publish action unless a future permission model explicitly grants teachers `exams.publish`.
- Empty state: “No exam assignments are available.”

### Navigation
- Add “Attendance” and “Offline Exams” to School Admin navigation.
- Add “Attendance” and “Offline Exams” to Teacher navigation.
- Permission-based visibility is a user-experience aid only.
- No new student route is part of this work. Student RLS is still required and tested for future student result surfaces.

## State and error contracts

### Exam state
- The only transition is `draft -> published`.
- Draft exam metadata and marks are editable through authorized RPCs.
- Published exam metadata and marks are immutable.
- No unpublish, reopen, delete, or republish operation exists in Phase 1.

### Human-readable errors
Use these messages for the named cases:
- Unauthenticated: `Authentication is required.`
- Unauthorized: `You do not have permission to perform this action.`
- Cross-school or missing scoped resource: `This resource is not available.`
- Read-only: `School is in read-only mode. Subscription renewal is required to make changes.`
- Duplicate attendance: `Attendance already exists for this student and date. Use the correction action.`
- Duplicate exam: `This exam type already exists for the selected year, class, section, and subject.`
- Published edit: `Published exam results cannot be changed.`
- Incomplete publish: `Enter a mark or absent status for every active student before publishing.`
- Invalid mark: `Marks must be between 0 and the exam maximum.`

## Decisions and trade-offs

### RPC-only writes
- Chosen: Revoke direct table writes and expose only SECURITY DEFINER write RPCs.
- Advantage: Authorization, read-only checks, validation, row locking, and audit writes remain atomic.
- Disadvantage: More SQL contracts and generated TypeScript signatures are required.
- Rejected: Direct Supabase insert/update with write RLS. That approach makes batch validation and complete audit behavior harder to guarantee.

### Module-owned adapter helpers
- Chosen: Isolate all sibling-schema knowledge in four helper functions.
- Advantage: Module tables and RPCs remain stable when sibling column names differ.
- Disadvantage: The implementation must add and test an adapter layer after the dependency merges.
- Rejected: Create local student/teacher stubs. They would duplicate authoritative records and create migration conflicts.

### One exam row per section and subject
- Chosen: An exam is specific to one year, class, section, subject, and exam type.
- Advantage: Teacher assignment checks and roster completeness are exact.
- Disadvantage: A school-wide FA1 schedule creates multiple exam rows.
- Rejected: One exam header with a separate scope join table. That design is more flexible but adds complexity not required for Phase 1.

### Explicit absence result
- Chosen: Use `is_absent` with null marks.
- Advantage: Zero remains a real score and does not mean absence.
- Disadvantage: The mark entry and publish checks have an additional state.
- Rejected: Store absent as zero or a negative sentinel. Both corrupt numeric result meaning.

### Published results are immutable
- Chosen: Publication locks exam metadata and marks with no Phase 1 reopen flow.
- Advantage: Students never see a moving official result, and the state machine is simple.
- Disadvantage: A post-publication correction needs a future audited reopen design.
- Rejected: Allow ordinary mark edits after publication. That weakens the publication boundary.

### Attendance export implementation
- Chosen: Client CSV plus browser print/Save as PDF.
- Advantage: No heavy dependency or privileged server export path is added.
- Disadvantage: PDF rendering depends on the browser print engine.
- Rejected: Add a PDF generation library before the repository has a shared export convention.

## Assumptions requiring approval
- Excused attendance is excluded from both monthly percentage numerator and denominator.
- Present and late both count as attended.
- An exam has one row per academic year, class, section, subject, and exam type.
- An absent exam result has `is_absent = true` and null marks.
- Publishing requires a result or absent status for every active student in the exam roster.
- Publication is irreversible and locks metadata and marks in Phase 1.
- Assignment-scoped teachers can create exams and save marks, but only `exams.publish` holders can publish.
- Attendance export uses `attendance.read` because the existing catalog has no `attendance.export` permission.
- The browser print dialog is the Phase 1 PDF path.
- Student attendance/result pages are outside this task. Student RLS remains mandatory.
- The Students & Teachers module provides the identity, enrollment, and assignment capabilities listed above. Exact sibling column names remain provisional until its merge.

## Out of scope
- Online exams, questions, answers, timers, attempts, grading, and answer-key security.
- Report cards, grades, rankings, and transcripts.
- Face or QR attendance.
- Absence SMS, email, or push automation.
- Attendance import.
- Exam import or export.
- Attendance deletion.
- Exam deletion, unpublish, or post-publication correction.
- A server-generated binary PDF.
- New student, teacher, enrollment, or assignment tables.
- New student-facing React routes.

## Acceptance tests
Implementation must add runnable database tests under `supabase/tests/attendance_offline_exams_test.sql`.

### Dependency tests
- `DEP-001`: Required sibling tables exist after reset.
- `DEP-002`: A student can be resolved to exactly one school.
- `DEP-003`: A teacher user can be resolved to an active teacher.
- `DEP-004`: Enrollment validation matches all five scope identifiers.
- `DEP-005`: Class assignment validation rejects one mismatched scope identifier.
- `DEP-006`: Subject assignment validation rejects one mismatched scope identifier.

### Attendance tests
- `ATT-001`: The unique constraint rejects a second row for the same student/date/year.
- `ATT-002`: `mark_attendance` inserts a valid assigned roster batch atomically.
- `ATT-003`: An unassigned teacher cannot read or mark another class/section.
- `ATT-004`: A teacher from School A cannot read or mark School B attendance.
- `ATT-005`: A Sub-Admin with only `attendance.read` can read but cannot mark or correct.
- `ATT-006`: A student can read only their own attendance.
- `ATT-007`: `correct_attendance` changes only status/note and writes exact old/new audit values.
- `ATT-008`: Direct authenticated INSERT, UPDATE, and DELETE all fail.
- `ATT-009`: Read-only mode blocks mark and correction RPCs but permits SELECT.
- `ATT-010`: Present and late count as attended; excused is excluded; zero counted days returns null percentage.
- `ATT-011`: A date outside the academic year is rejected.
- `ATT-012`: Any invalid batch member rolls back the complete batch.

### Exam tests
- `EXM-001`: Only the six locked exam types are accepted.
- `EXM-002`: Zero and `max_marks` are accepted; a negative mark and a mark above maximum are rejected.
- `EXM-003`: Absent requires null marks; a numeric non-absent result requires non-null marks.
- `EXM-004`: A student cannot SELECT a draft exam or draft mark.
- `EXM-005`: A student can SELECT only their own published mark.
- `EXM-006`: An assigned teacher can create a draft and save marks only for the exact assigned subject scope.
- `EXM-007`: An unassigned or cross-school teacher cannot read or mutate the exam.
- `EXM-008`: A Sub-Admin needs `exams.publish` to publish even when they have `exams.update`.
- `EXM-009`: Publication rejects an incomplete roster and succeeds atomically for a complete roster.
- `EXM-010`: Published exam metadata and marks cannot change.
- `EXM-011`: Create, update, mark create/update, and publish write the specified audit actions.
- `EXM-012`: Direct authenticated INSERT, UPDATE, and DELETE all fail.
- `EXM-013`: Read-only mode blocks every exam write RPC but permits authorized reads.
- `EXM-014`: Lowering `max_marks` below an entered mark fails.
- `EXM-015`: Any invalid mark batch member rolls back the complete batch.

### RLS role matrix
Tests must use real authenticated JWT claims or an equivalent Supabase test helper. They must cover:
- School Admin in School A.
- Sub-Admin with read-only permissions.
- Sub-Admin with create/update permissions.
- Sub-Admin with and without publish permission.
- Assigned teacher in School A.
- Unassigned teacher in School A.
- Teacher in School B.
- Student who owns the row.
- Another student in the same school.
- Student in another school.
- Anonymous caller.

## Validation gates
Run these commands after implementation and dependency integration:

```bash
npm run build
npm run lint
npx supabase db reset
npx supabase test db --local
git diff --check
```

Validation is incomplete if Docker or a live Supabase/Postgres instance is unavailable. Record the blocked database commands. Do not infer that SQL passed.

Additional gates:
- Regenerate or verify `src/types/database.ts` against the reset database.
- Confirm migration order from a clean database.
- Confirm all module functions have explicit EXECUTE revokes and grants.
- Confirm `authenticated` and `anon` have no direct module table write privilege.
- Confirm no `using (true)` tenant policy exists.
- Search the frontend bundle and source for a service-role key.
- Inspect `explain` output for month/class attendance and student-result queries. Confirm the specified indexes are used on representative data.
- Exercise all four pages with the computer-use tool.
- Record video proof of an admin attendance flow, teacher assignment denial, draft marks hidden from a student, publication, and the published student read.
- Record the print preview only when static print layout evidence is needed in addition to the video.
- Verify keyboard navigation, focus, labels, contrast, error announcement, and mobile overflow.
- Update `docs/status.md` only with commands and acceptance tests that actually ran.
- Keep Attendance and Offline Exams as `REQUIRED` or `PARTIAL` until Rule 0.15 is satisfied. Mark neither module `CURRENT` based only on implementation.

## Rollout and dependency sequence
1. Approve this technical specification.
2. Merge the Students & Teachers task from issue #1 into `main`.
3. Verify the sibling schema through `DEP-001..006`.
4. Revise this specification and request approval again if a required sibling capability is absent or a locked contract must change.
5. Integrate current `main` into this specification branch.
6. Add migrations in the locked order.
7. Reset the database and run dependency, RLS, RPC, audit, and acceptance tests.
8. Regenerate database types.
9. Add the shared feature code and four route pages.
10. Run build, lint, database, acceptance, UI, accessibility, and print validation.
11. Update `docs/status.md` with actual evidence.
12. Deploy schema before frontend code that calls the new RPCs.
13. Verify production grants, RLS, function ownership, and read-only behavior.
14. Roll back application deployment if frontend verification fails. Do not roll back a migration by editing migration history.

## Approval question
Does the requester approve this specification, including the assumptions under “Assumptions requiring approval,” so implementation may start after the Students & Teachers tables exist on `main`?
