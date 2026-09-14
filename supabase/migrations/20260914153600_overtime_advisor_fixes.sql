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