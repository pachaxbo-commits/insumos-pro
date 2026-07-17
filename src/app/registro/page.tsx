import type { Metadata } from "next";
import { MapPin, PackageSearch, ShoppingBasket } from "lucide-react";
import { redirect } from "next/navigation";

import { QbInsumosBrand } from "@/components/branding/qb-insumos-brand";
import { CustomerRegistrationForm } from "@/components/customer-account/customer-registration-form";
import { Card, CardContent } from "@/components/ui/card";
import { getSafeCustomerReturnPath } from "@/lib/customer-registration/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Crea tu cuenta | QB Insumos",
  description: "Registra tu cuenta de cliente para guardar ubicaciones y consultar pedidos.",
};

export const dynamic = "force-dynamic";

export default async function RegistrationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; returnTo?: string }>;
}) {
  const params = await searchParams;
  const returnTo = getSafeCustomerReturnPath(params.returnTo);
  const initialMessage = params.error
    ? "No pudimos completar la vinculación de la cuenta. Inicia sesión o completa nuevamente tus datos."
    : undefined;
  const supabase = await createSupabaseServerClient();

  if (supabase) {
    const { data: claims } = await supabase.auth.getClaims();
    const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;

    if (userId) {
      const [{ data: profile }, { data: customer }] = await Promise.all([
        supabase.from("profiles").select("id").eq("id", userId).maybeSingle(),
        supabase
          .from("customer_accounts")
          .select("id, is_active")
          .eq("id", userId)
          .maybeSingle<{ id: string; is_active: boolean }>(),
      ]);

      if (profile) redirect("/");
      if (customer?.is_active) redirect(returnTo);
    }
  }

  return (
    <main className="min-h-screen bg-transparent px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <section className="relative overflow-hidden rounded-[2rem] bg-[linear-gradient(145deg,#173f34,#28634d)] p-8 text-white shadow-2xl shadow-emerald-950/15 lg:p-10">
          <div className="absolute inset-0 opacity-35 [background-image:radial-gradient(#ffffff40_1px,transparent_1px)] [background-size:24px_24px]" />
          <div className="relative flex h-full flex-col justify-between gap-12">
            <QbInsumosBrand
              showSubtitle
              textClassName="text-white"
              className="[&_p:last-child]:text-white/65"
            />

            <div>
              <h1 className="max-w-md font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
                Crea tu cuenta
              </h1>
              <p className="mt-4 max-w-md text-base leading-7 text-white/75">
                Guarda tus ubicaciones, consulta tus pedidos y repite compras fácilmente.
              </p>
            </div>

            <div className="grid gap-3">
              <div className="flex items-center gap-3 rounded-2xl bg-white/10 p-4">
                <MapPin className="size-5 shrink-0" />
                <p className="text-sm">Registra una o más ubicaciones cuando ingreses.</p>
              </div>
              <div className="flex items-center gap-3 rounded-2xl bg-white/10 p-4">
                <PackageSearch className="size-5 shrink-0" />
                <p className="text-sm">Consulta el estado y el historial de tus pedidos.</p>
              </div>
              <div className="flex items-center gap-3 rounded-2xl bg-white/10 p-4">
                <ShoppingBasket className="size-5 shrink-0" />
                <p className="text-sm">Tu carrito permanece guardado durante el registro.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="flex items-center">
          <Card className="w-full rounded-[2rem] border-white/60 bg-white/88 shadow-lg backdrop-blur">
            <CardContent className="p-7 sm:p-8">
              <div className="mb-6 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Cuenta de cliente
                </p>
                <h2 className="font-heading text-3xl font-semibold">Datos de registro</h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  La cuenta queda activa para comprar. No otorga acceso al panel interno.
                </p>
              </div>
              <CustomerRegistrationForm
                initialMessage={initialMessage}
                returnTo={returnTo}
              />
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
