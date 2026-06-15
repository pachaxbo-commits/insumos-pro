import type { ReactNode } from "react";
import {
  Activity,
  CheckCircle2,
  LockKeyhole,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireRoleAccess } from "@/lib/auth/session";
import { getRoleLabel } from "@/lib/auth/roles";
import { getAuditLogsData } from "@/lib/audit/data";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, type AuditFilters } from "@/types/audit";
import { USER_ROLES } from "@/types/auth";

type ConfiguracionPageProps = {
  searchParams: Promise<{
    user?: string;
    action?: string;
    entity?: string;
    date?: string;
  }>;
};

const modules = [
  "Dashboard",
  "Productos",
  "Inventario",
  "Proveedores",
  "Compras",
  "Clientes",
  "Ventas",
  "Finanzas",
  "Reportes",
  "Exportaciones CSV",
  "Bitacora",
];

const settings = [
  {
    title: "Empresa",
    description: "Datos comerciales y parametros generales preparados para configuracion avanzada.",
    status: "Preparado",
    icon: Settings,
  },
  {
    title: "Usuarios y roles",
    description: "Gestion inicial desde Supabase Auth y `public.profiles`.",
    status: "Activo",
    icon: Users,
  },
  {
    title: "Seguridad",
    description: "Rutas privadas, RLS, Server Actions y permisos por rol.",
    status: "Activo",
    icon: ShieldCheck,
  },
  {
    title: "Auditoria",
    description: "Acciones criticas registradas en `audit_logs`.",
    status: "Activo",
    icon: LockKeyhole,
  },
];

const actionLabels: Record<string, string> = {
  create_product: "Crear producto",
  update_product: "Editar producto",
  deactivate_product: "Desactivar producto",
  create_inventory_movement: "Movimiento de inventario",
  create_purchase: "Crear compra",
  confirm_purchase: "Confirmar compra",
  cancel_purchase: "Cancelar compra",
  create_sale: "Crear venta",
  confirm_sale: "Confirmar venta",
  cancel_sale: "Cancelar venta",
  register_customer_payment: "Registrar cobro",
  register_supplier_payment: "Registrar pago",
  register_manual_cash_movement: "Ingreso/gasto manual",
  deactivate_customer: "Desactivar cliente",
  deactivate_supplier: "Desactivar proveedor",
};

const entityLabels: Record<string, string> = {
  product: "Producto",
  inventory_movement: "Inventario",
  purchase: "Compra",
  sale: "Venta",
  payment: "Pago",
  cash_movement: "Caja",
  customer: "Cliente",
  supplier: "Proveedor",
};

function NativeSelect({
  name,
  defaultValue,
  children,
}: {
  name: string;
  defaultValue?: string;
  children: ReactNode;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue ?? "all"}
      className="flex h-10 w-full rounded-xl border border-input bg-white/75 px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
    >
      {children}
    </select>
  );
}

function normalizeFilters(params: Awaited<ConfiguracionPageProps["searchParams"]>): AuditFilters {
  const actions: readonly string[] = AUDIT_ACTIONS;
  const entities: readonly string[] = AUDIT_ENTITY_TYPES;

  return {
    user: params.user,
    action:
      params.action === "all" || actions.includes(params.action ?? "")
        ? (params.action as AuditFilters["action"])
        : "all",
    entity:
      params.entity === "all" || entities.includes(params.entity ?? "")
        ? (params.entity as AuditFilters["entity"])
        : "all",
    date: params.date,
  };
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-BO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatMetadata(metadata: Record<string, unknown>) {
  const entries = Object.entries(metadata);
  if (!entries.length) return "Sin metadata";

  return entries
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" | ");
}

export default async function ConfiguracionPage({ searchParams }: ConfiguracionPageProps) {
  await requireRoleAccess("/configuracion");
  const filters = normalizeFilters(await searchParams);
  const audit = await getAuditLogsData(filters);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Configuracion"
        title="Parametros, seguridad y bitacora"
        description="Estado operativo del sistema, roles disponibles, modulos activos y auditoria de acciones criticas."
      />

      <div className="grid gap-4 lg:grid-cols-4">
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

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <Card className="border-white/60 bg-card/92 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-700" />
              Modulos activos
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {modules.map((module) => (
              <Badge key={module} variant="outline" className="rounded-full border-slate-200 bg-white/80">
                {module}
              </Badge>
            ))}
          </CardContent>
        </Card>

        <Card className="border-white/60 bg-card/92 shadow-sm">
          <CardHeader>
            <CardTitle>Roles disponibles</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            {USER_ROLES.map((role) => (
              <div key={role} className="rounded-2xl border bg-white/70 p-3">
                <p className="font-medium">{getRoleLabel(role)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {role === "administrador"
                    ? "Acceso completo"
                    : role === "ventas"
                      ? "Ventas y clientes"
                      : role === "inventario"
                        ? "Stock, compras y productos"
                        : "Pagos, cuentas y reportes"}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="border-white/60 bg-card/92 shadow-sm">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="size-5" />
                Bitacora de actividad
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Registro de acciones criticas. Visible para administradores.
              </p>
            </div>
            <div className="grid gap-2 text-sm md:grid-cols-3">
              <span className="rounded-xl bg-muted/50 px-3 py-2">Filas: {audit.summary.total}</span>
              <span className="rounded-xl bg-muted/50 px-3 py-2">Hoy: {audit.summary.today}</span>
              <span className="rounded-xl bg-muted/50 px-3 py-2">Criticas: {audit.summary.critical}</span>
            </div>
          </div>

          <form className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_180px_auto]" action="/configuracion">
            <NativeSelect name="user" defaultValue={filters.user}>
              <option value="all">Todos los usuarios</option>
              {audit.users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.label}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect name="action" defaultValue={filters.action}>
              <option value="all">Todas las acciones</option>
              {AUDIT_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {actionLabels[action]}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect name="entity" defaultValue={filters.entity}>
              <option value="all">Todas las entidades</option>
              {AUDIT_ENTITY_TYPES.map((entity) => (
                <option key={entity} value={entity}>
                  {entityLabels[entity]}
                </option>
              ))}
            </NativeSelect>
            <input
              name="date"
              type="date"
              defaultValue={filters.date ?? ""}
              className="h-10 rounded-xl border border-input bg-white/75 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
            />
            <Button type="submit" variant="outline" className="rounded-xl">
              Filtrar
            </Button>
          </form>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-2xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Fecha</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Accion</TableHead>
                  <TableHead>Entidad</TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audit.logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>{formatDateTime(log.created_at)}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{log.user?.full_name || log.user_id?.slice(0, 8) || "Sistema"}</p>
                        <p className="text-xs text-muted-foreground">{log.user ? getRoleLabel(log.user.role) : "N/D"}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="rounded-full">
                        {actionLabels[log.action] ?? log.action}
                      </Badge>
                    </TableCell>
                    <TableCell>{entityLabels[log.entity_type] ?? log.entity_type}</TableCell>
                    <TableCell className="max-w-[360px] truncate text-muted-foreground">
                      {formatMetadata(log.metadata)}
                    </TableCell>
                    <TableCell>{log.ip_address ?? "N/D"}</TableCell>
                  </TableRow>
                ))}
                {!audit.logs.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      Sin eventos de auditoria para los filtros actuales.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
