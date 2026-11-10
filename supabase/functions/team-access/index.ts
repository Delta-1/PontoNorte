import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { canManageLinks, clean, digest, signLink, usernameFor, validateRegistration, verifyLink } from "./domain.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const failure = (message: string, status = 400) => json({ error: message }, status);
  try {
    const body = await req.json();
    const action = clean(body.action);
    if (["links", "enable", "revoke"].includes(action)) {
      const caller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } });
      const { data: userData } = await caller.auth.getUser();
      if (!userData.user) return failure("Entre novamente para administrar os links.", 401);
      const { data: memberships, error: membershipError } = await admin.from("organization_members").select("role,organization_id").eq("user_id", userData.user.id).eq("active", true);
      if (membershipError || !canManageLinks(memberships ?? [], body.organization_id)) return failure("Apenas o responsável ou administrador de RH pode administrar os links.", 403);
      const { data: org } = await admin.from("organizations").select("id,settings,company_code,trade_name").eq("id", body.organization_id).single();
      if (!org) return failure("Empresa não encontrada.", 404);
      const settings = { ...org.settings };
      if (action === "revoke" || action === "enable") {
        settings.team_join_version = action === "enable" ? crypto.randomUUID() : null;
        const { error } = await admin.from("organizations").update({ settings }).eq("id", org.id);
        if (error) return failure("Não foi possível alterar o link de cadastro.", 500);
      }
      let { data: terminal } = await admin.from("terminals").select("id,enabled").eq("organization_id", org.id).eq("code", "web-totem").maybeSingle();
      if (action === "enable" && !terminal) {
        const { data: user, error: userError } = await admin.auth.admin.createUser({ email: `web-totem.${org.company_code}@login.pontonorte.app`, password: `${crypto.randomUUID()}-${crypto.randomUUID()}`, email_confirm: true, app_metadata: { organization_id: org.id, role: "terminal", company_code: org.company_code } });
        if (userError || !user.user) return failure("Não foi possível preparar o totem. Confira se o código web-totem já está em uso.", 409);
        const { data: createdTerminal, error: terminalError } = await admin.from("terminals").insert({ organization_id: org.id, auth_user_id: user.user.id, code: "web-totem", name: "Totem no navegador", created_by: userData.user.id }).select("id,enabled").single();
        if (terminalError) { await admin.auth.admin.deleteUser(user.user.id); return failure("Não foi possível preparar o totem.", 500); }
        terminal = createdTerminal;
      }
      if (action !== "links") await admin.from("audit_logs").insert({ organization_id: org.id, actor_user_id: userData.user.id, action: `team_access.${action}`, entity_type: "organization", entity_id: org.id });
      return json({ join_token: settings.team_join_version ? await signLink(service, org.id, "join", settings.team_join_version) : null, totem_token: terminal?.enabled ? await signLink(service, org.id, "totem", terminal.id) : null });
    }
    const claims = await verifyLink(service, clean(body.token));
    if (!claims) return failure("Este link é inválido. Peça um novo link ao responsável.", 403);
    const { data: org } = await admin.from("organizations").select("id,trade_name,company_code,settings,license_status,paid_until,status,timezone").eq("id", claims.organizationId).single();
    const day = (value: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: org?.timezone || "America/Rio_Branco", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
    if (!org || org.status !== "active" || org.license_status !== "active" || org.paid_until && org.paid_until < day(new Date())) return failure("O acesso desta empresa não está disponível. Fale com o responsável.", 403);
    if (claims.scope === "join" && org.settings?.team_join_version !== claims.version) return failure("Este link de cadastro foi desativado. Peça um novo link ao responsável.", 403);
    let terminal: any = null;
    if (claims.scope === "totem") {
      const result = await admin.from("terminals").select("id,enabled,device_uuid,latitude,longitude,radius_meters").eq("id", claims.version).eq("organization_id", org.id).single();
      terminal = result.data;
      if (!terminal?.enabled) return failure("Este totem foi desativado.", 403);
    }
    if (action === "info") return json({ name: org.trade_name, company_code: org.company_code, scope: claims.scope });
    if (action !== "register" && action !== "record") return failure("Ação inválida.");
    if (action === "register" && claims.scope !== "join" || action === "record" && claims.scope !== "totem") return failure("Este link não permite esta ação.", 403);
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const rates = [{ key: await digest(`${org.id}:${action}:${usernameFor(body.username)}:${ip}`), limit: 10 }, { key: await digest(`${org.id}:${action}:all:${ip}`), limit: 60 }];
    for (const rate of rates) {
      const { count, error } = await admin.from("registration_attempts").select("*", { count: "exact", head: true }).eq("ip_hash", rate.key).gte("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString());
      if (error) return failure("Não foi possível validar o acesso. Tente novamente.", 503);
      if ((count ?? 0) >= rate.limit) return failure("Muitas tentativas. Aguarde 15 minutos.", 429);
      const { error: attemptError } = await admin.from("registration_attempts").insert({ ip_hash: rate.key });
      if (attemptError) return failure("Não foi possível validar o acesso.", 503);
    }
    const username = usernameFor(body.username);
    if (action === "register") {
      const validation = validateRegistration(body);
      if (validation) return failure(validation);
      const { data: created, error: authError } = await admin.auth.admin.createUser({ email: `${username}.${org.company_code}@login.pontonorte.app`, password: body.password, email_confirm: true, app_metadata: { organization_id: org.id, role: "employee", company_code: org.company_code }, user_metadata: { full_name: clean(body.full_name) } });
      if (authError || !created.user) return failure("Este usuário já está em uso ou a senha não foi aceita. Escolha outro usuário ou entre com sua conta.", 409);
      const userId = created.user.id;
      const rollback = async () => { await admin.from("employees").delete().eq("auth_user_id", userId); await admin.from("organization_members").delete().eq("user_id", userId); await admin.auth.admin.deleteUser(userId); };
      try {
        const { data: schedule } = await admin.from("work_schedules").select("id").eq("organization_id", org.id).eq("active", true).order("created_at").limit(1).maybeSingle();
        const { data: employee, error } = await admin.from("employees").insert({ organization_id: org.id, auth_user_id: userId, username, employee_code: username, full_name: clean(body.full_name), phone: clean(body.phone), schedule_id: schedule?.id ?? null, must_change_password: false, status: "active" }).select("id").single();
        if (error || !employee) { await rollback(); return failure("Não foi possível concluir o cadastro. Tente outro usuário.", 409); }
        const { error: memberError } = await admin.from("organization_members").insert({ organization_id: org.id, user_id: userId, role: "employee" });
        const { error: recordError } = await admin.from("employee_records").insert({ organization_id: org.id, employee_id: employee.id, created_by: userId, data: { self_onboarding: { completed_at: new Date().toISOString(), source: "company_link", basic_profile: true } } });
        const { error: deviceError } = await admin.from("authorized_devices").insert({ organization_id: org.id, employee_id: employee.id, device_uuid: body.device_uuid, device_name: "Cadastro pelo link da empresa", platform: "web", approved: true, approved_at: new Date().toISOString() });
        if (memberError || recordError || deviceError) { await rollback(); return failure("Não foi possível concluir o cadastro neste aparelho. Nenhuma nova conta foi mantida.", 409); }
        await admin.from("audit_logs").insert({ organization_id: org.id, actor_user_id: userId, action: "employee.self_registered", entity_type: "employee", entity_id: employee.id, after_data: { source: "company_link" } });
        return json({ company_code: org.company_code, username }, 201);
      } catch { await rollback(); return failure("Não foi possível concluir o cadastro.", 500); }
    }
    if (!/^[a-z0-9._-]{3,40}$/.test(username) || !body.password || !/^[a-f0-9-]{36}$/.test(clean(body.client_event_id)) || !/^[a-f0-9-]{36}$/.test(clean(body.device_uuid))) return failure("Informe seu usuário e senha.");
    if (terminal.latitude != null || terminal.longitude != null) return failure("Este terminal exige localização. Use o aplicativo configurado pelo responsável.", 403);
    const caller = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signed, error: loginError } = await caller.auth.signInWithPassword({ email: `${username}.${org.company_code}@login.pontonorte.app`, password: body.password });
    if (loginError || !signed.user) return failure("Usuário ou senha incorretos.", 403);
    const userId = signed.user.id;
    await caller.auth.signOut({ scope: "local" });
    const { data: employee } = await admin.from("employees").select("id,status,must_change_password").eq("auth_user_id", userId).eq("organization_id", org.id).single();
    if (!employee || employee.status !== "active" || employee.must_change_password) return failure("Seu acesso precisa ser regularizado com o responsável.", 403);
    const { data: member } = await admin.from("organization_members").select("id").eq("organization_id", org.id).eq("user_id", userId).eq("active", true).maybeSingle();
    if (!member) return failure("Seu acesso precisa ser regularizado com o responsável.", 403);
    if (!terminal.device_uuid) {
      const { data: bound, error } = await admin.from("terminals").update({ device_uuid: body.device_uuid }).eq("id", terminal.id).is("device_uuid", null).select("device_uuid").maybeSingle();
      if (error || !bound) return failure("Este totem já está em uso. Peça ao responsável para conferir o aparelho.", 409);
      terminal.device_uuid = bound.device_uuid;
    }
    if (terminal.device_uuid !== body.device_uuid) return failure("Este totem está vinculado a outro aparelho. Use o aparelho da empresa.", 403);
    const { data: duplicate } = await admin.from("time_entries").select("id,event_type,occurred_at,status").eq("employee_id", employee.id).eq("client_event_id", body.client_event_id).maybeSingle();
    if (duplicate) return json({ entry: duplicate, duplicate: true });
    const { data: recent, error: readError } = await admin.from("time_entries").select("occurred_at").eq("employee_id", employee.id).order("occurred_at", { ascending: false }).limit(12);
    if (readError) return failure("Não foi possível consultar sua jornada.", 503);
    const countToday = (recent ?? []).filter(entry => day(new Date(entry.occurred_at)) === day(new Date())).length;
    if (countToday >= 4) return failure("Sua jornada de hoje já está completa.", 409);
    const { data: entry, error: entryError } = await admin.from("time_entries").insert({ organization_id: org.id, employee_id: employee.id, terminal_id: terminal.id, created_by: userId, method: "mobile", event_type: ["entry", "break_start", "break_end", "exit"][countToday], client_event_id: body.client_event_id, status: "valid" }).select("id,event_type,occurred_at,status").single();
    if (entryError) {
      if (entryError.code === "23505") {
        const { data: retried } = await admin.from("time_entries").select("id,event_type,occurred_at,status").eq("employee_id", employee.id).eq("client_event_id", body.client_event_id).maybeSingle();
        if (retried) return json({ entry: retried, duplicate: true });
      }
      return failure("Não foi possível registrar. Tente novamente.", 409);
    }
    await admin.from("terminals").update({ last_seen_at: new Date().toISOString() }).eq("id", terminal.id);
    await admin.from("audit_logs").insert({ organization_id: org.id, actor_user_id: userId, action: "time_entry.web_totem_created", entity_type: "time_entry", entity_id: entry.id, after_data: { terminal_id: terminal.id, event_type: entry.event_type } });
    return json({ entry }, 201);
  } catch (error) {
    console.error("team-access failed", error instanceof Error ? error.message : "unknown");
    return failure("Não foi possível concluir agora. Tente novamente.", 500);
  }
});
