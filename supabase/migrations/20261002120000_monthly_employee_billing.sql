create table if not exists public.platform_billing_settings (
  id smallint primary key default 1 check (id = 1),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  currency text not null default 'BRL' check (currency = 'BRL'),
  billing_day smallint not null default 10 check (billing_day between 1 and 28),
  free_month date,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_billing_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  unit_price_override numeric(12,2) check (unit_price_override is null or unit_price_override >= 0),
  billing_enabled boolean not null default true,
  billing_exempt boolean not null default false,
  notes text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  billing_month date not null check (billing_month = date_trunc('month', billing_month)::date),
  active_employee_count integer not null default 0 check (active_employee_count >= 0),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  due_date date,
  status text not null default 'pending' check (status in ('free','pending','paid','cancelled')),
  paid_at timestamptz,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, billing_month)
);

create index if not exists billing_invoices_month_status_idx on public.billing_invoices (billing_month, status);
create index if not exists billing_invoices_organization_idx on public.billing_invoices (organization_id);

alter table public.platform_billing_settings enable row level security;
alter table public.organization_billing_settings enable row level security;
alter table public.billing_invoices enable row level security;

drop policy if exists platform_billing_admin_all on public.platform_billing_settings;
create policy platform_billing_admin_all on public.platform_billing_settings for all to authenticated
using (private.is_platform_admin()) with check (private.is_platform_admin());

drop policy if exists organization_billing_admin_all on public.organization_billing_settings;
create policy organization_billing_admin_all on public.organization_billing_settings for all to authenticated
using (private.is_platform_admin()) with check (private.is_platform_admin());

drop policy if exists billing_invoices_admin_all on public.billing_invoices;
create policy billing_invoices_admin_all on public.billing_invoices for all to authenticated
using (private.is_platform_admin()) with check (private.is_platform_admin());

drop policy if exists billing_invoices_company_read on public.billing_invoices;
create policy billing_invoices_company_read on public.billing_invoices for select to authenticated
using (
  exists (
    select 1 from public.organization_members member
    where member.organization_id = billing_invoices.organization_id
      and member.user_id = (select auth.uid())
      and member.active
      and member.role in ('company_owner','hr_admin')
  )
);

insert into public.platform_billing_settings (id, unit_price, billing_day, free_month)
values (1, 0, 10, date '2026-10-01')
on conflict (id) do update set free_month = excluded.free_month, updated_at = now();

comment on table public.platform_billing_settings is 'Regra global de cobrança mensal por colaborador ativo.';
comment on table public.organization_billing_settings is 'Exceções comerciais por empresa, administradas apenas pelo PontoNorte.';
comment on table public.billing_invoices is 'Fotografia mensal da quantidade de ativos e do valor calculado por empresa.';
