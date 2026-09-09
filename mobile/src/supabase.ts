import { createClient } from "@supabase/supabase-js";
export const supabase = createClient(
  "https://eqjgumevweiswqhogvgk.supabase.co",
  "sb_publishable_EoKvIcC28dhj7QwYpI6QIQ_JX0K0pU3",
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } },
);
export function loginEmail(companyCode:string,username:string){
  const company=companyCode.toUpperCase().replace(/[^A-Z0-9]/g,"");
  const user=username.toLowerCase().trim().replace(/[^a-z0-9._-]/g,"");
  return `${user}.${company}@login.pontonorte.app`;
}
