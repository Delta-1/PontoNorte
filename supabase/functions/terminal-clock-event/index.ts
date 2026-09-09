import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { verifyPin } from "../_shared/pin.ts";

const sequence = ["entry", "break_start", "break_end", "exit"] as const;
function distanceMeters(aLat:number,aLon:number,bLat:number,bLon:number){const r=(n:number)=>n*Math.PI/180;const x=Math.sin(r(bLat-aLat)/2)**2+Math.cos(r(aLat))*Math.cos(r(bLat))*Math.sin(r(bLon-aLon)/2)**2;return 6371000*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  try {
    const authHeader=req.headers.get("Authorization");if(!authHeader)return json({error:"Sessão obrigatória."},401);
    const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const caller=createClient(url,anon,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false}});const admin=createClient(url,service,{auth:{persistSession:false}});
    const{data:userData}=await caller.auth.getUser();if(!userData.user)return json({error:"Sessão inválida."},401);
    const body=await req.json();if(!body.device_uuid||!body.employee_code||!/^\d{6}$/.test(body.pin??"")||!body.client_event_id)return json({error:"Matrícula, PIN e aparelho são obrigatórios."},400);
    const{data:terminal}=await admin.from("terminals").select("*").eq("auth_user_id",userData.user.id).single();
    if(!terminal?.enabled)return json({error:"Terminal desativado."},403);
    if(terminal.device_uuid&&terminal.device_uuid!==body.device_uuid)return json({error:"Este acesso pertence a outro aparelho."},403);
    if(!terminal.device_uuid)await admin.from("terminals").update({device_uuid:body.device_uuid,last_seen_at:new Date().toISOString()}).eq("id",terminal.id);
    else await admin.from("terminals").update({last_seen_at:new Date().toISOString()}).eq("id",terminal.id);
    if(terminal.latitude!=null&&terminal.longitude!=null&&terminal.radius_meters!=null){if(!Number.isFinite(body.latitude)||!Number.isFinite(body.longitude))return json({error:"A localização deste terminal é obrigatória."},400);if(distanceMeters(Number(body.latitude),Number(body.longitude),Number(terminal.latitude),Number(terminal.longitude))>terminal.radius_meters)return json({error:"Terminal fora da área autorizada."},403)}
    const{data:employee}=await admin.from("employees").select("id,organization_id,status").eq("organization_id",terminal.organization_id).eq("employee_code",String(body.employee_code).trim()).single();
    if(!employee||employee.status!=="active")return json({error:"Matrícula ou PIN incorretos."},403);
    const{data:secret}=await admin.from("employee_secrets").select("*").eq("employee_id",employee.id).single();
    if(!secret||secret.locked_until&&new Date(secret.locked_until)>new Date())return json({error:"Acesso temporariamente bloqueado. Procure o RH."},423);
    if(!await verifyPin(body.pin,secret.pin_hash)){const attempts=(secret.failed_attempts??0)+1;await admin.from("employee_secrets").update({failed_attempts:attempts,locked_until:attempts>=5?new Date(Date.now()+15*60*1000).toISOString():null,updated_at:new Date().toISOString()}).eq("employee_id",employee.id);return json({error:"Matrícula ou PIN incorretos."},403)}
    await admin.from("employee_secrets").update({failed_attempts:0,locked_until:null,updated_at:new Date().toISOString()}).eq("employee_id",employee.id);
    const{data:org}=await admin.from("organizations").select("timezone").eq("id",employee.organization_id).single();const localDate=(v:Date)=>new Intl.DateTimeFormat("en-CA",{timeZone:org?.timezone??"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(v);const today=localDate(new Date());
    const{data:recent}=await admin.from("time_entries").select("event_type,occurred_at").eq("employee_id",employee.id).order("occurred_at",{ascending:false}).limit(12);const existing=(recent??[]).filter(x=>localDate(new Date(x.occurred_at))===today).reverse();if(existing.length>=4)return json({error:"A jornada de hoje já possui todos os registros."},409);const eventType=sequence[existing.length];
    const{data:entry,error}=await admin.from("time_entries").insert({organization_id:employee.organization_id,employee_id:employee.id,event_type:eventType,method:"mobile",latitude:body.latitude??null,longitude:body.longitude??null,accuracy_meters:body.accuracy_meters??null,terminal_id:terminal.id,client_event_id:body.client_event_id,status:"valid",created_by:userData.user.id}).select("id,event_type,occurred_at,status").single();
    if(error){if(error.code==="23505"){const{data:duplicate}=await admin.from("time_entries").select("id,event_type,occurred_at,status").eq("employee_id",employee.id).eq("client_event_id",body.client_event_id).single();return json({entry:duplicate,duplicate:true})}return json({error:error.message},400)}
    await admin.from("audit_logs").insert({organization_id:employee.organization_id,actor_user_id:userData.user.id,action:"time_entry.terminal_created",entity_type:"time_entry",entity_id:entry.id,after_data:{event_type:eventType,terminal_id:terminal.id}});
    return json({entry},201);
  }catch{return json({error:"Não foi possível registrar o ponto."},500)}
});
