import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { corsHeaders,json } from "../_shared/cors.ts";

async function sha256(value:string){const data=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(data)).map(x=>x.toString(16).padStart(2,"0")).join("")}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"Método não permitido."},405);
  try{
    const body=await req.json();
    const token=String(body.activation_token??"").replace(/[^a-zA-Z0-9]/g,"");
    const code=String(body.code??"").toUpperCase().replace(/[^A-Z0-9]/g,"");
    if(token.length<40||code.length!==5)return json({error:"Informe o código de ativação com cinco caracteres."},400);
    const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
    const{data:claim}=await admin.from("company_activation_claims").select("*").eq("token_hash",await sha256(token)).is("activated_at",null).maybeSingle();
    if(!claim)return json({error:"Solicitação inválida ou já ativada."},400);
    if(claim.locked_until&&new Date(claim.locked_until)>new Date())return json({error:"Muitas tentativas. Aguarde 15 minutos e tente novamente."},429);
    const{data:license}=await admin.from("license_codes").select("*").eq("organization_id",claim.organization_id).eq("code_hash",await sha256(code)).is("used_at",null).gt("expires_at",new Date().toISOString()).maybeSingle();
    if(!license){const attempts=(claim.failed_attempts??0)+1;await admin.from("company_activation_claims").update({failed_attempts:attempts>=5?0:attempts,locked_until:attempts>=5?new Date(Date.now()+15*60*1000).toISOString():null}).eq("organization_id",claim.organization_id);return json({error:"Código inválido ou expirado. Confira o código enviado pelo PontoNorte."},400)}
    const now=new Date().toISOString();
    const{error:licenseError}=await admin.from("license_codes").update({used_at:now}).eq("id",license.id).is("used_at",null);if(licenseError)return json({error:"Este código já foi utilizado."},409);
    const{data:organization,error:orgError}=await admin.from("organizations").update({license_status:"active",status:"active",paid_until:license.license_until,license_updated_at:now}).eq("id",claim.organization_id).select("company_code,trade_name").single();if(orgError||!organization)return json({error:"Não foi possível ativar a empresa."},500);
    await admin.from("company_activation_claims").update({activated_at:now,failed_attempts:0,locked_until:null}).eq("organization_id",claim.organization_id);
    const{data:member}=await admin.from("organization_members").select("user_id").eq("organization_id",claim.organization_id).eq("role","company_owner").eq("active",true).limit(1).single();
    const{data:owner}=member?await admin.from("employees").select("username").eq("organization_id",claim.organization_id).eq("auth_user_id",member.user_id).single():{data:null};
    return json({success:true,company_code:organization.company_code,trade_name:organization.trade_name,username:owner?.username,credential_until:license.license_until});
  }catch(error){console.error("activate-registration failure",error);return json({error:"Não foi possível validar o credenciamento agora."},500)}
});
