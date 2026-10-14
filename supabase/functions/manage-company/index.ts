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
    const action = String(body.action ?? "update");
    const orgId = String(body.organization_id ?? "");
    if (!orgId) return json({ error: "Informe a empresa." }, 400);
    const { data: organization } = await admin.from("organizations").select("*").eq("id", orgId).maybeSingle();
    if (!organization) return json({ error: "Empresa não encontrada." }, 404);

    if (action === "delete") {
      if (orgId === platformAdmin.organization_id) return json({ error: "A conta principal do PontoNorte não pode ser excluída." }, 409);
      if (String(body.confirm_name ?? "").trim() !== String(organization.trade_name).trim()) return json({ error: "Confirme o nome exato da empresa para excluir." }, 400);
      const [{ data: members }, { data: employees }, { data: terminals }] = await Promise.all([
        admin.from("organization_members").select("user_id").eq("organization_id", orgId),
        admin.from("employees").select("auth_user_id").eq("organization_id", orgId).not("auth_user_id", "is", null),
        admin.from("terminals").select("auth_user_id").eq("organization_id", orgId).not("auth_user_id", "is", null),
      ]);
      const candidates = [...new Set([...(members ?? []).map((row) => row.user_id), ...(employees ?? []).map((row) => row.auth_user_id), ...(terminals ?? []).map((row) => row.auth_user_id)].filter(Boolean))];
      const { data: sharedMemberships } = candidates.length
        ? await admin.from("organization_members").select("user_id").in("user_id", candidates).neq("organization_id", orgId)
        : { data: [] };
      const sharedUsers = new Set((sharedMemberships ?? []).map((row) => row.user_id));
      for (const userId of candidates) {
        if (userId === userData.user.id || sharedUsers.has(userId)) continue;
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) return json({ error: "Não foi possível apagar um dos acessos da empresa. Verifique arquivos vinculados ao usuário e tente novamente." }, 409);
      }
      const { error: deleteError } = await admin.from("organizations").delete().eq("id", orgId);
      if (deleteError) return json({ error: deleteError.message }, 409);
      console.info("company deleted", { organization_id: orgId, actor_user_id: userData.user.id, deleted_auth_users: candidates.length });
      return json({ success: true, deleted: true });
    }

    if (orgId === platformAdmin.organization_id) return json({ error: "Edite a conta principal em Configurações." }, 409);
    const companyCode = cleanCode(body.company_code);
    const username = cleanUsername(body.owner_username);
    const contactEmail = String(body.owner_email ?? "").trim().toLowerCase();
    const temporaryPassword = String(body.temporary_password ?? "");
    const ownerName = String(body.owner_name ?? "").trim() || `Administrador ${String(body.trade_name ?? organization.trade_name).trim()}`;
    if (companyCode.length < 4 || companyCode.length > 12) return json({ error: "Informe um código de empresa válido." }, 400);
    if (username.length < 3 || username.length > 40) return json({ error: "O usuário deve ter entre 3 e 40 caracteres." }, 400);
    if (!/^\S+@\S+\.\S+$/.test(contactEmail)) return json({ error: "Informe um e-mail de recuperação válido." }, 400);
    if (temporaryPassword && temporaryPassword.length < 8) return json({ error: "A nova senha precisa ter pelo menos 8 caracteres." }, 400);
    const { data: duplicateCode } = await admin.from("organizations").select("id").eq("company_code", companyCode).neq("id", orgId).maybeSingle();
    if (duplicateCode) return json({ error: "Este código de empresa já está em uso." }, 409);

    const { data: ownerMember } = await admin.from("organization_members").select("user_id").eq("organization_id", orgId).eq("role", "company_owner").eq("active", true).limit(1).maybeSingle();
    let owner: any = null;
    if (ownerMember) {
      const { data } = await admin.from("employees").select("*").eq("organization_id", orgId).eq("auth_user_id", ownerMember.user_id).maybeSingle();
      owner = data;
    }
    if (!owner) {
      const { data } = await admin.from("employees").select("*").eq("organization_id", orgId).eq("status", "active").not("auth_user_id", "is", null).order("created_at").limit(1).maybeSingle();
      owner = data;
    }

    let createdAuthUserId = "";
    if (!owner) {
      if (temporaryPassword.length < 8) return json({ error: "Esta empresa ainda não tem administrador. Informe uma nova senha para criar o acesso." }, 400);
      const { data: created, error: authError } = await admin.auth.admin.createUser({
        email: loginEmail(companyCode, username), password: temporaryPassword, email_confirm: true,
        app_metadata: { organization_id: orgId, company_code: companyCode, role: "company_owner" },
        user_metadata: { full_name: ownerName, contact_email: contactEmail },
      });
      if (authError || !created.user) return json({ error: "Não foi possível criar o administrador da empresa." }, 409);
      createdAuthUserId = created.user.id;
      let { data: department } = await admin.from("departments").select("id").eq("organization_id", orgId).eq("active", true).limit(1).maybeSingle();
      if (!department) ({ data: department } = await admin.from("departments").insert({ organization_id: orgId, name: "Administrativo" }).select("id").single());
      let { data: schedule } = await admin.from("work_schedules").select("id").eq("organization_id", orgId).eq("active", true).limit(1).maybeSingle();
      if (!schedule) ({ data: schedule } = await admin.from("work_schedules").insert({ organization_id: orgId, name: "Flexível 44h", schedule_type: "flexible", weekly_minutes: 2640, daily_minutes: 480, start_time: null, end_time: null }).select("id").single());
      const { data: createdOwner, error: employeeError } = await admin.from("employees").insert({
        organization_id: orgId, auth_user_id: created.user.id, department_id: department?.id ?? null, schedule_id: schedule?.id ?? null,
        username, employee_code: "ADM001", full_name: ownerName, email: contactEmail, job_title: "Administrador da empresa", status: "active", must_change_password: false,
      }).select("*").single();
      if (employeeError || !createdOwner) {
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: employeeError?.message ?? "Não foi possível criar o perfil do administrador." }, 409);
      }
      owner = createdOwner;
    }

    const { data: duplicateUsername } = await admin.from("employees").select("id").eq("organization_id", orgId).eq("username", username).neq("id", owner.id).maybeSingle();
    if (duplicateUsername) {
      if (createdAuthUserId) await admin.auth.admin.deleteUser(createdAuthUserId);
      return json({ error: "Este usuário já está em uso na empresa." }, 409);
    }
    const { error: memberError } = await admin.from("organization_members").upsert({ organization_id: orgId, user_id: owner.auth_user_id, department_id: owner.department_id ?? null, role: "company_owner", active: true }, { onConflict: "organization_id,user_id" });
    if (memberError) return json({ error: "Não foi possível vincular o administrador à empresa." }, 409);

    if (organization.company_code !== companyCode) {
      const { data: companyEmployees } = await admin.from("employees").select("id,auth_user_id,username").eq("organization_id", orgId).not("auth_user_id", "is", null);
      for (const employee of companyEmployees ?? []) {
        const finalUsername = employee.id === owner.id ? username : employee.username;
        const metadata: Record<string, unknown> = { organization_id: orgId, company_code: companyCode };
        if (employee.id === owner.id) metadata.role = "company_owner";
        const { error } = await admin.auth.admin.updateUserById(employee.auth_user_id, { email: loginEmail(companyCode, finalUsername), app_metadata: metadata });
        if (error) return json({ error: `Não foi possível atualizar o acesso ${finalUsername}.` }, 409);
      }
      const { data: companyTerminals } = await admin.from("terminals").select("auth_user_id,code").eq("organization_id", orgId).not("auth_user_id", "is", null);
      for (const terminal of companyTerminals ?? []) {
        const { error } = await admin.auth.admin.updateUserById(terminal.auth_user_id, { email: loginEmail(companyCode, terminal.code), app_metadata: { organization_id: orgId, company_code: companyCode, role: "terminal" } });
        if (error) return json({ error: `Não foi possível atualizar o aparelho ${terminal.code}.` }, 409);
      }
    }

    const authChanges: Record<string, unknown> = {
      email: loginEmail(companyCode, username),
      app_metadata: { organization_id: orgId, company_code: companyCode, role: "company_owner" },
      user_metadata: { full_name: ownerName, contact_email: contactEmail },
    };
    if (temporaryPassword) authChanges.password = temporaryPassword;
    const { error: authError } = await admin.auth.admin.updateUserById(owner.auth_user_id, authChanges);
    if (authError) return json({ error: "Não foi possível atualizar o acesso do administrador." }, 409);

    const now = new Date().toISOString();
    const { error: orgError } = await admin.from("organizations").update({
      company_code: companyCode, trade_name: String(body.trade_name ?? "").trim(), legal_name: String(body.legal_name ?? "").trim(),
      tax_id: String(body.tax_id ?? "").trim() || null, timezone: String(body.timezone ?? "America/Rio_Branco").trim(), updated_at: now,
    }).eq("id", orgId);
    if (orgError) return json({ error: orgError.message }, 400);
    const { error: employeeError } = await admin.from("employees").update({
      username, full_name: ownerName, email: contactEmail, must_change_password: false,
      last_password_change_at: temporaryPassword ? now : owner.last_password_change_at, updated_at: now,
    }).eq("id", owner.id);
    if (employeeError) return json({ error: employeeError.message }, 400);

    await admin.from("audit_logs").insert({ organization_id: orgId, actor_user_id: userData.user.id, action: createdAuthUserId ? "company_owner_repaired" : "company_access_updated", entity_type: "organization", entity_id: orgId, after_data: { company_code: companyCode, owner_username: username, password_reset: Boolean(temporaryPassword) } });
    return json({ success: true, company_code: companyCode, owner_username: username, owner_created: Boolean(createdAuthUserId), password_reset: Boolean(temporaryPassword) });
  } catch (error) {
    console.error("manage-company failure", error);
    return json({ error: "Não foi possível atualizar a empresa." }, 500);
  }
});
