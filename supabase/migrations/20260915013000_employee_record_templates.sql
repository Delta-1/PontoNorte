create table if not exists public.employee_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  template_key text not null default 'registro_empregado_br' check (template_key ~ '^[a-z0-9_]{3,60}$'),
  template_version integer not null default 1 check (template_version > 0),
  record_number text,
  esocial_registration text,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, template_key)
);

create index if not exists employee_records_org_idx on public.employee_records(organization_id);
create index if not exists employee_records_employee_idx on public.employee_records(employee_id);
create index if not exists employee_records_created_by_idx on public.employee_records(created_by);
create index if not exists employee_records_updated_by_idx on public.employee_records(updated_by);

alter table public.employee_records enable row level security;

drop policy if exists employee_records_read on public.employee_records;
create policy employee_records_read on public.employee_records for select to authenticated
using (private.can_access_employee(employee_id));

drop policy if exists employee_records_insert on public.employee_records;
create policy employee_records_insert on public.employee_records for insert to authenticated
with check (
  private.can_lead_employee(employee_id)
  and exists (
    select 1 from public.employees e
    where e.id = employee_id and e.organization_id = organization_id
  )
);

drop policy if exists employee_records_update on public.employee_records;
create policy employee_records_update on public.employee_records for update to authenticated
using (private.can_lead_employee(employee_id))
with check (
  private.can_lead_employee(employee_id)
  and exists (
    select 1 from public.employees e
    where e.id = employee_id and e.organization_id = organization_id
  )
);

drop policy if exists employee_records_delete on public.employee_records;
create policy employee_records_delete on public.employee_records for delete to authenticated
using (private.can_lead_employee(employee_id));

grant select,insert,update,delete on public.employee_records to authenticated;

comment on table public.employee_records is 'Fichas cadastrais versionadas por colaborador; data JSONB preserva modelos atuais e futuros sem expor documentos em tabelas públicas sem RLS.';
comment on column public.employee_records.data is 'Campos específicos do modelo de ficha, históricos e observações.';