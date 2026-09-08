"use client";

import { useState } from "react";
import {
  Bell, Building2, CalendarCheck, Check, ChevronDown, CircleAlert, ClipboardCheck,
  Clock3, Download, FileSpreadsheet, Fingerprint, LayoutDashboard, Menu, MoreHorizontal,
  Plus, QrCode, RadioTower, Search, Settings, ShieldCheck, Smartphone, UserCheck,
  UserPlus, UsersRound, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type Page="Hoje"|"Funcionários"|"Setores e líderes"|"Chamada"|"Jornadas"|"Ocorrências"|"Relatórios"|"Métodos de ponto"|"Empresas"|"Configurações";
const menu:[Page,React.ComponentType<{className?:string}>][]=[
 ["Hoje",LayoutDashboard],["Funcionários",UsersRound],["Setores e líderes",UserCheck],
 ["Chamada",ClipboardCheck],["Jornadas",Clock3],["Ocorrências",CircleAlert],
 ["Relatórios",FileSpreadsheet],["Métodos de ponto",Fingerprint],["Empresas",Building2],["Configurações",Settings]
];
const staff=[
 {name:"Ana Martins",job:"Analista financeiro",sector:"Financeiro",time:"08:01",status:"Presente",color:"green"},
 {name:"Carlos Mendes",job:"Consultor comercial",sector:"Comercial",time:"08:14",status:"Atraso",color:"amber"},
 {name:"João Silva",job:"Suporte técnico",sector:"Suporte",time:"07:56",status:"Presente",color:"green"},
 {name:"Rafaela Lima",job:"Analista de RH",sector:"Administrativo",time:"—",status:"Atestado",color:"blue"},
 {name:"Pedro Freitas",job:"Técnico de implantação",sector:"Implantação",time:"08:03",status:"Presente",color:"green"},
];
const sectors=[
 {name:"Comercial",leader:"Marcos Oliveira",members:12,present:10,absent:1,late:1},
 {name:"Suporte",leader:"João Silva",members:9,present:9,absent:0,late:0},
 {name:"Implantação",leader:"Patrícia Souza",members:8,present:7,absent:1,late:0},
 {name:"Administrativo",leader:"Rafaela Lima",members:6,present:5,absent:1,late:0},
];
function initials(name:string){return name.split(" ").slice(0,2).map(n=>n[0]).join("")}
function Badge({children,color="green"}:{children:React.ReactNode;color?:string}){return <span className={"badge "+color}>{children}</span>}
function Brand(){return <div className="brand"><span><RadioTower/></span><b>Ponto<em>Norte</em><small>CPUSIS</small></b></div>}
function PageHead({title,desc,action}:{title:string;desc:string;action?:React.ReactNode}){return <header className="page-head"><div><h1>{title}</h1><p>{desc}</p></div>{action}</header>}

function Dashboard(){
 return <><PageHead title="Hoje" desc="Terça-feira, 8 de setembro" action={<Button><Download/>Exportar dia</Button>}/>
 <section className="metrics">
  {[["48","Funcionários ativos","3 afastados"],["43","Presentes agora","89,6% da equipe"],["3","Atrasos hoje","Média de 11 min"],["1","Falta sem justificativa","Aguardando análise"]].map((m,i)=><article key={m[1]}><span className={"metric-mark m"+i}/><div><b>{m[0]}</b><p>{m[1]}</p><small>{m[2]}</small></div></article>)}
 </section>
 <section className="dash-grid">
  <article className="surface"><header className="section-head"><div><h2>Movimentação de hoje</h2><p>Últimos registros recebidos</p></div><Button variant="ghost">Ver todos</Button></header><div className="activity-list">{staff.map(p=><div key={p.name}><span className="avatar">{initials(p.name)}</span><p><b>{p.name}</b><small>{p.job}</small></p><span className="sector">{p.sector}</span><time>{p.time}</time><Badge color={p.color}>{p.status}</Badge></div>)}</div></article>
  <article className="surface"><header className="section-head"><div><h2>Setores</h2><p>Presença por equipe</p></div><Button variant="ghost">Gerenciar</Button></header><div className="sector-list">{sectors.map(s=><div key={s.name}><header><p><b>{s.name}</b><small>{s.leader}</small></p><strong>{s.present}/{s.members}</strong></header><div className="track"><i style={{width:(s.present/s.members*100)+"%"}}/></div><footer><span>{s.present} presentes</span>{s.late>0&&<span className="warn">{s.late} atraso</span>}{s.absent>0&&<span className="danger">{s.absent} falta</span>}</footer></div>)}</div></article>
 </section></>
}

function Employees(){const[q,setQ]=useState("");return <><PageHead title="Funcionários" desc="Cadastros, vínculos e situação atual" action={<Button><UserPlus/>Adicionar funcionário</Button>}/><section className="surface table-surface"><div className="table-tools"><label><Search/><Input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar por nome, cargo ou setor"/></label><Button variant="outline"><Download/>Exportar</Button></div><Table><TableHeader><TableRow><TableHead>Funcionário</TableHead><TableHead>Setor</TableHead><TableHead>Jornada</TableHead><TableHead>Entrada hoje</TableHead><TableHead>Situação</TableHead><TableHead/></TableRow></TableHeader><TableBody>{staff.filter(p=>(p.name+p.job+p.sector).toLowerCase().includes(q.toLowerCase())).map(p=><TableRow key={p.name}><TableCell><div className="person-cell"><span className="avatar">{initials(p.name)}</span><p><b>{p.name}</b><small>{p.job}</small></p></div></TableCell><TableCell>{p.sector}</TableCell><TableCell>08:00–18:00</TableCell><TableCell>{p.time}</TableCell><TableCell><Badge color={p.color}>{p.status}</Badge></TableCell><TableCell><MoreHorizontal/></TableCell></TableRow>)}</TableBody></Table></section></>}

function Sectors(){return <><PageHead title="Setores e líderes" desc="Organize as equipes e defina o que cada líder pode acompanhar" action={<Dialog><DialogTrigger asChild><Button><Plus/>Criar setor</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Novo setor</DialogTitle><DialogDescription>Defina o nome e escolha o líder responsável.</DialogDescription></DialogHeader><label className="field">Nome do setor<Input placeholder="Ex.: Estoque"/></label><label className="field">Líder<Input placeholder="Buscar funcionário"/></label><DialogFooter><Button>Criar setor</Button></DialogFooter></DialogContent></Dialog>}/><section className="sector-cards">{sectors.map(s=><article className="surface" key={s.name}><header><span className="sector-icon"><UsersRound/></span><button><MoreHorizontal/></button></header><h2>{s.name}</h2><div className="leader"><span className="avatar">{initials(s.leader)}</span><p><small>Líder do setor</small><b>{s.leader}</b></p></div><dl><div><dt>Funcionários</dt><dd>{s.members}</dd></div><div><dt>Presentes</dt><dd>{s.present}</dd></div><div><dt>Pendências</dt><dd>{s.absent+s.late}</dd></div></dl><Button variant="outline">Abrir equipe</Button></article>)}</section><section className="permission-note"><ShieldCheck/><div><b>Permissões do líder</b><p>O líder visualiza somente os funcionários do próprio setor. Ele pode realizar chamada, conferir faltas e enviar observações ao RH, mas não altera jornadas, salários ou dados de outros setores.</p></div><Button variant="outline">Configurar permissões</Button></section></>}

function RollCall(){const[marks,setMarks]=useState<Record<string,string>>({"Ana Martins":"Presente","Carlos Mendes":"Atraso"});const team=staff.slice(0,4);return <><PageHead title="Chamada do setor" desc="Comercial · Responsável: Marcos Oliveira" action={<Button><Check/>Concluir chamada</Button>}/><section className="call-layout"><article className="surface"><header className="call-head"><div><b>Chamada da manhã</b><p>Iniciada às 08:10 · 4 funcionários</p></div><Badge color="amber">Em andamento</Badge></header><div className="call-list">{team.map(p=><div key={p.name}><span className="avatar">{initials(p.name)}</span><p><b>{p.name}</b><small>{p.job}</small></p><div className="mark-options">{["Presente","Atraso","Ausente"].map(m=><button key={m} className={marks[p.name]===m?m.toLowerCase():""} onClick={()=>setMarks(x=>({...x,[p.name]:m}))}>{m}</button>)}</div></div>)}</div></article><aside className="surface call-summary"><h2>Resumo da chamada</h2><div><span><b>{Object.values(marks).filter(x=>x==="Presente").length}</b> presentes</span><span><b>{Object.values(marks).filter(x=>x==="Atraso").length}</b> atrasos</span><span><b>{Object.values(marks).filter(x=>x==="Ausente").length}</b> ausentes</span><span><b>{team.length-Object.keys(marks).length}</b> não marcados</span></div><label>Observação do líder<textarea placeholder="Escreva uma observação para o RH..."/></label></aside></section></>}

function Methods(){const[enabled,setEnabled]=useState([true,true,true,false]);const data=[[QrCode,"QR Code","O funcionário escaneia o código exibido pela empresa."],[Fingerprint,"Reconhecimento facial","Validação de rosto e prova de vida pelo aplicativo."],[Smartphone,"Botão no aplicativo","Registro direto no celular autorizado."],[Clock3,"Relógio físico","Integração com equipamento biométrico homologado."]] as const;return <><PageHead title="Métodos de ponto" desc="Escolha quais opções estarão disponíveis no aplicativo dos funcionários"/><section className="methods">{data.map(([I,title,desc],i)=><article className="surface" key={title}><header><span><I/></span><Switch checked={enabled[i]} onCheckedChange={v=>setEnabled(a=>a.map((x,j)=>j===i?v:x))}/></header><h2>{title}</h2><p>{desc}</p><footer><Badge color={enabled[i]?"green":"gray"}>{enabled[i]?"Disponível no app":"Desativado"}</Badge><Button variant="ghost">Configurar</Button></footer></article>)}</section><section className="app-banner"><div><Smartphone/><span><b>Aplicativo PontoNorte</b><p>O registro de ponto do funcionário é feito somente pelo aplicativo móvel. O painel web fica reservado para gestão, conferência e relatórios.</p></span></div><a href={`${basePath}/app-ponto`}><Button>Visualizar aplicativo</Button></a></section></>}

function Generic({page}:{page:Page}){const map:Record<string,[string,string]>={
 "Jornadas":["Jornadas de trabalho","Horários, intervalos, tolerâncias e banco de horas"],
 "Ocorrências":["Ocorrências","Faltas, atrasos, ajustes e justificativas"],
 "Relatórios":["Relatórios","Espelho de ponto, banco de horas e fechamento mensal"],
 "Empresas":["Empresas clientes","Controle das contas atendidas pela CPUSIS"],
 "Configurações":["Configurações","Dados da empresa, regras gerais e permissões"]
};const[t,d]=map[page];return <><PageHead title={t} desc={d} action={<Button><Plus/>Novo registro</Button>}/><section className="surface empty-state"><CalendarCheck/><h2>{t}</h2><p>Use os filtros e as ações acima para administrar este módulo.</p><Button variant="outline">Ver registros</Button></section></>}

export default function Home(){const[page,setPage]=useState<Page>("Hoje");const[drawer,setDrawer]=useState(false);return <main className="admin-shell"><aside className={"side "+(drawer?"open":"")}><header><Brand/><button onClick={()=>setDrawer(false)}><X/></button></header><button className="company-switch"><span>CP</span><p><b>CPUSIS</b><small>Conta demonstração</small></p><ChevronDown/></button><nav>{menu.map(([name,I])=><button className={page===name?"active":""} key={name} onClick={()=>{setPage(name);setDrawer(false)}}><I/><span>{name}</span>{name==="Ocorrências"&&<b>2</b>}</button>)}</nav><footer><span className="avatar">VS</span><p><b>Victor Souza</b><small>Administrador</small></p><MoreHorizontal/></footer></aside>{drawer&&<button className="scrim" onClick={()=>setDrawer(false)}/>}<section className="admin-main"><header className="appbar"><div><button className="menu-button" onClick={()=>setDrawer(true)}><Menu/></button><span><b>CPUSIS</b><small>Gestão de ponto</small></span></div><aside><a href={`${basePath}/app-ponto`}><Button variant="outline"><Smartphone/>Abrir aplicativo</Button></a><button className="notify"><Bell/><i/></button></aside></header><div className="admin-content">{page==="Hoje"&&<Dashboard/>}{page==="Funcionários"&&<Employees/>}{page==="Setores e líderes"&&<Sectors/>}{page==="Chamada"&&<RollCall/>}{page==="Métodos de ponto"&&<Methods/>}{!["Hoje","Funcionários","Setores e líderes","Chamada","Métodos de ponto"].includes(page)&&<Generic page={page}/>}</div></section></main>}
