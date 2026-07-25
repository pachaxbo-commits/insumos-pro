import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { getFocusedWorkspace } from "@/lib/auth/roles";
import { requireRoleAccess } from "@/lib/auth/session";

export default async function DashboardPage() {
  const auth = await requireRoleAccess("/");
  const workspace = getFocusedWorkspace(auth.user.role);

  if (workspace.href) {
    redirect(workspace.href);
  }

  return (
    <Card className="mx-auto max-w-2xl border-amber-200 bg-amber-50/80">
      <CardContent className="flex gap-4 p-8">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-900">
          <LockKeyhole className="size-5" />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-semibold">
            Módulo en pausa
          </h1>
          <p className="mt-2 leading-7 text-muted-foreground">
            Este perfil se habilitará cuando terminemos y validemos el flujo
            básico de pedidos, preparación y entrega.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
