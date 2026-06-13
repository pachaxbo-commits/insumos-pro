import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldAlert } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAuthContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type RestrictedPageProps = {
  searchParams: Promise<{
    reason?: string;
    from?: string;
  }>;
};

function getRestrictedMessage(reason?: string) {
  switch (reason) {
    case "inactive":
      return "Tu perfil existe, pero esta marcado como inactivo. Necesitas que un administrador lo reactive.";
    case "missing-profile":
      return "Tu usuario existe en Supabase Auth, pero no tiene un perfil valido en la tabla profiles.";
    case "profile-error":
      return "No fue posible leer tu perfil. Verifica que SUPABASE_SCHEMA.sql se haya ejecutado correctamente.";
    default:
      return "Tu rol actual no tiene permisos para acceder a este modulo.";
  }
}

export default async function RestrictedPage({ searchParams }: RestrictedPageProps) {
  const auth = await getAuthContext();

  if (auth.status === "missing_env") {
    redirect("/login?reason=missing-env");
  }

  if (auth.status === "unauthenticated") {
    redirect("/login");
  }

  const params = await searchParams;
  const from = params.from ? decodeURIComponent(params.from) : null;

  return (
    <main className="min-h-screen bg-transparent px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <PageHeader
          eyebrow="Seguridad"
          title="Acceso restringido"
          description="Insumos Pro limita los modulos visibles y accesibles segun el rol y el estado activo del usuario autenticado."
        />

        <Card className="border-white/60 bg-card/92 shadow-sm">
          <CardContent className="flex flex-col gap-6 p-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-4">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-700">
                <ShieldAlert className="size-6" />
              </div>
              <div className="space-y-2">
                <h2 className="font-heading text-2xl font-semibold">
                  No tienes permisos para continuar
                </h2>
                <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
                  {getRestrictedMessage(params.reason)}
                </p>
                {from ? (
                  <p className="text-sm text-muted-foreground">
                    Ruta solicitada:{" "}
                    <span className="font-medium text-foreground">{from}</span>
                  </p>
                ) : null}
              </div>
            </div>

            <Button asChild className="rounded-xl">
              <Link href="/">
                <ArrowLeft className="size-4" />
                Volver al dashboard
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
