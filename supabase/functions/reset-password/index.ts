import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { corsHeaders, json } from "../_shared/cors.ts";

async function sha256(value:string){const data=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(data)).map(x=>x.toString(16).padStart(2,"0")).join("")}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"Método não permitido."},405);
  try{
    const body=await req.json();
    const companyCode=String(body.company_code??"").toUpperCase().replace(/[^A-Z0-9]/g,"");
    const username=String(body.username??"").toLowerCase().replace(/[^a-z0-9._-]/g,"");
    const email=String(body.email??"").trim().toLowerCase();
    const password=String(body.new_password??"");
    if(companyCode.length<4||username.length<3||!/^\S+@\S+\.\S+$/.test(email))return json({error:"Confira o código da empresa, usuário e e-mail."},400);
    if(password.length<8)return json({error:"A nova senha precisa ter pelo menos 8 caracteres."},400);

    const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
    const attemptKey=await sha256(`reset:${companyCode}:${username}:${email}`);
    const hourAgo=new Date(Date.now()-60*60*1000).toISOString();
    const{count}=await admin.from("registration_attempts").select("id",{count:"exact",head:true}).eq("ip_hash",attemptKey).gte("created_at",hourAgo);
    if((count??0)>=5)return json({error:"Muitas tentativas de redefinição. Aguarde uma hora e tente novamente."},429);
    await admin.from("registration_attempts").insert({ip_hash:attemptKey});

    const{data:organization}=await admin.from("organizations").select("id").eq("company_code",companyCode).maybeSingle();
    if(!organization)return json({error:"Não foi possível confirmar os dados informados."},400);
    const{data:employee}=await admin.from("employees").select("id,auth_user_id,email,status").eq("organization_id",organization.id).eq("username",username).ilike("email",email).maybeSingle();
    if(!employee?.auth_user_id||employee.status==="terminated")return json({error:"Não foi possível confirmar os dados informados."},400);

    const{error:authError}=await admin.auth.admin.updateUserById(employee.auth_user_id,{password});
    if(authError)return json({error:"Não foi possível salvar a nova senha."},409);
    const now=new Date().toISOString();
    await admin.from("employees").update({must_change_password:false,last_password_change_at:now,updated_at:now}).eq("id",employee.id);
    await admin.from("audit_logs").insert({organization_id:organization.id,actor_user_id:employee.auth_user_id,action:"password.self_service_reset",entity_type:"employee",entity_id:employee.id});
    return json({success:true});
  }catch(error){console.error("reset-password failure",error);return json({error:"Não foi possível redefinir a senha agora."},500)}
});
