-- EduManage Phase 1 — Foundation: extensions & enums
-- Spec refs: Section 4 (Tenancy), Section 5 (Role architecture)

create extension if not exists pgcrypto with schema public;

create type public.app_role as enum ('super_admin', 'school_admin', 'sub_admin', 'teacher', 'student');
create type public.school_status as enum ('active', 'suspended', 'expired');
create type public.subscription_status as enum ('trial', 'active', 'past_due', 'expired', 'suspended', 'cancelled');

comment on type public.app_role is 'Canonical roles per Spec Section 5. Do not add roles that bypass this enum.';
