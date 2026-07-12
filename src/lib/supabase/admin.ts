import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseEnv } from "@/lib/supabase/server";

export function getSupabaseAdminEnv() {
  const { url } = getSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  return { url, serviceRoleKey };
}

export function hasSupabaseAdminEnv() {
  const { url, serviceRoleKey } = getSupabaseAdminEnv();
  return Boolean(url && serviceRoleKey);
}

export function createSupabaseAdminClient(): SupabaseClient | null {
  const { url, serviceRoleKey } = getSupabaseAdminEnv();

  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
