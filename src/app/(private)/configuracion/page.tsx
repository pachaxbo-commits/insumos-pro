import type { ReactNode } from "react";
import {
  Activity,
  CheckCircle2,
  FileText,
  LockKeyhole,
  Settings,
  ShieldCheck,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  getActiveTransitionalModules,
  getSuspendedLegacyModules,
} from "@/lib/qb-insumos/transition-policy";
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

const settings = [
  {
    title: "Identidad del sistema",
    description: "La aplicación utiliza la identidad oficial de QB Insumos.",
    status: "Actual",
    icon: Settings,
  },
  {
    title: "Accesos del personal",
    description: "Cada rol dispone únicamente de las funciones necesarias para su trabajo.",
    status: "Configurados",
    icon: ShieldCheck,
  },
  {
    title: "Alcance operativo",
    description: "Distingue las funciones gestionadas desde otros módulos y las que no forman parte de esta versión.",
    status: "Definido",
    icon: LockKeyhole,
  },
  {
    title: "Auditoría",
    description: "Consulta la bitácora de actividad para dar seguimiento a las acciones registradas.",
    status: "Consulta",
    icon: FileText,
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
  cancel_confirmed_purchase: "Anular compra confirmada",
  create_purchase_batch: "Crear compra multiple",
  update_purchase_batch: "Editar compra multiple",
  create_purchase_batch_line: "Agregar linea de compra multiple",
  update_purchase_batch_line: "Editar linea de compra multiple",
  delete_purchase_batch_line: "Eliminar linea de compra multiple",
  confirm_purchase_batch: "Confirmar compra multiple",
  save_purchase_batch_line_classification: "Guardar clasificacion de ingreso",
  create_order: "Crear pedido",
  confirm_order: "Confirmar pedido",
  cancel_order: "Cancelar pedido",
  create_sale: "Crear venta",
  confirm_sale: "Confirmar venta",
  cancel_sale: "Cancelar venta",
  cancel_confirmed_sale: "Anular venta confirmada",
  register_customer_payment: "Registrar cobro",
  register_supplier_payment: "Registrar pago",
  register_manual_cash_movement: "Ingreso/gasto manual",
  deactivate_customer: "Desactivar cliente",
  deactivate_supplier: "Desactivar proveedor",
  create_user: "Crear usuario",
  update_user: "Editar usuario",
  change_user_role: "Cambiar rol",
  activate_user: "Activar usuario",
  deactivate_user: "Desactivar usuario",
  reset_user_access: "Restablecer acceso",
  update_configuration: "Cambiar configuracion",
};

const entityLabels: Record<string, string> = {
  product: "Producto",
  inventory_movement: "Inventario",
  purchase: "Compra",
  purchase_batch: "Compra multiple",
  purchase_classification: "Clasificacion de ingreso",
  order: "Pedido",
  sale: "Venta",
  payment: "Pago",
  cash_movement: "Caja",
  customer: "Cliente",
  supplier: "Proveedor",
  user: "Usuario",
  configuration: "Configuracion",
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
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatMetadata(metadata: Record<string, unknown>) {
  const entries = Object.entries(metadata);
  if (!entries.length) return "Sin información adicional";

  return entries
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" | ");
}

export default async function ConfiguracionPage({ searchParams }: ConfiguracionPageProps) {
  await requireRoleAccess("/configuracion");
  const filters = normalizeFilters(await searchParams);
  const audit = await getAuditLogsData(filters);
  const activeModules = getActiveTransitionalModules();
  const suspendedModules = getSuspendedLegacyModules();
  const managedModules = suspendedModules.filter((module) =>
    ["inventario", "ventas", "compras", "confirmacion-publica"].includes(module.id),
  );
  const unavailableModules = suspendedModules.filter((module) =>
    ["proveedores", "finanzas"].includes(module.id),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administración"
        title="Configuración y auditoría"
        description="Consulta las funciones disponibles, los accesos por rol y la actividad registrada en QB Insumos."
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
              Módulos disponibles
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {activeModules.map((module) => (
              <Badge key={module.id} variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-800">
                {module.title}
              </Badge>
            ))}
          </CardContent>
        </Card>

        <Card className="border-white/60 bg-card/92 shadow-sm">
          <CardHeader>
            <CardTitle>Acceso por rol</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            {USER_ROLES.map((role) => (
              <div key={role} className="rounded-2xl border bg-white/70 p-3">
                <p className="font-medium">{getRoleLabel(role)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {role === "administrador"
                    ? "Acceso: Administración"
                    : role === "ventas"
                      ? "Acceso: Preparación, Inventario o Administración"
                      : role === "inventario"
                        ? "Acceso: Preparación e Inventario"
                        : "Sin acceso operativo"}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-white/60 bg-card/92 shadow-sm">
          <CardHeader>
            <CardTitle>Funciones gestionadas desde otros módulos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {managedModules.map((module) => (
              <div key={module.id} className="rounded-2xl border bg-white/70 p-3 text-sm">
                <p className="font-medium">{module.title}</p>
                <p className="mt-1 text-muted-foreground">{module.reason}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-white/60 bg-card/92 shadow-sm">
          <CardHeader>
            <CardTitle>Funciones no incluidas en esta versión</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {unavailableModules.map((module) => (
              <div key={module.id} className="rounded-2xl border bg-white/70 p-3 text-sm">
                <p className="font-medium">{module.title}</p>
                <p className="mt-1 text-muted-foreground">{module.reason}</p>
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
                Bitácora de actividad
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Registro de acciones importantes, visible para administradores.
              </p>
            </div>
            <div className="grid gap-2 text-sm md:grid-cols-3">
              <span className="rounded-xl bg-muted/50 px-3 py-2">Filas: {audit.summary.total}</span>
              <span className="rounded-xl bg-muted/50 px-3 py-2">Hoy: {audit.summary.today}</span>
              <span className="rounded-xl bg-muted/50 px-3 py-2">Críticas: {audit.summary.critical}</span>
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
          {audit.error ? (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>No se pudo cargar la bitácora correctamente</AlertTitle>
              <AlertDescription>{audit.error}</AlertDescription>
            </Alert>
          ) : null}

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
                      No hay eventos de auditoría para los filtros actuales.
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
