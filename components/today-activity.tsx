"use client";
import { useCallback, useEffect, useState } from "react";
import { Clock3, RefreshCw, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
export function TodayActivity({ organizationId, timezone }: { organizationId: string; timezone: string }) {
  const [employees, setEmployees] = useState<any[]>([]), [entries, setEntries] = useState<any[]>([]);
  const [query, setQuery] = useState(""), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const [people, records] = await Promise.all([
      supabase.from("employees").select("id,full_name,username,employee_code").eq("organization_id", organizationId).eq("status", "active").order("full_name"),
      supabase.from("time_entries").select("id,employee_id,event_type,occurred_at,status").eq("organization_id", organizationId).gte("occurred_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()).order("occurred_at", { ascending: false }).limit(2000),
    ]);
    if (people.error || records.error) setError("Não foi possível carregar a equipe. Tente atualizar.");
    else { setEmployees(people.data ?? []); setEntries(records.data ?? []); setError(""); }
    setLoading(false);
  }, [organizationId]);
  useEffect(() => {
    void load();
    const channel = supabase.channel(`today-activity-${organizationId}`).on("postgres_changes", { event: "*", schema: "public", table: "time_entries", filter: `organization_id=eq.${organizationId}` }, () => void load()).on("postgres_changes", { event: "*", schema: "public", table: "employees", filter: `organization_id=eq.${organizationId}` }, () => void load()).subscribe();
    const timer = setInterval(() => void load(), 30000);
    return () => { clearInterval(timer); void supabase.removeChannel(channel); };
  }, [load, organizationId]);
  const date = (value: string | number) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(value));
  const today = date(Date.now()), recent = new Map<string, any>();
  for (const entry of entries) if (date(entry.occurred_at) === today && entry.status !== "rejected" && !recent.has(entry.employee_id)) recent.set(entry.employee_id, entry);
  const filtered = employees.filter(person => `${person.full_name} ${person.username} ${person.employee_code}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
  const labels: Record<string,string> = { entry: "Em expediente", break_start: "Em intervalo", break_end: "Em expediente", exit: "Finalizado" };
  return <section className="today-activity surface"><header><div><span className="eyebrow">ACOMPANHAMENTO</span><h2>Equipe de hoje <small>{employees.length}</small></h2></div><Button variant="ghost" aria-label="Atualizar equipe" onClick={() => { setLoading(true); void load(); }} disabled={loading}><RefreshCw className={loading ? "spin" : ""} /></Button></header>
    <label className="activity-search"><Search /><Input placeholder="Buscar funcionário…" aria-label="Buscar funcionário" value={query} onChange={event => setQuery(event.target.value)} /></label>
    {error ? <p role="alert" className="form-error">{error}</p> : loading ? <p role="status" className="activity-empty">Carregando equipe…</p> : <div className="activity-rows">{filtered.length ? filtered.map(person => {
      const last = recent.get(person.id);
      return <div className="activity-person" key={person.id}><span className="avatar">{person.full_name.split(" ").filter(Boolean).slice(0,2).map((part:string) => part[0]).join("")}</span><div><b>{person.full_name}</b><small>{last ? labels[last.event_type] : "Sem registro hoje"}</small></div><time>{last ? new Intl.DateTimeFormat("pt-BR", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(last.occurred_at)) : "—"}</time><span className={`activity-dot ${last?.event_type === "exit" ? "finished" : last ? "present" : "waiting"}`} aria-hidden="true" /></div>;
    }) : <div className="activity-empty"><Clock3 /><p>{query ? "Nenhum funcionário encontrado." : "Sua equipe aparecerá aqui assim que se cadastrar."}</p></div>}</div>}
  </section>;
}
