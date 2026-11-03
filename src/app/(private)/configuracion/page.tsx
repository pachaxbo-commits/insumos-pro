import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";

import { UserManagement } from "@/components/admin/user-management";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsNav } from "@/components/settings/settings-nav";
import { AppearanceForm } from "@/components/settings/appearance-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRoleAccess } from "@/lib/auth/session";
import { getAppAppearance } from "@/lib/app-appearance/data";
import { getAdminUsersData } from "@/lib/admin-users/data";

export default async function ConfiguracionPage() {
  const auth = await requireRoleAccess("/configuracion");
  // /configuracion is administrator-only in the live role policy. The data
  // loader repeats that check before reading Auth users or profiles.
  const [appearance, users] = await Promise.all([
    getAppAppearance(),
    getAdminUsersData(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administración"
        title="Configuración · General"
        description="Gestiona los usuarios del equipo y la identidad visible del sistema."
      />
      <SettingsNav current="/configuracion" />

      <section aria-labelledby="users-heading" className="space-y-3">
        <div className="flex items-center gap-2">
          <Users className="size-5 text-emerald-800" aria-hidden="true" />
          <h2 id="users-heading" className="text-lg font-semibold">Usuarios y permisos</h2>
        </div>
        <UserManagement
          users={users.users}
          currentUserId={auth.user.id}
          error={users.error}
          serviceRoleConfigured={users.serviceRoleConfigured}
        />
      </section>

      <Card>
        <CardHeader><CardTitle>Identidad visible</CardTitle></CardHeader>
        <CardContent><AppearanceForm appearance={appearance} /></CardContent>
      </Card>

      <Card className="border-slate-200 bg-slate-50/70">
        <CardHeader><CardTitle>Herramientas operativas</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-sm text-muted-foreground">
            La preparación del catálogo y sus conversiones se administra desde la herramienta dedicada.
          </p>
          <Button asChild variant="outline">
            <Link href="/configuracion/activacion-operativa">Abrir activación operativa <ArrowRight className="ml-2 size-4" /></Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
