"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.email("Ingresa un correo valido."),
  password: z.string().min(6, "La contrasena debe tener al menos 6 caracteres."),
});

export type LoginActionState = {
  success: boolean;
  message?: string;
  fieldErrors?: {
    email?: string[];
    password?: string[];
  };
};

export async function loginAction(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  if (!hasSupabaseEnv()) {
    return {
      success: false,
      message:
        "Faltan las variables de Supabase. Completa NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local.",
    };
  }

  const payload = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!payload.success) {
    return {
      success: false,
      message: "Revisa los campos obligatorios.",
      fieldErrors: payload.error.flatten().fieldErrors,
    };
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return {
      success: false,
      message:
        "No se pudo inicializar la conexion con Supabase. Revisa las variables de entorno.",
    };
  }

  const { data, error } = await supabase.auth.signInWithPassword(payload.data);

  if (error || !data.user) {
    return {
      success: false,
      message:
        "No pudimos iniciar sesion. Verifica tu correo, tu contrasena y el estado de tu usuario en Supabase Auth.",
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, is_active")
    .eq("id", data.user.id)
    .maybeSingle<{ id: string; is_active: boolean }>();

  if (profileError || !profile) {
    await supabase.auth.signOut({ scope: "local" });

    return {
      success: false,
      message:
        "La sesion se creo, pero no existe un perfil valido en la tabla profiles. Ejecuta SUPABASE_SCHEMA.sql y crea el perfil del usuario.",
    };
  }

  if (!profile.is_active) {
    await supabase.auth.signOut({ scope: "local" });

    return {
      success: false,
      message:
        "Tu usuario esta inactivo. Solicita a un administrador que reactive tu perfil.",
    };
  }

  redirect("/");
}

export async function logoutAction() {
  if (hasSupabaseEnv()) {
    const supabase = await createSupabaseServerClient();
    await supabase?.auth.signOut({ scope: "local" });
  }

  redirect("/login");
}
