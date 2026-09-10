"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell, Building2, CalendarCheck, Check, ChevronDown, CircleAlert, ClipboardCheck,
  Clock3, Download, FileSpreadsheet, Fingerprint, LayoutDashboard, LogOut, Menu,
  KeyRound, MoreHorizontal, Pencil, Plus, RadioTower, RefreshCw, Search, Settings, ShieldCheck,
  Smartphone, UserCheck, UserPlus, UsersRound, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { employeeLoginEmail, supabase } from "@/lib/supabase";
import { functionErrorMessage } from "@/lib/function-error";
import QRCode from "qrcode";

type Page = "Hoje"|"Funcionários"|"Dispositivos"|"Terminais"|"Setores e líderes"|"Chamada"|"Jornadas"|"Conferência"|"Ocorrências"|"Relatórios"|"Métodos de ponto"|"Empresas"|"Configurações";
type Context = { member:any; employee:any; organization:any };
const menu:[Page,React.ComponentType<{className?:string}>][] = [
  ["Hoje",LayoutDashboard],["Funcionários",UsersRound],["Dispositivos",Smartphone],["Terminais",RadioTower],["Setores e líderes",UserCheck],
  ["Chamada",ClipboardCheck],["Jornadas",Clock3],["Conferência",CalendarCheck],
  ["Ocorrências",CircleAlert],["Relatórios",FileSpreadsheet],["Métodos de ponto",Fingerprint],
  ["Empresas",Building2],["Configurações",Settings],
];
const labels:Record<string,string> = {
  platform_admin:"Administrador geral PontoNorte",company_owner:"Administrador da empresa",
  hr_admin:"Administrador de RH",hr_agent:"Equipe de RH",manager:"Líder de setor",employee:"Funcionário",
};
const eventLabels:Record<string,string> = {entry:"Entrada",break_start:"Início do intervalo",break_end:"Fim do intervalo",exit:"Saída"};
const methodLabels:Record<string,string> = {mobile:"Botão no aplicativo",qr_code:"QR Code",face:"Reconhecimento facial",fingerprint:"Relógio biométrico"};
const roleCanManage = (role:string) => ["platform_admin","company_owner","hr_admin","hr_agent"].includes(role);
const initials = (name:string="") => name.split(" ").filter(Boolean).slice(0,2).map((n)=>n[0]).join("").toUpperCase();
const dateTime = (value:string) => new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(new Date(value));
const minutes = (value:number=0) => `${value<0?"−":""}${Math.floor(Math.abs(value)/60)}h ${String(Math.abs(value)%60).padStart(2,"0")}min`;
const todayStart = () => { const d=new Date(); d.setHours(0,0,0,0); return d.toISOString(); };
const licenseActive = (organization:any) => organization?.license_status==="active" && (!organization?.paid_until || organization.paid_until>=new Date().toISOString().slice(0,10));
async function sha256(value:string){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("")}

function Brand(){return <div className="brand"><span><RadioTower/></span><b>Ponto<em>Norte</em></b></div>}
function Badge({children,color="green"}:{children:React.ReactNode;color?:string}){return <span className={"badge "+color}>{children}</span>}
function PageHead({title,desc,action}:{title:string;desc:string;action?:React.ReactNode}){return <header className="page-head"><div><h1>{title}</h1><p>{desc}</p></div>{action}</header>}
function ErrorBox({message}:{message:string}){return message?<div className="form-error">{message}</div>:null}

function Login({onLogin}:{onLogin:()=>void}){
  const [signup,setSignup]=useState(false);
  const [forgot,setForgot]=useState(false);
  const [company,setCompany]=useState("CPUSIS");
  const [username,setUsername]=useState("");
  const [password,setPassword]=useState("");
  const [error,setError]=useState(""); const [loading,setLoading]=useState(false);
  async function submit(e:FormEvent){
    e.preventDefault(); setLoading(true); setError("");
    const {error} = await supabase.auth.signInWithPassword({email:employeeLoginEmail(company,username),password});
    setLoading(false);
    if(error) setError("Código da empresa, usuário ou senha incorretos."); else onLogin();
  }
  if(signup)return <CompanySignup onBack={()=>setSignup(false)}/>;
  if(forgot)return <ForgotPassword onBack={()=>setForgot(false)}/>;
  return <main className="auth-stage"><section className="auth-card"><Brand/><div className="auth-copy"><span><ShieldCheck/></span><h1>Acesse o PontoNorte</h1><p>Entre com o código e o usuário da sua empresa.</p></div><form onSubmit={submit}><label>Código da empresa<Input value={company} onChange={e=>setCompany(e.target.value.toUpperCase())} autoCapitalize="characters"/></label><label>Usuário<Input value={username} onChange={e=>setUsername(e.target.value.toLowerCase())} autoCapitalize="none"/></label><label>Senha<Input value={password} onChange={e=>setPassword(e.target.value)} type="password"/></label><button type="button" className="forgot-link" onClick={()=>setForgot(true)}>Esqueci meu usuário ou senha</button><ErrorBox message={error}/><Button disabled={loading}>{loading?<RefreshCw className="spin"/>:"Entrar"}</Button><Button type="button" variant="outline" onClick={()=>setSignup(true)}>Cadastrar minha empresa</Button></form><small>Uma plataforma para todas as empresas</small></section></main>
}

function ForgotPassword({onBack}:{onBack:()=>void}){
  const[form,setForm]=useState({company_code:"",tax_id:"",email:""});const[error,setError]=useState("");const[loading,setLoading]=useState(false);const[result,setResult]=useState<any>(null);
  async function submit(e:FormEvent){e.preventDefault();setLoading(true);setError("");const{data,error}=await supabase.functions.invoke("request-password-reset",{body:form});setLoading(false);if(error)return setError(await functionErrorMessage(error,"Não foi possível enviar o pedido."));setResult(data)}
  if(result)return <main className="auth-stage"><section className="auth-card"><Brand/><div className="auth-copy"><span><Check/></span><h1>Pedido registrado</h1><p>{result.message}</p></div><div className="recovery-protocol"><small>Seu protocolo</small><strong>{result.protocol}</strong></div><p className="muted-text recovery-help">Informe este protocolo ao atendimento PontoNorte. Por segurança, nenhuma senha é enviada por esta tela.</p><Button className="full-button" onClick={onBack}>Voltar ao login</Button></section></main>;
  return <main className="auth-stage"><section className="auth-card"><Brand/><button className="back-link" onClick={onBack}>← Voltar ao login</button><div className="auth-copy recovery-copy"><span><KeyRound/></span><h1>Recuperar acesso</h1><p>Não precisa lembrar o usuário. Confirme os dados cadastrados pela empresa.</p></div><form onSubmit={submit}><label>Código da empresa<Input required minLength={4} maxLength={12} value={form.company_code} onChange={e=>setForm({...form,company_code:e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"")})}/></label><label>CNPJ ou CPF da empresa<Input required inputMode="numeric" value={form.tax_id} onChange={e=>setForm({...form,tax_id:e.target.value})}/></label><label>E-mail do proprietário<Input required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value.toLowerCase()})}/></label><ErrorBox message={error}/><Button disabled={loading}>{loading?"Enviando…":"Solicitar recuperação"}</Button></form></section></main>;
}

function CompanySignup({onBack}:{onBack:()=>void}){
  const[form,setForm]=useState({legal_name:"",trade_name:"",tax_id:"",owner_name:"",owner_username:"admin",owner_email:"",owner_password:"",pin:""});const[error,setError]=useState("");const[loading,setLoading]=useState(false);const[result,setResult]=useState<any>(null);
  async function submit(e:FormEvent){e.preventDefault();setLoading(true);setError("");const{data,error}=await supabase.functions.invoke("register-company",{body:form});setLoading(false);if(error)return setError(await functionErrorMessage(error,"Não foi possível cadastrar sua empresa."));setResult(data)}
  if(result)return <main className="auth-stage"><section className="auth-card signup-success"><Brand/><div className="auth-copy"><span><Check/></span><h1>Empresa cadastrada</h1><p>Guarde este código. Ele identifica sua empresa no site e no aplicativo.</p></div><div className="company-code-result">{result.company_code}</div><p className="muted-text">Usuário inicial: <b>{result.username}</b></p><div className="permission-note"><ShieldCheck/><div><b>Licença pendente</b><p>Entre na conta e informe o código de ativação fornecido pelo PontoNorte.</p></div></div><Button onClick={onBack}>Ir para o login</Button></section></main>;
  return <main className="auth-stage"><section className="auth-card signup-card"><Brand/><button className="back-link" onClick={onBack}>← Voltar ao login</button><div className="auth-copy"><span><Building2/></span><h1>Cadastre sua empresa</h1><p>O código de acesso será criado automaticamente.</p></div><form className="form-grid" onSubmit={submit}><label>Nome fantasia<Input required value={form.trade_name} onChange={e=>setForm({...form,trade_name:e.target.value})}/></label><label>Razão social<Input required value={form.legal_name} onChange={e=>setForm({...form,legal_name:e.target.value})}/></label><label>CNPJ ou CPF<Input required value={form.tax_id} onChange={e=>setForm({...form,tax_id:e.target.value})}/></label><label>Nome do administrador<Input required value={form.owner_name} onChange={e=>setForm({...form,owner_name:e.target.value})}/></label><label>E-mail de contato<Input required type="email" value={form.owner_email} onChange={e=>setForm({...form,owner_email:e.target.value})}/></label><label>Usuário inicial<Input required value={form.owner_username} onChange={e=>setForm({...form,owner_username:e.target.value.toLowerCase()})}/></label><label>Senha<Input required minLength={8} type="password" value={form.owner_password} onChange={e=>setForm({...form,owner_password:e.target.value})}/></label><label>PIN do terminal<Input required pattern="[0-9]{6}" maxLength={6} type="password" value={form.pin} onChange={e=>setForm({...form,pin:e.target.value.replace(/\D/g,"")})}/></label><ErrorBox message={error}/><DialogFooter><Button disabled={loading}>{loading?"Cadastrando…":"Criar empresa"}</Button></DialogFooter></form></section></main>
}

function LicenseActivation({ctx,onDone}:{ctx:Context;onDone:()=>void}){
  const[code,setCode]=useState("");const[error,setError]=useState("");const[loading,setLoading]=useState(false);
  async function activate(e:FormEvent){e.preventDefault();setLoading(true);setError("");const{error}=await supabase.functions.invoke("activate-license",{body:{code}});setLoading(false);if(error)return setError(await functionErrorMessage(error,"Não foi possível ativar a licença."));onDone()}
  return <main className="auth-stage"><section className="auth-card"><Brand/><div className="auth-copy"><span><ShieldCheck/></span><h1>Ative sua licença</h1><p>A licença de {ctx.organization.trade_name} está {ctx.organization.license_status==="suspended"?"suspensa":"pendente"}. Solicite ao atendimento um novo código.</p></div><form onSubmit={activate}><label>Código de ativação<Input required maxLength={5} value={code} onChange={e=>setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""))} className="license-input"/></label><ErrorBox message={error}/><Button disabled={loading||code.length!==5}>{loading?"Validando…":"Ativar licença"}</Button><Button type="button" variant="outline" onClick={()=>supabase.auth.signOut().then(()=>location.reload())}>Sair</Button></form></section></main>
}

function ChangePassword({employee,onDone}:{employee:any;onDone:()=>void}){
  const [password,setPassword]=useState(""); const [confirm,setConfirm]=useState(""); const [error,setError]=useState("");
  async function submit(e:FormEvent){
    e.preventDefault(); setError("");
    if(password.length<8) return setError("Use pelo menos 8 caracteres.");
    if(password!==confirm) return setError("As senhas não coincidem.");
    const {error:authError}=await supabase.auth.updateUser({password});
    if(authError) return setError(authError.message);
    const {error:updateError}=await supabase.functions.invoke("complete-first-access");
    if(updateError) return setError(updateError.message);
    onDone();
  }
  return <main className="auth-stage"><section className="auth-card"><Brand/><div className="auth-copy"><span><ShieldCheck/></span><h1>Crie sua nova senha</h1><p>A senha provisória só pode ser usada no primeiro acesso.</p></div><form onSubmit={submit}><label>Nova senha<Input type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label><label>Confirmar senha<Input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><ErrorBox message={error}/><Button>Salvar nova senha</Button></form></section></main>
}

function Dashboard({ctx}:{ctx:Context}){
  const [stats,setStats]=useState({employees:0,entries:0,pending:0,departments:0});
  useEffect(()=>{(async()=>{
    const org=ctx.organization.id;
    const [employees,entries,pending,departments]=await Promise.all([
      supabase.from("employees").select("*",{count:"exact",head:true}).eq("organization_id",org).eq("status","active"),
      supabase.from("time_entries").select("*",{count:"exact",head:true}).eq("organization_id",org).gte("occurred_at",todayStart()),
      supabase.from("justifications").select("*",{count:"exact",head:true}).eq("organization_id",org).eq("status","pending"),
      supabase.from("departments").select("*",{count:"exact",head:true}).eq("organization_id",org).eq("active",true),
    ]);
    setStats({employees:employees.count??0,entries:entries.count??0,pending:pending.count??0,departments:departments.count??0});
  })()},[ctx.organization.id]);
  return <><PageHead title="Hoje" desc={new Intl.DateTimeFormat("pt-BR",{dateStyle:"full"}).format(new Date())}/><section className="metrics">
    {[[""+stats.employees,"Funcionários ativos","Equipe cadastrada"],[""+stats.entries,"Registros hoje","Recebidos pelo aplicativo"],[""+stats.pending,"Pendências","Aguardando análise"],[""+stats.departments,"Setores ativos","Estrutura da empresa"]].map((m,i)=><article key={m[1]}><span className={"metric-mark m"+i}/><div><b>{m[0]}</b><p>{m[1]}</p><small>{m[2]}</small></div></article>)}
  </section><section className="permission-note"><ShieldCheck/><div><b>Operação em produção</b><p>Os dados exibidos pertencem a {ctx.organization.trade_name}. Seu acesso é limitado ao perfil {labels[ctx.member.role]}.</p></div></section></>
}

function Employees({ctx}:{ctx:Context}){
  const [rows,setRows]=useState<any[]>([]); const [departments,setDepartments]=useState<any[]>([]); const [schedules,setSchedules]=useState<any[]>([]);
  const [q,setQ]=useState(""); const [open,setOpen]=useState(false); const [error,setError]=useState(""); const [loading,setLoading]=useState(false);
  const blank={full_name:"",username:"",employee_code:"",cpf:"",birth_date:"",gender:"",hired_at:"",job_title:"",email:"",phone:"",department_id:ctx.member.role==="manager"?(ctx.member.department_id||""):"",schedule_id:"",role:"employee",password:"",pin:""};
  const [form,setForm]=useState(blank);
  const load=useCallback(async()=>{
    const org=ctx.organization.id;
    const [e,d,s]=await Promise.all([
      supabase.from("employees").select("*,departments(name),work_schedules(name,start_time,end_time)").eq("organization_id",org).order("full_name"),
      supabase.from("departments").select("*").eq("organization_id",org).eq("active",true).order("name"),
      supabase.from("work_schedules").select("*").eq("organization_id",org).eq("active",true).order("name"),
    ]); setRows(e.data??[]);setDepartments(d.data??[]);setSchedules(s.data??[]);
  },[ctx.organization.id]);
  useEffect(()=>{load()},[load]);
  async function create(e:FormEvent){
    e.preventDefault();setLoading(true);setError("");
    const {error}=await supabase.functions.invoke("manage-user",{body:{...form,organization_id:ctx.organization.id,department_id:form.department_id||null,schedule_id:form.schedule_id||null}});
    setLoading(false);if(error)return setError(await functionErrorMessage(error,"Não foi possível cadastrar o funcionário."));
    setOpen(false);setForm(blank);load();
  }
  async function setStatus(row:any,status:"active"|"inactive"|"terminated"){const reason=status==="terminated"?(window.prompt("Motivo do desligamento:")||""):null;if(status==="terminated"&&!reason)return;const{error}=await supabase.functions.invoke("manage-user",{body:{action:"set_status",organization_id:ctx.organization.id,employee_id:row.id,status,termination_reason:reason}});if(error)setError(await functionErrorMessage(error,"Não foi possível alterar a situação."));else load()}
  async function remove(row:any){if(!window.confirm(`Excluir definitivamente o perfil de ${row.full_name}? Os registros relacionados também serão removidos.`))return;const{error}=await supabase.functions.invoke("manage-user",{body:{action:"delete",organization_id:ctx.organization.id,employee_id:row.id}});if(error)setError(await functionErrorMessage(error,"Não foi possível excluir."));else load()}
  const filtered=rows.filter(r=>(r.full_name+r.username+(r.job_title??"")+(r.departments?.name??"")).toLowerCase().includes(q.toLowerCase()));
  const canCreate=roleCanManage(ctx.member.role)||ctx.member.role==="manager";
  return <><PageHead title="Funcionários" desc="Ficha cadastral, acesso e vínculo de jornada" action={canCreate?<Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><UserPlus/>Adicionar funcionário</Button></DialogTrigger><DialogContent className="wide-dialog"><DialogHeader><DialogTitle>Novo funcionário</DialogTitle><DialogDescription>Cadastre a ficha. A senha muda no primeiro acesso e o PIN identifica o colaborador no terminal da empresa.</DialogDescription></DialogHeader><form className="form-grid" onSubmit={create}><label>Nome completo<Input required value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})}/></label><label>CPF<Input required inputMode="numeric" maxLength={14} value={form.cpf} onChange={e=>setForm({...form,cpf:e.target.value})}/></label><label>Matrícula<Input required value={form.employee_code} onChange={e=>setForm({...form,employee_code:e.target.value})}/></label><label>Usuário<Input required value={form.username} onChange={e=>setForm({...form,username:e.target.value.toLowerCase()})}/></label><label>Data de nascimento<Input type="date" value={form.birth_date} onChange={e=>setForm({...form,birth_date:e.target.value})}/></label><label>Admissão<Input type="date" value={form.hired_at} onChange={e=>setForm({...form,hired_at:e.target.value})}/></label><label>Gênero<select value={form.gender} onChange={e=>setForm({...form,gender:e.target.value})}><option value="">Não informado</option><option value="female">Feminino</option><option value="male">Masculino</option><option value="other">Outro</option><option value="not_disclosed">Prefere não informar</option></select></label><label>Cargo<Input value={form.job_title} onChange={e=>setForm({...form,job_title:e.target.value})}/></label><label>E-mail pessoal<Input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label>Telefone<Input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label><label>Setor<select disabled={ctx.member.role==="manager"} value={form.department_id} onChange={e=>setForm({...form,department_id:e.target.value})}><option value="">Sem setor</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label>Jornada<select value={form.schedule_id} onChange={e=>setForm({...form,schedule_id:e.target.value})}><option value="">Sem jornada</option>{schedules.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Perfil<select disabled={ctx.member.role==="manager"} value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="employee">Funcionário</option><option value="manager">Líder de setor</option><option value="hr_agent">Equipe de RH</option><option value="hr_admin">Administrador de RH</option></select></label><label>PIN do terminal (6 números)<Input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} type="password" value={form.pin} onChange={e=>setForm({...form,pin:e.target.value.replace(/\D/g,"")})}/></label><label>Senha provisória<Input required minLength={8} type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></label><ErrorBox message={error}/><DialogFooter><Button disabled={loading}>{loading?"Criando…":"Criar acesso"}</Button></DialogFooter></form></DialogContent></Dialog>:undefined}/><ErrorBox message={error}/><section className="surface table-surface"><div className="table-tools"><label><Search/><Input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar funcionário"/></label><Button variant="outline" onClick={load}><RefreshCw/>Atualizar</Button></div><Table><TableHeader><TableRow><TableHead>Funcionário</TableHead><TableHead>Matrícula / CPF</TableHead><TableHead>Setor</TableHead><TableHead>Jornada</TableHead><TableHead>Situação</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader><TableBody>{filtered.map(r=><TableRow key={r.id}><TableCell><div className="person-cell"><span className="avatar">{initials(r.full_name)}</span><p><b>{r.full_name}</b><small>{r.username} · {r.job_title||"Sem cargo"}</small></p></div></TableCell><TableCell>{r.employee_code}<br/><small>{r.cpf||"CPF não informado"}</small></TableCell><TableCell>{r.departments?.name||"—"}</TableCell><TableCell>{r.work_schedules?.name||"—"}</TableCell><TableCell><Badge color={r.status==="active"?"green":"gray"}>{r.status==="active"?"Ativo":r.status==="terminated"?"Demitido":r.status}</Badge>{r.termination_reason&&<small className="termination-note">{r.termination_reason}</small>}</TableCell><TableCell><div className="row-actions">{r.status==="active"?<Button size="sm" variant="outline" onClick={()=>setStatus(r,"terminated")}>Desligar</Button>:<Button size="sm" variant="outline" onClick={()=>setStatus(r,"active")}>Reativar</Button>}{["platform_admin","company_owner","hr_admin"].includes(ctx.member.role)&&<Button size="sm" variant="outline" onClick={()=>remove(r)}>Excluir</Button>}</div></TableCell></TableRow>)}</TableBody></Table></section></>
}

function Departments({ctx}:{ctx:Context}){
  const [rows,setRows]=useState<any[]>([]);const [name,setName]=useState("");
  const load=useCallback(async()=>{const {data}=await supabase.from("departments").select("*,employees(count)").eq("organization_id",ctx.organization.id).order("name");setRows(data??[])},[ctx.organization.id]);
  useEffect(()=>{load()},[load]);
  async function add(e:FormEvent){e.preventDefault();await supabase.from("departments").insert({organization_id:ctx.organization.id,name});setName("");load()}
  return <><PageHead title="Setores e líderes" desc="O líder acessa e confirma somente os pontos do próprio setor" action={roleCanManage(ctx.member.role)?<form className="inline-create" onSubmit={add}><Input required value={name} onChange={e=>setName(e.target.value)} placeholder="Nome do novo setor"/><Button><Plus/>Criar</Button></form>:undefined}/><section className="sector-cards">{rows.map(r=><article className="surface" key={r.id}><header><span className="sector-icon"><UsersRound/></span><Badge color={r.active?"green":"gray"}>{r.active?"Ativo":"Inativo"}</Badge></header><h2>{r.name}</h2><p className="muted-text">{r.description||"Equipe organizada por setor."}</p><dl><div><dt>Funcionários</dt><dd>{r.employees?.[0]?.count??0}</dd></div></dl></article>)}</section></>
}

function Devices({ctx}:{ctx:Context}){
  const[rows,setRows]=useState<any[]>([]);
  const load=useCallback(async()=>{const{data}=await supabase.from("authorized_devices").select("*,employees(full_name,department_id)").eq("organization_id",ctx.organization.id).order("created_at",{ascending:false});setRows(data??[])},[ctx.organization.id]);
  useEffect(()=>{load()},[load]);
  async function setApproval(row:any,approved:boolean){const{data:{user}}=await supabase.auth.getUser();await supabase.from("authorized_devices").update({approved,approved_by:approved?user?.id:null,approved_at:approved?new Date().toISOString():null,revoked_at:approved?null:new Date().toISOString()}).eq("id",row.id);load()}
  return <><PageHead title="Dispositivos" desc="Autorize os celulares vinculados aos funcionários"/><section className="surface table-surface"><Table><TableHeader><TableRow><TableHead>Funcionário</TableHead><TableHead>Aparelho</TableHead><TableHead>Plataforma</TableHead><TableHead>Último acesso</TableHead><TableHead>Status</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader><TableBody>{rows.map(r=><TableRow key={r.id}><TableCell>{r.employees?.full_name}</TableCell><TableCell><b>{r.device_name||"Celular"}</b><br/><small>{r.device_uuid}</small></TableCell><TableCell>{r.platform||"android"}</TableCell><TableCell>{r.last_seen_at?dateTime(r.last_seen_at):"Primeiro acesso"}</TableCell><TableCell><Badge color={r.approved&&!r.revoked_at?"green":"amber"}>{r.approved&&!r.revoked_at?"Autorizado":"Pendente"}</Badge></TableCell><TableCell><Button size="sm" variant="outline" onClick={()=>setApproval(r,!(r.approved&&!r.revoked_at))}>{r.approved&&!r.revoked_at?"Revogar":"Autorizar"}</Button></TableCell></TableRow>)}</TableBody></Table></section></>
}

function Terminals({ctx}:{ctx:Context}){
  const[rows,setRows]=useState<any[]>([]);const[open,setOpen]=useState(false);const[error,setError]=useState("");const[saved,setSaved]=useState("");
  const[form,setForm]=useState({name:"Recepção",code:"recepcao",password:"",location_name:"",radius_meters:150});
  const load=useCallback(async()=>{const{data}=await supabase.from("terminals").select("*").eq("organization_id",ctx.organization.id).order("created_at",{ascending:false});setRows(data??[])},[ctx.organization.id]);
  useEffect(()=>{load()},[load]);
  async function create(e:FormEvent){e.preventDefault();setError("");const{data,error}=await supabase.functions.invoke("provision-terminal",{body:{...form,organization_id:ctx.organization.id}});if(error)return setError(await functionErrorMessage(error,"Não foi possível criar o terminal."));setSaved(`${data.company_code} / ${data.terminal.code}`);setOpen(false);setForm({...form,password:""});load()}
  async function toggle(r:any){await supabase.from("terminals").update({enabled:!r.enabled}).eq("id",r.id);load()}
  return <><PageHead title="Terminais da empresa" desc="APK fixo para recepção, portaria ou tablet compartilhado" action={["platform_admin","company_owner","hr_admin"].includes(ctx.member.role)?<Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus/>Novo terminal</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Criar terminal corporativo</DialogTitle><DialogDescription>Instale o mesmo APK no aparelho da empresa e entre com estas credenciais.</DialogDescription></DialogHeader><form className="form-grid" onSubmit={create}><label>Nome do aparelho<Input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Código do terminal<Input required minLength={3} value={form.code} onChange={e=>setForm({...form,code:e.target.value.toLowerCase()})}/></label><label>Local<Input value={form.location_name} onChange={e=>setForm({...form,location_name:e.target.value})}/></label><label>Raio permitido (metros)<Input type="number" min={20} max={5000} value={form.radius_meters} onChange={e=>setForm({...form,radius_meters:+e.target.value})}/></label><label className="full-row">Senha do terminal<Input required minLength={10} type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></label><ErrorBox message={error}/><DialogFooter><Button>Criar terminal</Button></DialogFooter></form></DialogContent></Dialog>:undefined}/>{saved&&<div className="success-banner"><Check/>Terminal criado. Login no APK: <b>{saved}</b></div>}<section className="surface table-surface"><Table><TableHeader><TableRow><TableHead>Terminal</TableHead><TableHead>Código</TableHead><TableHead>Local</TableHead><TableHead>Aparelho vinculado</TableHead><TableHead>Status</TableHead><TableHead>Ação</TableHead></TableRow></TableHeader><TableBody>{rows.map(r=><TableRow key={r.id}><TableCell><b>{r.name}</b></TableCell><TableCell>{r.code}</TableCell><TableCell>{r.location_name||"Sem restrição"}</TableCell><TableCell>{r.device_uuid||"Vincula no primeiro acesso"}</TableCell><TableCell><Badge color={r.enabled?"green":"gray"}>{r.enabled?"Ativo":"Desativado"}</Badge></TableCell><TableCell><Button size="sm" variant="outline" onClick={()=>toggle(r)}>{r.enabled?"Desativar":"Ativar"}</Button></TableCell></TableRow>)}</TableBody></Table></section></>
}

function Schedules({ctx}:{ctx:Context}){
  const [rows,setRows]=useState<any[]>([]);const [form,setForm]=useState({name:"",schedule_type:"flexible",weekly_hours:44,daily_hours:8,start_time:"08:00",break_start:"12:00",break_end:"13:00",end_time:"17:00",tolerance_minutes:10});
  const load=useCallback(async()=>{const{data}=await supabase.from("work_schedules").select("*").eq("organization_id",ctx.organization.id).order("name");setRows(data??[])},[ctx.organization.id]);
  useEffect(()=>{load()},[load]);
  async function add(e:FormEvent){e.preventDefault();const fixed=form.schedule_type==="fixed";await supabase.from("work_schedules").insert({organization_id:ctx.organization.id,name:form.name,schedule_type:form.schedule_type,weekly_minutes:Math.round(form.weekly_hours*60),daily_minutes:Math.round(form.daily_hours*60),start_time:fixed?form.start_time:null,break_start:fixed?form.break_start:null,break_end:fixed?form.break_end:null,end_time:fixed?form.end_time:null,tolerance_minutes:form.tolerance_minutes});setForm({...form,name:""});load()}
  return <><PageHead title="Jornadas" desc="Carga contratual fixa ou flexível, com saldo automático"/>{roleCanManage(ctx.member.role)&&<form className="surface schedule-form" onSubmit={add}><label>Nome<Input required placeholder="Ex.: Flexível 44h" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Modelo<select value={form.schedule_type} onChange={e=>setForm({...form,schedule_type:e.target.value})}><option value="flexible">Flexível</option><option value="fixed">Horário fixo</option></select></label><label>Horas semanais<Input type="number" min={1} max={168} step={0.5} value={form.weekly_hours} onChange={e=>setForm({...form,weekly_hours:+e.target.value})}/></label><label>Meta diária<Input type="number" min={1} max={24} step={0.5} value={form.daily_hours} onChange={e=>setForm({...form,daily_hours:+e.target.value})}/></label>{form.schedule_type==="fixed"&&<><label>Entrada<Input type="time" value={form.start_time} onChange={e=>setForm({...form,start_time:e.target.value})}/></label><label>Intervalo início<Input type="time" value={form.break_start} onChange={e=>setForm({...form,break_start:e.target.value})}/></label><label>Intervalo fim<Input type="time" value={form.break_end} onChange={e=>setForm({...form,break_end:e.target.value})}/></label><label>Saída<Input type="time" value={form.end_time} onChange={e=>setForm({...form,end_time:e.target.value})}/></label></>}<label>Tolerância (min)<Input type="number" min={0} max={180} value={form.tolerance_minutes} onChange={e=>setForm({...form,tolerance_minutes:+e.target.value})}/></label><Button><Plus/>Adicionar jornada</Button></form>}<section className="surface table-surface"><Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Modelo</TableHead><TableHead>Carga semanal</TableHead><TableHead>Meta diária</TableHead><TableHead>Horário</TableHead></TableRow></TableHeader><TableBody>{rows.map(r=><TableRow key={r.id}><TableCell><b>{r.name}</b></TableCell><TableCell><Badge color={r.schedule_type==="flexible"?"green":"blue"}>{r.schedule_type==="flexible"?"Flexível":"Fixo"}</Badge></TableCell><TableCell>{minutes(r.weekly_minutes)}</TableCell><TableCell>{minutes(r.daily_minutes)}</TableCell><TableCell>{r.schedule_type==="flexible"?"Entrada e saída livres":`${r.start_time?.slice(0,5)}–${r.end_time?.slice(0,5)}`}</TableCell></TableRow>)}</TableBody></Table></section></>
}

function ReviewEntries({ctx}:{ctx:Context}){
  const [rows,setRows]=useState<any[]>([]);
  const load=useCallback(async()=>{const{data}=await supabase.from("time_entries").select("*,employees(full_name,job_title,department_id),time_entry_reviews(*)").eq("organization_id",ctx.organization.id).gte("occurred_at",todayStart()).order("occurred_at",{ascending:false});setRows(data??[])},[ctx.organization.id]);
  useEffect(()=>{load()},[load]);
  async function review(row:any,status:string){
    const {data:{user}}=await supabase.auth.getUser();if(!user)return;
    await supabase.from("time_entry_reviews").upsert({organization_id:row.organization_id,time_entry_id:row.id,employee_id:row.employee_id,reviewer_user_id:user.id,status},{onConflict:"time_entry_id,reviewer_user_id"});load();
  }
  return <><PageHead title="Conferência de pontos" desc="Líderes confirmam os registros do próprio setor sem alterar a marcação original"/><section className="surface table-surface"><Table><TableHeader><TableRow><TableHead>Funcionário</TableHead><TableHead>Registro</TableHead><TableHead>Método</TableHead><TableHead>Conferência</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader><TableBody>{rows.map(r=>{const own=r.time_entry_reviews?.find((x:any)=>x.reviewer_user_id===ctx.member.user_id);return <TableRow key={r.id}><TableCell>{r.employees?.full_name}</TableCell><TableCell>{eventLabels[r.event_type]} · {dateTime(r.occurred_at)}</TableCell><TableCell>{methodLabels[r.method]??r.method}</TableCell><TableCell><Badge color={own?.status==="confirmed"?"green":own?"amber":"gray"}>{own?.status==="confirmed"?"Confirmado":own?"Divergência":"Pendente"}</Badge></TableCell><TableCell><div className="row-actions"><Button size="sm" variant="outline" onClick={()=>review(r,"confirmed")}><Check/>Confirmar</Button><Button size="sm" variant="outline" onClick={()=>review(r,"forwarded_to_hr")}><CircleAlert/>Enviar ao RH</Button></div></TableCell></TableRow>})}</TableBody></Table></section></>
}

function RollCall({ctx}:{ctx:Context}){
  const [employees,setEmployees]=useState<any[]>([]);const [marks,setMarks]=useState<Record<string,string>>({});const [note,setNote]=useState("");const [saved,setSaved]=useState(false);
  const departmentId=ctx.member.department_id;
  useEffect(()=>{if(!departmentId)return;supabase.from("employees").select("*").eq("organization_id",ctx.organization.id).eq("department_id",departmentId).eq("status","active").order("full_name").then(({data})=>setEmployees(data??[]))},[ctx.organization.id,departmentId]);
  async function finish(){
    if(!departmentId)return;
    const {data:{user}}=await supabase.auth.getUser();if(!user)return;
    const date=new Date().toISOString().slice(0,10);
    const {data:call,error}=await supabase.from("attendance_calls").upsert({organization_id:ctx.organization.id,department_id:departmentId,call_date:date,period:"daily",status:"completed",notes:note,created_by:user.id,completed_at:new Date().toISOString()},{onConflict:"department_id,call_date,period"}).select("id").single();
    if(error||!call)return;
    await supabase.from("attendance_call_items").upsert(employees.map(e=>({call_id:call.id,organization_id:ctx.organization.id,employee_id:e.id,mark:marks[e.id]||"absent",marked_at:new Date().toISOString()})),{onConflict:"call_id,employee_id"});
    setSaved(true);
  }
  if(!departmentId&&ctx.member.role==="manager")return <section className="surface empty-state"><CircleAlert/><h2>Líder sem setor</h2><p>O RH precisa vincular este líder a um setor.</p></section>;
  return <><PageHead title="Chamada do setor" desc="Marque a presença e conclua a chamada" action={<Button onClick={finish}><Check/>Concluir chamada</Button>}/>{saved&&<div className="success-banner"><Check/>Chamada salva e enviada ao RH.</div>}<section className="call-layout"><article className="surface"><div className="call-list">{employees.map(p=><div key={p.id}><span className="avatar">{initials(p.full_name)}</span><p><b>{p.full_name}</b><small>{p.job_title||"Funcionário"}</small></p><div className="mark-options">{[["present","Presente"],["late","Atraso"],["absent","Ausente"],["excused","Justificado"]].map(([v,l])=><button key={v} className={marks[p.id]===v?v:""} onClick={()=>setMarks({...marks,[p.id]:v})}>{l}</button>)}</div></div>)}</div></article><aside className="surface call-summary"><h2>Resumo</h2><div><span><b>{Object.values(marks).filter(v=>v==="present").length}</b> presentes</span><span><b>{Object.values(marks).filter(v=>v==="late").length}</b> atrasos</span><span><b>{Object.values(marks).filter(v=>v==="absent").length}</b> ausentes</span><span><b>{employees.length-Object.keys(marks).length}</b> não marcados</span></div><label>Observação<textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Observação para o RH"/></label></aside></section></>
}

function Occurrences({ctx}:{ctx:Context}){
  const [rows,setRows]=useState<any[]>([]);
  const load=useCallback(async()=>{const{data}=await supabase.from("justifications").select("*,employees(full_name)").eq("organization_id",ctx.organization.id).order("created_at",{ascending:false});setRows(data??[])},[ctx.organization.id]);
  useEffect(()=>{load()},[load]);
  async function decide(id:string,status:string){const{data:{user}}=await supabase.auth.getUser();await supabase.from("justifications").update({status,reviewed_by:user?.id,reviewed_at:new Date().toISOString()}).eq("id",id);load()}
  return <><PageHead title="Ocorrências e justificativas" desc="Atestados, faltas e análises do RH"/><section className="surface table-surface"><Table><TableHeader><TableRow><TableHead>Funcionário</TableHead><TableHead>Tipo</TableHead><TableHead>Período</TableHead><TableHead>Status</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader><TableBody>{rows.map(r=><TableRow key={r.id}><TableCell>{r.employees?.full_name}</TableCell><TableCell>{r.kind}</TableCell><TableCell>{dateTime(r.starts_at)} a {dateTime(r.ends_at)}</TableCell><TableCell><Badge color={r.status==="approved"?"green":r.status==="rejected"?"amber":"gray"}>{r.status}</Badge></TableCell><TableCell>{r.status==="pending"&&<div className="row-actions"><Button size="sm" onClick={()=>decide(r.id,"approved")}>Aprovar</Button><Button size="sm" variant="outline" onClick={()=>decide(r.id,"rejected")}>Rejeitar</Button></div>}</TableCell></TableRow>)}</TableBody></Table></section></>
}

function Reports({ctx}:{ctx:Context}){
  const [rows,setRows]=useState<any[]>([]);
  const [people,setPeople]=useState<any[]>([]);const[justifications,setJustifications]=useState<any[]>([]);
  const load=useCallback(async()=>{const[summary,employees,docs]=await Promise.all([supabase.from("daily_time_summary").select("*").eq("organization_id",ctx.organization.id).order("work_date",{ascending:false}).limit(500),supabase.from("employees").select("id,full_name,status,termination_reason").eq("organization_id",ctx.organization.id).order("full_name"),supabase.from("justifications").select("id,status,employee_id").eq("organization_id",ctx.organization.id)]);setRows(summary.data??[]);setPeople(employees.data??[]);setJustifications(docs.data??[])},[ctx.organization.id]);
  useEffect(()=>{load()},[load]);
  function exportCsv(){const header="Funcionário,Data,Modelo,Primeira entrada,Última saída,Horas trabalhadas,Meta,Saldo,Situação,Registros\n";const body=rows.map(r=>[r.full_name,r.work_date,r.schedule_type,r.first_entry??"",r.last_exit??"",minutes(r.worked_minutes),minutes(r.target_minutes),minutes(r.balance_minutes),r.day_status,r.event_count].map((v:any)=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\ufeff"+header+body],{type:"text/csv"}));a.download=`pontonorte-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href)}
  const active=people.filter(p=>p.status==="active");const today=new Date().toISOString().slice(0,10);const withPoint=new Set(rows.filter(r=>r.work_date===today&&r.event_count>0).map(r=>r.employee_id));const missing=active.filter(p=>!withPoint.has(p.id));
  return <><PageHead title="Relatórios e banco de horas" desc="Visão geral da equipe, faltas, justificativas e saldo de horas" action={<Button onClick={exportCsv}><Download/>Exportar para Excel</Button>}/><section className="metrics report-metrics">{[[active.length,"Funcionários ativos"],[people.filter(p=>p.status==="terminated").length,"Desligados"],[missing.length,"Sem registro hoje"],[justifications.filter(j=>j.status==="pending").length,"Justificativas pendentes"]].map((m,i)=><article key={String(m[1])}><span className={"metric-mark m"+i}/><div><b>{m[0]}</b><p>{m[1]}</p></div></article>)}</section>{missing.length>0&&<section className="surface missing-report"><h2>Sem registro hoje</h2><p>{missing.map(p=>p.full_name).join(" · ")}</p></section>}<section className="surface table-surface"><Table><TableHeader><TableRow><TableHead>Funcionário</TableHead><TableHead>Data</TableHead><TableHead>Jornada</TableHead><TableHead>Entrada / saída</TableHead><TableHead>Trabalhado</TableHead><TableHead>Meta</TableHead><TableHead>Saldo</TableHead><TableHead>Situação</TableHead></TableRow></TableHeader><TableBody>{rows.filter(r=>r.work_date).map((r,i)=><TableRow key={r.employee_id+r.work_date+i}><TableCell>{r.full_name}</TableCell><TableCell>{r.work_date}</TableCell><TableCell>{r.schedule_type==="flexible"?"Flexível":"Fixa"}</TableCell><TableCell>{r.first_entry?dateTime(r.first_entry):"—"}<br/><small>{r.last_exit?dateTime(r.last_exit):"Em aberto"}</small></TableCell><TableCell>{minutes(r.worked_minutes)}</TableCell><TableCell>{minutes(r.target_minutes)}</TableCell><TableCell><Badge color={r.balance_minutes>=0?"green":"amber"}>{minutes(r.balance_minutes)}</Badge></TableCell><TableCell>{({completed:"Cumprida",debit:"Débito",open:"Em andamento",absent:"Ausente"} as any)[r.day_status]??r.day_status}</TableCell></TableRow>)}</TableBody></Table></section></>
}

function Methods({ctx}:{ctx:Context}){
  const [rows,setRows]=useState<any[]>([]);const[qr,setQr]=useState<{image:string;expires:string}|null>(null);const[qrError,setQrError]=useState("");
  const load=useCallback(async()=>{const{data}=await supabase.from("clock_methods").select("*").eq("organization_id",ctx.organization.id).order("method");setRows(data??[])},[ctx.organization.id]);
  useEffect(()=>{load()},[load]);
  async function toggle(r:any,enabled:boolean){await supabase.from("clock_methods").update({enabled,updated_at:new Date().toISOString()}).eq("id",r.id);load()}
  async function generateQr(){
    setQrError("");try{
      const position=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:15000}));
      const token=`PN-${crypto.randomUUID()}-${Date.now()}`;const expires=new Date(Date.now()+2*60*1000).toISOString();
      const{data:{user}}=await supabase.auth.getUser();if(!user)throw new Error("Sessão inválida.");
      const{error}=await supabase.from("qr_sessions").insert({organization_id:ctx.organization.id,token_hash:await sha256(token),location_name:ctx.organization.trade_name,latitude:position.coords.latitude,longitude:position.coords.longitude,radius_meters:150,expires_at:expires,created_by:user.id});
      if(error)throw error;setQr({image:await QRCode.toDataURL(token,{width:320,margin:2,color:{dark:"#0b2e4c",light:"#ffffff"}}),expires});
    }catch(e){setQrError(e instanceof Error?e.message:"Não foi possível gerar o QR Code.")}
  }
  return <><PageHead title="Métodos de ponto" desc="A empresa decide o que aparece no aplicativo"/><section className="methods">{rows.map(r=><article className="surface" key={r.id}><header><span><Fingerprint/></span><Switch disabled={!["platform_admin","company_owner","hr_admin"].includes(ctx.member.role)} checked={r.enabled} onCheckedChange={v=>toggle(r,v)}/></header><h2>{methodLabels[r.method]??r.method}</h2><p>{r.method==="face"?"Exige fornecedor de prova de vida e consentimento LGPD.":r.require_location?"Solicita a localização do aparelho.":"Registro sem localização."}</p><footer><Badge color={r.enabled?"green":"gray"}>{r.enabled?"Disponível":"Desativado"}</Badge></footer></article>)}</section><section className="surface qr-panel"><div><h2>QR Code da empresa</h2><p>O código expira em 2 minutos e valida uma área de 150 metros.</p><Button onClick={generateQr}><RefreshCw/>Gerar novo QR Code</Button><ErrorBox message={qrError}/></div>{qr&&<figure><img src={qr.image} alt="QR Code temporário para registro de ponto"/><figcaption>Válido até {new Intl.DateTimeFormat("pt-BR",{timeStyle:"short"}).format(new Date(qr.expires))}</figcaption></figure>}</section></>
}

function Companies({ctx}:{ctx:Context}){
  const[rows,setRows]=useState<any[]>([]);const[requests,setRequests]=useState<any[]>([]);const[open,setOpen]=useState(false);const[editOpen,setEditOpen]=useState(false);const[error,setError]=useState("");const[editError,setEditError]=useState("");const[saving,setSaving]=useState(false);const[issued,setIssued]=useState<{company:string;code:string;until:string}|null>(null);
  const[form,setForm]=useState({company_code:"",legal_name:"",trade_name:"",tax_id:"",owner_name:"",owner_username:"",owner_email:"",owner_password:""});
  const[edit,setEdit]=useState({organization_id:"",company_code:"",legal_name:"",trade_name:"",tax_id:"",timezone:"America/Rio_Branco",owner_username:"",owner_email:"",temporary_password:"",reset_request_id:""});
  const load=useCallback(async()=>{
    const[orgs,members,employees,resets]=await Promise.all([
      supabase.from("organizations").select("*").order("trade_name"),
      supabase.from("organization_members").select("organization_id,user_id").eq("role","company_owner").eq("active",true),
      supabase.from("employees").select("organization_id,auth_user_id,username,email,full_name"),
      supabase.from("password_reset_requests").select("id,organization_id,employee_id,protocol,status,requested_at,employees(full_name,username,email),organizations(trade_name,company_code)").eq("status","pending").order("requested_at",{ascending:false}),
    ]);
    const owners=new Map((members.data??[]).map(m=>[m.organization_id,(employees.data??[]).find(e=>e.auth_user_id===m.user_id)]));
    setRows((orgs.data??[]).map(org=>({...org,owner:owners.get(org.id)})));setRequests(resets.data??[]);
  },[]);
  useEffect(()=>{load()},[load]);
  if(ctx.member.role!=="platform_admin")return <section className="surface empty-state"><ShieldCheck/><h2>Acesso restrito ao administrador geral</h2></section>;
  async function create(e:FormEvent){e.preventDefault();setError("");const{error}=await supabase.functions.invoke("provision-company",{body:form});if(error)return setError(await functionErrorMessage(error,"Não foi possível cadastrar a empresa."));setOpen(false);load()}
  async function license(row:any,action:"issue"|"suspend"|"activate"){setError("");const{data,error}=await supabase.functions.invoke("license-manager",{body:{organization_id:row.id,action,months:1}});if(error)return setError(await functionErrorMessage(error,"Não foi possível alterar a licença."));if(data?.code)setIssued({company:row.trade_name,code:data.code,until:data.license_until});load()}
  function editCompany(row:any,requestId=""){setEditError("");setEdit({organization_id:row.id,company_code:row.company_code,legal_name:row.legal_name,trade_name:row.trade_name,tax_id:row.tax_id??"",timezone:row.timezone??"America/Rio_Branco",owner_username:row.owner?.username??"",owner_email:row.owner?.email??"",temporary_password:"",reset_request_id:requestId});setEditOpen(true)}
  function attend(request:any){const row=rows.find(r=>r.id===request.organization_id);if(row)editCompany(row,request.id)}
  function generatePassword(){const value=`Pn!${crypto.randomUUID().replace(/-/g,"").slice(0,10)}`;setEdit(current=>({...current,temporary_password:value}))}
  async function saveCompany(e:FormEvent){e.preventDefault();setSaving(true);setEditError("");const{error}=await supabase.functions.invoke("manage-company",{body:edit});setSaving(false);if(error)return setEditError(await functionErrorMessage(error,"Não foi possível salvar a empresa."));setEditOpen(false);load()}
  return <>
    <PageHead title="Empresas e licenças" desc="Cadastros, acessos, pagamentos, ativações e suspensões" action={<Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus/>Cadastrar manualmente</Button></DialogTrigger><DialogContent className="wide-dialog"><DialogHeader><DialogTitle>Cadastrar empresa</DialogTitle><DialogDescription>Também será criado o primeiro administrador da empresa.</DialogDescription></DialogHeader><form className="form-grid" onSubmit={create}><label>Código da empresa<Input required minLength={4} maxLength={12} value={form.company_code} onChange={e=>setForm({...form,company_code:e.target.value.toUpperCase()})}/></label><label>Nome fantasia<Input required value={form.trade_name} onChange={e=>setForm({...form,trade_name:e.target.value})}/></label><label>Razão social<Input required value={form.legal_name} onChange={e=>setForm({...form,legal_name:e.target.value})}/></label><label>CNPJ/CPF<Input value={form.tax_id} onChange={e=>setForm({...form,tax_id:e.target.value})}/></label><label>Nome do administrador<Input required value={form.owner_name} onChange={e=>setForm({...form,owner_name:e.target.value})}/></label><label>Usuário do administrador<Input required value={form.owner_username} onChange={e=>setForm({...form,owner_username:e.target.value.toLowerCase()})}/></label><label>E-mail pessoal<Input type="email" value={form.owner_email} onChange={e=>setForm({...form,owner_email:e.target.value})}/></label><label>Senha provisória<Input required minLength={8} type="password" value={form.owner_password} onChange={e=>setForm({...form,owner_password:e.target.value})}/></label><ErrorBox message={error}/><DialogFooter><Button>Criar empresa</Button></DialogFooter></form></DialogContent></Dialog>}/>
    {requests.length>0&&<section className="surface recovery-queue"><header><div><KeyRound/><span><b>Recuperações pendentes</b><small>Confira o protocolo informado pelo proprietário antes de redefinir o acesso.</small></span></div><Badge color="amber">{requests.length} pendente{requests.length===1?"":"s"}</Badge></header>{requests.map(request=><div className="recovery-row" key={request.id}><span><strong>{request.protocol}</strong><small>{request.organizations?.trade_name} · {request.organizations?.company_code}</small></span><span><b>{request.employees?.full_name}</b><small>Solicitado em {dateTime(request.requested_at)}</small></span><Button size="sm" onClick={()=>attend(request)}>Atender pedido</Button></div>)}</section>}
    {issued&&<div className="license-banner"><div><b>Código para {issued.company}</b><strong>{issued.code}</strong><small>Válido por 24 horas · mensalidade até {issued.until}</small></div><button onClick={()=>setIssued(null)}><X/></button></div>}
    <ErrorBox message={error}/><section className="surface table-surface"><Table><TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead>Proprietário</TableHead><TableHead>Código</TableHead><TableHead>Licença</TableHead><TableHead>Pago até</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader><TableBody>{rows.map(r=><TableRow key={r.id}><TableCell><b>{r.trade_name}</b><br/><small>{r.legal_name}</small></TableCell><TableCell><b>{r.owner?.full_name??"Não vinculado"}</b><br/><small>{r.owner?.username??"—"}</small></TableCell><TableCell><Badge color="blue">{r.company_code}</Badge></TableCell><TableCell><Badge color={r.license_status==="active"?"green":r.license_status==="suspended"?"amber":"gray"}>{r.license_status||"pending"}</Badge></TableCell><TableCell>{r.paid_until||"—"}</TableCell><TableCell><div className="row-actions"><Button size="sm" variant="outline" onClick={()=>editCompany(r)}><Pencil/>Dados e acesso</Button><Button size="sm" onClick={()=>license(r,"issue")}>Gerar código</Button>{r.license_status==="suspended"?<Button size="sm" variant="outline" onClick={()=>license(r,"activate")}>Reativar</Button>:<Button size="sm" variant="outline" onClick={()=>license(r,"suspend")}>Suspender</Button>}</div></TableCell></TableRow>)}</TableBody></Table></section>
    <Dialog open={editOpen} onOpenChange={setEditOpen}><DialogContent className="wide-dialog"><DialogHeader><DialogTitle>Dados e acesso da empresa</DialogTitle><DialogDescription>Altere o cadastro ou gere uma senha provisória para o proprietário. A nova senha deverá ser trocada no próximo acesso.</DialogDescription></DialogHeader><form className="form-grid" onSubmit={saveCompany}><label>Código da empresa<Input required minLength={4} maxLength={12} value={edit.company_code} onChange={e=>setEdit({...edit,company_code:e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"")})}/></label><label>Nome fantasia<Input required value={edit.trade_name} onChange={e=>setEdit({...edit,trade_name:e.target.value})}/></label><label>Razão social<Input required value={edit.legal_name} onChange={e=>setEdit({...edit,legal_name:e.target.value})}/></label><label>CNPJ/CPF<Input value={edit.tax_id} onChange={e=>setEdit({...edit,tax_id:e.target.value})}/></label><label>Usuário do proprietário<Input required minLength={3} value={edit.owner_username} onChange={e=>setEdit({...edit,owner_username:e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g,"")})}/></label><label>E-mail do proprietário<Input type="email" value={edit.owner_email} onChange={e=>setEdit({...edit,owner_email:e.target.value.toLowerCase()})}/></label><label>Fuso horário<Input required value={edit.timezone} onChange={e=>setEdit({...edit,timezone:e.target.value})}/></label><label>Senha provisória (opcional)<div className="password-generator"><Input minLength={8} value={edit.temporary_password} onChange={e=>setEdit({...edit,temporary_password:e.target.value})}/><Button type="button" variant="outline" onClick={generatePassword}>Gerar</Button></div></label>{edit.reset_request_id&&<div className="full-row recovery-context"><KeyRound/><span><b>Atendendo uma recuperação</b><small>Ao salvar, o protocolo será marcado como resolvido.</small></span></div>}<ErrorBox message={editError}/><DialogFooter><Button type="button" variant="outline" onClick={()=>setEditOpen(false)}>Cancelar</Button><Button disabled={saving}>{saving?"Salvando…":"Salvar alterações"}</Button></DialogFooter></form></DialogContent></Dialog>
  </>
}

function Configuration({ctx,onRefresh}:{ctx:Context;onRefresh:()=>void}){
  const [code,setCode]=useState(ctx.organization.company_code);const [name,setName]=useState(ctx.organization.trade_name);const [legal,setLegal]=useState(ctx.organization.legal_name);const [timezone,setTimezone]=useState(ctx.organization.timezone);const [saved,setSaved]=useState(false);const[error,setError]=useState("");
  const allowed=["platform_admin","company_owner","hr_admin"].includes(ctx.member.role);
  async function save(e:FormEvent){e.preventDefault();setError("");setSaved(false);if(code!==ctx.organization.company_code){const{error}=await supabase.functions.invoke("update-company-code",{body:{organization_id:ctx.organization.id,company_code:code}});if(error)return setError(await functionErrorMessage(error,"Não foi possível alterar o código da empresa."))}const{error}=await supabase.from("organizations").update({trade_name:name,legal_name:legal,timezone,updated_at:new Date().toISOString()}).eq("id",ctx.organization.id);if(error)return setError(error.message);setSaved(true);onRefresh()}
  return <><PageHead title="Configurações" desc="Perfil, código de acesso e regras gerais da empresa"/><form className="surface settings-form" onSubmit={save}><label>Código da empresa<Input disabled={!allowed} minLength={4} maxLength={12} value={code} onChange={e=>setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""))}/><small>Funcionários usam este código para entrar.</small></label><label>Nome fantasia<Input value={name} onChange={e=>setName(e.target.value)}/></label><label>Razão social<Input value={legal} onChange={e=>setLegal(e.target.value)}/></label><label>Fuso horário<Input value={timezone} onChange={e=>setTimezone(e.target.value)}/></label><ErrorBox message={error}/><Button disabled={!allowed}>Salvar alterações</Button>{saved&&<span className="saved"><Check/>Salvo</span>}</form></>
}

function Admin({ctx,onRefresh}:{ctx:Context;onRefresh:()=>void}){
  const [page,setPage]=useState<Page>("Hoje");const[drawer,setDrawer]=useState(false);
  const visible=useMemo(()=>menu.filter(([name])=>{
    if(name==="Empresas")return ctx.member.role==="platform_admin";
    if(ctx.member.role==="manager")return ["Hoje","Funcionários","Dispositivos","Chamada","Conferência","Ocorrências","Relatórios","Configurações"].includes(name);
    return ctx.member.role!=="employee";
  }),[ctx.member.role]);
  async function logout(){await supabase.auth.signOut();location.reload()}
  return <main className="admin-shell"><aside className={"side "+(drawer?"open":"")}><header><Brand/><button onClick={()=>setDrawer(false)}><X/></button></header><button className="company-switch"><span>{initials(ctx.organization.trade_name)}</span><p><b>{ctx.organization.trade_name}</b><small>{ctx.organization.company_code}</small></p><ChevronDown/></button><nav>{visible.map(([name,I])=><button className={page===name?"active":""} key={name} onClick={()=>{setPage(name);setDrawer(false)}}><I/><span>{name}</span></button>)}</nav><footer><span className="avatar">{initials(ctx.employee.full_name)}</span><p><b>{ctx.employee.full_name}</b><small>{labels[ctx.member.role]}</small></p><button className="icon-plain" onClick={logout}><LogOut/></button></footer></aside>{drawer&&<button className="scrim" onClick={()=>setDrawer(false)}/>}<section className="admin-main"><header className="appbar"><div><button className="menu-button" onClick={()=>setDrawer(true)}><Menu/></button><span><b>{ctx.organization.trade_name}</b><small>Gestão de ponto</small></span></div><aside><button className="notify"><Bell/></button></aside></header><div className="admin-content">{page==="Hoje"&&<Dashboard ctx={ctx}/>} {page==="Funcionários"&&<Employees ctx={ctx}/>} {page==="Dispositivos"&&<Devices ctx={ctx}/>} {page==="Terminais"&&<Terminals ctx={ctx}/>} {page==="Setores e líderes"&&<Departments ctx={ctx}/>} {page==="Chamada"&&<RollCall ctx={ctx}/>} {page==="Jornadas"&&<Schedules ctx={ctx}/>} {page==="Conferência"&&<ReviewEntries ctx={ctx}/>} {page==="Ocorrências"&&<Occurrences ctx={ctx}/>} {page==="Relatórios"&&<Reports ctx={ctx}/>} {page==="Métodos de ponto"&&<Methods ctx={ctx}/>} {page==="Empresas"&&<Companies ctx={ctx}/>} {page==="Configurações"&&<Configuration ctx={ctx} onRefresh={onRefresh}/>}</div></section></main>
}

export default function Home(){
  const [ctx,setCtx]=useState<Context|null>(null);const[loading,setLoading]=useState(true);const[error,setError]=useState("");
  const load=useCallback(async()=>{
    setLoading(true);setError("");
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){setCtx(null);setLoading(false);return}
    const [memberResult,employeeResult]=await Promise.all([
      supabase.from("organization_members").select("*,organizations(*)").eq("user_id",user.id).eq("active",true).limit(1).single(),
      supabase.from("employees").select("*").eq("auth_user_id",user.id).single(),
    ]);
    if(memberResult.error||employeeResult.error){setError("Seu usuário não possui um vínculo ativo.");setLoading(false);return}
    setCtx({member:memberResult.data,employee:employeeResult.data,organization:memberResult.data.organizations});setLoading(false);
  },[]);
  useEffect(()=>{load();const{data}=supabase.auth.onAuthStateChange((_event,session)=>{if(!session){setCtx(null);setLoading(false)}else setTimeout(load,0)});return()=>data.subscription.unsubscribe()},[load]);
  if(loading)return <main className="auth-stage"><RefreshCw className="spin"/></main>;
  if(error)return <main className="auth-stage"><section className="auth-card"><Brand/><ErrorBox message={error}/><Button onClick={()=>supabase.auth.signOut().then(()=>location.reload())}>Voltar ao login</Button></section></main>;
  if(!ctx)return <Login onLogin={load}/>;
  if(ctx.employee.must_change_password)return <ChangePassword employee={ctx.employee} onDone={load}/>;
  if(ctx.member.role!=="platform_admin"&&!licenseActive(ctx.organization))return <LicenseActivation ctx={ctx} onDone={load}/>;
  if(ctx.member.role==="employee")return <main className="auth-stage"><section className="auth-card"><Brand/><div className="auth-copy"><span><ShieldCheck/></span><h1>Use o aplicativo PontoNorte</h1><p>O portal web é reservado ao RH e aos líderes. Instale o aplicativo Android para registrar seus pontos.</p></div><Button onClick={()=>supabase.auth.signOut().then(()=>location.reload())}>Sair</Button></section></main>;
  return <Admin ctx={ctx} onRefresh={load}/>;
}
