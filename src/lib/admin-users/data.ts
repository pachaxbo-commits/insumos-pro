import { unstable_noStore as noStore } from "next/cache";

import { requireAuthenticatedUser } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AdminUser, Profile } from "@/types/auth";

export type AdminUsersData = {
  users: AdminUser[];
  error?: string;
  serviceRoleConfigured: boolean;
};

export async function getAdminUsersData(): Promise<AdminUsersData> {
  noStore();

  const auth = await requireAuthenticatedUser();
  if (auth.user.role !== "administrador") {
    return {
      users: [],
      serviceRoleConfigured: false,
      error: "No tienes permisos para administrar usuarios.",
    };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      users: [],
      serviceRoleConfigured: false,
      error: "Faltan variables publicas de Supabase.",
    };
  }

  const { data: profilesData, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (profilesError) {
    return {
      users: [],
      serviceRoleConfigured: false,
      error: `No se pudieron leer perfiles: ${profilesError.message}`,
    };
  }

  const profiles = (profilesData ?? []) as Profile[];
  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    return {
      users: profiles.map((profile) => ({
        ...profile,
        email: null,
        auth_created_at: null,
        last_sign_in_at: null,
      })),
      serviceRoleConfigured: false,
      error:
        "Falta SUPABASE_SERVICE_ROLE_KEY en el entorno del servidor. La lista muestra perfiles, pero no puede administrar Auth.",
    };
  }

  const { data: authUsersData, error: authUsersError } =
    await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });

  if (authUsersError) {
    return {
      users: [],
      serviceRoleConfigured: true,
      error: `No se pudieron leer usuarios Auth: ${authUsersError.message}`,
    };
  }

  const authUsersById = new Map(
    authUsersData.users.map((user) => [
      user.id,
      {
        email: user.email ?? null,
        auth_created_at: user.created_at ?? null,
        last_sign_in_at: user.last_sign_in_at ?? null,
      },
    ]),
  );

  return {
    serviceRoleConfigured: true,
    users: profiles.map((profile) => ({
      ...profile,
      email: authUsersById.get(profile.id)?.email ?? null,
      auth_created_at: authUsersById.get(profile.id)?.auth_created_at ?? null,
      last_sign_in_at: authUsersById.get(profile.id)?.last_sign_in_at ?? null,
    })),
  };
}
