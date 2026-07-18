"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { USER_ROLES, type Profile, type UserRole } from "@/types/auth";

type ActionState = {
  success: boolean;
  message?: string;
};

type AdminAccess = {
  actor: Awaited<ReturnType<typeof requireAuthenticatedUser>>["user"];
  adminClient: NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
};

const roleSchema = z.enum(USER_ROLES);

const createUserSchema = z.object({
  email: z.string().email("Ingresa un email valido."),
  full_name: z.string().trim().min(2, "Ingresa el nombre del usuario."),
  role: roleSchema,
});

const updateUserSchema = z.object({
  id: z.string().uuid("Usuario invalido."),
  full_name: z.string().trim().min(2, "Ingresa el nombre del usuario."),
  role: roleSchema,
  is_active: z.enum(["true", "false"]).transform((value) => value === "true"),
});

const resetAccessSchema = z.object({
  id: z.string().uuid("Usuario invalido."),
});

async function getPasswordResetRedirectUrl() {
  const requestHeaders = await headers();
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const origin = configured?.replace(/\/$/, "") ?? (host ? `${protocol}://${host}` : "http://localhost:3000");

  return `${origin}/mi-cuenta/auth/callback?next=/mi-cuenta/restablecer`;
}

async function assertAdminAccess(): Promise<AdminAccess> {
  const auth = await requireAuthenticatedUser();

  if (auth.user.role !== "administrador") {
    throw new Error("Solo un administrador puede gestionar usuarios.");
  }

  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor. Configurala solo como variable privada.",
    );
  }

  return { actor: auth.user, adminClient };
}

async function getProfile(adminClient: AdminAccess["adminClient"], id: string) {
  const { data, error } = await adminClient
    .from("profiles")
    .select("id, full_name, role, is_active, created_at, updated_at")
    .eq("id", id)
    .maybeSingle<Profile>();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Perfil no encontrado.");

  return data;
}

async function ensureAdminSafety({
  adminClient,
  actorId,
  current,
  nextRole,
  nextIsActive,
}: {
  adminClient: AdminAccess["adminClient"];
  actorId: string;
  current: Profile;
  nextRole: UserRole;
  nextIsActive: boolean;
}) {
  if (current.id === actorId && current.role !== nextRole) {
    throw new Error("No puedes cambiar tu propio rol.");
  }

  if (current.id === actorId && !nextIsActive) {
    throw new Error("No puedes desactivar tu propio usuario.");
  }

  const wouldRemoveActiveAdmin =
    current.role === "administrador" &&
    current.is_active &&
    (nextRole !== "administrador" || !nextIsActive);

  if (!wouldRemoveActiveAdmin) return;

  const { count, error } = await adminClient
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "administrador")
    .eq("is_active", true)
    .neq("id", current.id);

  if (error) throw new Error(error.message);
  if (!count) {
    throw new Error("No se puede dejar el sistema sin al menos un administrador activo.");
  }
}

async function updateProfileWithRpc(
  id: string,
  fullName: string,
  role: UserRole,
  isActive: boolean,
) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Faltan variables publicas de Supabase.");

  const { error } = await supabase.rpc("admin_update_profile", {
    p_profile_id: id,
    p_full_name: fullName,
    p_role: role,
    p_is_active: isActive,
  });

  if (error) throw new Error(error.message);
  return supabase;
}

export async function createUserAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { actor, adminClient } = await assertAdminAccess();
    const parsed = createUserSchema.parse(Object.fromEntries(formData));

    const { data, error } = await adminClient.auth.admin.createUser({
      email: parsed.email,
      email_confirm: true,
      user_metadata: { full_name: parsed.full_name },
    });

    if (error) throw new Error(error.message);
    if (!data.user) throw new Error("Supabase no devolvio el usuario creado.");

    const { error: profileError } = await adminClient.from("profiles").insert({
      id: data.user.id,
      full_name: parsed.full_name,
      role: parsed.role,
      is_active: true,
    });

    if (profileError) {
      await adminClient.auth.admin.deleteUser(data.user.id);
      throw new Error(`No se pudo crear el perfil interno: ${profileError.message}`);
    }

    const { error: resetError } = await adminClient.auth.resetPasswordForEmail(
      parsed.email,
      { redirectTo: await getPasswordResetRedirectUrl() },
    );

    if (resetError) {
      await adminClient.auth.admin.deleteUser(data.user.id);
      throw new Error("No se pudo enviar el enlace de acceso. No se creo el usuario.");
    }

    const supabase = await createSupabaseServerClient();
    if (!supabase) throw new Error("Faltan variables publicas de Supabase.");

    await writeAuditLog({
      supabase,
      userId: actor.id,
      action: "create_user",
      entityType: "user",
      entityId: data.user.id,
      metadata: {
        email: parsed.email,
        role: parsed.role,
        is_active: true,
      },
    });

    revalidatePath("/configuracion");
    return {
      success: true,
      message: "Usuario creado. Se envio un enlace para que defina su contrasena.",
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo crear el usuario.",
    };
  }
}

export async function updateUserAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { actor, adminClient } = await assertAdminAccess();
    const parsed = updateUserSchema.parse(Object.fromEntries(formData));
    const current = await getProfile(adminClient, parsed.id);

    await ensureAdminSafety({
      adminClient,
      actorId: actor.id,
      current,
      nextRole: parsed.role,
      nextIsActive: parsed.is_active,
    });

    const supabase = await updateProfileWithRpc(
      parsed.id,
      parsed.full_name,
      parsed.role,
      parsed.is_active,
    );

    const action =
      current.role !== parsed.role
        ? "change_user_role"
        : current.is_active !== parsed.is_active && parsed.is_active
          ? "activate_user"
          : current.is_active !== parsed.is_active
            ? "deactivate_user"
            : "update_user";

    await writeAuditLog({
      supabase,
      userId: actor.id,
      action,
      entityType: "user",
      entityId: parsed.id,
      metadata: {
        previous_role: current.role,
        next_role: parsed.role,
        previous_is_active: current.is_active,
        next_is_active: parsed.is_active,
      },
    });

    revalidatePath("/configuracion");
    return { success: true, message: "Usuario actualizado correctamente." };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo actualizar el usuario.",
    };
  }
}

export async function resetUserAccessAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { actor, adminClient } = await assertAdminAccess();
    const parsed = resetAccessSchema.parse(Object.fromEntries(formData));

    const {
      data: { user },
      error,
    } = await adminClient.auth.admin.getUserById(parsed.id);

    if (error) throw new Error(error.message);
    if (!user?.email) throw new Error("El usuario no tiene email en Supabase Auth.");

    const supabase = await createSupabaseServerClient();
    if (!supabase) throw new Error("Faltan variables publicas de Supabase.");

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: await getPasswordResetRedirectUrl(),
    });
    if (resetError) throw new Error(resetError.message);

    await writeAuditLog({
      supabase,
      userId: actor.id,
      action: "reset_user_access",
      entityType: "user",
      entityId: parsed.id,
      metadata: { email: user.email },
    });

    revalidatePath("/configuracion");
    return {
      success: true,
      message: "Se solicito el restablecimiento de acceso para el usuario.",
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "No se pudo restablecer el acceso del usuario.",
    };
  }
}
