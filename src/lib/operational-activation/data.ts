import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OperationalActivationSummary } from "@/types/operational-activation";

export async function getOperationalActivationSummary(): Promise<OperationalActivationSummary> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("No se pudo cargar la activación operativa.");
  const { data, error } = await supabase.rpc("get_qb_operational_activation_summary");
  if (error || !data || typeof data !== "object" || "error" in data) throw new Error("No se pudo cargar la activación operativa.");
  return data as unknown as OperationalActivationSummary;
}
