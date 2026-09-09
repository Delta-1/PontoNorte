import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { corsHeaders, json } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Sessão obrigatória." }, 401);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
    });
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data: current } = await caller.auth.getUser();
    if (!current.user) return json({ error: "Sessão inválida." }, 401);
    const { data: platform } = await admin.from("organization_members").select("id")
      .eq("user_id", current.user.id).eq("role", "platform_admin").eq("active", true).maybeSingle();
    if (!platform) return json({ error: "Apenas a CP Ocis pode cadastrar empresas." }, 403);

    const body = await req.json();
    const companyCode = String(body.company_code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const username = String(body.owner_username ?? "").toLowerCase().replace(/[^a-z0-9._-]/g, "");
    if (companyCode.length < 4 || username.length < 3 || String(body.owner_password ?? "").length < 8) {
      return json({ error: "Confira o código, usuário e senha provisória." }, 400);
    }
    const { data: org, error: orgError } = await admin.from("organizations").insert({
      company_code: companyCode,
      legal_name: body.legal_name,
      trade_name: body.trade_name,
      tax_id: body.tax_id || null,
      timezone: body.timezone || "America/Rio_Branco",
      status: "active",
      onboarding_completed_at: new Date().toISOString(),
    }).select("id,company_code,trade_name").single();
    if (orgError || !org) return json({ error: orgError?.message ?? "Falha ao criar empresa." }, 409);

    const loginEmail = `${username}.${companyCode}@login.pontonorte.app`;
    const { data: owner, error: ownerError } = await admin.auth.admin.createUser({
      email: loginEmail, password: body.owner_password, email_confirm: true,
      app_metadata: { organization_id: org.id, role: "company_owner", company_code: companyCode },
      user_metadata: { full_name: body.owner_name },
    });
    if (ownerError || !owner.user) {
      await admin.from("organizations").delete().eq("id", org.id);
      return json({ error: ownerError?.message ?? "Falha ao criar proprietário." }, 409);
    }
    const { data: schedule } = await admin.from("work_schedules").insert({
      organization_id: org.id, name: "Jornada padrão", start_time: "08:00",
      break_start: "12:00", break_end: "13:00", end_time: "18:00",
    }).select("id").single();
    const { data: department } = await admin.from("departments").insert({
      organization_id: org.id, name: "Administrativo",
    }).select("id").single();
    const { data: employee, error: employeeError } = await admin.from("employees").insert({
      organization_id: org.id, auth_user_id: owner.user.id,
      department_id: department?.id ?? null, schedule_id: schedule?.id ?? null,
      username, employee_code: "ADM-001", full_name: body.owner_name,
      email: body.owner_email || null, job_title: "Administrador",
      status: "active", must_change_password: true,
    }).select("id").single();
    if (employeeError || !employee) {
      await admin.auth.admin.deleteUser(owner.user.id);
      await admin.from("organizations").delete().eq("id", org.id);
      return json({ error: employeeError?.message ?? "Falha ao criar conta." }, 409);
    }
    await admin.from("organization_members").insert({
      organization_id: org.id, user_id: owner.user.id,
      department_id: department?.id ?? null, role: "company_owner",
    });
    await admin.from("clock_methods").insert([
      { organization_id: org.id, method: "mobile", enabled: true, require_location: true },
      { organization_id: org.id, method: "qr_code", enabled: true, require_location: true },
      { organization_id: org.id, method: "face", enabled: false, require_location: true, require_liveness: true },
      { organization_id: org.id, method: "fingerprint", enabled: false },
    ]);
    await admin.from("audit_logs").insert({
      organization_id: org.id, actor_user_id: current.user.id, action: "organization.created",
      entity_type: "organization", entity_id: org.id, after_data: { company_code: companyCode, trade_name: body.trade_name },
    });
    return json({ organization: org, owner_username: username }, 201);
  } catch {
    return json({ error: "Não foi possível cadastrar a empresa." }, 500);
  }
});
