import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://eqjgumevweiswqhogvgk.supabase.co";
const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_EoKvIcC28dhj7QwYpI6QIQ_JX0K0pU3";

export const supabase = createClient(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export function employeeLoginEmail(companyCode: string, username: string) {
  const company = companyCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const user = username.toLowerCase().trim().replace(/[^a-z0-9._-]/g, "");
  return `${user}.${company}@login.pontonorte.app`;
}
