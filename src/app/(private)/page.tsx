import Link from "next/link";
import { LockKeyhole } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { canAccessPath, getRoleLabel } from "@/lib/auth/roles";
import { requireRoleAccess } from "@/lib/auth/session";

const sections = [
  { href: "/pedidos", title: "Pedidos", description: "Crea y consulta pedidos." },
  { href: "/matriz-operativa", title: "Operación", description: "Prepara y confirma entregas." },
  { href: "/stock", title: "Stock", description: "Consulta existencias y movimientos." },
  { href: "/recibos", title: "Recibos", description: "Gestiona recibos y resúmenes." },
  { href: "/clientes", title: "Clientes", description: "Consulta las cuentas de clientes." },
  { href: "/matriz-operativa/mercado", title: "Hoja de Provisión", description: "Revisa lo pendiente por fecha." },
  { href: "/configuracion", title: "Configuración", description: "Administra productos y ajustes del sistema." },
] as const;

export default async function DashboardPage() {
  const auth = await requireRoleAccess("/");
  const available = sections.filter((section) =>
    canAccessPath(auth.user.role, section.href) &&
    (section.href !== "/matriz-operativa/mercado" || auth.user.role === "administrador"),
  );

  if (!available.length) {
    return <Card className="mx-auto max-w-2xl border-amber-200 bg-amber-50/80">
      <CardContent className="flex gap-4 p-8">
        <LockKeyhole className="size-6 shrink-0 text-amber-900" />
        <div><h1 className="text-xl font-semibold">Módulo en pausa</h1>
          <p className="mt-2 text-sm text-muted-foreground">Este perfil aún no tiene funciones operativas habilitadas.</p>
        </div>
      </CardContent>
    </Card>;
  }

  return <div className="space-y-4">
    <PageHeader eyebrow={getRoleLabel(auth.user.role)} title="Inicio" description="Elige la tarea que necesitas realizar." />
    <nav aria-label="Accesos de inicio" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {available.map((section) => <Link key={section.href} href={section.href}
        className="rounded-lg border bg-white p-4 transition-colors hover:border-emerald-700 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
        <span className="font-semibold text-slate-900">{section.title}</span>
        <span className="mt-1 block text-sm text-slate-600">{section.description}</span>
      </Link>)}
    </nav>
  </div>;
}
