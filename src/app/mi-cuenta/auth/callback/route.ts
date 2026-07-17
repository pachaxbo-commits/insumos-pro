import { NextResponse } from "next/server";

import {
  completeConfirmedCustomerAccount,
  getLoginNoticePath,
  isMissingPkceContext,
  withConfirmationState,
} from "@/lib/customer-registration/confirmation";
import { getSafeCustomerReturnPath } from "@/lib/customer-registration/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next");
  const isRegistration = url.searchParams.get("registration") === "1";
  const registrationNext = getSafeCustomerReturnPath(requestedNext);
  const next = isRegistration
    ? registrationNext
    : requestedNext === "/mi-cuenta/restablecer"
      ? requestedNext
      : "/mi-cuenta";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = (await supabase?.auth.exchangeCodeForSession(code)) ?? {
      error: new Error("Supabase no configurado"),
    };

    if (!error && supabase) {
      if (isRegistration) {
        const completion = await completeConfirmedCustomerAccount(supabase);

        if (!completion.completed) {
          await supabase.auth.signOut({ scope: "local" });
          return NextResponse.redirect(
            new URL(getLoginNoticePath("account-linking", registrationNext), url.origin),
          );
        }

        return NextResponse.redirect(
          new URL(withConfirmationState(registrationNext, "confirmed"), url.origin),
        );
      }

      return NextResponse.redirect(new URL(next, url.origin));
    }

    if (isRegistration && error && isMissingPkceContext(error)) {
      return NextResponse.redirect(
        new URL(getLoginNoticePath("email-confirmed", registrationNext), url.origin),
      );
    }
  }

  if (isRegistration) {
    return NextResponse.redirect(
      new URL(getLoginNoticePath("invalid-confirmation", registrationNext), url.origin),
    );
  }

  return NextResponse.redirect(new URL("/mi-cuenta?error=auth", url.origin));
}
