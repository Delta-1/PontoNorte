import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { corsHeaders, json } from "../_shared/cors.ts";

const cleanCode = (value: unknown) => String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const cleanUsername = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9._-]/g, "");
const loginEmail = (code: string, username: string) => `${username}.${code}@login.pontonorte.app`;

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
    const { data: platformAdmin } = await admin.from("organization_members").select("organization_id").eq("user_id", userData.user.id).eq("role", "platform_admin").eq("active", true).maybeSingle();
    if (!platformAdmin) return json({ error: "Acesso exclusivo do administrador geral." }, 403);

    const body = await req.json();
    const orgId = String(body.organization_id ?? "");
    const companyCode = cleanCode(body.company_code);
    const username = cleanUsername(body.owner_username);
    const contactEmail = String(body.owner_email ?? "").trim().toLowerCase();
    const temporaryPassword = String(body.temporary_password ?? "");
    if (!orgId || companyCode.length < 4 || companyCode.length > 12) return json({ error: "Informe uma empresa e um código válido." }, 400);
    if (username.length < 3 || username.length > 40) return json({ error: "O usuário deve ter entre 3 e 40 caracteres." }, 400);
    if (contactEmail && !contactEmail.includes("@")) return json({ error: "Informe um e-mail de contato válido." }, 400);
    if (temporaryPassword && temporaryPassword.length < 8) return json({ error: "A senha provisória precisa ter pelo menos 8 caracteres." }, 400);

    const { data: organization } = await admin.from("organizations").select("*").eq("id", orgId).single();
    if (!organization) return json({ error: "Empresa não encontrada." }, 404);
    const { data: duplicateCode } = await admin.from("organizations").select("id").eq("company_code", companyCode).neq("id", orgId).maybeSingle();
    if (duplicateCode) return json({ error: "Este código de empresa já está em uso." }, 409);

    const { data: ownerMember } = await admin.from("organization_members").select("user_id").eq("organization_id", orgId).eq("role", "company_owner").eq("active", true).limit(1).maybeSingle();
    if (!ownerMember) return json({ error: "A empresa não possui um proprietário ativo." }, 409);
    const { data: owner } = await admin.from("employees").select("*").eq("organization_id", orgId).eq("auth_user_id", ownerMember.user_id).single();
    if (!owner) return json({ error: "Cadastro do proprietário não encontrado." }, 409);
    const { data: duplicateUsername } = await admin.from("employees").select("id").eq("organization_id", orgId).eq("username", username).neq("id", owner.id).maybeSingle();
    if (duplicateUsername) return json({ error: "Este usuário já está em uso na empresa." }, 409);

    if (organization.company_code !== companyCode) {
      const { data: employees } = await admin.from("employees").select("id,auth_user_id,username").eq("organization_id", orgId).not("auth_user_id", "is", null);
      for (const employee of employees ?? []) {
        const finalUsername = employee.id === owner.id ? username : employee.username;
        const { error } = await admin.auth.admin.updateUserById(employee.auth_user_id, { email: loginEmail(companyCode, finalUsername), app_metadata: { organization_id: orgId, company_code: companyCode } });
        if (error) return json({ error: `Não foi possível atualizar o acesso ${finalUsername}.` }, 409);
      }
      const { data: terminals } = await admin.from("terminals").select("auth_user_id,code").eq("organization_id", orgId);
      for (const terminal of terminals ?? []) {
        const { error } = await admin.auth.admin.updateUserById(terminal.auth_user_id, { email: loginEmail(companyCode, terminal.code), app_metadata: { organization_id: orgId, company_code: companyCode, role: "terminal" } });
        if (error) return json({ error: `Não foi possível atualizar o terminal ${terminal.code}.` }, 409);
      }
    }

    const authChanges: Record<string, unknown> = {
      email: loginEmail(companyCode, username),
      app_metadata: { organization_id: orgId, company_code: companyCode, role: "company_owner" },
      user_metadata: { full_name: owner.full_name, contact_email: contactEmail },
    };
    if (temporaryPassword) authChanges.password = temporaryPassword;
    const { error: authError } = await admin.auth.admin.updateUserById(owner.auth_user_id, authChanges);
    if (authError) return json({ error: "Não foi possível atualizar o acesso do proprietário." }, 409);

    const now = new Date().toISOString();
    const { error: orgError } = await admin.from("organizations").update({
      company_code: companyCode,
      trade_name: String(body.trade_name ?? "").trim(),
      legal_name: String(body.legal_name ?? "").trim(),
      tax_id: String(body.tax_id ?? "").trim() || null,
      timezone: String(body.timezone ?? "America/Rio_Branco").trim(),
      updated_at: now,
    }).eq("id", orgId);
    if (orgError) return json({ error: orgError.message }, 400);
    const { error: employeeError } = await admin.from("employees").update({ username, email: contactEmail || null, must_change_password: temporaryPassword ? true : owner.must_change_password, updated_at: now }).eq("id", owner.id);
    if (employeeError) return json({ error: employeeError.message }, 400);

    if (body.reset_request_id) await admin.from("password_reset_requests").update({ status: "resolved", resolved_at: now, resolved_by: userData.user.id, notes: "Acesso redefinido pelo administrador geral." }).eq("id", body.reset_request_id).eq("organization_id", orgId);
    await admin.from("audit_logs").insert({ organization_id: orgId, actor_user_id: userData.user.id, action: "company_access_updated", entity_type: "organization", entity_id: orgId, after_data: { company_code: companyCode, owner_username: username, password_reset: Boolean(temporaryPassword) } });
    return json({ success: true, company_code: companyCode, owner_username: username, password_reset: Boolean(temporaryPassword) });
  } catch (error) {
    console.error("manage-company failure", error);
    return json({ error: "Não foi possível atualizar a empresa." }, 500);
  }
});
