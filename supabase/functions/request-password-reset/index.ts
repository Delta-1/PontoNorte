import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { corsHeaders, json } from "../_shared/cors.ts";

const genericMessage = "Se os dados estiverem corretos, o pedido será encaminhado ao administrador do PontoNorte.";
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newProtocol() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `PN-${Array.from(bytes).map((byte) => alphabet[byte % alphabet.length]).join("")}`;
}
const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  try {
    const body = await req.json();
    const companyCode = String(body.company_code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const taxId = digits(body.tax_id);
    const email = String(body.email ?? "").trim().toLowerCase();
    if (companyCode.length < 4 || taxId.length < 11 || !email.includes("@")) {
      return json({ error: "Preencha o código da empresa, CNPJ/CPF e e-mail cadastrados." }, 400);
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const protocol = newProtocol();
    const { data: organization } = await admin.from("organizations").select("id,tax_id").eq("company_code", companyCode).maybeSingle();
    if (!organization || digits(organization.tax_id) !== taxId) return json({ success: true, protocol, message: genericMessage });

    const { data: owners } = await admin.from("organization_members").select("user_id").eq("organization_id", organization.id).eq("role", "company_owner").eq("active", true);
    const ownerIds = (owners ?? []).map((row) => row.user_id);
    if (!ownerIds.length) return json({ success: true, protocol, message: genericMessage });
    const { data: employee } = await admin.from("employees").select("id,email").eq("organization_id", organization.id).in("auth_user_id", ownerIds).ilike("email", email).maybeSingle();
    if (!employee) return json({ success: true, protocol, message: genericMessage });

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin.from("password_reset_requests").select("id", { count: "exact", head: true }).eq("employee_id", employee.id).gte("requested_at", hourAgo);
    if ((count ?? 0) < 3) {
      await admin.from("password_reset_requests").update({ status: "cancelled", resolved_at: new Date().toISOString(), notes: "Substituído por uma nova solicitação." }).eq("employee_id", employee.id).eq("status", "pending");
      const { error } = await admin.from("password_reset_requests").insert({ organization_id: organization.id, employee_id: employee.id, protocol });
      if (error) console.error("password reset insert", error);
    }
    return json({ success: true, protocol, message: genericMessage });
  } catch (error) {
    console.error("request-password-reset failure", error);
    return json({ error: "Não foi possível enviar o pedido agora. Tente novamente." }, 500);
  }
});
