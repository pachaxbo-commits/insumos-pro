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
