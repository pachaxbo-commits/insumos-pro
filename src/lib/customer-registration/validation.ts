import { z } from "zod";

export const CUSTOMER_REGISTRATION_RETURN_PATHS = [
  "/mi-cuenta",
  "/catalogo",
  "/catalogo/checkout",
] as const;

export type CustomerRegistrationReturnPath =
  (typeof CUSTOMER_REGISTRATION_RETURN_PATHS)[number];

export function normalizeRegistrationText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function isValidWhatsApp(value: string) {
  const digits = value.replace(/\D/g, "");
  return (
    value.length <= 25 &&
    /^[+0-9()\s-]+$/.test(value) &&
    digits.length >= 7 &&
    digits.length <= 15
  );
}

export function getSafeCustomerReturnPath(
  value: string | null | undefined,
  fallback: CustomerRegistrationReturnPath = "/mi-cuenta",
): CustomerRegistrationReturnPath {
  return CUSTOMER_REGISTRATION_RETURN_PATHS.some((path) => path === value)
    ? (value as CustomerRegistrationReturnPath)
    : fallback;
}

export function getSafeCustomerReturnPathFromRedirect(
  value: string | null | undefined,
  authorizedOrigin: string,
  fallback: CustomerRegistrationReturnPath = "/mi-cuenta",
): CustomerRegistrationReturnPath {
  if (!value || value.includes("\\") || value.startsWith("//")) return fallback;

  try {
    const origin = new URL(authorizedOrigin).origin;
    const candidate = new URL(value, origin);

    if (candidate.origin !== origin || candidate.username || candidate.password) {
      return fallback;
    }

    return getSafeCustomerReturnPath(candidate.pathname, fallback);
  } catch {
    return fallback;
  }
}

export function getSafeCustomerConfirmationReturnPath(input: {
  returnTo?: string | null;
  redirectTo?: string | null;
  authorizedOrigin: string;
}): CustomerRegistrationReturnPath {
  if (input.returnTo) return getSafeCustomerReturnPath(input.returnTo);

  if (input.redirectTo && !input.redirectTo.includes("\\")) {
    try {
      const origin = new URL(input.authorizedOrigin).origin;
      const redirect = new URL(input.redirectTo, origin);
      if (
        redirect.origin === origin &&
        redirect.pathname === "/mi-cuenta/auth/callback" &&
        redirect.searchParams.get("registration") === "1"
      ) {
        return getSafeCustomerReturnPath(redirect.searchParams.get("next"));
      }
    } catch {
      return "/mi-cuenta";
    }
  }

  return getSafeCustomerReturnPathFromRedirect(
    input.redirectTo,
    input.authorizedOrigin,
  );
}

const requiredText = (label: string, max: number) =>
  z
    .string()
    .transform(normalizeRegistrationText)
    .pipe(
      z
        .string()
        .min(2, `Ingresa ${label}.`)
        .max(max, `${label} es demasiado largo.`),
    );

export const customerRegistrationProfileSchema = z.object({
  business_name: requiredText("el nombre del negocio", 120),
  responsible_name: requiredText("el nombre del responsable", 120),
  phone: z
    .string()
    .transform(normalizeRegistrationText)
    .refine(isValidWhatsApp, "Ingresa un número de WhatsApp válido."),
});

export const customerRegistrationSchema = customerRegistrationProfileSchema
  .extend({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.email("Ingresa un correo válido.").max(254)),
    password: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres.")
      .max(72, "La contraseña es demasiado larga."),
    password_confirmation: z
      .string()
      .min(8, "La confirmación debe tener al menos 8 caracteres.")
      .max(72, "La confirmación es demasiado larga."),
    return_to: z.string().optional(),
    company_website: z.string().max(200).optional().default(""),
  })
  .refine((value) => value.password === value.password_confirmation, {
    path: ["password_confirmation"],
    message: "Las contraseñas no coinciden.",
  });

export type CustomerRegistrationInput = z.infer<typeof customerRegistrationSchema>;
