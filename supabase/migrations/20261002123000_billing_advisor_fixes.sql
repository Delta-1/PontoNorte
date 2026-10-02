create index if not exists platform_billing_settings_updated_by_idx on public.platform_billing_settings(updated_by);
create index if not exists organization_billing_settings_updated_by_idx on public.organization_billing_settings(updated_by);
create index if not exists billing_invoices_created_by_idx on public.billing_invoices(created_by);

drop policy if exists billing_invoices_admin_all on public.billing_invoices;
drop policy if exists billing_invoices_company_read on public.billing_invoices;

create policy billing_invoices_read on public.billing_invoices for select to authenticated
using (
  private.is_platform_admin() or exists (
    select 1 from public.organization_members member
    where member.organization_id = billing_invoices.organization_id
      and member.user_id = (select auth.uid())
      and member.active
      and member.role in ('company_owner','hr_admin')
  )
);

create policy billing_invoices_admin_insert on public.billing_invoices for insert to authenticated
with check (private.is_platform_admin());
create policy billing_invoices_admin_update on public.billing_invoices for update to authenticated
using (private.is_platform_admin()) with check (private.is_platform_admin());
create policy billing_invoices_admin_delete on public.billing_invoices for delete to authenticated
using (private.is_platform_admin());
