import { ArrowRight, Lock, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";

import { QbInsumosBrand } from "@/components/branding/qb-insumos-brand";
import { ConfigAlert } from "@/components/auth/config-alert";
import { LoginForm } from "@/components/auth/login-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getAuthContext } from "@/lib/auth/session";
import { hasSupabaseEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{
    reason?: string;
  }>;
};

function getReasonMessage(reason?: string) {
  switch (reason) {
    case "missing-env":
      return "La autenticacion necesita que configures las variables de Supabase antes de iniciar sesion.";
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
  const hasEnv = hasSupabaseEnv();

  return (
    <main className="min-h-screen bg-transparent px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/55 bg-[linear-gradient(145deg,rgba(18,39,71,0.98),rgba(25,78,86,0.95))] p-8 text-white shadow-2xl shadow-slate-950/15 lg:p-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.14),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(135,206,196,0.18),transparent_30%)]" />
          <div className="relative flex h-full flex-col justify-between gap-10">
            <div className="space-y-5">
              <Badge className="rounded-full bg-white/12 px-3 py-1 text-white hover:bg-white/12">
                Acceso seguro
              </Badge>
              <div className="space-y-4">
                <h1 className="max-w-xl font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                  QB Insumos prepara una operacion mas simple y segura.
                </h1>
                <p className="max-w-xl text-base leading-7 text-white/72">
                  Inicia sesion para entrar al entorno de transicion QB-1 y ver solo los modulos habilitados.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="border-white/12 bg-white/8 text-white shadow-none">
                <CardContent className="space-y-3 p-5">
                  <Lock className="size-5" />
                  <div>
                    <p className="font-medium">Auth real</p>
                    <p className="mt-1 text-sm leading-6 text-white/65">
                      Sesion validada con Supabase Auth.
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-white/12 bg-white/8 text-white shadow-none">
                <CardContent className="space-y-3 p-5">
                  <ShieldCheck className="size-5" />
                  <div>
                    <p className="font-medium">Roles temporales</p>
                    <p className="mt-1 text-sm leading-6 text-white/65">
                      Los roles reales se conservan hasta una fase posterior.
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-white/12 bg-white/8 text-white shadow-none">
                <CardContent className="space-y-3 p-5">
                  <ArrowRight className="size-5" />
                  <div>
                    <p className="font-medium">Rutas protegidas</p>
                    <p className="mt-1 text-sm leading-6 text-white/65">
                      Acceso filtrado por modulo y perfil.
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
                  Iniciar sesion
                </h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  Usa tus credenciales de Supabase Auth para entrar al entorno privado.
                </p>
              </div>

              {!hasEnv ? (
                <ConfigAlert
                  title="Supabase aun no esta configurado"
                  description="Completa NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local. La app compila sin estas variables, pero el login real no puede funcionar hasta configurarlas."
                />
              ) : null}

              {reasonMessage ? (
                <ConfigAlert title="Atencion requerida" description={reasonMessage} />
              ) : null}

              <LoginForm />
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
