# Communication & Admin Tooling — Technical Specification

## Tracking
- Factory task: `01a0a623-8327-7ed5-b331-1ec84fa58d7a`
- `ticket_source`: `adhoc`
- `ticket_id`: `f2a84fd4-50c4-4563-8609-1eb2f536b9ee`
- Requester and reviewer: `nomaan5541`
- Baseline inspected: `origin/main` at `dee6eb7757464608ad7d487a5fe29fee26d0cc36`

## Summary
Build the Phase 1 Communication and Admin Tooling modules on the current foundation. The work includes homework, study materials, timetable management, notifications, school backup and restore, reports, server-side list filtering, and real Super Admin aggregates. The implementation must remain useful on foundation-only `main`. It must deny assignment-dependent access until the Student and Teacher modules provide authoritative relationships. It must never fabricate data or delivery success.

This document is a technical specification only. It does not authorize implementation to weaken RLS, edit an existing migration, or claim a module is complete without Rule 0.15 evidence.

## Current state
- Foundation migrations end at `supabase/migrations/20260915170000_profiles_email.sql`.
- The reusable authorization helpers are in:
  - `supabase/migrations/20260915160200_auth_helper_functions.sql:14`
  - `supabase/migrations/20260915160300_permissions_and_sub_admin.sql:59`
  - `supabase/migrations/20260915160500_subscriptions_minimal.sql:30`
- The permission catalog starts at `supabase/migrations/20260915160300_permissions_and_sub_admin.sql:83`.
- Academic structure exists in `supabase/migrations/20260915160400_academic_structure.sql:4`.
- Audit writes use `public.write_audit_log` from `supabase/migrations/20260915160600_audit_logs.sql:24`.
- The requested module tables, private storage buckets, report RPCs, and notification Edge Functions do not exist.
- `src/types/database.ts:12` is hand-authored and shared by every module.
- Routes and role navigation are centralized in `src/App.tsx:28` and `src/App.tsx:40`.
- New School Admin pages belong under `src/pages/school-admin/`. They must use the existing `AppShell` and `RoleLayout` integration at `src/components/layout/AppShell.tsx:16`.
- `src/pages/super-admin/SuperAdminDashboardPage.tsx:16` currently reports only real school counts. Student, teacher, and revenue data sources are absent.
- No open pull request existed when this specification was written. Student, Teacher, Fees, Attendance, and Exam schemas can still arrive before or during implementation.

## Migration ownership and integration sequence
The Communication and Admin Tooling implementation owns only new migration files and the objects defined in this document.

1. Fetch `origin/main` immediately before implementation.
2. Find the greatest migration timestamp on that commit.
3. Allocate a contiguous, strictly increasing timestamp range after that value for:
   - `communication_admin_schema`
   - `communication_admin_security_and_rpcs`
   - `communication_admin_storage`
   - `communication_admin_backup_restore_reports`
4. Do not edit, rename, or append to any existing foundation or sibling migration.
5. Do not reference a sibling table in a base migration unless that table exists on the implementation branch.
6. Use nullable integration columns without a foreign key when the authoritative sibling table is absent.
7. Add a later `communication_admin_sibling_integrations` migration only after the sibling schema is present. That migration adds validated foreign keys, assignment/enrollment policy branches, report adapters, backup sections, and aggregate adapters.
8. Before the first deployment, merge the latest `origin/main`. If another branch used the same timestamp, rename only this module's undeployed migration files so the order remains unique.
9. Never rename a migration after any environment has applied it. Resolve a deployed collision with a new forward-only migration.

The implementation integrator owns the collision points `src/types/database.ts`, `src/App.tsx`, shared list controls, and shared navigation. Sibling agents must contribute module-specific files or a patch. The integrator applies shared-file changes once after database contracts stabilize.

## Database design

### Shared rules
- Add `btree_gist` for timetable exclusion constraints and `pg_trgm` for indexed text search.
- Use UUID primary keys with `gen_random_uuid()`.
- Every school-owned row has `school_id uuid not null references public.schools(id)`.
- Structural references to `academic_years`, `classes`, `sections`, and `subjects` use `on delete restrict`.
- Every table with `updated_at` uses `public.set_updated_at()`.
- Every structural reference has a `before insert or update` trigger that verifies all referenced rows have the same `school_id`.
- Ordinary users cannot directly insert, update, or delete module rows. Revoke direct DML and expose audited RPCs.
- Keep RLS enabled even when direct DML is revoked. RLS remains defense in depth and controls direct reads.
- Do not hard-delete homework, materials, notifications, backup history, restore history, or report export history.
- Use `[start, end)` interval semantics. Adjacent timetable periods do not conflict.

### Enums
Add these enums in the schema migration:
- `learning_content_status`: `draft`, `published`, `archived`
- `notification_target_kind`: `school`, `role`, `class`, `section`, `user`
- `notification_channel`: `in_app`, `email`, `sms`, `push`
- `notification_delivery_state`: `queued`, `processing`, `sent`, `delivered`, `failed`, `not_configured`, `stubbed`, `skipped`
- `backup_export_state`: `pending`, `processing`, `completed`, `failed`
- `backup_restore_state`: `pending`, `validating`, `processing`, `completed`, `completed_with_warnings`, `failed`
- `report_export_state`: `pending`, `completed`, `failed`

### `public.homework`
Purpose: school-owned assignments without submission support.

- Columns:
  - `id`, `school_id`, `academic_year_id`, `class_id`, `section_id`, `subject_id`
  - `title text not null`, `description text not null default ''`, `instructions text not null default ''`
  - `due_at timestamptz not null`
  - `status learning_content_status not null default 'published'`
  - `attachment_path`, `attachment_name`, `attachment_mime` as nullable text
  - `attachment_size_bytes bigint`
  - `created_by uuid not null references auth.users(id) on delete restrict`
  - `updated_by uuid references auth.users(id) on delete restrict`
  - `created_at`, `updated_at`
- Constraints:
  - `title` is not blank and is at most 200 characters.
  - Description and instructions are each at most 20,000 characters.
  - Attachment fields are either all null or all populated.
  - Attachment size is greater than zero and at most 10 MiB.
  - The attachment trigger requires the path prefix `schools/{school_id}/learning/homework/{id}/`.
- Indexes:
  - `(school_id, academic_year_id, class_id, section_id, due_at desc)`
  - `(school_id, subject_id, status, due_at desc)`
  - GIN trigram index on normalized title.

### `public.study_materials`
Purpose: downloadable school-owned learning resources.

- Columns:
  - `id`, `school_id`, `academic_year_id`, `class_id`, `section_id`, `subject_id`
  - `title text not null`, `description text not null default ''`
  - `status learning_content_status not null default 'published'`
  - `storage_path`, `file_name`, `mime_type` as nullable text
  - `size_bytes bigint`
  - `created_by uuid not null references auth.users(id) on delete restrict`
  - `created_at`
- Constraints:
  - `title` is not blank and is at most 200 characters.
  - Description is at most 20,000 characters.
  - File metadata is either all null or all populated.
  - Size is greater than zero and at most 25 MiB.
  - The storage path trigger requires the prefix `schools/{school_id}/learning/materials/{id}/`.
- Indexes:
  - `(school_id, academic_year_id, class_id, section_id, created_at desc)`
  - `(school_id, subject_id, status, created_at desc)`
  - GIN trigram index on normalized title.
- Phase 1 has no `materials.update` permission. A material is immutable after successful attachment. A School Admin must create a replacement and archive the old material through an internal School-Admin-only RPC if correction is required. Sub-Admins and teachers cannot edit or delete it.

### `public.timetable_entries`
Purpose: one teaching period for one class and section.

- Columns:
  - `id`, `school_id`, `academic_year_id`, `class_id`, `section_id`, `subject_id`
  - `day_of_week smallint not null` where Monday is `1` and Sunday is `7`
  - `period_label text not null`
  - `start_time time not null`, `end_time time not null`
  - `slot_minutes int4range generated always as [start minute, end minute)`
  - `teacher_id uuid null`
  - `room text null`
  - `room_key text generated always as lower(trim(room))`, with blank converted to null
  - `created_by`, `updated_by`, `created_at`, `updated_at`
- Constraints:
  - `start_time < end_time`.
  - A period cannot cross midnight.
  - `period_label` is not blank and is at most 80 characters.
  - Room is at most 120 characters.
  - A row with a non-null `teacher_id` is accepted only when an authoritative Teacher table exists and an integration trigger verifies the teacher is active in the same school. On foundation-only main, `teacher_id` must be null.
  - Add exclusion constraints for overlapping rows in the same school, academic year, and day:
    - same `teacher_id`, when teacher is non-null
    - same normalized `room_key`, when room is non-null
    - same `class_id` and `section_id`
- Indexes:
  - `(school_id, academic_year_id, day_of_week, start_time)`
  - `(school_id, class_id, section_id, day_of_week, start_time)`
  - `(school_id, teacher_id, day_of_week, start_time)` where teacher is non-null.

Room remains free text for Phase 1. No rooms table is created.

### `public.notifications`
Purpose: immutable message content and target definition.

- Columns:
  - `id`, `school_id`
  - `idempotency_key uuid not null`
  - `title text not null`, `body text not null`, `type text not null default 'announcement'`
  - `target_kind notification_target_kind not null`
  - nullable `target_role app_role`, `class_id`, `section_id`, `target_user_id`
  - `requested_channels notification_channel[] not null`
  - `created_by uuid not null references auth.users(id) on delete restrict`
  - `created_at`
- Constraints:
  - Unique `(school_id, created_by, idempotency_key)`.
  - Title is 1–200 characters. Body is 1–20,000 characters.
  - The target-shape check permits only the fields required by the selected target kind.
  - `requested_channels` is non-empty and contains no duplicates.
  - A notification cannot target `super_admin`.
- Indexes:
  - `(school_id, created_at desc, id desc)`
  - `(school_id, target_kind, created_at desc)`
  - GIN trigram index on normalized title and body.

### `public.notification_deliveries`
Purpose: one recipient/channel state and the recipient's in-app read state.

- Columns:
  - `id`, `school_id`, `notification_id`
  - `recipient_user_id uuid not null references auth.users(id) on delete restrict`
  - `channel notification_channel not null`
  - `state notification_delivery_state not null`
  - `provider_code text not null`
  - `provider_message_id text null`
  - `attempt_count integer not null default 0`
  - `next_attempt_at`, `last_attempt_at`, `sent_at`, `delivered_at`, `read_at`
  - `last_error_code`, `last_error_message` with sanitized, non-secret values
  - `created_at`, `updated_at`
- Constraints:
  - Unique `(notification_id, recipient_user_id, channel)`.
  - `attempt_count` is between 0 and 3.
  - `read_at` is allowed only for `in_app`.
- Indexes:
  - `(recipient_user_id, channel, state, created_at desc)`
  - `(school_id, state, next_attempt_at)`
  - `(notification_id, channel, state)`.

### `public.backup_exports`
Purpose: immutable metadata for one generated backup.

- Columns:
  - `id`, `school_id`, `state`
  - `format_version integer not null`
  - `schema_version text not null`, `app_version text not null`
  - `checksum_algorithm text not null default 'SHA-256'`
  - `checksum_hex text`, `storage_path text`, `size_bytes bigint`
  - `included_sections jsonb not null default '[]'`
  - `warnings jsonb not null default '[]'`
  - `created_by`, `created_at`, `completed_at`, `error_code`, `error_message`
- Constraints:
  - Format version is positive.
  - Completed rows have checksum, path, size, and completion timestamp.
  - Path prefix is `schools/{school_id}/backups/{id}/`.
- Index: `(school_id, created_at desc, id desc)`.

### `public.backup_restore_runs`
Purpose: durable restore attempt status. It is not part of the replace payload.

- Columns:
  - `id`, `school_id`, nullable `backup_export_id`
  - `state`, `source_school_id`, `format_version`, `schema_version`, `app_version`
  - `checksum_hex`
  - `replaced_counts jsonb not null default '{}'`
  - `skipped_sections jsonb not null default '[]'`
  - `warnings jsonb not null default '[]'`
  - `requested_by`, `created_at`, `completed_at`, `error_code`, `error_message`
- Indexes:
  - `(school_id, created_at desc)`
  - Unique partial index allowing one `validating` or `processing` restore per school.

### `public.report_exports`
Purpose: audit-friendly status for generated CSV and PDF exports.

- Columns:
  - `id`, `school_id`, `report_key`, `format`, `filters jsonb`, `state`
  - `row_count`, `requested_by`, `created_at`, `completed_at`
  - `error_code`, `error_message`
- Constraints:
  - Format is `csv` or `pdf`.
  - Filters contain only the allowlisted keys for the report.
- Index: `(school_id, created_at desc)`.

### `public.operation_rate_events`
Purpose: database-backed Edge Function throttling.

- Columns: `id`, `school_id`, `actor_user_id`, `operation`, `created_at`, `expires_at`.
- No direct client policy or grant.
- `public.consume_operation_quota` performs an atomic count-and-insert and opportunistically removes expired rows.
- Indexes: `(school_id, actor_user_id, operation, created_at)` and `(expires_at)`.

## Permission and role mapping
Add exactly these permission rows with `on conflict (key) do nothing`:

- `homework.read`
- `homework.create`
- `homework.update`
- `materials.read`
- `materials.create`
- `timetable.read`
- `timetable.create`
- `timetable.update`
- `backup.create`
- `backup.restore`
- `notifications.read`

Reuse the existing `reports.read`, `reports.export`, and `notifications.create`. Do not add another permission key for this module.

Apply permissions as follows:
- School Admin:
  - Has every tenant capability through the existing `has_permission` behavior.
  - Can archive an immutable study material through the School-Admin-only internal action.
- Sub-Admin:
  - Must have the exact read/create/update key for the action.
  - Report viewing also requires `reports.read` and the underlying domain read key.
  - Report export also requires `reports.export`, `reports.read`, and the underlying domain read key.
  - Backup creation requires `backup.create`. Restore requires `backup.restore`.
- Teacher:
  - Access is assignment-scoped, not Sub-Admin-permission-scoped.
  - Foundation-only policy denies timetable, homework, and material access.
  - The sibling integration migration enables reads and creates only after it can join the authoritative teacher assignment to the exact academic year, class, section, and subject.
  - A teacher can update only homework that the same teacher created and still owns within an active assignment.
- Student:
  - Access is identity/enrollment-scoped.
  - Foundation-only policy returns no class/section homework, materials, or timetable rows.
  - The sibling integration migration enables published content only for the student's active enrollment and the requested academic year.
  - A student sees only notification deliveries addressed to their user ID.
- Super Admin:
  - Can use platform dashboard and platform report RPCs.
  - Cannot call tenant mutation RPCs accidentally. Tenant RPCs resolve `current_user_school_id()` and reject a null school.
  - The normal restore workflow cannot restore one school's backup into another school.

The UI permission check controls visibility only. Every RPC, Edge Function, table read, and storage download repeats authorization server-side.

## RLS and grants
- `homework`, `study_materials`, and `timetable_entries`:
  - School Admin or a Sub-Admin with the matching read permission can select same-school rows.
  - Assignment/enrollment policy branches do not exist until the sibling integration migration is present.
  - Student policies also require `status = 'published'`.
- `notifications`:
  - Admin readers need `notifications.read`.
  - A recipient can select a notification only through an existing same-school delivery for `auth.uid()`.
- `notification_deliveries`:
  - A recipient can select only their own rows.
  - An admin reader needs `notifications.read`.
- `backup_exports`:
  - `backup.create` permits same-school list and download.
  - `backup.restore` also permits the same read.
- `backup_restore_runs`:
  - `backup.restore` permits same-school reads.
- `report_exports`:
  - `reports.export` permits same-school reads.
- `operation_rate_events`:
  - No authenticated policy.
- Direct DML is revoked on every module table.
- All write RPCs reject a read-only school with the standard message, except:
  - backup creation and download remain available because they are exports
  - report read/export remains available
  - in-app `mark_notification_read` remains available because it changes only the caller's read receipt
  - delivery workers may finish an already-authorized dispatch
- Restore is blocked for a read-only school.

## RPC contracts
All public RPCs are `security definer`, set `search_path = public`, re-check authorization, use the authenticated tenant, translate constraint failures to stable error codes, and have explicit execute grants. No tenant RPC accepts `school_id`.

### Learning content
- `create_homework(p_academic_year_id, p_class_id, p_section_id, p_subject_id, p_title, p_description, p_instructions, p_due_at, p_status) -> uuid`
  - Requires `homework.create`.
  - Verifies all scope IDs and the class-subject mapping.
  - Writes `homework.created`.
- `update_homework(p_homework_id, p_patch jsonb) -> homework`
  - Allowlisted patch keys are title, description, instructions, due date, and status.
  - Requires `homework.update`, or the integrated teacher ownership rule.
  - Writes `homework.updated` with old and new values.
- `create_study_material(p_scope..., p_title, p_description, p_status) -> uuid`
  - Requires `materials.create`.
  - Writes `study_material.created`.
- `archive_study_material(p_material_id) -> void`
  - School Admin only.
  - Writes `study_material.archived`.
- `list_homework(...) -> jsonb` and `list_study_materials(...) -> jsonb`
  - Accept `search`, academic year, class, section, subject, status, date range, page, page size, and an allowlisted sort key.
  - Return `{items, total_count, page, page_size}`.
- `authorize_learning_file(p_resource_type, p_resource_id, p_action) -> jsonb`
  - `p_action` is `upload` or `download`.
  - Returns only the verified school ID, resource ID, and permitted path prefix.
  - Upload requires an unpopulated attachment and the applicable create/update rule.
  - Download requires read access to the metadata row.
- `attach_learning_file(p_resource_type, p_resource_id, p_file_metadata jsonb) -> void`
  - Called with the caller JWT after the Edge Function uploads a validated file.
  - Verifies the exact server-generated prefix and metadata limits.
  - Writes an attachment audit event.

### Timetable
- `create_timetable_entry(p_academic_year_id, p_class_id, p_section_id, p_subject_id, p_day_of_week, p_period_label, p_start_time, p_end_time, p_teacher_id, p_room) -> timetable_entries`
- `update_timetable_entry(p_entry_id, p_patch jsonb) -> timetable_entries`
- `list_timetable_entries(...) -> jsonb`
  - Filters: search, academic year, class, section, subject, teacher, room, day, start/end time, page, page size, sort.
- Create requires `timetable.create`; update requires `timetable.update`.
- The functions rely on exclusion constraints, then map conflicts to:
  - `TIMETABLE_TEACHER_CONFLICT`
  - `TIMETABLE_ROOM_CONFLICT`
  - `TIMETABLE_CLASS_CONFLICT`
- Success writes `timetable.created` or `timetable.updated`.

### Notifications
- `create_notification(p_idempotency_key, p_title, p_body, p_type, p_target jsonb, p_channels notification_channel[]) -> jsonb`
  - Called by `send-notification`.
  - Requires `notifications.create`.
  - Expands school, role, or user targets from active same-school `user_roles`.
  - Class and section targets fail with `DEPENDENCY_UNAVAILABLE` until an enrollment/assignment integration adapter exists.
  - Inserts one in-app delivery with state `delivered`.
  - Inserts one email delivery with state `queued`.
  - Inserts SMS and push deliveries with state `stubbed`.
  - Missing recipient email changes that recipient's email state to `skipped` with `RECIPIENT_EMAIL_MISSING`.
  - Retries with the same idempotency key return the existing notification and do not add deliveries.
  - Writes `notification.created`.
- `claim_notification_deliveries(p_notification_id, p_channel, p_limit) -> setof notification_deliveries`
  - Internal worker RPC.
  - Uses `for update skip locked`.
  - Claims only `queued` or retryable `failed` rows whose `next_attempt_at <= now()`.
- `complete_notification_delivery(p_delivery_id, p_state, p_provider_code, p_provider_message_id, p_error_code, p_error_message) -> void`
  - Internal worker RPC.
  - Enforces the state machine and the three-attempt limit.
- `mark_notification_read(p_notification_id) -> void`
  - Updates only the caller's in-app delivery.
  - Is idempotent and allowed in read-only mode.
- `list_notifications(...) -> jsonb`
  - Filters: search, target, channel, state, type, read/unread, date range, page, page size, sort.

### Backup and restore
- `export_school_backup(p_backup_export_id) -> jsonb`
  - Requires `backup.create`.
  - Uses the caller's school and one repeatable-read database snapshot.
  - Emits only allowlisted sections.
  - Does not emit auth identities, role grants, subscription controls, audit rows, provider secrets, environment variables, storage signed URLs, or service credentials.
- `begin_backup_export(p_idempotency_key) -> uuid`
- `complete_backup_export(p_id, p_metadata jsonb) -> void`
- `fail_backup_export(p_id, p_error_code, p_safe_message) -> void`
  - These functions preserve one durable run and write `backup.created` or `backup.failed`.
- `apply_verified_school_restore(p_restore_run_id, p_actor_user_id, p_payload_text, p_payload_sha256) -> jsonb`
  - Execute grant is `service_role` only.
  - The restore Edge Function is the only caller.
  - Re-checks that the actor is active in the exact school and has `backup.restore`.
  - Recomputes SHA-256 over the exact canonical payload text.
  - Takes a school-scoped advisory transaction lock.
  - Executes the replace in one transaction.
  - Returns replaced row counts, skipped unknown sections, and warnings.
- `finish_restore_run(...)`
  - Records completed or failed attempts after the replace transaction.
  - A failed replace leaves school data unchanged but retains the failed run and audit event.

### Reports and dashboard
- `get_report_catalog() -> jsonb`
  - Returns real report adapters and unavailable requested domains separately.
  - Never returns an executable report key without an implementation.
- `run_tenant_report(p_report_key, p_filters, p_page, p_page_size, p_sort) -> jsonb`
  - Requires `reports.read` and the underlying domain read permission.
- `run_platform_report(...) -> jsonb`
  - Super Admin only.
- `begin_report_export(...)`, `complete_report_export(...)`, `fail_report_export(...)`
  - Export requires `reports.export`, `reports.read`, and the underlying domain read permission.
  - Success writes `report.exported`.
- `get_super_admin_dashboard() -> jsonb`
  - Super Admin only.
  - Returns each metric as `{status: 'available'|'unavailable'|'error', value?, reason?}`.
  - It must not turn a query error into zero.
- `consume_operation_quota(p_operation, p_limit, p_window_seconds) -> boolean`
  - Uses the authenticated actor for ordinary functions.
  - Service-only callers pass an actor only through a service-only overload.

## Edge Function and storage contracts

### Private buckets
Create two private buckets:
- `learning-resources`
- `school-backups`

Clients never upload or download objects directly. Storage policies deny direct authenticated writes and arbitrary reads. Edge Functions use the service role only after user-JWT authorization succeeds. Download functions return a 60-second signed URL.

### Learning file paths and validation
- Homework: `schools/{school_id}/learning/homework/{homework_id}/{uuid}.{ext}`
- Materials: `schools/{school_id}/learning/materials/{material_id}/{uuid}.{ext}`
- Backup: `schools/{school_id}/backups/{backup_id}/edumanage-backup-v1.json.gz`
- A client filename is display metadata only. It is never used as an object key.

`upload-learning-file`:
- Method: `POST multipart/form-data`.
- Auth: authenticated School Admin, permitted Sub-Admin, or integrated assigned teacher.
- Input: exactly one `file`, `resource_type`, and `resource_id`.
- Limits:
  - Homework: 10 MiB.
  - Materials: 25 MiB.
- Homework allowlist:
  - PDF, DOC, DOCX, JPEG, PNG.
- Material allowlist:
  - PDF, DOC, DOCX, PPT, PPTX, JPEG, PNG, ZIP.
- Validation:
  - Normalize extension and compare extension, declared MIME, and detected signature.
  - Reject executables, scripts, SVG, HTML, macro-enabled Office formats, double extensions, and null bytes.
  - Inspect OOXML containers for the expected DOCX or PPTX entries.
  - For generic ZIP, reject encryption, symlinks, absolute paths, `..` traversal, more than 100 entries, or more than 100 MiB expanded content.
  - Store no untrusted HTML.
- Output: `{resource_id, file_name, mime_type, size_bytes}`.
- Failure cleanup: delete a newly uploaded object if metadata attachment fails.
- Rate limit: 30 uploads per actor per 10 minutes and 200 per school per hour.
- Timeout: 30 seconds. A timeout produces no attached metadata.

`get-learning-file-url`:
- Method: `POST application/json`.
- Input: `{resource_type, resource_id}`.
- Output: `{url, expires_in: 60}`.
- It authorizes from the metadata row before signing.
- It must deny a guessed cross-school path.

### `send-notification`
- Method: `POST application/json`.
- Auth: authenticated caller with `notifications.create`.
- Input:
  - `idempotency_key`
  - `title`, `body`, `type`
  - `target`
  - non-empty `channels`
- Output:
  - `notification_id`
  - recipient count
  - counts by channel and delivery state
  - `warnings`
- Provider interface:
  - `send(message) -> {state, provider_message_id?, error_code?, safe_message?}`
  - Email provider is selected by `NOTIFICATION_EMAIL_PROVIDER`.
  - Provider credentials remain Edge Function secrets.
  - Missing provider name or credentials returns `not_configured`.
  - SMTP/provider acceptance returns `sent`, not `delivered`.
  - `delivered` is used only after a verified provider callback. Provider callbacks are deferred, so Phase 1 email normally ends at `sent`.
  - SMS and push use swappable providers that always return `stubbed` in Phase 1.
  - In-app uses `delivered` when the database delivery exists.
- Retry:
  - Retry email failures up to three attempts with controlled backoff.
  - Do not retry `not_configured`, `stubbed`, or `skipped`.
- Rate limit: 10 notification requests per actor per hour, 30 per school per hour, and 1,000 resolved recipients per request.
- Timeout: 45 seconds. Remaining queued rows stay queued and the response reports them honestly.

### `create-school-backup`
- Method: `POST application/json`.
- Auth: `backup.create`.
- Input: `{idempotency_key}`.
- Output: backup ID, versions, included sections, checksum, byte size, state, and warnings.
- Rate limit: 2 completed or processing backups per school per hour.
- Timeout and size: 45 seconds and 50 MiB compressed. Exceeding either fails the run with a safe error.
- The function canonicalizes the uncompressed payload, computes SHA-256, compresses it, uploads it, and completes metadata.

`download-school-backup`:
- Method: `POST application/json`.
- Input: `{backup_id}`.
- Auth: `backup.create` or `backup.restore`.
- Output: a 60-second signed URL.

### `restore-school-backup`
- Method: `POST`.
- Auth: `backup.restore`.
- Input is exactly one source:
  - JSON `{backup_id}` for a stored same-school backup, or
  - multipart field `file` for an uploaded backup.
- Upload limit: 50 MiB compressed and 200 MiB uncompressed.
- The function validates and hashes the file before service-role RPC use.
- Rate limit: one active restore and two restore attempts per school per day.
- Timeout: 90 seconds. A timeout is a failure and leaves the replace transaction rolled back.
- Output: restore run ID, final state, replaced counts, skipped sections, and warnings.
- Service-role use is limited to reading the private backup object and calling the service-only verified restore RPC.

### `export-report`
- Method: `POST application/json`.
- Input: `{report_key, format, filters, sort}`.
- Auth: report and domain permissions.
- Output: streamed `text/csv` or `application/pdf`.
- Limits:
  - CSV: 10,000 rows.
  - PDF: 1,000 rows.
  - Requests above a limit return `REPORT_FILTER_REQUIRED`.
- CSV neutralizes formula injection for cells beginning with `=`, `+`, `-`, or `@`.
- PDF uses the same server-returned rows as CSV. It includes school name, report title, filters, generation time, and page numbers.
- Rate limit: 10 exports per actor per hour and 50 per school per day.

## Timetable conflict enforcement
- Database exclusion constraints are authoritative.
- RPC preflight may provide an early friendly message, but it does not replace the constraint.
- Teacher conflict uses the integrated `teacher_id`. It is inactive for null teachers.
- Room conflict uses the normalized free-text room value. `Lab 1`, ` lab 1 `, and `LAB 1` are the same room.
- Class conflict uses both class and section.
- Conflicts are scoped by school, academic year, and day.
- `09:00–10:00` and `10:00–11:00` are allowed.
- Updating an entry excludes its own ID and still relies on the exclusion constraint for concurrency.
- Two concurrent conflicting inserts cannot both commit.

## Notification states
- In-app: inserted as `delivered`; unread means `read_at is null`.
- Email:
  - `queued -> processing -> sent`
  - `processing -> failed -> queued` for a retry
  - `processing -> not_configured` when configuration is absent
  - `sent -> delivered` only from a verified provider callback in a later phase
- SMS and push: inserted as `stubbed`.
- Missing recipient address: `skipped`.
- No UI text may map `queued`, `processing`, `sent`, `not_configured`, `stubbed`, `skipped`, or `failed` to “delivered”.
- Provider errors stored in the database and logs must be sanitized. They must not contain message bodies, recipient addresses, tokens, or credentials.

## Backup format and restore semantics

### Format
The canonical uncompressed document is:

```json
{
  "manifest": {
    "format_version": 1,
    "schema_version": "<highest applied migration>",
    "app_version": "<deployed application version>",
    "source_school_id": "<uuid>",
    "created_at": "<RFC3339 UTC>",
    "included_sections": [{"name": "academic_years", "version": 1}],
    "checksum": {"algorithm": "SHA-256", "hex": "<lowercase hex>"}
  },
  "payload": {}
}
```

- Canonicalization uses RFC 8785 JSON Canonicalization Scheme.
- Compute the digest over UTF-8 canonical JSON with `manifest.checksum` omitted.
- Compression occurs after checksum calculation.
- `format_version` controls parser compatibility.
- `schema_version` is the greatest applied migration identifier.
- `app_version` is informational. A different app version adds a warning but does not alone block restore.
- A future unsupported format version is fatal.
- A tampered checksum is fatal.

### Included sections on foundation-only main
- Allowed school profile fields: name, legal name, address, district, state, country, phone, email, website, logo URL, principal name, and board.
- `academic_years`
- `classes`
- `sections`
- `subjects`
- `class_subjects`
- `homework`
- `study_materials` metadata, not duplicate file bytes
- `timetable_entries`
- `notifications`
- `notification_deliveries`

Exclude:
- school ID mutation
- school code mutation
- school status
- subscriptions and plan controls
- Auth users, password data, sessions, tokens, role grants, permission grants
- provider credentials and environment values
- signed URLs
- audit log rows
- backup and restore run rows
- report export rows

The backup contains object path and checksum metadata for learning files. The backup archive does not copy storage objects in Phase 1. Missing referenced objects produce warnings during restore.

### Replace-school-data restore
- The source school ID must equal the authenticated actor's current school ID.
- Cross-school restore is rejected even for the normal Super Admin workflow.
- Preflight validates JSON shape, checksum, versions, IDs, duplicate IDs, target shapes, tenant ownership, relationships, and inbound foreign-key blockers.
- Unknown backup sections are skipped. Each skipped section appears in the result and audit metadata.
- A known required section that is malformed is fatal.
- A known optional section that is absent remains unchanged and produces a warning.
- For each known included section, delete current school rows in child-to-parent order and insert backup rows in parent-to-child order.
- Preserve backup UUIDs because source and destination school are identical.
- Update only allowlisted school profile fields.
- Never replace auth, roles, subscription control, audit history, or operation history.
- If a current, non-owned sibling table has rows that prevent safe replacement, preflight fails with `RESTORE_INTEGRATION_REQUIRED`. It does not disable a foreign key or delete the sibling rows.
- The sibling integration migration must register that table's export, validation, delete, and insert order before restore can replace it.
- One PostgreSQL transaction performs the recognized replacement.
- Any fatal error rolls back every recognized section.
- Unknown-section warnings do not roll back the recognized replacement.
- The result and audit event include replaced row counts, skipped sections, warnings, format version, schema version, app version, and checksum.
- Failed attempts also create a durable restore run and a `backup.restore.failed` audit event outside the rolled-back replace transaction.

## Reports
The implementation must provide real adapters for domains that exist on the implementation branch.

Mandatory foundation and module reports:
- Tenant:
  - Academic structure directory and counts
  - Homework
  - Study materials
  - Timetable
  - Notification delivery states
  - Backup and restore history
- Platform, Super Admin only:
  - Schools by status
  - Subscriptions by status

Student, Teacher, Fees, Attendance, and Exam reports are unavailable on the inspected baseline. The catalog labels them “Coming soon” and provides no data or executable key. If a sibling schema has merged before implementation, add an adapter in this module's later integration migration and test its tenant and role rules. Do not edit the sibling migration.

All report queries:
- Resolve tenant server-side.
- Apply academic year and domain filters.
- Return only allowlisted, non-secret columns.
- Use stable sorting and server-side pagination.
- Reuse one database result contract for screen, CSV, and PDF.
- Do not calculate counts from the current page.
- Do not fabricate zero values for unavailable domains.

## Real-only Super Admin dashboard
The base dashboard returns real:
- total schools
- active schools
- suspended schools
- expired schools
- subscription counts by persisted status
- recent schools from persisted rows

Optional metrics require explicit adapters:
- student count from the canonical Student table
- teacher count from the canonical Teacher table
- revenue from verified payment ledger rows only
- renewals from persisted subscription activation history only

When an adapter is absent, omit the numeric card and show an unavailable explanation. When an adapter query fails, show an error state with retry. Never render `0` for an absent or failed source. Do not estimate revenue from plan prices or subscription dates.

## Search, filtering, sorting, and pagination
- Add reusable module-owned `ListToolbar` and `PaginationControls` components only once.
- New module list screens use URL search parameters.
- Existing `SchoolsPage` and `AuditLogPage` receive server-aware search, relevant filters, stable sorting, and pagination in the integrator pass.
- Do not change sibling module list files. Provide the shared control contract for later adoption.
- Common request rules:
  - Search length: 0–100 characters.
  - Page starts at 1.
  - Page size defaults to 25 and is limited to 100.
  - Sort keys use an allowlist. Never concatenate a client column name into SQL.
  - Escape wildcard characters for literal search.
  - Return `total_count` separately from page items.
  - Use a deterministic ID tie-breaker.
- Filters:
  - Homework: academic year, class, section, subject, status, due range.
  - Materials: academic year, class, section, subject, status, created range.
  - Timetable: academic year, class, section, subject, teacher, room, day, time range.
  - Notifications: target, type, channel, delivery state, read state, date range.
  - Backups: export/restore state, creator, date range.
  - Reports: domain, availability, format, date range.
  - Schools: status and text.
  - Audit: action, entity type, actor role, date range, text.

## Routes and components
Use feature components for shared behavior and thin role-specific route pages.

School Admin and Sub-Admin route pages under `src/pages/school-admin/`:
- `/admin/homework`
- `/admin/materials`
- `/admin/timetable`
- `/admin/notifications`
- `/admin/reports`
- `/admin/backups`

Teacher route pages under `src/pages/teacher/`:
- `/teacher/homework`
- `/teacher/materials`
- `/teacher/timetable`
- `/teacher/notifications`

Student route pages under `src/pages/student/`:
- `/student/homework`
- `/student/materials`
- `/student/timetable`
- `/student/notifications`

Super Admin:
- Keep `/super-admin` for the real dashboard.
- Add `/super-admin/reports`.

UI requirements:
- Register all pages through the existing `RoleLayout` trees in `src/App.tsx`.
- Filter nav items by role and permission for usability. Backend checks remain authoritative.
- Reuse `src/components/ui/*`, `.glass-surface`, CSS tokens, and existing empty/loading/error patterns.
- Use responsive tables with horizontal scrolling or mobile cards.
- Provide visible focus states, semantic labels, keyboard operation, and text plus icons for statuses.
- Read-only mode disables school mutations with the standard explanation. It keeps views, backup creation/download, and report exports active.
- Assignment-dependent Teacher and Student pages show a factual dependency-unavailable state until the sibling integration exists. They do not query school-wide data as a fallback.
- Homework UI contains no submission action, submission count, or submission route.
- Notification UI displays each honest provider state.
- Report UI shows unavailable domains as “Coming soon” without a number, chart, downloadable file, or enabled action.

## Decisions
- Foundation-only implementation wins over waiting for sibling modules.
  - Alternative: block until every sibling merges.
  - Rejected because it delays independent work and increases collision risk.
  - Safety condition: assignment-dependent access fails closed and later integration is additive.
- Nullable `teacher_id` has no base foreign key.
  - Alternative: create a Teacher stub or point at an assumed sibling table.
  - Rejected because either choice duplicates or guesses another module's schema.
- Room is normalized free text.
  - Alternative: create a rooms table.
  - Rejected because room inventory is deferred for MVP.
- Timetable conflicts use database exclusion constraints.
  - Alternative: client checks or RPC preflight only.
  - Rejected because concurrent requests can bypass non-constraint checks.
- Email uses the dedicated `send-notification` Edge Function and a swappable provider.
  - Alternative: direct provider calls from React.
  - Rejected because secrets and delivery authority must stay server-side.
- Missing provider configuration records `not_configured`.
  - Alternative: mark the delivery sent in development.
  - Rejected because it fabricates delivery.
- SMS and push record `stubbed`.
  - Alternative: omit their state or create dead UI controls.
  - Rejected because the architecture must remain swappable and honest.
- Restore replaces recognized same-school data in one transaction.
  - Alternative: merge/upsert or best-effort row replacement.
  - Rejected because the requester selected replace semantics and partial fatal restores are unsafe.
- Unknown backup sections produce warnings and are skipped.
  - Alternative: reject the full backup.
  - Rejected by requester decision.
- Reports and dashboard use registered real adapters only.
  - Alternative: placeholder statistics.
  - Rejected by Rule 0.15 and the no-fabrication requirement.
- New School Admin pages use `src/pages/school-admin/`.
  - Alternative: add `src/pages/admin/`.
  - Rejected because it would create a parallel layout convention.

## Assumptions
- Monday is day `1`; Sunday is day `7`.
- Timetable time values represent the school's local wall-clock time. Phase 1 does not add a school time-zone column.
- One homework item and one material can have one attached file in Phase 1.
- Homework upload limit is 10 MiB. Material upload limit is 25 MiB.
- Backup format version starts at `1`.
- App version mismatch is a warning. Format incompatibility is the restore blocker.
- Existing `profiles.email` is the notification email source. A missing email skips that recipient honestly.
- Email `sent` means provider acceptance. It does not mean inbox delivery.
- Backups contain learning-file metadata but not storage object bytes.
- Backup creation and report export remain permitted for read-only schools.
- Marking an in-app message read remains permitted for read-only schools.
- The normal restore endpoint never performs cross-school migration.

## Out of scope
- Homework submissions, grading, and student upload workflows.
- A rooms table or room inventory.
- Provider delivery webhooks and email `delivered` confirmation.
- Real SMS or push providers.
- Cross-school restore or tenant cloning.
- Storage-object bundling inside school backups.
- Scheduled recurring backups and retention automation.
- Reports for sibling domains that do not exist on the implementation branch.
- Report cards, online exams, meetings, calendar, ID cards, AI, and Google Workspace.
- Product implementation in this specification PR.

## Validation criteria

### Required implementation gates
Run these before the implementation PR is handed to review:

```bash
npm run build
npm run lint
npx supabase db reset
```

Add and run:

```bash
npm run test:communication-admin
npx supabase test db
deno test supabase/functions/_tests/communication-admin-tooling.test.ts
```

If Docker, Deno, or a live Supabase service is unavailable, record that exact gate as not run. Keep affected modules `PARTIAL`. Do not substitute static inspection for a passing Rule 0.15 test.

### Database and security acceptance tests
- `CAT-SEC-001`: School A cannot select School B homework, materials, timetable, notifications, backup runs, restore runs, or report runs.
- `CAT-SEC-002`: School A cannot create or update a row by supplying School B resource IDs.
- `CAT-SEC-003`: School A cannot obtain a signed URL for School B learning or backup objects.
- `CAT-SEC-004`: A Sub-Admin with one permission can perform only that operation. Direct table DML and ungranted RPCs fail.
- `CAT-SEC-005`: A Super Admin without a tenant role cannot call a tenant mutation RPC.
- `CAT-SEC-006`: A read-only school can read, create/download a backup, and export a report. It cannot create/update homework, materials, timetable, notifications, or run restore.
- `CAT-SEC-007`: A Teacher or Student receives no assignment-scoped rows before an authoritative sibling integration exists.
- `CAT-SEC-008`: The frontend bundle contains no service-role key or provider secret.
- Check with `npx supabase test db` and the Edge Function acceptance harness.

### Homework and materials
- `CAT-HW-001`: Create and update same-school homework with valid scope. Audit rows contain actor and resource.
- `CAT-HW-002`: A subject not mapped to the selected class and academic year is rejected.
- `CAT-HW-003`: Published content becomes visible only through an authorized assignment/enrollment integration.
- `CAT-HW-004`: No homework submission table, route, or action exists.
- `CAT-FILE-001`: Valid allowlisted files upload to the exact tenant/resource path.
- `CAT-FILE-002`: Oversize, MIME mismatch, double extension, executable, traversal ZIP, encrypted ZIP, and archive bomb inputs are rejected.
- `CAT-FILE-003`: Metadata failure removes the newly uploaded orphan object.
- `CAT-FILE-004`: A guessed cross-tenant storage path never returns an object.
- Check with Edge Function tests and a live Storage acceptance test.

### Timetable
- `CAT-TT-001`: Concurrent overlapping entries for the same class and section yield one success and one `TIMETABLE_CLASS_CONFLICT`.
- `CAT-TT-002`: Overlapping entries for the same teacher yield `TIMETABLE_TEACHER_CONFLICT`.
- `CAT-TT-003`: `Lab 1` and ` lab 1 ` overlap and yield `TIMETABLE_ROOM_CONFLICT`.
- `CAT-TT-004`: Adjacent `[09:00,10:00)` and `[10:00,11:00)` entries both succeed.
- `CAT-TT-005`: Foundation-only main accepts only an unassigned null teacher. The integrated migration rejects a teacher from another school.
- Check with `npx supabase test db`.

### Notifications
- `CAT-NOT-001`: One request creates one notification and one delivery per resolved recipient/channel.
- `CAT-NOT-002`: The same idempotency key creates no duplicate notification or delivery.
- `CAT-NOT-003`: In-app delivery is `delivered`; mark-read changes only the caller's row.
- `CAT-NOT-004`: Missing email provider configuration records `not_configured`.
- `CAT-NOT-005`: Missing recipient email records `skipped`.
- `CAT-NOT-006`: SMS and push record `stubbed`.
- `CAT-NOT-007`: No UI or response describes `sent`, `stubbed`, `not_configured`, `skipped`, or `failed` as delivered.
- `CAT-NOT-008`: Class/section targeting fails closed until recipient integration exists.
- Check with database tests, provider unit tests, and the live UI flow.

### Backup and restore
- `CAT-BACK-001`: A School A backup contains only School A allowlisted data and no secrets, roles, credentials, subscription controls, or audit rows.
- `CAT-BACK-002`: Recomputing RFC 8785 SHA-256 matches the manifest checksum.
- `CAT-BACK-003`: A one-byte payload change fails checksum validation.
- `CAT-BACK-004`: A valid same-school restore replaces all recognized included sections.
- `CAT-BACK-005`: A fatal known-section relationship error rolls back every recognized replacement.
- `CAT-BACK-006`: An unknown section is skipped and appears in the API result, restore run, and audit metadata.
- `CAT-BACK-007`: A backup whose source school differs from the actor's school is rejected.
- `CAT-BACK-008`: An unsupported future format version is rejected. An app version mismatch completes with a warning.
- `CAT-BACK-009`: A non-owned inbound foreign-key blocker fails preflight with `RESTORE_INTEGRATION_REQUIRED`.
- `CAT-BACK-010`: A missing learning object completes with a warning and does not invent file availability.
- Check with `npx supabase test db`, checksum unit tests, and live backup/restore acceptance.

### Reports, dashboard, and lists
- `CAT-REP-001`: Screen, CSV, and PDF use the same filtered rows and authorized columns.
- `CAT-REP-002`: Sub-Admin report access requires report permission plus the underlying domain read permission.
- `CAT-REP-003`: CSV formula prefixes are neutralized.
- `CAT-REP-004`: Unavailable sibling domains have no executable report key or generated data.
- `CAT-DASH-001`: School and subscription metrics equal direct persisted row counts.
- `CAT-DASH-002`: An absent Student, Teacher, or verified-revenue adapter shows unavailable with no number.
- `CAT-DASH-003`: A forced adapter error shows error, not zero.
- `CAT-LIST-001`: Search and each filter operate server-side.
- `CAT-LIST-002`: Pagination has stable ordering, correct total count, page-size cap, and no duplicate or missing row across adjacent pages.
- Check with database acceptance tests and generated CSV/PDF assertions.

### UI and Rule 0.15
- Use `computer_use` against a successfully built application.
- Record a video that shows:
  - School Admin navigation through Homework, Materials, Timetable, Notifications, Reports, and Backups
  - one successful timetable entry and one visible conflict error
  - notification provider states
  - backup validation warnings
  - unavailable report/dashboard domains without fabricated values
  - search, filtering, and pagination
  - a read-only school with exports enabled and mutations disabled
- Verify desktop and mobile layouts, keyboard focus, loading, empty, error, success, permission-denied, and dependency-unavailable states.
- Update `docs/status.md` only after implementation, live database verification, authorization verification, error handling, UI verification, and acceptance tests all pass.
- The implementation change report must list `CHANGED`, `SECURITY`, `DATABASE`, `TESTED`, and `KNOWN LIMITATIONS`. It must name every skipped or failed gate.
