"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Eye, EyeOff, Link2, Monitor, RefreshCw, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { employeeLoginEmail, supabase } from "@/lib/supabase";
import { functionErrorMessage } from "@/lib/function-error";

const unavailable = "Os links ainda precisam ser ativados no banco do Ponto Norte. O cadastro manual continua disponível em Funcionários.";
async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("team-access", { body });
  if (error) {
    if ((error as any).context?.status === 404) throw new Error(["links", "enable", "revoke"].includes(String(body.action)) ? unavailable : "Este acesso ainda não foi ativado. Fale com o responsável pela empresa.");
    throw new Error(await functionErrorMessage(error, "Não foi possível acessar os links. Tente novamente."));
  }
  return data;
}
export function webDeviceId() {
  let value = localStorage.getItem("pontonorte_web_device_id");
  if (!value) { value = crypto.randomUUID(); localStorage.setItem("pontonorte_web_device_id", value); }
  return value;
}
function shareUrl(kind: "cadastro" | "totem", token: string) {
  const url = new URL(location.pathname, location.origin);
  url.hash = `${kind}=${token}`;
  return url.href;
}
export function TeamAccessPanel({ organizationId, demo = false }: { organizationId?: string; demo?: boolean }) {
  const [links, setLinks] = useState<{ join_token: string | null; totem_token: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [manual, setManual] = useState("");
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async (action: "links" | "enable" | "revoke" = "links") => {
    if (demo) return;
    setBusy(true); setError(""); setManual("");
    try { setLinks(await invoke({ action, organization_id: organizationId })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : unavailable); }
    finally { setBusy(false); setLoaded(true); }
  }, [organizationId, demo]);
  useEffect(() => { if (!demo) void load(); }, [load, demo]);
  async function copy(kind: "cadastro" | "totem") {
    const token = kind === "cadastro" ? links?.join_token : links?.totem_token;
    if (!token) return;
    const value = shareUrl(kind, token);
    try { await navigator.clipboard.writeText(value); setCopied(kind); setTimeout(() => setCopied(""), 2500); }
    catch { setManual(value); }
  }
  return <section className="team-access" aria-label="Começar a usar">
    <header><div><span className="eyebrow">COMECE POR AQUI</span><h2>Sua equipe, conectada.</h2></div><Link2 aria-hidden="true" /></header>
    <div className="access-options">
      <article><span className="access-icon"><UserPlus /></span><div><h3>Convidar funcionários</h3><p>Compartilhe o link. Cada pessoa cria sua conta e já pode usar o ponto.</p></div><Button disabled={busy || demo || !links?.join_token} onClick={() => copy("cadastro")}>{copied === "cadastro" ? <Check /> : <Copy />}{copied === "cadastro" ? "Link copiado" : "Copiar link de cadastro"}</Button></article>
      <article><span className="access-icon"><Monitor /></span><div><h3>Abrir totem</h3><p>Abra no computador ou tablet da empresa. A equipe bate o ponto ali.</p></div><div className="access-buttons"><Button disabled={busy || demo || !links?.totem_token} onClick={() => { if (links?.totem_token) window.open(shareUrl("totem", links.totem_token), "_blank", "noopener,noreferrer"); }}><ExternalLink />Abrir totem</Button><Button variant="outline" aria-label="Copiar link do totem" title="Copiar link do totem" disabled={busy || demo || !links?.totem_token} onClick={() => copy("totem")}>{copied === "totem" ? <Check /> : <Copy />}</Button></div></article>
    </div>
    {demo ? <p className="access-note">Prévia do novo fluxo. Os links reais ficam disponíveis na conta da empresa após a ativação do serviço.</p> : <footer className="access-footer">
      {links && !links.join_token ? <Button disabled={busy} onClick={() => load("enable")}>{busy ? <RefreshCw className="spin" /> : <Link2 />}Ativar links da empresa</Button> : null}
      {links?.join_token ? <details><summary>Gerenciar link de cadastro</summary><p>Quem recebe o link pode criar uma conta de funcionário. Envie apenas para sua equipe. O aparelho usado no cadastro será autorizado. O totem fica vinculado ao primeiro aparelho que registrar um ponto.</p><Button variant="outline" disabled={busy} onClick={() => load("enable")}>Gerar novo link</Button><Button variant="outline" disabled={busy} onClick={() => load("revoke")}>Desativar cadastro pelo link</Button></details> : null}
      {!loaded ? <p role="status">Carregando seus links…</p> : null}
      {error ? <div role="alert" className="form-error">{error}<button onClick={() => load()} type="button">Tentar novamente</button></div> : null}
      {manual ? <label>Copie este link<Input readOnly value={manual} onFocus={event => event.target.select()} /></label> : null}
    </footer>}
  </section>;
}
function AccessPassword({ value, onChange, autoComplete = "current-password", minLength }: { value: string; onChange: (value: string) => void; autoComplete?: string; minLength?: number }) {
  const [show, setShow] = useState(false);
  return <label>Senha<span className="password-control"><Input required type={show ? "text" : "password"} value={value} minLength={minLength} maxLength={128} onChange={event => onChange(event.target.value)} autoComplete={autoComplete} /><button type="button" onClick={() => setShow(!show)} aria-label={show ? "Ocultar senha" : "Mostrar senha"}>{show ? <EyeOff /> : <Eye />}</button></span></label>;
}
export function PublicTeamAccess({ mode, token, onDone }: { mode: "cadastro" | "totem"; token: string; onDone: () => void }) {
  const [info, setInfo] = useState<{ name: string; company_code: string; scope: string } | null>(null);
  const [infoError, setInfoError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<any>(null);
  const [visibleTime, setVisibleTime] = useState("");
  const [form, setForm] = useState({ full_name: "", phone: "", username: "", password: "" });
  const pendingEvent = useRef<string | null>(null);
  const guard = useRef(false);
  useEffect(() => {
    let active = true;
    setInfo(null); setInfoError("");
    invoke({ action: "info", token }).then(value => {
      if (!active) return;
      if (value.scope !== (mode === "cadastro" ? "join" : "totem")) setInfoError("Este link não corresponde a esta tela.");
      else setInfo(value);
    }).catch(reason => { if (active) setInfoError(reason.message); });
    return () => { active = false; };
  }, [token, mode]);
  useEffect(() => {
    if (mode !== "totem") return;
    const tick = () => setVisibleTime(new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date()));
    tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer);
  }, [mode]);
  useEffect(() => {
    if (!success || mode !== "totem") return;
    const timer = setTimeout(() => { setSuccess(null); setError(""); pendingEvent.current = null; }, 5000);
    return () => clearTimeout(timer);
  }, [success, mode]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (guard.current || !info) return;
    guard.current = true; setBusy(true); setError("");
    try {
      pendingEvent.current ??= crypto.randomUUID();
      const result = await invoke({ action: mode === "cadastro" ? "register" : "record", token, ...form, device_uuid: webDeviceId(), client_event_id: pendingEvent.current });
      setSuccess(result);
      if (mode === "totem") { setForm({ full_name: "", phone: "", username: "", password: "" }); pendingEvent.current = null; }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível concluir agora."); }
    finally { setBusy(false); guard.current = false; }
  }
  async function enter() {
    if (!success || guard.current) return;
    guard.current = true; setBusy(true); setError("");
    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email: employeeLoginEmail(success.company_code, success.username), password: form.password });
      if (loginError) throw new Error("Sua conta foi criada. Entre pelo link de acesso da empresa com o usuário e a senha escolhidos.");
      localStorage.setItem("pontonorte_login_hint", JSON.stringify({ company: success.company_code, username: success.username }));
      history.replaceState(null, "", `${location.pathname}?empresa=${encodeURIComponent(success.company_code)}`); onDone();
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); guard.current = false; }
  }
  return <main className={`auth-stage public-access ${mode === "totem" ? "totem-stage" : ""}`}><section className="auth-card public-access-card">
    <div className="public-brand"><span><Monitor /></span><b>PontoNorte</b></div>
    {mode === "totem" ? <div className="totem-time" aria-label="Hora atual">{visibleTime || "—"}</div> : null}
    <div className="auth-copy"><h1>{mode === "cadastro" ? success ? "Sua conta está pronta" : "Entre para a equipe" : "Bater ponto"}</h1><p>{info?.name || (infoError ? "Acesso indisponível" : "Conferindo seu link…")}</p></div>
    {infoError ? <p role="alert" className="form-error">{infoError}</p> : null}
    {info && success ? <div className="access-success" role="status"><Check /><h2>{mode === "cadastro" ? "Tudo certo!" : "Ponto registrado"}</h2><p>{mode === "cadastro" ? `Seu usuário: ${success.username}` : `${({ entry: "Entrada", break_start: "Início do intervalo", break_end: "Fim do intervalo", exit: "Saída" } as Record<string,string>)[success.entry.event_type]} · ${new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(success.entry.occurred_at))}`}</p>{mode === "cadastro" ? <Button onClick={enter} disabled={busy}>{busy ? "Entrando…" : "Entrar e usar o ponto"}</Button> : <Button variant="outline" onClick={() => setSuccess(null)}>Próxima pessoa</Button>}</div> : info ? <form onSubmit={submit} autoComplete={mode === "totem" ? "off" : "on"}>
      {mode === "cadastro" ? <><label>Nome completo<Input required autoComplete="name" minLength={3} maxLength={160} value={form.full_name} onChange={event => setForm({ ...form, full_name: event.target.value })} /></label><label>Telefone com DDD<Input required type="tel" autoComplete="tel" minLength={10} maxLength={30} value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} /></label></> : null}
      <label>Usuário<Input required minLength={3} maxLength={40} autoCapitalize="none" autoComplete={mode === "totem" ? "off" : "username"} value={form.username} onChange={event => { pendingEvent.current = null; setForm({ ...form, username: event.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "") }); }} /></label>
      <AccessPassword value={form.password} onChange={password => setForm({ ...form, password })} autoComplete={mode === "cadastro" ? "new-password" : "off"} minLength={mode === "cadastro" ? 8 : undefined} />
      {mode === "cadastro" ? <small>Use pelo menos 8 caracteres. A empresa já está vinculada pelo link.</small> : <small>A próxima marcação é identificada automaticamente.</small>}
      <Button disabled={busy}>{busy ? <RefreshCw className="spin" /> : mode === "cadastro" ? <UserPlus /> : <Check />}{busy ? "Aguarde…" : mode === "cadastro" ? "Criar minha conta" : "Registrar ponto"}</Button>
    </form> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {mode === "cadastro" && info ? <a className="access-login" href={`${location.pathname}?empresa=${encodeURIComponent(info.company_code)}`}>Já tenho conta · Entrar</a> : null}
    <small className="public-footnote">{mode === "totem" ? "Totem da empresa · seus dados são apagados da tela após registrar." : "Cadastro vinculado à sua empresa."}</small>
  </section></main>;
}
