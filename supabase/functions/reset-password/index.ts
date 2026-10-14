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
    const email=String(body.email??"").trim().toLowerCase();
    const password=String(body.new_password??"");
    if(companyCode.length<4||!/^\S+@\S+\.\S+$/.test(email))return json({error:"Confira o código da empresa e o e-mail."},400);
    if(password.length<8)return json({error:"A nova senha precisa ter pelo menos 8 caracteres."},400);

    const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
    const attemptKey=await sha256(`reset:${companyCode}:${email}`);
    const hourAgo=new Date(Date.now()-60*60*1000).toISOString();
    const{count}=await admin.from("registration_attempts").select("id",{count:"exact",head:true}).eq("ip_hash",attemptKey).gte("created_at",hourAgo);
    if((count??0)>=5)return json({error:"Muitas tentativas. Aguarde uma hora e tente novamente."},429);
    await admin.from("registration_attempts").insert({ip_hash:attemptKey});

    const{data:organization}=await admin.from("organizations").select("id").eq("company_code",companyCode).maybeSingle();
    if(!organization)return json({error:"Não foi possível confirmar os dados informados."},400);
    const{data:directMatches}=await admin.from("employees").select("id,auth_user_id,username,email,status").eq("organization_id",organization.id).neq("status","terminated").ilike("email",email);
    let matches=(directMatches??[]).filter((employee)=>employee.auth_user_id);
    if(matches.length===0){
      const{data:candidates}=await admin.from("employees").select("id,auth_user_id,username,email,status").eq("organization_id",organization.id).neq("status","terminated").not("auth_user_id","is",null);
      for(const candidate of candidates??[]){
        const{data:userData}=await admin.auth.admin.getUserById(candidate.auth_user_id);
        if(String(userData.user?.user_metadata?.contact_email??"").trim().toLowerCase()===email)matches.push(candidate);
      }
    }
    if(matches.length!==1)return json({error:matches.length>1?"Este e-mail possui mais de um acesso. Peça ao administrador para atualizar seu cadastro.":"Não foi possível confirmar os dados informados."},400);
    const employee=matches[0];
    const{error:authError}=await admin.auth.admin.updateUserById(employee.auth_user_id,{password});
    if(authError)return json({error:"Não foi possível salvar a nova senha."},409);
    const now=new Date().toISOString();
    await admin.from("employees").update({email,must_change_password:false,last_password_change_at:now,updated_at:now}).eq("id",employee.id);
    await admin.from("audit_logs").insert({organization_id:organization.id,actor_user_id:employee.auth_user_id,action:"password.self_service_reset",entity_type:"employee",entity_id:employee.id});
    return json({success:true,username:employee.username});
  }catch(error){console.error("reset-password failure",error);return json({error:"Não foi possível redefinir a senha agora."},500)}
});
