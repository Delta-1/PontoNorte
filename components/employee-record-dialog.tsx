"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileText, Save, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import {
  downloadEmployeeRecordPdf,employeeRecordDefaults,employeeRecordSections,
  type EmployeeRecordData
} from "@/lib/employee-record";

type Props={
  open:boolean;
  onOpenChange:(open:boolean)=>void;
  organization:any;
  employee:any|null;
  schedule?:any;
  canManage:boolean;
};

export function EmployeeRecordDialog({open,onOpenChange,organization,employee,schedule,canManage}:Props){
  const[sectionIndex,setSectionIndex]=useState(0);
  const[recordId,setRecordId]=useState("");
  const[recordNumber,setRecordNumber]=useState("");
  const[esocialRegistration,setEsocialRegistration]=useState("");
  const[data,setData]=useState<EmployeeRecordData>(()=>employeeRecordDefaults(employee,organization,schedule));
  const[loading,setLoading]=useState(false);
  const[saving,setSaving]=useState(false);
  const[message,setMessage]=useState("");
  const current=employeeRecordSections[sectionIndex];

  useEffect(()=>{
    if(!open||!employee?.id)return;
    let active=true;setLoading(true);setMessage("");setSectionIndex(0);
    const defaults=employeeRecordDefaults(employee,organization,schedule);
    void(async()=>{
      const{data:record,error}=await supabase.from("employee_records").select("*").eq("employee_id",employee.id).eq("template_key","registro_empregado_br").maybeSingle();
      if(!active)return;
      if(error){setMessage("Não foi possível carregar a ficha: "+error.message);setData(defaults)}
      else if(record){setRecordId(record.id);setRecordNumber(record.record_number||"");setEsocialRegistration(record.esocial_registration||"");setData({...defaults,...(record.data||{})})}
      else{setRecordId("");setRecordNumber(employee.employee_code||"");setEsocialRegistration("");setData(defaults)}
      setLoading(false);
    })();
    return()=>{active=false};
  },[employee?.id,open,organization,schedule]);

  const progress=useMemo(()=>Math.round(((sectionIndex+1)/employeeRecordSections.length)*100),[sectionIndex]);
  function setField(key:keyof EmployeeRecordData,value:string){setData(current=>({...current,[key]:value}))}

  async function persist(){
    if(!employee?.id)return false;
    setSaving(true);setMessage("");
    const{data:{user}}=await supabase.auth.getUser();
    const payload={organization_id:organization.id,employee_id:employee.id,template_key:"registro_empregado_br",template_version:1,record_number:recordNumber,esocial_registration:esocialRegistration,data,updated_by:user?.id,updated_at:new Date().toISOString()};
    const result=recordId
      ?await supabase.from("employee_records").update(payload).eq("id",recordId).select("id").single()
      :await supabase.from("employee_records").insert({...payload,created_by:user?.id}).select("id").single();
    setSaving(false);
    if(result.error){setMessage("Não foi possível salvar: "+result.error.message);return false}
    setRecordId(result.data.id);setMessage("Ficha salva com sucesso.");return true;
  }

  async function submit(event:FormEvent){event.preventDefault();await persist()}
  async function exportPdf(){
    if(canManage){const saved=await persist();if(!saved)return}
    await downloadEmployeeRecordPdf({organization,employee,schedule,recordNumber,esocialRegistration,data});
  }

  if(!employee)return null;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="employee-record-dialog">
    <DialogHeader>
      <div className="employee-record-title">
        <span><FileText/></span>
        <div><DialogTitle>Ficha de empregado</DialogTitle><DialogDescription>{employee.full_name} · modelo Registro de Empregado</DialogDescription></div>
      </div>
    </DialogHeader>
    <div className="employee-record-security"><ShieldCheck/><p><b>Dados trabalhistas protegidos</b><small>A ficha é vinculada somente a este colaborador e respeita as permissões da empresa.</small></p></div>
    <div className="employee-record-progress"><span style={{width:progress+"%"}}/></div>
    <nav className="employee-record-steps" aria-label="Etapas da ficha">
      {employeeRecordSections.map((section,index)=><button type="button" key={section.title} className={index===sectionIndex?"active":index<sectionIndex?"done":""} onClick={()=>setSectionIndex(index)}><span>{index+1}</span><small>{section.title}</small></button>)}
    </nav>
    {loading?<div className="employee-record-loading">Carregando ficha…</div>:<form className="employee-record-form" onSubmit={submit}>
      <header><div><small>ETAPA {sectionIndex+1} DE {employeeRecordSections.length}</small><h2>{current.title}</h2></div><span>{progress}%</span></header>
      {sectionIndex===0&&<div className="employee-record-fields record-meta-fields">
        <label>Número da ficha<Input disabled={!canManage} value={recordNumber} onChange={event=>setRecordNumber(event.target.value)}/></label>
        <label>Matrícula eSocial<Input disabled={!canManage} value={esocialRegistration} onChange={event=>setEsocialRegistration(event.target.value)}/></label>
        <label>Empregador<Input disabled value={organization.legal_name||organization.trade_name}/></label>
        <label>CNPJ / CPF do empregador<Input disabled value={organization.tax_id||""}/></label>
      </div>}
      <div className="employee-record-fields">
        {current.fields.map(([key,label,type])=><label key={key} className={type==="textarea"?"record-wide":""}>{label}
          {type==="textarea"
            ?<textarea disabled={!canManage} rows={key==="salary_job_changes"||key==="general_notes"?4:3} value={data[key]} onChange={event=>setField(key,event.target.value)}/>
            :<Input disabled={!canManage} type={type} step={type==="number"?"0.01":undefined} value={data[key]} onChange={event=>setField(key,event.target.value)}/>}
        </label>)}
      </div>
      {message&&<div className={message.includes("sucesso")?"employee-record-success":"form-error"}>{message}</div>}
      <footer>
        <Button type="button" variant="outline" disabled={sectionIndex===0} onClick={()=>setSectionIndex(index=>Math.max(0,index-1))}><ChevronLeft/>Anterior</Button>
        <div>{canManage&&<Button type="submit" variant="outline" disabled={saving}><Save/>{saving?"Salvando…":"Salvar ficha"}</Button>}<Button type="button" onClick={exportPdf} disabled={saving}><Download/>Exportar PDF preenchido</Button></div>
        {sectionIndex<employeeRecordSections.length-1&&<Button type="button" onClick={()=>setSectionIndex(index=>Math.min(employeeRecordSections.length-1,index+1))}>Próxima<ChevronRight/></Button>}
      </footer>
    </form>}
    <button type="button" className="employee-record-close" onClick={()=>onOpenChange(false)} aria-label="Fechar ficha"><X/></button>
  </DialogContent></Dialog>
}
