import { ArrowRight, Lock, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";

import { QbInsumosBrand } from "@/components/branding/qb-insumos-brand";
import { ConfigAlert } from "@/components/auth/config-alert";
import { LoginForm } from "@/components/auth/login-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getAuthContext } from "@/lib/auth/session";
import { hasSupabaseEnv } from "@/lib/supabase/server";
import { getSafeCustomerReturnPath } from "@/lib/customer-registration/validation";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{
    reason?: string;
    returnTo?: string;
  }>;
};

function getReasonMessage(reason?: string) {
  switch (reason) {
    case "missing-env":
      return "El acceso no está disponible en este momento. Comunícate con el administrador de QB Insumos.";
    default:
      return null;
  }
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const auth = await getAuthContext();

  if (auth.status === "authenticated") {
    redirect("/");
  }

  const params = await searchParams;
  const reasonMessage = getReasonMessage(params.reason);
  const returnTo = params.returnTo
    ? getSafeCustomerReturnPath(params.returnTo)
    : undefined;
  const hasEnv = hasSupabaseEnv();

  return (
    <main className="min-h-screen bg-transparent px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/55 bg-[linear-gradient(145deg,rgba(18,39,71,0.98),rgba(25,78,86,0.95))] p-8 text-white shadow-2xl shadow-slate-950/15 lg:p-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.14),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(135,206,196,0.18),transparent_30%)]" />
          <div className="relative flex h-full flex-col justify-between gap-10">
            <div className="space-y-5">
              <Badge className="rounded-full bg-white/12 px-3 py-1 text-white hover:bg-white/12">
                Gestión centralizada
              </Badge>
              <div className="space-y-4">
                <h1 className="max-w-xl font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                  QB Insumos, desarrollado por Pachax®
                </h1>
                <p className="max-w-xl text-base leading-7 text-white/72">
                  Administra pedidos, inventario, entregas y recibos desde una plataforma segura y fácil de usar.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="border-white/12 bg-white/8 text-white shadow-none">
                <CardContent className="space-y-3 p-5">
                  <Lock className="size-5" />
                  <div>
                    <p className="font-medium">Control integral</p>
                    <p className="mt-1 text-sm leading-6 text-white/65">
                      Gestiona cada etapa de la operación desde un solo lugar.
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-white/12 bg-white/8 text-white shadow-none">
                <CardContent className="space-y-3 p-5">
                  <ShieldCheck className="size-5" />
                  <div>
                    <p className="font-medium">Acceso personalizado</p>
                    <p className="mt-1 text-sm leading-6 text-white/65">
                      Cada usuario accede únicamente a las funciones que necesita.
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-white/12 bg-white/8 text-white shadow-none">
                <CardContent className="space-y-3 p-5">
                  <ArrowRight className="size-5" />
                  <div>
                    <p className="font-medium">Información segura</p>
                    <p className="mt-1 text-sm leading-6 text-white/65">
                      Tus datos y movimientos se mantienen protegidos en todo momento.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="flex items-center">
          <Card className="w-full rounded-[2rem] border-white/60 bg-white/82 shadow-lg backdrop-blur">
            <CardContent className="space-y-6 p-7 sm:p-8">
              <div className="space-y-2">
                <QbInsumosBrand showSubtitle />
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Bienvenido
                </p>
                <h2 className="font-heading text-3xl font-semibold tracking-tight">
                  Iniciar sesión
                </h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  Ingresa con tu correo y contraseña para acceder a tu cuenta.
                </p>
              </div>

              {!hasEnv ? (
                <ConfigAlert
                  title="Acceso no disponible"
                  description="La configuración de acceso no está completa. Comunícate con el administrador de QB Insumos."
                />
              ) : null}

              {reasonMessage ? (
                <ConfigAlert title="Atención requerida" description={reasonMessage} />
              ) : null}

              <LoginForm returnTo={returnTo} />
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
