import assert from "node:assert/strict";
import test from "node:test";
import { signLink, verifyLink, canManageLinks, validateRegistration } from "../supabase/functions/team-access/domain.ts";
const org="00000000-0000-4000-8000-000000000001",other="00000000-0000-4000-8000-000000000002",version="00000000-0000-4000-8000-000000000003",secret="test-only-signing-key";
test("links reject tampered company, scope, version and signing key",async()=>{
 const token=await signLink(secret,org,"join",version);
 assert.deepEqual(await verifyLink(secret,token),{organizationId:org,scope:"join",version});
 for(const value of [token.replace(org,other),token.replace("join","totem"),token.replace(version,other),token.slice(0,-1),"",token+".extra"])assert.equal(await verifyLink(secret,value),null);
 assert.equal(await verifyLink("other-key",token),null);
 assert.equal(await verifyLink(secret,await signLink(secret,org,"admin",version)),null);
});
test("only owners and HR admins manage invitations for their own company",()=>{
 for(const role of ["employee","terminal","manager","hr_agent"])assert.equal(canManageLinks([{organization_id:org,role}],org),false);
 for(const role of ["company_owner","hr_admin"]){assert.equal(canManageLinks([{organization_id:org,role}],org),true);assert.equal(canManageLinks([{organization_id:other,role}],org),false)}
 assert.equal(canManageLinks([{organization_id:other,role:"platform_admin"}],org),true);assert.equal(canManageLinks([],org),false);
});
test("short registration validates identity, device and password",()=>{
 const body={full_name:"Pessoa de Teste",username:"pessoa.teste",phone:"68999990000",password:"example-password",device_uuid:version};assert.equal(validateRegistration(body),null);
 for(const [key,value]of [["full_name",""],["username","bad@example.com"],["username","a"],["phone","123"],["password","1234567"],["device_uuid","invalid"]])assert.ok(validateRegistration({...body,[key]:value}));
});
