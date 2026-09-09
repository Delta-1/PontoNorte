import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { corsHeaders, json } from "../_shared/cors.ts";

const sequence = ["entry", "break_start", "break_end", "exit"] as const;

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function distanceMeters(aLat: number, aLon: number, bLat: number, bLon: number) {
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const q = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Sessão obrigatória." }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const caller = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { data: userData, error: userError } = await caller.auth.getUser();
    if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);

    const body = await req.json();
    if (!body.client_event_id || !["mobile", "qr_code", "face"].includes(body.method)) {
      return json({ error: "Registro inválido." }, 400);
    }

    const { data: employee } = await admin.from("employees")
      .select("id, organization_id, status, must_change_password")
      .eq("auth_user_id", userData.user.id).single();
    if (!employee || employee.status !== "active") return json({ error: "Funcionário inativo ou não encontrado." }, 403);
    if (employee.must_change_password) return json({ error: "Troque sua senha antes de registrar o ponto." }, 428);

    const { data: method } = await admin.from("clock_methods")
      .select("enabled, require_location, require_liveness, configuration")
      .eq("organization_id", employee.organization_id).eq("method", body.method).single();
    if (!method?.enabled) return json({ error: "Este método não está habilitado pela empresa." }, 403);
    if (body.method === "face" && method.require_liveness && !method.configuration?.provider) {
      return json({ error: "Reconhecimento facial ainda não foi configurado pela empresa." }, 503);
    }

    const { data: org } = await admin.from("organizations").select("settings, timezone")
      .eq("id", employee.organization_id).single();
    let deviceId: string | null = null;
    if (org?.settings?.require_device_authorization) {
      const { data: device } = await admin.from("authorized_devices").select("id, approved, revoked_at")
        .eq("organization_id", employee.organization_id).eq("device_uuid", body.device_uuid).single();
      if (!device?.approved || device.revoked_at) return json({ error: "Este celular ainda não foi autorizado pelo RH." }, 403);
      deviceId = device.id;
      await admin.from("authorized_devices").update({ last_seen_at: new Date().toISOString(), app_version: body.app_version ?? null })
        .eq("id", device.id);
    }

    if (method.require_location && (!Number.isFinite(body.latitude) || !Number.isFinite(body.longitude))) {
      return json({ error: "A localização é obrigatória para este registro." }, 400);
    }

    let qrSessionId: string | null = null;
    if (body.method === "qr_code") {
      if (!body.qr_token) return json({ error: "QR Code inválido." }, 400);
      const hash = await sha256(body.qr_token);
      const { data: qr } = await admin.from("qr_sessions").select("*")
        .eq("organization_id", employee.organization_id).eq("token_hash", hash)
        .gt("expires_at", new Date().toISOString()).single();
      if (!qr) return json({ error: "QR Code inválido ou expirado." }, 400);
      qrSessionId = qr.id;
      if (qr.latitude != null && qr.longitude != null && qr.radius_meters != null) {
        const distance = distanceMeters(Number(body.latitude), Number(body.longitude), Number(qr.latitude), Number(qr.longitude));
        if (distance > qr.radius_meters) return json({ error: "Você está fora da área permitida." }, 403);
      }
    }

    const localDate = (value: Date) => new Intl.DateTimeFormat("en-CA", {
      timeZone: org?.timezone ?? "America/Rio_Branco", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(value);
    const today = localDate(new Date());
    const { data: recent } = await admin.from("time_entries").select("event_type, occurred_at")
      .eq("employee_id", employee.id).order("occurred_at", { ascending: false }).limit(12);
    const existing = (recent ?? []).filter((item) => localDate(new Date(item.occurred_at)) === today).reverse();
    const eventType = sequence[Math.min(existing.length, sequence.length - 1)];
    if (existing.length >= 4) return json({ error: "A jornada de hoje já possui todos os registros." }, 409);

    const { data: entry, error } = await admin.from("time_entries").insert({
      organization_id: employee.organization_id,
      employee_id: employee.id,
      event_type: eventType,
      method: body.method,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      accuracy_meters: body.accuracy_meters ?? null,
      device_id: deviceId,
      client_event_id: body.client_event_id,
      qr_session_id: qrSessionId,
      evidence_path: body.evidence_path ?? null,
      status: body.method === "face" ? "pending_review" : "valid",
      created_by: userData.user.id,
    }).select("id,event_type,occurred_at,status").single();
    if (error) {
      if (error.code === "23505") {
        const { data: duplicate } = await admin.from("time_entries").select("id,event_type,occurred_at,status")
          .eq("employee_id", employee.id).eq("client_event_id", body.client_event_id).single();
        return json({ entry: duplicate, duplicate: true });
      }
      return json({ error: error.message }, 400);
    }

    await admin.from("audit_logs").insert({
      organization_id: employee.organization_id,
      actor_user_id: userData.user.id,
      action: "time_entry.created",
      entity_type: "time_entry",
      entity_id: entry.id,
      after_data: { event_type: entry.event_type, method: body.method, device_id: deviceId },
    });
    return json({ entry }, 201);
  } catch {
    return json({ error: "Não foi possível registrar o ponto." }, 500);
  }
});
