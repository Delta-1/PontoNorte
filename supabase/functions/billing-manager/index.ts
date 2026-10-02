import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { corsHeaders, json } from "../_shared/cors.ts";

const monthStart = (value: unknown) => {
  const raw = String(value ?? "");
  if (!/^\d{4}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}-01T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : `${raw}-01`;
};

const dueDate = (month: string, day: number) => {
  const date = new Date(`${month}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(Math.min(28, Math.max(1, day)));
  return date.toISOString().slice(0, 10);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Sessão obrigatória." }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data: userData } = await caller.auth.getUser();
    if (!userData.user) return json({ error: "Sessão inválida." }, 401);
    const { data: membership } = await admin.from("organization_members").select("id").eq("user_id", userData.user.id).eq("role", "platform_admin").eq("active", true).maybeSingle();
    if (!membership) return json({ error: "Acesso exclusivo do administrador geral." }, 403);

    const body = await req.json();
    const action = String(body.action ?? "overview");
    if (action === "update_settings") {
      const unitPrice = Number(body.unit_price);
      const billingDay = Number(body.billing_day);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) return json({ error: "Informe um preço válido por funcionário." }, 400);
      if (!Number.isInteger(billingDay) || billingDay < 1 || billingDay > 28) return json({ error: "O vencimento deve ficar entre os dias 1 e 28." }, 400);
      const freeMonth = body.free_month ? monthStart(String(body.free_month).slice(0, 7)) : null;
      const { error } = await admin.from("platform_billing_settings").upsert({ id: 1, unit_price: unitPrice, billing_day: billingDay, free_month: freeMonth, updated_by: userData.user.id, updated_at: new Date().toISOString() });
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    if (action === "update_company") {
      const organizationId = String(body.organization_id ?? "");
      if (!organizationId) return json({ error: "Empresa obrigatória." }, 400);
      const override = body.unit_price_override === "" || body.unit_price_override == null ? null : Number(body.unit_price_override);
      if (override != null && (!Number.isFinite(override) || override < 0)) return json({ error: "Informe um preço personalizado válido." }, 400);
      const { error } = await admin.from("organization_billing_settings").upsert({ organization_id: organizationId, unit_price_override: override, billing_enabled: body.billing_enabled !== false, billing_exempt: body.billing_exempt === true, notes: String(body.notes ?? "").trim() || null, updated_by: userData.user.id, updated_at: new Date().toISOString() });
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    if (action === "mark_paid") {
      const invoiceId = String(body.invoice_id ?? "");
      const { error } = await admin.from("billing_invoices").update({ status: "paid", paid_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", invoiceId).eq("status", "pending");
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    if (action !== "generate") return json({ error: "Ação inválida." }, 400);
    const month = monthStart(body.month);
    if (!month) return json({ error: "Competência inválida." }, 400);
    const [{ data: settings }, { data: organizations }, { data: overrides }, { data: employees }] = await Promise.all([
      admin.from("platform_billing_settings").select("*").eq("id", 1).single(),
      admin.from("organizations").select("id,trade_name"),
      admin.from("organization_billing_settings").select("*"),
      admin.from("employees").select("organization_id").eq("status", "active"),
    ]);
    if (!settings) return json({ error: "Configure a regra de cobrança antes de gerar a competência." }, 409);
    const counts = new Map<string, number>();
    for (const employee of employees ?? []) counts.set(employee.organization_id, (counts.get(employee.organization_id) ?? 0) + 1);
    const byOrg = new Map((overrides ?? []).map((item) => [item.organization_id, item]));
    const rows = (organizations ?? []).map((organization) => {
      const custom = byOrg.get(organization.id);
      const quantity = counts.get(organization.id) ?? 0;
      const unitPrice = Number(custom?.unit_price_override ?? settings.unit_price ?? 0);
      const subtotal = Number((quantity * unitPrice).toFixed(2));
      const isFree = settings.free_month === month || custom?.billing_exempt === true;
      const disabled = custom?.billing_enabled === false;
      return { organization_id: organization.id, billing_month: month, active_employee_count: quantity, unit_price: unitPrice, subtotal, discount: isFree ? subtotal : 0, total: isFree || disabled ? 0 : subtotal, due_date: dueDate(month, settings.billing_day), status: disabled ? "cancelled" : isFree ? "free" : "pending", notes: settings.free_month === month ? "Mês gratuito definido pelo PontoNorte." : custom?.billing_exempt ? "Empresa isenta nesta regra comercial." : null, created_by: userData.user.id, updated_at: new Date().toISOString() };
    });
    const { error } = await admin.from("billing_invoices").upsert(rows, { onConflict: "organization_id,billing_month" });
    if (error) return json({ error: error.message }, 400);
    return json({ success: true, generated: rows.length });
  } catch (error) {
    console.error("billing-manager failure", error);
    return json({ error: "Não foi possível processar a cobrança." }, 500);
  }
});
