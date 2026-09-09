import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { corsHeaders, json } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Sessão obrigatória." }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { data: userData } = await caller.auth.getUser();
    if (!userData.user) return json({ error: "Sessão inválida." }, 401);
    const body = await req.json();
    const code = String(body.code ?? "").toLowerCase().trim().replace(/[^a-z0-9._-]/g, "");
    if (!body.organization_id || code.length < 3 || !body.name) return json({ error: "Nome e código do terminal são obrigatórios." }, 400);
    if (!body.password || String(body.password).length < 10) return json({ error: "A senha do terminal precisa ter pelo menos 10 caracteres." }, 400);
    const { data: memberships } = await admin.from("organization_members").select("role,organization_id").eq("user_id", userData.user.id).eq("active", true);
    const allowed = memberships?.some((m) => m.role === "platform_admin" || (m.organization_id === body.organization_id && ["company_owner", "hr_admin"].includes(m.role)));
    if (!allowed) return json({ error: "Apenas o administrador pode criar terminais." }, 403);
    const { data: org } = await admin.from("organizations").select("company_code").eq("id", body.organization_id).single();
    if (!org) return json({ error: "Empresa não encontrada." }, 404);
    const email = `${code}.${org.company_code}@login.pontonorte.app`;
    const { data: created, error: authError } = await admin.auth.admin.createUser({
      email, password: body.password, email_confirm: true,
      app_metadata: { organization_id: body.organization_id, role: "terminal", company_code: org.company_code },
    });
    if (authError || !created.user) return json({ error: authError?.message ?? "Não foi possível criar o terminal." }, 409);
    const { error: memberError } = await admin.from("organization_members").insert({ organization_id: body.organization_id, user_id: created.user.id, role: "terminal" });
    const { data: terminal, error: terminalError } = memberError ? { data: null, error: memberError } : await admin.from("terminals").insert({ organization_id: body.organization_id, auth_user_id: created.user.id, code, name: body.name, location_name: body.location_name ?? null, latitude: body.latitude ?? null, longitude: body.longitude ?? null, radius_meters: body.radius_meters ?? null, created_by: userData.user.id }).select("id,code,name").single();
    if (terminalError || !terminal) {
      await admin.from("organization_members").delete().eq("user_id", created.user.id);
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: terminalError?.message ?? "Não foi possível salvar o terminal." }, 409);
    }
    await admin.from("audit_logs").insert({ organization_id: body.organization_id, actor_user_id: userData.user.id, action: "terminal.created", entity_type: "terminal", entity_id: terminal.id, after_data: { code, name: body.name } });
    return json({ terminal, company_code: org.company_code }, 201);
  } catch {
    return json({ error: "Não foi possível criar o terminal." }, 500);
  }
});
