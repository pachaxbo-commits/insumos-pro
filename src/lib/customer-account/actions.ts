"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CustomerAuthActionState } from "@/types/customer-account";

const credentialsSchema = z.object({
  email: z.email("Ingresa un correo valido.").trim().toLowerCase(),
  password: z
    .string()
    .min(8, "La contrasena debe tener al menos 8 caracteres.")
    .max(72, "La contrasena es demasiado larga."),
});

const recoverySchema = z.object({
  email: z.email("Ingresa un correo valido.").trim().toLowerCase(),
});

const passwordSchema = z
  .object({
    password: credentialsSchema.shape.password,
    password_confirmation: z.string(),
  })
  .refine((value) => value.password === value.password_confirmation, {
    path: ["password_confirmation"],
    message: "Las contrasenas no coinciden.",
  });

const accountSchema = z
  .object({
    full_name: z.string().trim().min(2, "Ingresa tu nombre.").max(120),
    phone: z.string().trim().max(25),
    default_delivery_type: z.enum(["delivery", "recojo"]),
    default_address: z.string().trim().max(300),
    default_delivery_time_window: z.string().trim().max(100),
    default_payment_method: z.enum(["efectivo", "qr", "mixto"]),
  })
  .superRefine((value, context) => {
    if (value.phone && !/^\+?[0-9\s-]{7,25}$/.test(value.phone)) {
      context.addIssue({ code: "custom", path: ["phone"], message: "Celular invalido." });
    }
  });

async function getSiteOrigin() {
  const requestHeaders = await headers();
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  return host ? `${protocol}://${host}` : "http://localhost:3000";
}

export async function customerLoginAction(
  _state: CustomerAuthActionState,
  formData: FormData,
): Promise<CustomerAuthActionState> {
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { success: false, message: "El acceso no esta configurado." };

  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    return { success: false, message: "Correo o contrasena incorrectos." };
  }

  const { data: account } = await supabase
    .from("customer_accounts")
    .select("id, is_active")
    .eq("id", data.user.id)
    .maybeSingle<{ id: string; is_active: boolean }>();

  if (!account?.is_active) {
    await supabase.auth.signOut({ scope: "local" });
    return {
      success: false,
      message: "Esta cuenta no esta habilitada como cuenta de cliente.",
    };
  }

  redirect("/mi-cuenta");
}

export async function customerLogoutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase?.auth.signOut({ scope: "local" });
  redirect("/mi-cuenta");
}

export async function requestCustomerPasswordResetAction(
  _state: CustomerAuthActionState,
  formData: FormData,
): Promise<CustomerAuthActionState> {
  const parsed = recoverySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { success: false, message: "El acceso no esta configurado." };

  const origin = await getSiteOrigin();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/mi-cuenta/auth/callback?next=/mi-cuenta/restablecer`,
  });

  return {
    success: true,
    message: "Si el correo pertenece a una cuenta, recibiras un enlace de recuperacion.",
  };
}

export async function updateCustomerPasswordAction(
  _state: CustomerAuthActionState,
  formData: FormData,
): Promise<CustomerAuthActionState> {
  const parsed = passwordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { success: false, message: "El acceso no esta configurado." };

  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) {
    return { success: false, message: "El enlace vencio. Solicita uno nuevo." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { success: false, message: "No pudimos actualizar la contrasena." };

  await supabase.auth.signOut({ scope: "local" });
  redirect("/login?reason=password-updated");
}

export async function updateCustomerAccountAction(
  _state: CustomerAuthActionState,
  formData: FormData,
): Promise<CustomerAuthActionState> {
  const parsed = accountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { success: false, message: "El acceso no esta configurado." };

  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { success: false, message: "Inicia sesion nuevamente." };

  const { error } = await supabase.rpc("update_own_customer_account", {
    p_full_name: parsed.data.full_name,
    p_phone: parsed.data.phone || null,
    p_default_delivery_type: parsed.data.default_delivery_type,
    p_default_address: parsed.data.default_address || null,
    p_default_delivery_time_window: parsed.data.default_delivery_time_window || null,
    p_default_payment_method: parsed.data.default_payment_method,
  });

  if (error) return { success: false, message: "No pudimos guardar tus datos." };

  revalidatePath("/mi-cuenta");
  revalidatePath("/catalogo/checkout");
  return { success: true, message: "Datos actualizados correctamente." };
}
