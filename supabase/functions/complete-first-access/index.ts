import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { corsHeaders, json } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  const authHeader=req.headers.get("Authorization");
  if(!authHeader)return json({error:"Sessão obrigatória."},401);
  const url=Deno.env.get("SUPABASE_URL")!;
  const caller=createClient(url,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false}});
  const admin=createClient(url,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
  const{data}=await caller.auth.getUser();
  if(!data.user)return json({error:"Sessão inválida."},401);
  const{data:employee,error}=await admin.from("employees").update({
    must_change_password:false,last_password_change_at:new Date().toISOString(),
  }).eq("auth_user_id",data.user.id).select("id,organization_id").single();
  if(error||!employee)return json({error:"Funcionário não encontrado."},404);
  await admin.from("audit_logs").insert({
    organization_id:employee.organization_id,actor_user_id:data.user.id,
    action:"password.first_change_completed",entity_type:"employee",entity_id:employee.id,
  });
  return json({ok:true});
});
