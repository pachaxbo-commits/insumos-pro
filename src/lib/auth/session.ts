import { cache } from "react";
import { redirect } from "next/navigation";

import { canAccessPath } from "@/lib/auth/roles";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";
import type { AuthUser, Profile, SessionUser } from "@/types/auth";

type AuthContext =
  | { status: "missing_env" }
  | { status: "unauthenticated" }
  | { status: "profile_error"; authUser: AuthUser; message: string }
  | { status: "missing_profile"; authUser: AuthUser }
  | { status: "inactive"; user: SessionUser; profile: Profile }
  | { status: "authenticated"; user: SessionUser; profile: Profile };

function buildSessionUser(authUser: AuthUser, profile: Profile | null): SessionUser {
  return {
    id: authUser.id,
    email: authUser.email ?? null,
    fullName: profile?.full_name ?? null,
    role: profile?.role ?? null,
    isActive: profile?.is_active ?? false,
  };
}

export const getAuthContext = cache(async (): Promise<AuthContext> => {
  if (!hasSupabaseEnv()) {
    return { status: "missing_env" };
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return { status: "missing_env" };
  }

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData) {
    return { status: "unauthenticated" };
  }

  const authUser: AuthUser = {
    id: String(claimsData.claims.sub),
    email:
      typeof claimsData.claims.email === "string" ? claimsData.claims.email : null,
  };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active, created_at, updated_at")
    .eq("id", authUser.id)
    .maybeSingle<Profile>();

  if (profileError) {
    return {
      status: "profile_error",
      authUser,
      message: profileError.message,
    };
  }

  if (!profile) {
    return { status: "missing_profile", authUser };
  }

  const user = buildSessionUser(authUser, profile);

  if (!profile.is_active) {
    return { status: "inactive", user, profile };
  }

  return { status: "authenticated", user, profile };
});

export async function requireAuthenticatedUser() {
  const auth = await getAuthContext();

  if (auth.status === "missing_env") {
    redirect("/login?reason=missing-env");
  }

  if (auth.status === "unauthenticated") {
    redirect("/login");
  }

  if (auth.status === "missing_profile") {
    redirect("/acceso-restringido?reason=missing-profile");
  }

  if (auth.status === "profile_error") {
    redirect("/acceso-restringido?reason=profile-error");
  }

  if (auth.status === "inactive") {
    redirect("/acceso-restringido?reason=inactive");
  }

  return auth;
}

export async function requireRoleAccess(pathname: string) {
  const auth = await requireAuthenticatedUser();

  if (!canAccessPath(auth.user.role, pathname)) {
    redirect(`/acceso-restringido?reason=role&from=${encodeURIComponent(pathname)}`);
  }

  return auth;
}

export function getUserDisplayName(user: SessionUser) {
  return user.fullName?.trim() || user.email || "Usuario";
}
