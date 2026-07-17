import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { customerRegistrationProfileSchema } from "@/lib/customer-registration/validation";

type RegistrationResultCode =
  | "account_exists"
  | "already_registered"
  | "created"
  | "inactive_account"
  | "internal_user"
  | "invalid_data"
  | "unauthenticated";

export async function completeOwnCustomerAccount(
  supabase: SupabaseClient,
  input: {
    businessName: unknown;
    responsibleName: unknown;
    phone: unknown;
  },
) {
  const parsed = customerRegistrationProfileSchema.safeParse({
    business_name: input.businessName,
    responsible_name: input.responsibleName,
    phone: input.phone,
  });

  if (!parsed.success) {
    return { code: "invalid_data" as const, completed: false };
  }

  const { data, error } = await supabase.rpc("register_own_customer_account", {
    p_business_name: parsed.data.business_name,
    p_responsible_name: parsed.data.responsible_name,
    p_phone: parsed.data.phone,
  });

  if (error || typeof data !== "string") {
    return { code: "service_error" as const, completed: false };
  }

  const code = data as RegistrationResultCode;
  return {
    code,
    completed: code === "created" || code === "already_registered",
  };
}

export function registrationMetadata(input: {
  businessName: string;
  responsibleName: string;
  phone: string;
}) {
  return {
    qb_customer_registration: true,
    business_name: input.businessName,
    responsible_name: input.responsibleName,
    phone: input.phone,
  };
}
