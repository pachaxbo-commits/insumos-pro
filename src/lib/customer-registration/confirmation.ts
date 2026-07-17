import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isAuthPKCECodeVerifierMissingError,
  isAuthRetryableFetchError,
} from "@supabase/supabase-js";

import { completeOwnCustomerAccount } from "@/lib/customer-registration/account";
import {
  getSafeCustomerConfirmationReturnPath,
  type CustomerRegistrationReturnPath,
} from "@/lib/customer-registration/validation";

const PKCE_CONTEXT_ERROR_CODES = new Set([
  "bad_code_verifier",
  "flow_state_not_found",
  "pkce_code_verifier_not_found",
]);

export function getAuthorizedSiteOrigin(requestOrigin: string) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  try {
    return new URL(configured || requestOrigin).origin;
  } catch {
    return new URL(requestOrigin).origin;
  }
}

export const getConfirmationReturnPath = getSafeCustomerConfirmationReturnPath;

export function isRecoverableConfirmationError(error: unknown) {
  if (isAuthRetryableFetchError(error)) return true;
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? error.status
      : null;
  return typeof status === "number" && status >= 500;
}

export function isMissingPkceContext(error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? error.code
      : null;

  return (
    isAuthPKCECodeVerifierMissingError(error) ||
    (typeof code === "string" && PKCE_CONTEXT_ERROR_CODES.has(code))
  );
}

export function withConfirmationState(
  path: CustomerRegistrationReturnPath,
  state: "confirmed",
) {
  const params = new URLSearchParams({ confirmation: state });
  return `${path}?${params.toString()}`;
}

export function getLoginNoticePath(
  reason: "account-linking" | "email-confirmed" | "invalid-confirmation",
  returnTo: CustomerRegistrationReturnPath,
) {
  const params = new URLSearchParams({ reason, returnTo });
  return `/login?${params.toString()}`;
}

export async function completeConfirmedCustomerAccount(supabase: SupabaseClient) {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { completed: false as const };

  const metadata = data.user.user_metadata;
  const completion = await completeOwnCustomerAccount(supabase, {
    businessName: metadata?.business_name,
    responsibleName: metadata?.responsible_name,
    phone: metadata?.phone,
  });

  return { completed: completion.completed };
}
