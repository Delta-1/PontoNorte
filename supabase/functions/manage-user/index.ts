import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { hashPin } from "../_shared/pin.ts";

type CreateUserBody = {
  action?: "create" | "update" | "complete_profile" | "set_status" | "rotate_qr" | "delete";
  employee_id?: string;
  status?: "active" | "inactive" | "on_leave" | "terminated";
  termination_reason?: string | null;
  organization_id: string;
  department_id?: string | null;
  schedule_id?: string | null;
  overtime_mode?: "disabled" | "bank" | "pay";
  overtime_policy_id?: string | null;
  role?: "company_owner" | "hr_admin" | "hr_agent" | "manager" | "employee";
  username?: string;
  password?: string;
  employee_code?: string;
  full_name?: string;
  email?: string | null;
  phone?: string | null;
  job_title?: string | null;
  cbo_code?: string | null;
  cbo_title?: string | null;
  hired_at?: string | null;
  cpf?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  pin?: string;
  postal_code?: string;
  street?: string;
  address_number?: string;
  address_complement?: string | null;
  neighborhood?: string;
  city?: string;
  state?: string;
};

const allowedCreators = ["platform_admin", "company_owner", "hr_admin", "hr_agent", "manager"];

function newPersonalQrToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes).map((value) => value.toString(16).padStart(2, "0")).join("");
}

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
    if (!body.organization_id) return json({ error: "Empresa obrigatória." }, 400);
    const { data: membership } = await admin
      .from("organization_members")
      .select("role, organization_id, department_id")
      .eq("user_id", userData.user.id)
      .eq("active", true);
    const creator = membership?.find((m) =>
      m.role === "platform_admin" ||
      (m.organization_id === body.organization_id && allowedCreators.includes(m.role))
    );
    const action = body.action ?? "create";
    if (action !== "create") {
      if (!body.employee_id) return json({ error: "Funcionário obrigatório." }, 400);
      const { data: target } = await admin.from("employees").select("id,auth_user_id,department_id,full_name,username,employee_code,personal_qr_token,overtime_mode,overtime_policy_id").eq("id",body.employee_id).eq("organization_id",body.organization_id).single();
      if (!target) return json({ error: "Funcionário não encontrado." }, 404);
      const isSelfProfileUpdate = action === "update" && target.auth_user_id === userData.user.id;
      if (action === "complete_profile") {
        const employeeMembership = membership?.find((member) => member.organization_id === body.organization_id && member.role === "employee");
        if (target.auth_user_id !== userData.user.id || !employeeMembership) return json({ error: "A ficha inicial só pode ser preenchida pelo próprio funcionário." }, 403);
        const email = body.email?.trim().toLowerCase() || "";
        const phone = body.phone?.replace(/[^0-9+() -]/g, "").trim() || "";
        const postalCode = body.postal_code?.replace(/\D/g, "") || "";
        const street = body.street?.trim() || "";
        const addressNumber = body.address_number?.trim() || "";
        const neighborhood = body.neighborhood?.trim() || "";
        const city = body.city?.trim() || "";
        const state = body.state?.trim().toUpperCase() || "";
        const addressComplement = body.address_complement?.trim() || "";
        if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Informe um e-mail de contato válido." }, 400);
        if (phone.replace(/\D/g, "").length < 10) return json({ error: "Informe um telefone com DDD." }, 400);
        if (postalCode.length !== 8) return json({ error: "Informe um CEP com 8 números." }, 400);
        if (!street || !addressNumber || !neighborhood || !city || !/^[A-Z]{2}$/.test(state)) return json({ error: "Preencha rua, número, bairro, cidade e UF." }, 400);
        const completedAt = new Date().toISOString();
        const { data: currentRecord } = await admin.from("employee_records").select("id,data").eq("employee_id", target.id).eq("template_key", "registro_empregado_br").maybeSingle();
        const residenceAddress = `${street}, ${addressNumber}${addressComplement ? ` - ${addressComplement}` : ""} - ${neighborhood}, ${city}/${state} - CEP ${postalCode.slice(0,5)}-${postalCode.slice(5)}`;
        const recordData = { ...(currentRecord?.data ?? {}), residence_address: residenceAddress, residential_phone: phone, contact_email: email, contact_phone: phone, address: { postal_code: postalCode, street, number: addressNumber, complement: addressComplement, neighborhood, city, state }, self_onboarding: { version: 1, completed_at: completedAt } };
        const { error: employeeUpdateError } = await admin.from("employees").update({ email, phone, updated_at: completedAt }).eq("id", target.id).eq("organization_id", body.organization_id);
        if (employeeUpdateError) return json({ error: employeeUpdateError.message }, 400);
        const recordPayload = { organization_id: body.organization_id, employee_id: target.id, template_key: "registro_empregado_br", template_version: 1, record_number: target.employee_code, data: recordData, updated_by: userData.user.id, updated_at: completedAt };
        const recordResult = currentRecord ? await admin.from("employee_records").update(recordPayload).eq("id", currentRecord.id) : await admin.from("employee_records").insert({ ...recordPayload, created_by: userData.user.id });
        if (recordResult.error) return json({ error: recordResult.error.message }, 400);
        await admin.from("audit_logs").insert({ organization_id: body.organization_id, actor_user_id: userData.user.id, action: "employee.self_onboarding_completed", entity_type: "employee", entity_id: target.id, after_data: { version: 1, fields: ["email", "phone", "address"] } });
        return json({ success: true, completed_at: completedAt });
      }
      if (!creator && !isSelfProfileUpdate) return json({ error: "Você não pode alterar este funcionário." }, 403);
      if (creator?.role === "manager" && target.department_id !== creator.department_id) return json({ error: "O líder só pode administrar seu próprio setor." }, 403);
      if (action === "rotate_qr") {
        if (!creator) return json({ error: "Apenas a gestão pode renovar o QR Code." }, 403);
        const personalQrToken = newPersonalQrToken();
        const { error: qrError } = await admin.from("employees").update({ personal_qr_token: personalQrToken, updated_at: new Date().toISOString() }).eq("id", target.id);
        if (qrError) return json({ error: qrError.message }, 400);
        await admin.from("audit_logs").insert({organization_id:body.organization_id,actor_user_id:userData.user.id,action:"employee.qr_rotated",entity_type:"employee",entity_id:target.id});
        return json({ success: true, personal_qr_token: personalQrToken });
      }
      if (action === "delete") {
        if (!creator || !["platform_admin","company_owner","hr_admin"].includes(creator.role)) return json({ error: "Somente o administrador pode excluir definitivamente." }, 403);
        await admin.from("employees").delete().eq("id",target.id);
        if (target.auth_user_id) await admin.auth.admin.deleteUser(target.auth_user_id);
        await admin.from("audit_logs").insert({organization_id:body.organization_id,actor_user_id:userData.user.id,action:"employee.deleted",entity_type:"employee",entity_id:target.id,before_data:{full_name:target.full_name}});
        return json({ success:true });
      }
      if (action === "update") {
        const cboCode = body.cbo_code?.replace(/\D/g, "") || null;
        if (cboCode && cboCode.length !== 6) return json({ error: "O CBO deve ter seis dígitos." }, 400);
        const cpf = body.cpf?.replace(/\D/g, "") || null;
        if (!isSelfProfileUpdate && cpf && cpf.length !== 11) return json({ error: "Informe um CPF com 11 dígitos." }, 400);
        const updates: Record<string, unknown> = isSelfProfileUpdate ? {
          job_title: body.job_title?.trim() || null,
          cbo_code: cboCode,
          cbo_title: body.cbo_title?.trim() || null,
          phone: body.phone?.trim() || null,
          email: body.email?.trim().toLowerCase() || null,
          updated_at: new Date().toISOString(),
        } : {
          full_name: body.full_name?.trim() || target.full_name,
          employee_code: body.employee_code?.trim(),
          department_id: body.department_id ?? null,
          schedule_id: body.schedule_id ?? null,
          overtime_mode: body.overtime_mode ?? target.overtime_mode ?? "bank",
          overtime_policy_id: body.overtime_policy_id ?? target.overtime_policy_id ?? null,
          cpf,
          birth_date: body.birth_date || null,
          gender: body.gender || null,
          hired_at: body.hired_at || null,
          job_title: body.job_title?.trim() || null,
          cbo_code: cboCode,
          cbo_title: body.cbo_title?.trim() || null,
          phone: body.phone?.trim() || null,
          email: body.email?.trim().toLowerCase() || null,
          updated_at: new Date().toISOString(),
        };
        if (!isSelfProfileUpdate && creator?.role === "manager") {
          updates.department_id = creator.department_id;
        }
        const { data: updated, error: updateError } = await admin.from("employees").update(updates).eq("id", target.id).select("*").single();
        if (updateError) return json({ error: updateError.message }, 400);
        if (!isSelfProfileUpdate && target.auth_user_id) {
          await admin.from("organization_members").update({ department_id: updates.department_id }).eq("user_id", target.auth_user_id).eq("organization_id", body.organization_id);
        }
        if (!isSelfProfileUpdate && body.pin) {
          if (!/^\d{6}$/.test(body.pin)) return json({ error: "O PIN deve ter seis números." }, 400);
          await admin.from("employee_secrets").update({ pin_hash: await hashPin(body.pin), failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() }).eq("employee_id", target.id);
        }
        await admin.from("audit_logs").insert({organization_id:body.organization_id,actor_user_id:userData.user.id,action:isSelfProfileUpdate?"employee.profile_updated":"employee.updated",entity_type:"employee",entity_id:target.id,after_data:{cbo_code:cboCode,job_title:updates.job_title,overtime_mode:updates.overtime_mode,overtime_policy_id:updates.overtime_policy_id}});
        return json({ employee: updated });
      }
      if (!body.status) return json({ error: "Situação obrigatória." }, 400);
      const { error: statusError } = await admin.from("employees").update({status:body.status,terminated_at:body.status==="terminated"?new Date().toISOString():null,termination_reason:body.status==="terminated"?(body.termination_reason?.trim()||"Desligamento registrado pelo responsável"):null,updated_at:new Date().toISOString()}).eq("id",target.id);
      if (statusError) return json({ error: statusError.message }, 400);
      await admin.from("organization_members").update({active:body.status==="active"}).eq("user_id",target.auth_user_id);
      return json({ success:true,status:body.status });
    }

    if (!creator) return json({ error: "Você não pode criar usuários nesta empresa." }, 403);

    const username = body.username?.toLowerCase().trim().replace(/[^a-z0-9._-]/g, "");
    if (!username || username.length < 3 || !body.full_name || !body.employee_code) return json({ error: "Nome, matrícula e usuário são obrigatórios." }, 400);
    if (!body.password || body.password.length < 8) return json({ error: "A senha provisória deve ter pelo menos 8 caracteres." }, 400);
    const cpf = body.cpf?.replace(/\D/g, "") || null;
    if (cpf && cpf.length !== 11) return json({ error: "Informe um CPF com 11 dígitos." }, 400);
    if (!/^\d{6}$/.test(body.pin ?? "")) return json({ error: "O PIN do terminal deve ter 6 números." }, 400);
    if (!body.role) return json({ error: "Perfil obrigatório." }, 400);
    const cboCode = body.cbo_code?.replace(/\D/g, "") || null;
    if (cboCode && cboCode.length !== 6) return json({ error: "O CBO deve ter seis dígitos." }, 400);
    if (body.role === "manager" && !body.department_id) return json({ error: "Um líder precisa estar vinculado a um setor." }, 400);
    if (creator.role === "manager" && (body.role !== "employee" || body.department_id !== creator.department_id)) return json({ error: "O líder só pode cadastrar funcionários no próprio setor." }, 403);
    if (creator.role === "hr_agent" && !["employee", "manager"].includes(body.role)) {
      return json({ error: "O perfil RH operacional não pode criar administradores." }, 403);
    }

    const { data: org, error: orgError } = await admin
      .from("organizations")
      .select("company_code,license_status,paid_until")
      .eq("id", body.organization_id)
      .single();
    if (orgError || !org) return json({ error: "Empresa não encontrada." }, 404);
    if (creator.role !== "platform_admin" && (org.license_status !== "active" || (org.paid_until && org.paid_until < new Date().toISOString().slice(0,10)))) {
      return json({ error: "A licença da empresa está pendente ou vencida." }, 402);
    }

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
      overtime_mode: body.overtime_mode ?? "bank",
      overtime_policy_id: body.overtime_policy_id ?? null,
      username,
      employee_code: body.employee_code,
      full_name: body.full_name,
      email: body.email ?? null,
      phone: body.phone ?? null,
      job_title: body.job_title ?? null,
      cbo_code: cboCode,
      cbo_title: body.cbo_title?.trim() || null,
      hired_at: body.hired_at ?? null,
      cpf,
      birth_date: body.birth_date ?? null,
      gender: body.gender ?? null,
      must_change_password: true,
    }).select("id,personal_qr_token").single();

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
  } catch (error) {
    console.error("manage-user failure", error);
    return json({ error: "Não foi possível processar a solicitação." }, 500);
  }
});
