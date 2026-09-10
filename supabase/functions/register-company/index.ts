import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { hashPin } from "../_shared/pin.ts";

const clean = (value: unknown) => String(value ?? "").trim();
async function sha256(value:string){const data=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(data)).map(x=>x.toString(16).padStart(2,"0")).join("")}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"Método não permitido."},405);
  const url=Deno.env.get("SUPABASE_URL")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin=createClient(url,service,{auth:{persistSession:false}});
  try{
    const body=await req.json();
    const legalName=clean(body.legal_name),tradeName=clean(body.trade_name),taxId=clean(body.tax_id).replace(/\D/g,""),ownerName=clean(body.owner_name),username=clean(body.owner_username).toLowerCase().replace(/[^a-z0-9._-]/g,""),email=clean(body.owner_email).toLowerCase(),password=clean(body.owner_password),pin=clean(body.pin);
    if(!legalName||!tradeName||!ownerName||username.length<3||!email.includes("@"))return json({error:"Preencha os dados da empresa e do administrador."},400);
    if(password.length<8)return json({error:"A senha precisa ter pelo menos 8 caracteres."},400);
    if(!/^\d{6}$/.test(pin))return json({error:"Crie um PIN de 6 números para o terminal."},400);
    if(taxId&&![11,14].includes(taxId.length))return json({error:"Informe um CPF ou CNPJ válido."},400);
    const ip=req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown";const ipHash=await sha256(ip);
    const{count}=await admin.from("registration_attempts").select("*",{count:"exact",head:true}).eq("ip_hash",ipHash).gte("created_at",new Date(Date.now()-60*60*1000).toISOString());
    if((count??0)>=3)return json({error:"Muitas tentativas. Aguarde uma hora para cadastrar outra empresa."},429);
    await admin.from("registration_attempts").insert({ip_hash:ipHash});
    if(taxId){const{data:existing}=await admin.from("organizations").select("id").eq("tax_id",taxId).maybeSingle();if(existing)return json({error:"Esta empresa já possui cadastro."},409)}
    const prefix=tradeName.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9]/g,"").toUpperCase().slice(0,4).padEnd(4,"N");let companyCode="";
    for(let i=0;i<8;i++){companyCode=prefix+Array.from(crypto.getRandomValues(new Uint8Array(3))).map(x=>"ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[x%32]).join("");const{data}=await admin.from("organizations").select("id").eq("company_code",companyCode).maybeSingle();if(!data)break}
    const{data:org,error:orgError}=await admin.from("organizations").insert({company_code:companyCode,legal_name:legalName,trade_name:tradeName,tax_id:taxId||null,status:"active",license_status:"pending",plan:"professional",onboarding_completed_at:new Date().toISOString()}).select("id,company_code,trade_name").single();
    if(orgError||!org)return json({error:orgError?.message||"Não foi possível cadastrar a empresa."},409);
    const loginEmail=`${username}.${companyCode}@login.pontonorte.app`;
    const{data:created,error:authError}=await admin.auth.admin.createUser({email:loginEmail,password,email_confirm:true,app_metadata:{organization_id:org.id,role:"company_owner",company_code:companyCode},user_metadata:{full_name:ownerName,contact_email:email}});
    if(authError||!created.user){await admin.from("organizations").delete().eq("id",org.id);return json({error:authError?.message||"Não foi possível criar o administrador."},409)}
    const{data:schedule}=await admin.from("work_schedules").insert({organization_id:org.id,name:"Flexível 44h",schedule_type:"flexible",weekly_minutes:2640,daily_minutes:480,start_time:null,end_time:null}).select("id").single();
    const{data:employee,error:employeeError}=await admin.from("employees").insert({organization_id:org.id,auth_user_id:created.user.id,schedule_id:schedule?.id||null,username,employee_code:"ADM001",full_name:ownerName,email,job_title:"Administrador da empresa",must_change_password:false,status:"active"}).select("id").single();
    if(employeeError||!employee){await admin.auth.admin.deleteUser(created.user.id);await admin.from("organizations").delete().eq("id",org.id);return json({error:employeeError?.message||"Não foi possível criar o perfil."},409)}
    await admin.from("organization_members").insert({organization_id:org.id,user_id:created.user.id,role:"company_owner"});
    await admin.from("employee_secrets").insert({organization_id:org.id,employee_id:employee.id,pin_hash:await hashPin(pin)});
    await admin.from("clock_methods").insert([{organization_id:org.id,method:"mobile",enabled:true,require_location:false},{organization_id:org.id,method:"qr_code",enabled:true,require_location:true},{organization_id:org.id,method:"face",enabled:false,require_liveness:true},{organization_id:org.id,method:"fingerprint",enabled:false}]);
    return json({company_code:companyCode,username,trade_name:tradeName,license_required:true},201);
  }catch(error){console.error("register-company failure",error);return json({error:"Não foi possível concluir o cadastro agora."},500)}
});
