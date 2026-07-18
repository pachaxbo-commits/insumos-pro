import { NextResponse } from "next/server";

import {
  completeConfirmedCustomerAccount,
  getAuthorizedSiteOrigin,
  getConfirmationReturnPath,
  getLoginNoticePath,
  isRecoverableConfirmationError,
  withConfirmationState,
} from "@/lib/customer-registration/confirmation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const requestedType = url.searchParams.get("type");
  const isRecovery = requestedType === "recovery";
  const next = getConfirmationReturnPath({
    returnTo: url.searchParams.get("returnTo"),
    redirectTo: url.searchParams.get("redirect_to"),
    authorizedOrigin: getAuthorizedSiteOrigin(url.origin),
  });

  if (!tokenHash || (requestedType !== "email" && !isRecovery)) {
    return NextResponse.redirect(
      new URL(
        isRecovery
          ? "/mi-cuenta/recuperar?error=invalid-link"
          : getLoginNoticePath("invalid-confirmation", next),
        url.origin,
      ),
    );
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.redirect(
      new URL(getLoginNoticePath("account-linking", next), url.origin),
    );
  }

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: isRecovery ? "recovery" : "email",
  });

  if (error) {
    if (isRecovery) {
      return NextResponse.redirect(
        new URL("/mi-cuenta/recuperar?error=invalid-link", url.origin),
      );
    }

    return NextResponse.redirect(
      new URL(
        getLoginNoticePath(
          isRecoverableConfirmationError(error)
            ? "account-linking"
            : "invalid-confirmation",
          next,
        ),
        url.origin,
      ),
    );
  }

  if (isRecovery) {
    return NextResponse.redirect(new URL("/mi-cuenta/restablecer", url.origin));
  }

  const completion = await completeConfirmedCustomerAccount(supabase);
  if (!completion.completed) {
    await supabase.auth.signOut({ scope: "local" });
    return NextResponse.redirect(
      new URL(getLoginNoticePath("account-linking", next), url.origin),
    );
  }

  return NextResponse.redirect(
    new URL(withConfirmationState(next, "confirmed"), url.origin),
  );
}
