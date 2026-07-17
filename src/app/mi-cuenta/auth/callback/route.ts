import { NextResponse } from "next/server";

import { completeOwnCustomerAccount } from "@/lib/customer-registration/account";
import { getSafeCustomerReturnPath } from "@/lib/customer-registration/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next");
  const isRegistration = url.searchParams.get("registration") === "1";
  const next = isRegistration
    ? getSafeCustomerReturnPath(requestedNext)
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
        const { data } = await supabase.auth.getUser();
        const metadata = data.user?.user_metadata;
        const completion = await completeOwnCustomerAccount(supabase, {
          businessName: metadata?.business_name,
          responsibleName: metadata?.responsible_name,
          phone: metadata?.phone,
        });

        if (!completion.completed) {
          await supabase.auth.signOut({ scope: "local" });
          const registrationUrl = new URL("/registro", url.origin);
          registrationUrl.searchParams.set(
            "error",
            "No pudimos completar la vinculación de tu cuenta. Inténtalo nuevamente.",
          );
          registrationUrl.searchParams.set("returnTo", next);
          return NextResponse.redirect(registrationUrl);
        }
      }

      return NextResponse.redirect(new URL(next, url.origin));
    }
  }

  return NextResponse.redirect(new URL("/mi-cuenta?error=auth", url.origin));
}
