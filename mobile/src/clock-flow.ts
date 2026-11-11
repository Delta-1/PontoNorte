export const events = ["entry", "break_start", "break_end", "exit"] as const;
export const actionLabels: Record<string,string> = { entry: "Registrar entrada", break_start: "Sair para o intervalo", break_end: "Voltar do intervalo", exit: "Registrar saída" };
export function preferredMethod(methods: {method:string;enabled:boolean}[]) {
  return ["mobile", "qr_code"].map(name => methods.find(method => method.method === name && method.enabled)).find(Boolean)?.method as "mobile"|"qr_code"|undefined;
}
export function nextClockEvent(entries: {event_type:string;status?:string}[]) {
  // Follow the sequence used by clock-event, which counts every saved event.
  return entries.length >= events.length ? null : events[entries.length];
}
