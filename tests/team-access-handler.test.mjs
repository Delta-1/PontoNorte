import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync}from"node:fs";
import ts from "typescript";
import * as domain from "../supabase/functions/team-access/domain.ts";
const orgId="00000000-0000-4000-8000-000000000001",version="00000000-0000-4000-8000-000000000002",service="test-service-only";
const org={id:orgId,settings:{team_join_version:version},company_code:"TEST01",trade_name:"Empresa de Teste",status:"active",license_status:"active",paid_until:"2999-01-01",timezone:"America/Rio_Branco"};
const source=readFileSync(new URL("../supabase/functions/team-access/index.ts",import.meta.url),"utf8").replace(/^import .*;\n/gm,"");
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function setup({role=null,failDevice=false,revoked=false}={}){
 const mutations=[];let handler;
 function query(table){
  const state={table,operation:"select",payload:null,filters:[]},builder={};
  for(const method of ["select","eq","gte","order","limit","maybeSingle","single","is","insert","update","delete"])builder[method]=(...args)=>{if(["insert","update","delete"].includes(method)){state.operation=method;state.payload=args[0]}if(["eq","gte","is"].includes(method))state.filters.push(args);return builder};
  builder.then=(resolve,reject)=>Promise.resolve().then(()=>{
   if(state.operation!=="select"){mutations.push(structuredClone(state));if(failDevice&&table==="authorized_devices"&&state.operation==="insert")return{data:null,error:{code:"23505"}};return{data:table==="employees"?{id:"employee-id"}:null,error:null}}
   if(table==="organizations")return{data:{...org,settings:revoked?{}:org.settings}};
   if(table==="organization_members")return{data:role?[{organization_id:orgId,role}]:[]};
   if(table==="registration_attempts")return{count:0,error:null};return{data:null,error:null};
  }).then(resolve,reject);return builder;
 }
 const admin={from:query,auth:{admin:{createUser:async(payload)=>{mutations.push({operation:"createUser",payload});return{data:{user:{id:"new-user"}},error:null}},deleteUser:async(id)=>{mutations.push({operation:"deleteUser",id});return{error:null}}}}};
 const caller={auth:{getUser:async()=>({data:{user:role?{id:"manager-id"}:null}})}};
 const Deno={env:{get:name=>({SUPABASE_URL:"https://test.invalid",SUPABASE_ANON_KEY:"anon",SUPABASE_SERVICE_ROLE_KEY:service})[name]},serve:fn=>{handler=fn}};
 new Function("Deno","createClient","corsHeaders","json",...Object.keys(domain),compiled)(Deno,(_url,key)=>key===service?admin:caller,{},(body,status=200)=>Response.json(body,{status}),...Object.values(domain));
 return{mutations,request:body=>handler(new Request("https://test.invalid/team-access",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}))};
}
test("administrative actions reject missing login and ordinary employees",async()=>{
 assert.equal((await setup().request({action:"enable",organization_id:orgId})).status,401);
 for(const role of["employee","manager","hr_agent"]){const env=setup({role});assert.equal((await env.request({action:"enable",organization_id:orgId})).status,403);assert.equal(env.mutations.length,0)}
});
test("revoked invitation and wrong scope create no records",async()=>{
 const token=await domain.signLink(service,orgId,"join",version),revoked=setup({revoked:true});
 assert.equal((await revoked.request({action:"info",token})).status,403);assert.equal(revoked.mutations.length,0);
 const wrong=setup();assert.equal((await wrong.request({action:"record",token})).status,403);assert.equal(wrong.mutations.length,0);
});
const body={full_name:"Pessoa de Teste",phone:"68999990000",username:"pessoa",password:"test-password",device_uuid:version};
test("public registration ignores injected company and administrator role",async()=>{
 const env=setup(),token=await domain.signLink(service,orgId,"join",version);
 const response=await env.request({action:"register",token,...body,organization_id:"other-org",role:"platform_admin"});assert.equal(response.status,201,JSON.stringify(await response.clone().json()));
 const auth=env.mutations.find(item=>item.operation==="createUser");assert.equal(auth.payload.app_metadata.role,"employee");assert.equal(auth.payload.app_metadata.organization_id,orgId);
 const member=env.mutations.find(item=>item.table==="organization_members"&&item.operation==="insert");assert.equal(member.payload.role,"employee");assert.equal(member.payload.organization_id,orgId);
 const device=env.mutations.find(item=>item.table==="authorized_devices");assert.equal(device.payload.device_uuid,version);assert.equal(device.payload.approved,true);
 assert.ok(env.mutations.find(item=>item.table==="employee_records").payload.data.self_onboarding.completed_at);
});
test("failed registration rolls back its new employee and identity",async()=>{
 const env=setup({failDevice:true}),token=await domain.signLink(service,orgId,"join",version);
 assert.equal((await env.request({action:"register",token,...body})).status,409);
 assert.ok(env.mutations.some(item=>item.table==="employees"&&item.operation==="delete"));assert.ok(env.mutations.some(item=>item.operation==="deleteUser"&&item.id==="new-user"));
});
