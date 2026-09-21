"use client";

import { type FormEvent, useState } from "react";
import { Check, MapPin, RadioTower, RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { functionErrorMessage } from "@/lib/function-error";
import { supabase } from "@/lib/supabase";

type Props={employee:any;organization:any;onDone:()=>void};
const initial=(employee:any)=>({email:employee.email??"",phone:employee.phone??"",postal_code:"",street:"",address_number:"",address_complement:"",neighborhood:"",city:"",state:""});

export function EmployeeOnboarding({employee,organization,onDone}:Props){
  const[form,setForm]=useState(()=>initial(employee));const[confirmed,setConfirmed]=useState(false);const[busy,setBusy]=useState(false);const[error,setError]=useState("");
  async function submit(event:FormEvent){event.preventDefault();if(!confirmed)return setError("Confirme que os dados estão corretos para continuar.");setBusy(true);setError("");const{error:requestError}=await supabase.functions.invoke("manage-user",{body:{...form,action:"complete_profile",organization_id:organization.id,employee_id:employee.id}});setBusy(false);if(requestError)return setError(await functionErrorMessage(requestError,"Não foi possível concluir seu cadastro."));onDone()}
  return <main className="employee-onboarding-stage"><section className="employee-onboarding-card">
    <header className="employee-onboarding-brand"><span><RadioTower/></span><b>Ponto<em>Norte</em></b></header>
    <div className="employee-onboarding-copy"><small>PRIMEIRO ACESSO · ETAPA 2 DE 2</small><div className="employee-onboarding-progress"><span/></div><span className="employee-onboarding-icon"><UserRound/></span><h1>Complete seus dados</h1><p>Olá, {employee.full_name.split(" ")[0]}. Confirme seu contato e endereço para o RH manter sua ficha atualizada.</p></div>
    <form className="employee-onboarding-form" onSubmit={submit}>
      <section><h2><span>1</span>Contato</h2><label>E-mail para contato<Input required type="email" autoComplete="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value.toLowerCase()})} placeholder="voce@email.com"/></label><label>Celular com DDD<Input required type="tel" autoComplete="tel" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="(00) 00000-0000"/></label></section>
      <section><h2><span>2</span>Endereço</h2><label>CEP<Input required inputMode="numeric" maxLength={8} autoComplete="postal-code" value={form.postal_code} onChange={e=>setForm({...form,postal_code:e.target.value.replace(/\D/g,"").slice(0,8)})} placeholder="00000000"/></label><label>Rua / avenida<Input required autoComplete="address-line1" value={form.street} onChange={e=>setForm({...form,street:e.target.value})}/></label><div className="employee-onboarding-two-fields"><label>Número<Input required value={form.address_number} onChange={e=>setForm({...form,address_number:e.target.value})}/></label><label>Complemento<Input autoComplete="address-line2" value={form.address_complement} onChange={e=>setForm({...form,address_complement:e.target.value})} placeholder="Opcional"/></label></div><label>Bairro<Input required value={form.neighborhood} onChange={e=>setForm({...form,neighborhood:e.target.value})}/></label><div className="employee-onboarding-two-fields city-state"><label>Cidade<Input required autoComplete="address-level2" value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/></label><label>UF<Input required maxLength={2} autoComplete="address-level1" value={form.state} onChange={e=>setForm({...form,state:e.target.value.toUpperCase().replace(/[^A-Z]/g,"").slice(0,2)})} placeholder="PR"/></label></div></section>
      <label className="employee-onboarding-confirm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span><Check/><b>Revisei meus dados</b><small>O RH poderá consultar estas informações na minha ficha.</small></span></label>{error?<div className="form-error">{error}</div>:null}<Button disabled={busy||!confirmed}>{busy?<><RefreshCw className="spin"/>Salvando…</>:<><MapPin/>Concluir meu cadastro</>}</Button><p className="employee-onboarding-security"><ShieldCheck/>Seus dados ficam protegidos e separados por empresa.</p>
    </form>
  </section></main>
}
