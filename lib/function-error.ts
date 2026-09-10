import { FunctionsHttpError } from "@supabase/supabase-js";

export async function functionErrorMessage(error: unknown, fallback = "Não foi possível concluir esta operação.") {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      return body?.error || body?.message || fallback;
    } catch { return fallback; }
  }
  return error instanceof Error && error.message !== "Edge Function returned a non-2xx status code" ? error.message : fallback;
}
