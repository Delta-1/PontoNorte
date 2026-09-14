-- PontoNorte by CPUSIS — banco de produção multiempresa (PostgreSQL 17)
create extension if not exists pgcrypto;
create schema if not exists private;

create type public.member_role as enum ('platform_admin','company_owner','hr_admin','hr_agent','manager','employee','terminal');
create type public.employee_status as enum ('active','inactive','on_leave','terminated');
create type public.clock_method as enum ('qr_code','face','mobile','fingerprint','manual_adjustment');
create type public.clock_event_type as enum ('entry','break_start','break_end','exit');
create type public.entry_status as enum ('valid','pending_review','rejected','adjusted');
create type public.review_status as enum ('confirmed','divergent','forwarded_to_hr');
create type public.justification_status as enum ('pending','approved','rejected','cancelled');
create type public.call_status as enum ('draft','completed','cancelled');
create type public.attendance_mark as enum ('present','late','absent','excused');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  company_code text not null unique check (company_code ~ '^[A-Z0-9]{4,12}$'),
  legal_name text not null,
  trade_name text not null,
  tax_id text,
  logo_path text,
  timezone text not null default 'America/Rio_Branco',
  status text not null default 'onboarding' check (status in ('onboarding','active','suspended','cancelled')),
  plan text not null default 'professional',
  license_status text not null default 'pending' check (license_status in ('pending','active','suspended','expired')),
  paid_until date,
  license_updated_at timestamptz not null default now(),
  settings jsonb not null default '{"require_device_authorization":true,"allow_offline_queue":true}'::jsonb,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  role public.member_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table public.work_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  weekly_minutes integer not null default 2640 check (weekly_minutes between 0 and 10080),
  schedule_type text not null default 'fixed' check (schedule_type in ('fixed','flexible')),
  daily_minutes integer not null default 480 check (daily_minutes between 0 and 1440),
  start_time time,
  break_start time,
  break_end time,
  end_time time,
  flexible_window_start time,
  flexible_window_end time,
  tolerance_minutes integer not null default 10 check (tolerance_minutes between 0 and 180),
  days_of_week smallint[] not null default '{1,2,3,4,5}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  schedule_id uuid references public.work_schedules(id) on delete set null,
  username text not null check (username ~ '^[a-z0-9._-]{3,40}$'),
  employee_code text not null,
  full_name text not null,
  email text,
  phone text,
  cpf text,
  job_title text,
  cbo_code text check (cbo_code is null or cbo_code ~ '^[0-9]{6}$'),
  cbo_title text,
  personal_qr_token text not null default encode(gen_random_bytes(24), 'hex'),
  birth_date date,
  gender text,
  avatar_path text,
  hired_at date,
  status public.employee_status not null default 'active',
  terminated_at timestamptz,
  termination_reason text,
  must_change_password boolean not null default true,
  last_password_change_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, username),
  unique (organization_id, employee_code)
);

create table public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  protocol text not null unique check (protocol ~ '^PN-[A-Z0-9]{6}$'),
  status text not null default 'pending' check (status in ('pending','resolved','cancelled')),
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  notes text
);
create index password_reset_org_status_idx on public.password_reset_requests(organization_id,status,requested_at desc);
create index password_reset_employee_idx on public.password_reset_requests(employee_id,requested_at desc);
create index password_reset_resolved_by_idx on public.password_reset_requests(resolved_by);

create table public.clock_methods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  method public.clock_method not null,
  enabled boolean not null default false,
  require_location boolean not null default false,
  require_liveness boolean not null default false,
  configuration jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (organization_id, method)
);

create table public.authorized_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  device_uuid text not null,
  device_name text,
  platform text,
  app_version text,
  approved boolean not null default false,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, device_uuid)
);

-- Segredos de terminal nunca são expostos pela Data API.
create table public.employee_secrets (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pin_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table public.terminals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9._-]{3,40}$'),
  name text not null,
  device_uuid text,
  location_name text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  radius_meters integer,
  enabled boolean not null default true,
  last_seen_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.qr_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  token_hash text not null unique,
  location_name text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  radius_meters integer,
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  event_type public.clock_event_type not null,
  method public.clock_method not null,
  occurred_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  latitude numeric(9,6),
  longitude numeric(9,6),
  accuracy_meters numeric(8,2),
  device_id uuid references public.authorized_devices(id) on delete set null,
  terminal_id uuid references public.terminals(id) on delete set null,
  client_event_id uuid not null,
  qr_session_id uuid references public.qr_sessions(id) on delete set null,
  evidence_path text,
  status public.entry_status not null default 'valid',
  notes text,
  adjusted_from_id uuid references public.time_entries(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (employee_id, client_event_id)
);
create index time_entries_employee_date_idx on public.time_entries (employee_id, occurred_at desc);
create index time_entries_org_date_idx on public.time_entries (organization_id, occurred_at desc);
create index employees_org_idx on public.employees(organization_id);
create index employees_department_idx on public.employees(department_id);
create index employees_schedule_idx on public.employees(schedule_id);
create unique index employees_personal_qr_token_idx on public.employees(personal_qr_token);
create index members_user_idx on public.organization_members(user_id);
create index members_department_idx on public.organization_members(department_id);
create index devices_employee_idx on public.authorized_devices(employee_id);
create index devices_approved_by_idx on public.authorized_devices(approved_by);
create index qr_created_by_idx on public.qr_sessions(created_by);
create index qr_org_idx on public.qr_sessions(organization_id);
create index entries_device_idx on public.time_entries(device_id);
create index entries_terminal_idx on public.time_entries(terminal_id);
create index terminals_org_idx on public.terminals(organization_id);
create index terminals_created_by_idx on public.terminals(created_by);
create index employee_secrets_org_idx on public.employee_secrets(organization_id);
create index entries_qr_idx on public.time_entries(qr_session_id);
create index entries_adjusted_idx on public.time_entries(adjusted_from_id);
create index entries_created_by_idx on public.time_entries(created_by);

create table public.time_entry_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  time_entry_id uuid not null references public.time_entries(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  reviewer_user_id uuid not null references auth.users(id) on delete restrict,
  status public.review_status not null,
  note text,
  reviewed_at timestamptz not null default now(),
  unique (time_entry_id, reviewer_user_id)
);

create table public.justifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  kind text not null,
  reason text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at >= starts_at),
  document_path text,
  status public.justification_status not null default 'pending',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.attendance_calls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  call_date date not null default current_date,
  period text not null default 'morning',
  status public.call_status not null default 'draft',
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (department_id, call_date, period)
);

create table public.attendance_call_items (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.attendance_calls(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  mark public.attendance_mark,
  note text,
  marked_at timestamptz,
  unique (call_id, employee_id)
);

create table public.biometric_consents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  consent_version text not null,
  consent_text_hash text not null,
  granted_at timestamptz not null,
  revoked_at timestamptz,
  provider text,
  provider_reference text,
  created_at timestamptz not null default now(),
  unique (employee_id, consent_version)
);

create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  holiday_date date not null,
  name text not null,
  applies_to_department_id uuid references public.departments(id) on delete cascade,
  unique nulls not distinct (organization_id, holiday_date, applies_to_department_id)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  ip_hash text,
  created_at timestamptz not null default now()
);

create table public.registration_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create table public.license_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code_hash text not null unique,
  license_until date not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- Comprovante secreto entregue somente ao navegador/app que iniciou o cadastro.
-- Permite ativar a primeira credencial sem revelar o código interno da empresa.
create table public.company_activation_claims (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  token_hash text not null unique,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  activated_at timestamptz,
  created_at timestamptz not null default now()
);
create index license_codes_org_date_idx on public.license_codes(organization_id,created_at desc);
create index license_codes_created_by_idx on public.license_codes(created_by);
create index registration_attempts_ip_date_idx on public.registration_attempts(ip_hash,created_at desc);
create index reviews_org_idx on public.time_entry_reviews(organization_id);
create index reviews_employee_idx on public.time_entry_reviews(employee_id);
create index reviews_reviewer_idx on public.time_entry_reviews(reviewer_user_id);
create index justifications_org_idx on public.justifications(organization_id);
create index justifications_employee_idx on public.justifications(employee_id);
create index justifications_created_by_idx on public.justifications(created_by);
create index justifications_reviewed_by_idx on public.justifications(reviewed_by);
create index calls_org_idx on public.attendance_calls(organization_id);
create index calls_created_by_idx on public.attendance_calls(created_by);
create index call_items_org_idx on public.attendance_call_items(organization_id);
create index call_items_employee_idx on public.attendance_call_items(employee_id);
create index consents_org_idx on public.biometric_consents(organization_id);
create index holidays_department_idx on public.holidays(applies_to_department_id);
create index audit_org_date_idx on public.audit_logs(organization_id,created_at desc);
create index audit_actor_idx on public.audit_logs(actor_user_id);

-- Funções internas: a organização é sempre resolvida pelo usuário autenticado.
create or replace function private.is_platform_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select (select auth.uid()) is not null and exists (
  select 1 from public.organization_members m
  where m.user_id = (select auth.uid()) and m.role = 'platform_admin' and m.active
) $$;

create or replace function private.is_org_member(target_org uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select (select auth.uid()) is not null and (
  private.is_platform_admin() or exists (
    select 1 from public.organization_members m
    where m.user_id = (select auth.uid()) and m.organization_id = target_org and m.active
  )
) $$;

create or replace function private.has_org_role(target_org uuid, allowed public.member_role[])
returns boolean language sql stable security definer set search_path = ''
as $$ select (select auth.uid()) is not null and (
  private.is_platform_admin() or exists (
    select 1 from public.organization_members m
    where m.user_id = (select auth.uid()) and m.organization_id = target_org
      and m.role = any(allowed) and m.active
  )
) $$;

create or replace function private.can_access_employee(target_employee uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select (select auth.uid()) is not null and exists (
  select 1 from public.employees e where e.id = target_employee and (
    e.auth_user_id = (select auth.uid())
    or private.has_org_role(e.organization_id, array['company_owner','hr_admin','hr_agent']::public.member_role[])
    or exists (
      select 1 from public.organization_members m
      where m.user_id = (select auth.uid()) and m.organization_id = e.organization_id
        and m.role = 'manager' and m.department_id = e.department_id and m.active
    )
  )
) $$;

create or replace function private.can_lead_employee(target_employee uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select (select auth.uid()) is not null and exists (
  select 1 from public.employees e
  join public.organization_members m on m.organization_id = e.organization_id
  where e.id = target_employee and m.user_id = (select auth.uid()) and m.active and (
    m.role in ('company_owner','hr_admin','hr_agent')
    or (m.role = 'manager' and m.department_id = e.department_id)
  )
) $$;

create or replace function private.can_manage_department(target_org uuid, target_department uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select (select auth.uid()) is not null and (
  private.has_org_role(target_org,array['company_owner','hr_admin','hr_agent']::public.member_role[])
  or exists (
    select 1 from public.organization_members m
    where m.user_id=(select auth.uid()) and m.organization_id=target_org
      and m.department_id=target_department and m.role='manager' and m.active
  )
) $$;

create or replace function private.try_uuid(value text)
returns uuid language plpgsql immutable security invoker set search_path = ''
as $$
begin return value::uuid;
exception when others then return null;
end;
$$;

revoke all on all functions in schema private from public, anon;
grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;

alter table public.organizations enable row level security;
alter table public.departments enable row level security;
alter table public.organization_members enable row level security;
alter table public.work_schedules enable row level security;
alter table public.employees enable row level security;
alter table public.clock_methods enable row level security;
alter table public.authorized_devices enable row level security;
alter table public.employee_secrets enable row level security;
alter table public.terminals enable row level security;
alter table public.qr_sessions enable row level security;
alter table public.time_entries enable row level security;
alter table public.time_entry_reviews enable row level security;
alter table public.justifications enable row level security;
alter table public.attendance_calls enable row level security;
alter table public.attendance_call_items enable row level security;
alter table public.biometric_consents enable row level security;
alter table public.holidays enable row level security;
alter table public.audit_logs enable row level security;
alter table public.registration_attempts enable row level security;
alter table public.license_codes enable row level security;
alter table public.company_activation_claims enable row level security;
alter table public.password_reset_requests enable row level security;

create policy employee_secrets_deny on public.employee_secrets for all to authenticated using (false) with check (false);
create policy registration_attempts_deny on public.registration_attempts for all to authenticated using (false) with check (false);
create policy license_codes_platform_read on public.license_codes for select to authenticated using (private.is_platform_admin());
create policy company_activation_claims_deny on public.company_activation_claims for all to authenticated using (false) with check (false);
create policy password_reset_platform_read on public.password_reset_requests for select to authenticated using (private.is_platform_admin());

create policy organizations_read on public.organizations for select to authenticated using (private.is_org_member(id));
create policy organizations_update on public.organizations for update to authenticated
using (private.has_org_role(id,array['company_owner','hr_admin']::public.member_role[]))
with check (private.has_org_role(id,array['company_owner','hr_admin']::public.member_role[]));
create policy departments_read on public.departments for select to authenticated using (private.is_org_member(organization_id));
create policy departments_manage on public.departments for all to authenticated
using (private.has_org_role(organization_id,array['company_owner','hr_admin']::public.member_role[]))
with check (private.has_org_role(organization_id,array['company_owner','hr_admin']::public.member_role[]));
create policy members_read on public.organization_members for select to authenticated using (private.is_org_member(organization_id));
create policy members_manage on public.organization_members for update to authenticated
using (private.has_org_role(organization_id,array['company_owner','hr_admin']::public.member_role[]))
with check (private.has_org_role(organization_id,array['company_owner','hr_admin']::public.member_role[]));
create policy schedules_read on public.work_schedules for select to authenticated using (private.is_org_member(organization_id));
create policy schedules_manage on public.work_schedules for all to authenticated
using (private.has_org_role(organization_id,array['company_owner','hr_admin','hr_agent']::public.member_role[]))
with check (private.has_org_role(organization_id,array['company_owner','hr_admin','hr_agent']::public.member_role[]));
create policy employees_read on public.employees for select to authenticated using (private.can_access_employee(id));
create policy employees_insert on public.employees for insert to authenticated
with check (private.has_org_role(organization_id,array['company_owner','hr_admin','hr_agent']::public.member_role[]));
create policy methods_read on public.clock_methods for select to authenticated using (private.is_org_member(organization_id));
create policy methods_manage on public.clock_methods for all to authenticated
using (private.has_org_role(organization_id,array['company_owner','hr_admin']::public.member_role[]))
with check (private.has_org_role(organization_id,array['company_owner','hr_admin']::public.member_role[]));
create policy devices_read on public.authorized_devices for select to authenticated using (private.can_access_employee(employee_id));
create policy devices_insert_own on public.authorized_devices for insert to authenticated
with check (employee_id in (select id from public.employees where auth_user_id=(select auth.uid())));
create policy devices_manage on public.authorized_devices for update to authenticated
using (private.can_lead_employee(employee_id)) with check (private.can_lead_employee(employee_id));
create policy terminals_read on public.terminals for select to authenticated
using (auth_user_id=(select auth.uid()) or private.has_org_role(organization_id,array['company_owner','hr_admin']::public.member_role[]));
create policy terminals_manage on public.terminals for all to authenticated
using (private.has_org_role(organization_id,array['company_owner','hr_admin']::public.member_role[]))
with check (private.has_org_role(organization_id,array['company_owner','hr_admin']::public.member_role[]));
create policy qr_read on public.qr_sessions for select to authenticated using (private.is_org_member(organization_id));
create policy qr_manage on public.qr_sessions for all to authenticated
using (private.has_org_role(organization_id,array['company_owner','hr_admin','hr_agent','manager']::public.member_role[]))
with check (private.has_org_role(organization_id,array['company_owner','hr_admin','hr_agent','manager']::public.member_role[]));
create policy entries_read on public.time_entries for select to authenticated using (private.can_access_employee(employee_id));
create policy entries_adjust on public.time_entries for update to authenticated
using (private.has_org_role(organization_id,array['company_owner','hr_admin','hr_agent']::public.member_role[]))
with check (private.has_org_role(organization_id,array['company_owner','hr_admin','hr_agent']::public.member_role[]));
create policy reviews_read on public.time_entry_reviews for select to authenticated using (private.can_access_employee(employee_id));
create policy reviews_leader_insert on public.time_entry_reviews for insert to authenticated
with check (reviewer_user_id=(select auth.uid()) and private.can_lead_employee(employee_id));
create policy reviews_leader_update on public.time_entry_reviews for update to authenticated
using (reviewer_user_id=(select auth.uid()) and private.can_lead_employee(employee_id))
with check (reviewer_user_id=(select auth.uid()) and private.can_lead_employee(employee_id));
create policy justifications_read on public.justifications for select to authenticated using (private.can_access_employee(employee_id));
create policy justifications_insert on public.justifications for insert to authenticated
with check (private.can_access_employee(employee_id) and created_by=(select auth.uid()));
create policy justifications_review on public.justifications for update to authenticated
using (private.can_lead_employee(employee_id)) with check (private.can_lead_employee(employee_id));
create policy calls_read on public.attendance_calls for select to authenticated
using (private.can_manage_department(organization_id,department_id));
create policy calls_insert on public.attendance_calls for insert to authenticated
with check (private.can_manage_department(organization_id,department_id) and created_by=(select auth.uid()));
create policy calls_update on public.attendance_calls for update to authenticated
using (private.can_manage_department(organization_id,department_id))
with check (private.can_manage_department(organization_id,department_id));
create policy calls_delete on public.attendance_calls for delete to authenticated
using (private.has_org_role(organization_id,array['company_owner','hr_admin']::public.member_role[]));
create policy call_items_read on public.attendance_call_items for select to authenticated using (private.can_access_employee(employee_id));
create policy call_items_manage on public.attendance_call_items for all to authenticated
using (private.can_lead_employee(employee_id)) with check (private.can_lead_employee(employee_id));
create policy consents_read on public.biometric_consents for select to authenticated using (private.can_access_employee(employee_id));
create policy consents_own on public.biometric_consents for insert to authenticated
with check (employee_id in (select id from public.employees where auth_user_id=(select auth.uid())));
create policy holidays_read on public.holidays for select to authenticated using (private.is_org_member(organization_id));
create policy holidays_manage on public.holidays for all to authenticated
using (private.has_org_role(organization_id,array['company_owner','hr_admin']::public.member_role[]))
with check (private.has_org_role(organization_id,array['company_owner','hr_admin']::public.member_role[]));
create policy audit_read on public.audit_logs for select to authenticated
using (private.has_org_role(organization_id,array['company_owner','hr_admin']::public.member_role[]));
create policy password_reset_platform_update on public.password_reset_requests for update to authenticated
using (private.is_platform_admin()) with check (private.is_platform_admin());

grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant insert,update,delete on public.departments,public.work_schedules,public.clock_methods,
  public.authorized_devices,public.terminals,public.qr_sessions,public.time_entry_reviews,public.justifications,
  public.attendance_calls,public.attendance_call_items,public.biometric_consents,public.holidays to authenticated;
grant update on public.organizations,public.organization_members,public.time_entries to authenticated;
grant update on public.password_reset_requests to authenticated;
grant insert on public.employees to authenticated;
grant usage,select on all sequences in schema public to authenticated;
revoke all on public.employee_secrets from public,anon,authenticated;
revoke all on public.registration_attempts from public,anon,authenticated;
revoke all on public.company_activation_claims from public,anon,authenticated;
grant select on public.license_codes to authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types) values
  ('avatars','avatars',false,5242880,array['image/jpeg','image/png','image/webp']),
  ('documents','documents',false,10485760,array['application/pdf','image/jpeg','image/png']),
  ('clock-evidence','clock-evidence',false,5242880,array['image/jpeg','image/webp'])
on conflict (id) do nothing;

create policy storage_read_tenant on storage.objects for select to authenticated
using (
  bucket_id in ('avatars','documents','clock-evidence')
  and private.is_org_member(private.try_uuid((storage.foldername(name))[1]))
  and private.can_access_employee(private.try_uuid((storage.foldername(name))[2]))
);
create policy storage_insert_tenant on storage.objects for insert to authenticated
with check (
  bucket_id in ('avatars','documents','clock-evidence')
  and private.is_org_member(private.try_uuid((storage.foldername(name))[1]))
  and private.can_access_employee(private.try_uuid((storage.foldername(name))[2]))
);
create policy storage_update_tenant on storage.objects for update to authenticated
using (
  bucket_id in ('avatars','documents','clock-evidence')
  and private.is_org_member(private.try_uuid((storage.foldername(name))[1]))
  and private.can_access_employee(private.try_uuid((storage.foldername(name))[2]))
)
with check (
  bucket_id in ('avatars','documents','clock-evidence')
  and private.is_org_member(private.try_uuid((storage.foldername(name))[1]))
  and private.can_access_employee(private.try_uuid((storage.foldername(name))[2]))
);

create view public.daily_time_summary with (security_invoker=true) as
with points as (
  select e.organization_id,e.id employee_id,e.full_name,
    (t.occurred_at at time zone o.timezone)::date work_date,
    min(t.occurred_at) filter (where t.event_type='entry') first_entry,
    min(t.occurred_at) filter (where t.event_type='break_start') break_start,
    max(t.occurred_at) filter (where t.event_type='break_end') break_end,
    max(t.occurred_at) filter (where t.event_type='exit') last_exit,
    count(t.id) event_count,coalesce(s.daily_minutes,480) target_minutes,
    coalesce(s.weekly_minutes,2640) weekly_target_minutes,coalesce(s.schedule_type,'fixed') schedule_type
  from public.employees e join public.organizations o on o.id=e.organization_id
  left join public.work_schedules s on s.id=e.schedule_id
  left join public.time_entries t on t.employee_id=e.id
  group by e.organization_id,e.id,e.full_name,s.daily_minutes,s.weekly_minutes,s.schedule_type,
    (t.occurred_at at time zone o.timezone)::date
)
select *,case when first_entry is not null and last_exit is not null then
  greatest(0,(extract(epoch from (last_exit-first_entry))/60)::integer-
    case when break_start is not null and break_end is not null then greatest(0,(extract(epoch from (break_end-break_start))/60)::integer) else 0 end)
  else 0 end worked_minutes,
  case when first_entry is not null and last_exit is not null then
    greatest(0,(extract(epoch from (last_exit-first_entry))/60)::integer-
      case when break_start is not null and break_end is not null then greatest(0,(extract(epoch from (break_end-break_start))/60)::integer) else 0 end)-target_minutes
    else -target_minutes end balance_minutes,
  case when first_entry is null then 'absent' when last_exit is null then 'open'
    when (extract(epoch from (last_exit-first_entry))/60)::integer >= target_minutes then 'completed' else 'debit' end day_status
from points;
grant select on public.daily_time_summary to authenticated;

create view public.weekly_time_summary with (security_invoker=true) as
select organization_id,employee_id,full_name,date_trunc('week',work_date)::date week_start,
  sum(worked_minutes)::integer worked_minutes,
  max(weekly_target_minutes)::integer target_minutes,
  (sum(worked_minutes)-max(weekly_target_minutes))::integer balance_minutes
from public.daily_time_summary where work_date is not null
group by organization_id,employee_id,full_name,date_trunc('week',work_date);
grant select on public.weekly_time_summary to authenticated;


-- Módulo de horas extras e banco de horas
-- Horas extras e banco de horas configuráveis por empresa e colaborador.

create table if not exists public.overtime_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  weekday_percent numeric(6,2) not null default 50 check (weekday_percent between 0 and 300),
  saturday_percent numeric(6,2) not null default 50 check (saturday_percent between 0 and 300),
  sunday_percent numeric(6,2) not null default 100 check (sunday_percent between 0 and 300),
  holiday_percent numeric(6,2) not null default 100 check (holiday_percent between 0 and 300),
  bank_50_multiplier numeric(5,2) not null default 1 check (bank_50_multiplier between 0 and 5),
  bank_100_multiplier numeric(5,2) not null default 1 check (bank_100_multiplier between 0 and 5),
  compensation_months smallint not null default 6 check (compensation_months between 1 and 24),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,name)
);

insert into public.overtime_policies (organization_id,name)
select id,'Padrão 50% / 100%' from public.organizations o
where not exists (select 1 from public.overtime_policies p where p.organization_id=o.id);

create or replace function private.create_default_overtime_policy()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  insert into public.overtime_policies (organization_id,name)
  values (new.id,'Padrão 50% / 100%')
  on conflict (organization_id,name) do nothing;
  return new;
end;
$$;

drop trigger if exists organizations_default_overtime_policy on public.organizations;
create trigger organizations_default_overtime_policy
after insert on public.organizations for each row
execute function private.create_default_overtime_policy();

alter table public.employees
  add column if not exists overtime_mode text not null default 'bank'
    check (overtime_mode in ('disabled','bank','pay')),
  add column if not exists overtime_policy_id uuid references public.overtime_policies(id) on delete set null;

update public.employees e set overtime_policy_id=(
  select p.id from public.overtime_policies p
  where p.organization_id=e.organization_id and p.active
  order by p.created_at limit 1
) where e.overtime_policy_id is null;

create index if not exists employees_overtime_policy_idx on public.employees(overtime_policy_id);

create table if not exists public.overtime_calendar_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rule_date date not null,
  title text not null,
  overtime_percent numeric(6,2) not null check (overtime_percent between 0 and 300),
  count_all_worked_as_overtime boolean not null default true,
  applies_to_department_id uuid references public.departments(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique nulls not distinct (organization_id,rule_date,applies_to_department_id)
);

create index if not exists overtime_calendar_org_date_idx on public.overtime_calendar_rules(organization_id,rule_date);
create index if not exists overtime_calendar_department_idx on public.overtime_calendar_rules(applies_to_department_id);

create table if not exists public.time_bank_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null default current_date,
  entry_type text not null check (entry_type in ('opening','credit','debit','compensation','payment','correction')),
  minutes integer not null check (minutes between -1000000 and 1000000 and minutes <> 0),
  overtime_percent numeric(6,2) check (overtime_percent is null or overtime_percent between 0 and 300),
  reason text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists time_bank_adjustments_org_date_idx on public.time_bank_adjustments(organization_id,work_date desc);
create index if not exists time_bank_adjustments_employee_date_idx on public.time_bank_adjustments(employee_id,work_date desc);

alter table public.overtime_policies enable row level security;
alter table public.overtime_calendar_rules enable row level security;
alter table public.time_bank_adjustments enable row level security;

drop policy if exists overtime_policies_read on public.overtime_policies;
create policy overtime_policies_read on public.overtime_policies for select to authenticated
using (private.is_org_member(organization_id));
drop policy if exists overtime_policies_manage on public.overtime_policies;
create policy overtime_policies_manage on public.overtime_policies for all to authenticated
using (private.has_org_role(organization_id,array['company_owner','hr_admin','hr_agent']::public.member_role[]))
with check (private.has_org_role(organization_id,array['company_owner','hr_admin','hr_agent']::public.member_role[]));

drop policy if exists overtime_calendar_read on public.overtime_calendar_rules;
create policy overtime_calendar_read on public.overtime_calendar_rules for select to authenticated
using (private.is_org_member(organization_id));
drop policy if exists overtime_calendar_manage on public.overtime_calendar_rules;
create policy overtime_calendar_manage on public.overtime_calendar_rules for all to authenticated
using (private.has_org_role(organization_id,array['company_owner','hr_admin','hr_agent']::public.member_role[]))
with check (private.has_org_role(organization_id,array['company_owner','hr_admin','hr_agent']::public.member_role[]));

drop policy if exists time_bank_adjustments_read on public.time_bank_adjustments;
create policy time_bank_adjustments_read on public.time_bank_adjustments for select to authenticated
using (private.can_access_employee(employee_id));
drop policy if exists time_bank_adjustments_manage on public.time_bank_adjustments;
create policy time_bank_adjustments_manage on public.time_bank_adjustments for all to authenticated
using (private.has_org_role(organization_id,array['company_owner','hr_admin','hr_agent']::public.member_role[]))
with check (private.has_org_role(organization_id,array['company_owner','hr_admin','hr_agent']::public.member_role[]));

grant select,insert,update,delete on public.overtime_policies,public.overtime_calendar_rules,public.time_bank_adjustments to authenticated;

create or replace view public.overtime_daily_summary with (security_invoker=true) as
with classified as (
  select
    d.organization_id,d.employee_id,d.full_name,d.work_date,d.first_entry,d.event_break_start break_start,d.event_break_end break_end,d.last_exit,d.event_count,
    d.worked_minutes,d.target_minutes original_target_minutes,d.schedule_type,
    e.employee_code,e.department_id,e.overtime_mode,e.overtime_policy_id,
    p.name overtime_policy_name,p.bank_50_multiplier,p.bank_100_multiplier,p.compensation_months,
    coalesce(c.overtime_percent,
      case
        when h.id is not null then p.holiday_percent
        when extract(isodow from d.work_date)=7 then p.sunday_percent
        when extract(isodow from d.work_date)=6 then p.saturday_percent
        else p.weekday_percent
      end
    ) overtime_percent,
    case
      when c.count_all_worked_as_overtime is true or h.id is not null or not (extract(isodow from d.work_date)::smallint=any(coalesce(s.days_of_week,'{1,2,3,4,5}'::smallint[]))) then 0
      else d.target_minutes
    end effective_target_minutes,
    coalesce(c.title,h.name,
      case
        when extract(isodow from d.work_date)=7 then 'Domingo'
        when extract(isodow from d.work_date)=6 then 'Sábado'
        else 'Dia útil'
      end
    ) overtime_rule
  from public.daily_time_summary d
  join public.employees e on e.id=d.employee_id
  left join public.work_schedules s on s.id=e.schedule_id
  left join lateral (
    select op.* from public.overtime_policies op
    where op.organization_id=e.organization_id and op.active
      and (op.id=e.overtime_policy_id or e.overtime_policy_id is null)
    order by (op.id=e.overtime_policy_id) desc,op.created_at
    limit 1
  ) p on true
  left join lateral (
    select r.* from public.overtime_calendar_rules r
    where r.organization_id=e.organization_id and r.rule_date=d.work_date
      and (r.applies_to_department_id is null or r.applies_to_department_id=e.department_id)
    order by (r.applies_to_department_id is not null) desc
    limit 1
  ) c on true
  left join lateral (
    select hd.* from public.holidays hd
    where hd.organization_id=e.organization_id and hd.holiday_date=d.work_date
      and (hd.applies_to_department_id is null or hd.applies_to_department_id=e.department_id)
    order by (hd.applies_to_department_id is not null) desc
    limit 1
  ) h on true
)
select classified.*,
  greatest(worked_minutes-effective_target_minutes,0)::integer overtime_minutes,
  greatest(effective_target_minutes-worked_minutes,0)::integer debit_minutes,
  case when overtime_percent=50 then greatest(worked_minutes-effective_target_minutes,0)::integer else 0 end overtime_50_minutes,
  case when overtime_percent>=100 then greatest(worked_minutes-effective_target_minutes,0)::integer else 0 end overtime_100_minutes,
  case when overtime_mode='bank' then
    round(greatest(worked_minutes-effective_target_minutes,0)*
      case when overtime_percent>=100 then bank_100_multiplier else bank_50_multiplier end
    )::integer-greatest(effective_target_minutes-worked_minutes,0)::integer
    else 0
  end bank_delta_minutes,
  case when overtime_mode='pay' then greatest(worked_minutes-effective_target_minutes,0)::integer else 0 end payable_overtime_minutes
from classified;

grant select on public.overtime_daily_summary to authenticated;

create or replace view public.employee_time_bank_balance with (security_invoker=true) as
with daily as (
  select organization_id,employee_id,
    sum(bank_delta_minutes)::integer calculated_minutes,
    sum(overtime_50_minutes)::integer overtime_50_minutes,
    sum(overtime_100_minutes)::integer overtime_100_minutes
  from public.overtime_daily_summary
  group by organization_id,employee_id
),adjustments as (
  select organization_id,employee_id,sum(minutes)::integer adjustment_minutes
  from public.time_bank_adjustments
  group by organization_id,employee_id
)
select e.organization_id,e.id employee_id,e.full_name,e.employee_code,e.overtime_mode,e.overtime_policy_id,
  coalesce(d.calculated_minutes,0) calculated_minutes,
  coalesce(a.adjustment_minutes,0) adjustment_minutes,
  coalesce(d.calculated_minutes,0)+coalesce(a.adjustment_minutes,0) balance_minutes,
  coalesce(d.overtime_50_minutes,0) overtime_50_minutes,
  coalesce(d.overtime_100_minutes,0) overtime_100_minutes
from public.employees e
left join daily d on d.employee_id=e.id
left join adjustments a on a.employee_id=e.id;

grant select on public.employee_time_bank_balance to authenticated;

comment on table public.overtime_policies is 'Regras reutilizáveis de adicionais e compensação por empresa.';
comment on table public.overtime_calendar_rules is 'Exceções por data para classificar dias em 50%, 100% ou outro adicional.';
comment on table public.time_bank_adjustments is 'Lançamentos manuais auditáveis no banco de horas.';
comment on view public.overtime_daily_summary is 'Classificação diária de horas extras, pagamento e banco conforme jornada, calendário e política.';


-- Performance and RLS follow-up for overtime module
create index if not exists overtime_calendar_created_by_idx on public.overtime_calendar_rules(created_by);
create index if not exists time_bank_adjustments_created_by_idx on public.time_bank_adjustments(created_by);

drop policy if exists overtime_policies_manage on public.overtime_policies;
drop policy if exists overtime_policies_insert on public.overtime_policies;
drop policy if exists overtime_policies_update on public.overtime_policies;
drop policy if exists overtime_policies_delete on public.overtime_policies;
create policy overtime_policies_insert on public.overtime_policies for insert to authenticated
with check (private.has_org_role(organization_id,array['company_owner','hr_admin','hr_agent']::public.member_role[]));
create policy overtime_policies_update on public.overtime_policies for update to authenticated
using (private.has_org_role(organization_id,array['company_owner','hr_admin','hr_agent']::public.member_role[]))
with check (private.has_org_role(organization_id,array['company_owner','hr_admin','hr_agent']::public.member_role[]));
create policy overtime_policies_delete on public.overtime_policies for delete to authenticated
using (private.has_org_role(organization_id,array['company_owner','hr_admin','hr_agent']::public.member_role[]));

drop policy if exists overtime_calendar_manage on public.overtime_calendar_rules;
drop policy if exists overtime_calendar_insert on public.overtime_calendar_rules;
drop policy if exists overtime_calendar_update on public.overtime_calendar_rules;
drop policy if exists overtime_calendar_delete on public.overtime_calendar_rules;
create policy overtime_calendar_insert on public.overtime_calendar_rules for insert to authenticated
with check (private.has_org_role(organization_id,array['company_owner','hr_admin','hr_agent']::public.member_role[]));
create policy overtime_calendar_update on public.overtime_calendar_rules for update to authenticated
using (private.has_org_role(organization_id,array['company_owner','hr_admin','hr_agent']::public.member_role[]))
with check (private.has_org_role(organization_id,array['company_owner','hr_admin','hr_agent']::public.member_role[]));
create policy overtime_calendar_delete on public.overtime_calendar_rules for delete to authenticated
using (private.has_org_role(organization_id,array['company_owner','hr_admin','hr_agent']::public.member_role[]));

drop policy if exists time_bank_adjustments_manage on public.time_bank_adjustments;
drop policy if exists time_bank_adjustments_insert on public.time_bank_adjustments;
drop policy if exists time_bank_adjustments_update on public.time_bank_adjustments;
drop policy if exists time_bank_adjustments_delete on public.time_bank_adjustments;
create policy time_bank_adjustments_insert on public.time_bank_adjustments for insert to authenticated
with check (private.has_org_role(organization_id,array['company_owner','hr_admin','hr_agent']::public.member_role[]));
create policy time_bank_adjustments_update on public.time_bank_adjustments for update to authenticated
using (private.has_org_role(organization_id,array['company_owner','hr_admin','hr_agent']::public.member_role[]))
with check (private.has_org_role(organization_id,array['company_owner','hr_admin','hr_agent']::public.member_role[]));
create policy time_bank_adjustments_delete on public.time_bank_adjustments for delete to authenticated
using (private.has_org_role(organization_id,array['company_owner','hr_admin','hr_agent']::public.member_role[]));
