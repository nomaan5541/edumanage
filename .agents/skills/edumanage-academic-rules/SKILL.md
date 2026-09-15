---
name: edumanage-academic-rules
description: Academic-structure and historical-data rules for EduManage - academic years, classes/sections/subjects, promotion, transfer, attendance, and offline exams (FA1/FA2/MID/FA3/FA4/FINAL). Use when building any of these modules.
---

# EduManage Academic Rules

## Academic years are immutable history (Spec Section 12)
Every academic record (attendance, marks, fees, enrollment) must carry `academic_year_id`. Changing the school's *active* academic year must NEVER rewrite or delete records tied to a prior year. Promotion (Section 15) creates a NEW enrollment row in the new year/class/section - it does not mutate the old year's records. Only one `academic_years` row per school should have `is_active = true` (already enforced by a partial unique index in the foundation migration).

## Classes/Sections/Subjects
Use the existing `classes`, `sections`, `class_subjects`, `subjects` tables from `supabase/migrations/20260915160400_academic_structure.sql` - do not create parallel tables for the same concepts. `sections.class_id` and `class_subjects.*` use `on delete restrict` (not `cascade`) specifically so deleting a class can't silently cascade-delete structural data; follow the same restrict pattern for any new FK from a historical table (students, attendance, exams) into these tables (see `edumanage-multitenancy` for the cross-school trigger pattern too).

## Promotion (Spec Section 15)
Bulk-select students, pick source/destination academic year + class + section mapping. Must not duplicate a student's enrollment and must not touch the prior year's enrollment row - insert a new enrollment, don't update the old one in place.

## Transfer (Spec Section 16)
Cross-school transfer is a privileged, server-side workflow (initiate -> destination accepts -> server validates both schools -> enrollment changes -> historical records preserved -> transfer certificate -> audit). Never let a School Admin write directly into another school's tables to "simulate" a transfer - see `edumanage-multitenancy`.

## Attendance (Spec Section 24)
Statuses: `present | absent | late | excused`. One record per `(student_id, date, academic_year_id)` - enforce with a unique constraint, not just application logic, to prevent duplicate marking. Teachers may only mark attendance for classes they're assigned to (check via a teacher-assignment table + RLS, not just UI filtering). Corrections should be audited (Spec Section 42), not silently overwritten.

## Offline exams (Spec Section 21)
Exam types are `FA1, FA2, MID, FA3, FA4, FINAL`. Marks entry needs validation (`0 <= marks <= max_marks`), a `draft -> published` state, and students must only see marks after `published`. Do not expose an unpublished result to a student's query - gate it in RLS by status, not just by hiding it in the UI.

## Setup Wizard defaults
Telangana defaults (Nursery, LKG, UKG, Class 1-10; sections A-D) are provided as editable pre-selected checkboxes in `SetupWizardPage.tsx`, never hard-coded elsewhere as the only option - schools must be able to add/remove classes, sections, and subjects freely (Spec Section 11).
