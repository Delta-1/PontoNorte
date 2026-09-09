import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { hashPin } from "../_shared/pin.ts";

type CreateUserBody = {
  organization_id: string;
  department_id?: string | null;
  schedule_id?: string | null;
  role: "company_owner" | "hr_admin" | "hr_agent" | "manager" | "employee";
  username: string;
  password: string;
  employee_code: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  job_title?: string | null;
  hired_at?: string | null;
  cpf?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  pin: string;
};

const allowedCreators = ["platform_admin", "company_owner", "hr_admin", "hr_agent"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Sessão obrigatória." }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const publishableKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const caller = createClient(url, publishableKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    const { data: userData, error: userError } = await caller.auth.getUser();
    if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);

    const body = (await req.json()) as CreateUserBody;
    const username = body.username?.toLowerCase().trim().replace(/[^a-z0-9._-]/g, "");
    if (!body.organization_id || !username || username.length < 3) {
      return json({ error: "Organização e usuário são obrigatórios." }, 400);
    }
    if (!body.password || body.password.length < 8) {
      return json({ error: "A senha provisória deve ter pelo menos 8 caracteres." }, 400);
    }
    const cpf = body.cpf?.replace(/\D/g, "") || null;
    if (cpf && cpf.length !== 11) return json({ error: "Informe um CPF com 11 dígitos." }, 400);
    if (!/^\d{6}$/.test(body.pin ?? "")) return json({ error: "O PIN do terminal deve ter 6 números." }, 400);
    if (body.role === "manager" && !body.department_id) {
      return json({ error: "Um líder precisa estar vinculado a um setor." }, 400);
    }

    const { data: membership } = await admin
      .from("organization_members")
      .select("role, organization_id")
      .eq("user_id", userData.user.id)
      .eq("active", true);
    const creator = membership?.find((m) =>
      m.role === "platform_admin" ||
      (m.organization_id === body.organization_id && allowedCreators.includes(m.role))
    );
    if (!creator) return json({ error: "Você não pode criar usuários nesta empresa." }, 403);
    if (creator.role === "hr_agent" && !["employee", "manager"].includes(body.role)) {
      return json({ error: "O perfil RH operacional não pode criar administradores." }, 403);
    }

    const { data: org, error: orgError } = await admin
      .from("organizations")
      .select("company_code")
      .eq("id", body.organization_id)
      .single();
    if (orgError || !org) return json({ error: "Empresa não encontrada." }, 404);

    const loginEmail = `${username}.${org.company_code}@login.pontonorte.app`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: loginEmail,
      password: body.password,
      email_confirm: true,
      app_metadata: {
        organization_id: body.organization_id,
        role: body.role,
        company_code: org.company_code,
      },
      user_metadata: { full_name: body.full_name },
    });
    if (createError || !created.user) {
      return json({ error: createError?.message ?? "Não foi possível criar o acesso." }, 409);
    }

    const { data: employee, error: employeeError } = await admin.from("employees").insert({
      organization_id: body.organization_id,
      auth_user_id: created.user.id,
      department_id: body.department_id ?? null,
      schedule_id: body.schedule_id ?? null,
      username,
      employee_code: body.employee_code,
      full_name: body.full_name,
      email: body.email ?? null,
      phone: body.phone ?? null,
      job_title: body.job_title ?? null,
      hired_at: body.hired_at ?? null,
      cpf,
      birth_date: body.birth_date ?? null,
      gender: body.gender ?? null,
      must_change_password: true,
    }).select("id").single();

    if (employeeError || !employee) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: employeeError?.message ?? "Falha ao criar funcionário." }, 409);
    }

    const { error: memberError } = await admin.from("organization_members").insert({
      organization_id: body.organization_id,
      user_id: created.user.id,
      department_id: body.department_id ?? null,
      role: body.role,
    });
    if (memberError) {
      await admin.from("employees").delete().eq("id", employee.id);
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: memberError.message }, 409);
    }

    const { error: secretError } = await admin.from("employee_secrets").insert({
      organization_id: body.organization_id,
      employee_id: employee.id,
      pin_hash: await hashPin(body.pin),
    });
    if (secretError) {
      await admin.from("organization_members").delete().eq("user_id", created.user.id);
      await admin.from("employees").delete().eq("id", employee.id);
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: "Não foi possível proteger o PIN do funcionário." }, 409);
    }

    await admin.from("audit_logs").insert({
      organization_id: body.organization_id,
      actor_user_id: userData.user.id,
      action: "user.created",
      entity_type: "employee",
      entity_id: employee.id,
      after_data: { username, role: body.role, department_id: body.department_id ?? null },
    });

    return json({
      employee_id: employee.id,
      username,
      company_code: org.company_code,
      must_change_password: true,
    }, 201);
  } catch {
    return json({ error: "Não foi possível processar a solicitação." }, 500);
  }
});
