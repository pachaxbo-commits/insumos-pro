"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  completeOwnCustomerAccount,
  registrationMetadata,
} from "@/lib/customer-registration/account";
import {
  customerRegistrationSchema,
  getSafeCustomerReturnPath,
} from "@/lib/customer-registration/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CustomerRegistrationActionState = {
  success: boolean;
  message?: string;
  confirmationRequired?: boolean;
  fieldErrors?: Record<string, string[] | undefined>;
};

async function isSameOriginRequest() {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const host =
    requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    requestHeaders.get("host");

  if (!origin || !host) return process.env.NODE_ENV !== "production";

  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

async function getSiteOrigin() {
  const requestHeaders = await headers();
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  const host =
    requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    requestHeaders.get("host");
  const protocol =
    requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "http";
  return host ? `${protocol}://${host}` : "http://localhost:3000";
}

function registrationMessage(code: string) {
  if (code === "internal_user") {
    return "Este correo pertenece a un acceso interno y no puede registrarse como cliente.";
  }
  if (code === "inactive_account") {
    return "Esta cuenta no está activa. Comunícate con QB Insumos para revisarla.";
  }
  if (code === "account_exists" || code === "already_registered") {
    return "Ya existe una cuenta con este correo. Inicia sesión para continuar.";
  }
  return "No pudimos completar el registro. Inténtalo nuevamente.";
}

export async function registerCustomerAction(
  _state: CustomerRegistrationActionState,
  formData: FormData,
): Promise<CustomerRegistrationActionState> {
  const parsed = customerRegistrationSchema.safeParse({
    business_name: formData.get("business_name"),
    responsible_name: formData.get("responsible_name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    password: formData.get("password"),
    password_confirmation: formData.get("password_confirmation"),
    return_to: formData.get("return_to") || undefined,
    company_website: formData.get("company_website") || "",
  });

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  if (parsed.data.company_website || !(await isSameOriginRequest())) {
    return {
      success: false,
      message: "No pudimos validar el registro. Actualiza la página e intenta nuevamente.",
    };
  }

  const returnTo = getSafeCustomerReturnPath(parsed.data.return_to);
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      success: false,
      message: "El registro no está disponible en este momento.",
    };
  }

  const { data: claims } = await supabase.auth.getClaims();
  if (typeof claims?.claims?.sub === "string") {
    const completion = await completeOwnCustomerAccount(supabase, {
      businessName: parsed.data.business_name,
      responsibleName: parsed.data.responsible_name,
      phone: parsed.data.phone,
    });

    if (completion.completed) redirect(returnTo);

    return { success: false, message: registrationMessage(completion.code) };
  }

  const origin = await getSiteOrigin();
  const callbackUrl = new URL("/mi-cuenta/auth/callback", origin);
  callbackUrl.searchParams.set("registration", "1");
  callbackUrl.searchParams.set("next", returnTo);

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: callbackUrl.toString(),
      data: registrationMetadata({
        businessName: parsed.data.business_name,
        responsibleName: parsed.data.responsible_name,
        phone: parsed.data.phone,
      }),
    },
  });

  if (error) {
    return {
      success: false,
      message: "No pudimos crear la cuenta. Revisa los datos e intenta nuevamente.",
    };
  }

  if (!data.user || data.user.identities?.length === 0) {
    return {
      success: false,
      message: "Ya existe una cuenta con este correo. Inicia sesión para continuar.",
    };
  }

  if (!data.session) {
    return {
      success: true,
      confirmationRequired: true,
      message: "Revisa tu correo para confirmar la cuenta.",
    };
  }

  const completion = await completeOwnCustomerAccount(supabase, {
    businessName: parsed.data.business_name,
    responsibleName: parsed.data.responsible_name,
    phone: parsed.data.phone,
  });

  if (!completion.completed) {
    await supabase.auth.signOut({ scope: "local" });
    return { success: false, message: registrationMessage(completion.code) };
  }

  redirect(returnTo);
}
