import { CheckCircle2, LockKeyhole, Settings, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRoleAccess } from "@/lib/auth/session";

const settings = [
  {
    title: "Empresa",
    description: "Datos comerciales, sucursal principal y parametros fiscales.",
    status: "Preparado",
    icon: Settings,
  },
  {
    title: "Usuarios y roles",
    description: "La gestion inicial se realiza desde Supabase Auth y la tabla profiles.",
    status: "Activo",
    icon: ShieldCheck,
  },
  {
    title: "Seguridad",
    description: "Rutas privadas, RLS y permisos por rol ya estan aplicados.",
    status: "Activo",
    icon: LockKeyhole,
  },
];

export default async function ConfiguracionPage() {
  await requireRoleAccess("/configuracion");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Configuracion"
        title="Parametros del sistema"
        description="Estado de configuracion para la demo comercial. Los ajustes avanzados de empresa y usuarios se mantienen controlados desde Supabase en esta etapa."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {settings.map((item) => {
          const Icon = item.icon;

          return (
            <Card key={item.title} className="border-white/60 bg-white/80 shadow-sm">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                    <Icon className="size-5" />
                  </span>
                  <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-700">
                    {item.status}
                  </Badge>
                </div>
                <CardTitle>{item.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                {item.description}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-white/60 bg-card/92 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-700" />
            Listo para demo
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
          <p>Para crear usuarios demo, usa Supabase Auth y asigna roles en `public.profiles`.</p>
          <p>Para datos operativos, usa productos, compras, ventas y finanzas desde los modulos reales.</p>
        </CardContent>
      </Card>
    </div>
  );
}
