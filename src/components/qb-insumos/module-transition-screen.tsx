import Link from "next/link";
import { LockKeyhole, ShieldCheck } from "lucide-react";

import { QbInsumosBrand } from "@/components/branding/qb-insumos-brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { TransitionModule } from "@/lib/qb-insumos/transition-policy";

type ModuleTransitionScreenProps = {
  module: TransitionModule;
  publicView?: boolean;
};

export function ModuleTransitionScreen({
  module,
  publicView = false,
}: ModuleTransitionScreenProps) {
  return (
    <main className={publicView ? "min-h-screen bg-transparent px-4 py-8 sm:px-6" : ""}>
      <div className="mx-auto flex min-h-[60vh] max-w-4xl items-center">
        <Card className="w-full border-white/60 bg-white/88 shadow-sm backdrop-blur">
          <CardContent className="grid gap-8 p-7 md:grid-cols-[auto_1fr] md:p-8">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-800">
              <LockKeyhole className="size-6" />
            </div>

            <div className="space-y-6">
              <div className="space-y-3">
                <QbInsumosBrand showSubtitle />
                <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 text-amber-800">
                  Función no disponible
                </Badge>
                <div className="space-y-2">
                  <h1 className="font-heading text-3xl font-semibold tracking-tight">
                    {module.title}
                  </h1>
                  <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
                    Este módulo no forma parte de la operación actual de QB Insumos.
                    Consulta la indicación siguiente para continuar desde la función disponible.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                <div className="flex gap-3">
                  <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-800" />
                  <p className="text-sm leading-6 text-muted-foreground">{module.reason}</p>
                </div>
              </div>

              {!publicView ? (
                <div className="flex flex-wrap gap-2">
                  <Button asChild className="rounded-xl">
                    <Link href="/">Ir al inicio</Link>
                  </Button>
                  <Button asChild variant="outline" className="rounded-xl">
                    <Link href="/configuracion">Ver funciones disponibles</Link>
                  </Button>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
