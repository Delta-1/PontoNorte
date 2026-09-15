"use client";

export type EmployeeRecordData = {
  employer_address:string;
  beneficiaries:string;
  residence_address:string;
  birth_place:string;
  nationality:string;
  marital_status:string;
  father_name:string;
  mother_name:string;
  identity_number:string;
  identity_issued_at:string;
  identity_issuer:string;
  voter_title:string;
  voter_zone:string;
  voter_section:string;
  professional_council_registration:string;
  ctps_number:string;
  ctps_series:string;
  ctps_issued_at:string;
  ctps_state:string;
  drivers_license_number:string;
  drivers_license_category:string;
  military_document:string;
  military_category:string;
  race_color:string;
  education_level:string;
  disability_details:string;
  residential_phone:string;
  salary_amount:string;
  salary_period:string;
  work_hours_label:string;
  break_hours_label:string;
  fgts_option_at:string;
  fgts_bank_account:string;
  rectification_at:string;
  pis_registered_at:string;
  pis_number:string;
  bank_domicile:string;
  bank_number:string;
  bank_branch:string;
  bank_branch_address:string;
  salary_job_changes:string;
  vacation_accrual_periods:string;
  vacation_taken_periods:string;
  vacation_bonus_periods:string;
  disciplinary_notes:string;
  work_accidents:string;
  termination_type:string;
  union_contributions:string;
  general_notes:string;
};

export type EmployeeRecordExport = {
  organization:any;
  employee:any;
  schedule?:any;
  recordNumber:string;
  esocialRegistration:string;
  data:EmployeeRecordData;
};

const blank:EmployeeRecordData={
  employer_address:"",beneficiaries:"",residence_address:"",birth_place:"",nationality:"BRASIL",marital_status:"",
  father_name:"",mother_name:"",identity_number:"",identity_issued_at:"",identity_issuer:"",voter_title:"",voter_zone:"",
  voter_section:"",professional_council_registration:"",ctps_number:"",ctps_series:"",ctps_issued_at:"",ctps_state:"",
  drivers_license_number:"",drivers_license_category:"",military_document:"",military_category:"",race_color:"",
  education_level:"",disability_details:"Não",residential_phone:"",salary_amount:"",salary_period:"Mês",
  work_hours_label:"",break_hours_label:"",fgts_option_at:"",fgts_bank_account:"",rectification_at:"",
  pis_registered_at:"",pis_number:"",bank_domicile:"",bank_number:"",bank_branch:"",bank_branch_address:"",
  salary_job_changes:"",vacation_accrual_periods:"",vacation_taken_periods:"",vacation_bonus_periods:"",
  disciplinary_notes:"",work_accidents:"",termination_type:"",union_contributions:"",general_notes:""
};

function timeRange(start?:string,end?:string){
  if(!start&&!end)return"";
  return "das "+(start||"--:--").slice(0,5)+" às "+(end||"--:--").slice(0,5);
}

export function employeeRecordDefaults(employee:any,organization:any,schedule?:any):EmployeeRecordData{
  return{
    ...blank,
    nationality:"BRASIL",
    residential_phone:employee?.phone||"",
    work_hours_label:timeRange(schedule?.start_time,schedule?.end_time),
    break_hours_label:timeRange(schedule?.break_start,schedule?.break_end),
    fgts_option_at:employee?.hired_at||"",
    termination_type:employee?.termination_reason||"",
  };
}

export const employeeRecordSections=[
  {
    title:"Identificação e residência",
    fields:[
      ["employer_address","Endereço do empregador","text"],
      ["beneficiaries","Beneficiários","textarea"],
      ["residence_address","Residência do empregado","textarea"],
      ["birth_place","Local de nascimento","text"],
      ["nationality","País da nacionalidade","text"],
      ["marital_status","Estado civil","text"],
      ["father_name","Nome do pai","text"],
      ["mother_name","Nome da mãe","text"],
    ]
  },
  {
    title:"Documentos",
    fields:[
      ["identity_number","Cédula de identidade / RG","text"],
      ["identity_issued_at","Data de emissão do RG","date"],
      ["identity_issuer","Órgão/UF emissor","text"],
      ["voter_title","Título eleitoral","text"],
      ["voter_zone","Zona","text"],
      ["voter_section","Seção","text"],
      ["professional_council_registration","Inscrição em órgão de classe","text"],
      ["ctps_number","CTPS","text"],
      ["ctps_series","Série da CTPS","text"],
      ["ctps_issued_at","Data de expedição da CTPS","date"],
      ["ctps_state","UF da CTPS","text"],
      ["drivers_license_number","CNH","text"],
      ["drivers_license_category","Categoria da CNH","text"],
      ["military_document","Documento militar","text"],
      ["military_category","Categoria militar","text"],
      ["pis_number","Número do PIS","text"],
    ]
  },
  {
    title:"Dados pessoais e trabalho",
    fields:[
      ["race_color","Cor / raça","text"],
      ["education_level","Grau de instrução","text"],
      ["disability_details","Deficiência","text"],
      ["residential_phone","Telefone residencial","text"],
      ["salary_amount","Salário","number"],
      ["salary_period","Pagamento por","text"],
      ["work_hours_label","Horário de trabalho","text"],
      ["break_hours_label","Horário de intervalo","text"],
      ["fgts_option_at","Opção do FGTS em","date"],
      ["fgts_bank_account","Conta vinculada no banco","text"],
      ["rectification_at","Data da retificação","date"],
    ]
  },
  {
    title:"PIS e domicílio bancário",
    fields:[
      ["pis_registered_at","PIS cadastrado em","date"],
      ["bank_domicile","Domicílio bancário","text"],
      ["bank_number","Número do banco","text"],
      ["bank_branch","Agência / código","text"],
      ["bank_branch_address","Endereço da agência","text"],
    ]
  },
  {
    title:"Históricos e observações",
    fields:[
      ["salary_job_changes","Alterações de salário, cargo e/ou função","textarea"],
      ["vacation_accrual_periods","Férias - períodos aquisitivos","textarea"],
      ["vacation_taken_periods","Férias - períodos de gozo","textarea"],
      ["vacation_bonus_periods","Férias - abono pecuniário","textarea"],
      ["disciplinary_notes","Advertências, suspensões e transferências","textarea"],
      ["work_accidents","Acidentes e doenças profissionais","textarea"],
      ["termination_type","Tipo do desligamento","textarea"],
      ["union_contributions","Contribuição sindical","textarea"],
      ["general_notes","Observações gerais","textarea"],
    ]
  }
] as const;

function dateBR(value?:string){
  if(!value)return"";
  const raw=value.slice(0,10).split("-");
  return raw.length===3?raw.reverse().join("/"):value;
}
function moneyBR(value?:string){
  const number=Number(String(value||"").replace(",","."));
  return Number.isFinite(number)&&number>0?number.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}):"";
}
function safe(value:any){return String(value??"").trim()}
function fileName(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9]+/g,"-").replace(/^-|-$/g,"").toLowerCase()||"funcionario"}

export async function downloadEmployeeRecordPdf(input:EmployeeRecordExport){
  const {jsPDF}=await import("jspdf");
  const {organization,employee,schedule,recordNumber,esocialRegistration,data}=input;
  const doc=new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});
  doc.setDrawColor(16,23,30);doc.setTextColor(15,22,28);doc.setLineWidth(.28);
  const margin=3,width=204;
  const label=(text:string,x:number,y:number)=>{doc.setFont("helvetica","normal");doc.setFontSize(5.4);doc.text(text,x,y)};
  const value=(text:any,x:number,y:number,maxWidth:number,fontSize=8.4,align:"left"|"center"|"right"="left")=>{
    doc.setFont("helvetica","normal");doc.setFontSize(fontSize);
    const clean=safe(text)||" ";
    const lines=doc.splitTextToSize(clean,Math.max(4,maxWidth));
    doc.text(lines.slice(0,2),x,y,{align});
  };
  const box=(x:number,y:number,w:number,h:number,title?:string,text?:any,options?:{center?:boolean;fontSize?:number})=>{
    doc.roundedRect(x,y,w,h,1.4,1.4);
    if(title)label(title,x+1.7,y+3.3);
    if(text!==undefined)value(text,options?.center?x+w/2:x+1.8,y+7.1,w-3.6,options?.fontSize||8.3,options?.center?"center":"left");
  };
  const gridField=(x:number,y:number,w:number,h:number,title:string,text:any)=>{
    doc.rect(x,y,w,h);label(title,x+1.2,y+2.7);value(text,x+1.4,y+6,w-2.8,7.3);
  };
  const section=(x:number,y:number,w:number,h:number,title:string,text?:string)=>{
    doc.roundedRect(x,y,w,h,1.4,1.4);doc.line(x,y+4.2,x+w,y+4.2);
    doc.setFont("helvetica","normal");doc.setFontSize(5.7);doc.text(title,x+w/2,y+3,{align:"center"});
    if(text){doc.setFontSize(6.8);const lines=doc.splitTextToSize(text,w-5);doc.text(lines.slice(0,Math.max(1,Math.floor((h-6)/3.1))),x+2.5,y+7.4)}
  };

  doc.roundedRect(margin,2,width,7.2,1.6,1.6);
  doc.setFont("helvetica","bold");doc.setFontSize(10.8);doc.text("REGISTRO DE EMPREGADO",105,6.9,{align:"center"});

  box(3,10,51,27.5,"Autenticar","Foto / autenticação",{center:true,fontSize:6.5});
  box(55,10,134,8.5,"Matrícula eSocial",esocialRegistration);
  box(190,10,17,8.5,"Nº",recordNumber,{center:true});
  gridField(55,19,114,9,"Empregador",organization?.legal_name||organization?.trade_name);
  gridField(169,19,38,9,"CNPJ",organization?.tax_id);
  gridField(55,28,152,9.5,"Endereço",data.employer_address);

  box(3,38.5,102,19,"Empregado",employee?.full_name);
  label("Residência",4.7,47);value(data.residence_address,4.8,51,97,7.6);
  box(106,38.5,101,19,"Beneficiários",data.beneficiaries);

  box(3,58.5,31,53,"Foto","",{center:true});
  gridField(35,58.5,34,8,"Data de nascimento",dateBR(employee?.birth_date));
  gridField(69,58.5,74,8,"Local do nascimento",data.birth_place);
  gridField(143,58.5,36,8,"País da nacionalidade",data.nationality);
  gridField(179,58.5,28,8,"Estado civil",data.marital_status);
  gridField(35,66.5,27,11,"FILIAÇÃO","");
  gridField(62,66.5,145,5.5,"Pai",data.father_name);
  gridField(62,72,145,5.5,"Mãe",data.mother_name);
  gridField(35,77.5,34,8,"Cédula de Identidade",data.identity_number);
  gridField(69,77.5,23,8,"Data de emissão",dateBR(data.identity_issued_at));
  gridField(92,77.5,28,8,"Órgão/UF emissor",data.identity_issuer);
  gridField(120,77.5,37,8,"Título Eleitoral",data.voter_title);
  gridField(157,77.5,15,8,"Zona",data.voter_zone);
  gridField(172,77.5,15,8,"Seção",data.voter_section);
  gridField(187,77.5,20,8,"Órgão de Classe",data.professional_council_registration);
  gridField(35,85.5,19,8,"CTPS",data.ctps_number);
  gridField(54,85.5,18,8,"Série",data.ctps_series);
  gridField(72,85.5,31,8,"Expedição CTPS",dateBR(data.ctps_issued_at));
  gridField(103,85.5,15,8,"UF CTPS",data.ctps_state);
  gridField(118,85.5,34,8,"CPF",employee?.cpf);
  gridField(152,85.5,38,8,"CNH",data.drivers_license_number);
  gridField(190,85.5,17,8,"Categoria",data.drivers_license_category);
  gridField(35,93.5,28,7,"Doc. militar",data.military_document);
  gridField(63,93.5,22,7,"Categoria",data.military_category);
  gridField(85,93.5,34,7,"Cor",data.race_color);
  gridField(119,93.5,32,7,"Sexo",employee?.gender);
  gridField(151,93.5,56,7,"Grau de instrução",data.education_level);
  gridField(35,100.5,70,6,"Deficiência",data.disability_details);
  gridField(105,100.5,46,6,"Telefone residencial",data.residential_phone);
  gridField(151,100.5,56,6,"Telefone celular",employee?.phone);
  gridField(35,106.5,78,5,"Cargo",employee?.job_title);
  gridField(113,106.5,70,5,"Função",employee?.cbo_title);
  gridField(183,106.5,24,5,"C.B.O.",employee?.cbo_code);

  box(3,112.5,31,10,"Data de Admissão",dateBR(employee?.hired_at));
  box(35,112.5,39,10,"Salário",moneyBR(data.salary_amount));
  box(75,112.5,22,10,"Por",data.salary_period);
  box(98,112.5,57,10,"Horário de Trabalho",data.work_hours_label);
  box(156,112.5,51,10,"Horário de Intervalo",data.break_hours_label);

  box(3,123.5,21,8,"FGTS","",{center:true});
  box(24.5,123.5,34,8,"Opção em",dateBR(data.fgts_option_at));
  box(59,123.5,101,8,"Conta vinculada no banco",data.fgts_bank_account);
  box(160.5,123.5,46.5,8,"Data da Retificação",dateBR(data.rectification_at));

  section(3,132.5,204,17,"PROGRAMA DE INTEGRAÇÃO SOCIAL - PIS");
  gridField(3,136.7,26,6.4,"Cadastrado em",dateBR(data.pis_registered_at));
  gridField(29,136.7,39,6.4,"Sob nº",data.pis_number);
  gridField(68,136.7,139,6.4,"Domicílio bancário",data.bank_domicile);
  gridField(3,143.1,25,6.4,"Nº banco",data.bank_number);
  gridField(28,143.1,34,6.4,"Agência código",data.bank_branch);
  gridField(62,143.1,145,6.4,"End. da agência",data.bank_branch_address);

  section(3,151,204,31,"ALTERAÇÕES DE SALÁRIO, CARGO E/OU FUNÇÃO",data.salary_job_changes);
  section(3,183.5,34,27,"FÉRIAS - PERÍODO AQUISITIVO",data.vacation_accrual_periods);
  section(37.5,183.5,34,27,"FÉRIAS - PERÍODO DE GOZO",data.vacation_taken_periods);
  section(72,183.5,39,27,"FÉRIAS - ABONO PECUNIÁRIO",data.vacation_bonus_periods);
  section(112,183.5,95,27,"OBS.: ADVERTÊNCIAS, SUSPENSÕES, TRANSFERÊNCIAS",data.disciplinary_notes);

  section(3,212,126,28,"ACIDENTES DE TRABALHO, DOENÇAS OU DOENÇAS PROFISSIONAIS",data.work_accidents);
  section(130,212,77,28,"RESCISÃO DE CONTRATO DE TRABALHO",
    "Data da saída: "+dateBR(employee?.terminated_at)+"\nTipo: "+safe(data.termination_type||employee?.termination_reason));

  section(3,241.5,126,35,"CONTRIBUIÇÃO SINDICAL",data.union_contributions);
  doc.line(133,269,204,269);doc.setFontSize(7.2);doc.text(safe(employee?.full_name).toUpperCase(),168.5,273,{align:"center"});
  section(3,278,204,14,"OBSERVAÇÕES",data.general_notes);

  doc.setFontSize(5.5);doc.setTextColor(90);doc.text("Ficha gerada pelo PontoNorte em "+new Date().toLocaleDateString("pt-BR"),207,295,{align:"right"});
  doc.save("ficha-de-empregado-"+fileName(employee?.full_name)+".pdf");
}
