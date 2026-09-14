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
