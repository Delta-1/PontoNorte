export const clean = (value: unknown) => String(value ?? "").trim();
export const usernameFor = (value: unknown) => clean(value).toLowerCase();
const encoder = new TextEncoder();
export async function digest(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)))).map(byte => byte.toString(16).padStart(2, "0")).join("");
}
export async function signLink(secret: string, organizationId: string, scope: string, version: string) {
  const payload = `${organizationId}.${scope}.${version}`;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)))).map(byte => byte.toString(16).padStart(2, "0")).join("");
  return `${payload}.${signature}`;
}
export async function verifyLink(secret: string, token: string) {
  const parts = token.split(".");
  if (parts.length !== 4 || !/^[a-f0-9-]{36}$/.test(parts[0]) || !["join", "totem"].includes(parts[1]) || !/^[a-f0-9-]{36}$/.test(parts[2]) || !/^[a-f0-9]{64}$/.test(parts[3])) return null;
  const expected = await signLink(secret, parts[0], parts[1], parts[2]);
  let difference = expected.length ^ token.length;
  for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ token.charCodeAt(index);
  return difference === 0 ? { organizationId: parts[0], scope: parts[1], version: parts[2] } : null;
}
export function canManageLinks(memberships: { organization_id: string; role: string }[], org: string) {
  return memberships.some(member => member.role === "platform_admin" || member.organization_id === org && ["company_owner", "hr_admin"].includes(member.role));
}
export function validateRegistration(body: Record<string, unknown>) {
  if (clean(body.full_name).length < 3 || clean(body.full_name).length > 160) return "Informe seu nome completo.";
  if (!/^[a-z0-9._-]{3,40}$/.test(usernameFor(body.username))) return "Use um usuário de 3 a 40 letras, números, ponto, hífen ou sublinhado.";
  if (clean(body.phone).replace(/\D/g, "").length < 10 || clean(body.phone).length > 30) return "Informe seu telefone com DDD.";
  if (String(body.password ?? "").length < 8 || String(body.password).length > 128) return "Use uma senha de 8 a 128 caracteres.";
  if (!/^[a-f0-9-]{36}$/.test(clean(body.device_uuid))) return "Não foi possível identificar este aparelho. Reabra o link.";
  return null;
}
