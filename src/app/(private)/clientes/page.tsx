import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireRoleAccess } from "@/lib/auth/session";
import {
  getQbCustomerDirectory,
  type QbCustomerDirectoryFilters,
} from "@/lib/customer-account/directory";

type ClientesPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
  }>;
};

function normalizeFilters(
  params: Awaited<ClientesPageProps["searchParams"]>,
): QbCustomerDirectoryFilters {
  return {
    q: params.q,
    status:
      params.status === "active" ||
      params.status === "inactive" ||
      params.status === "all"
        ? params.status
        : "all",
  };
}

export default async function ClientesPage({
  searchParams,
}: ClientesPageProps) {
  await requireRoleAccess("/clientes");
  const filters = normalizeFilters(await searchParams);
  const data = await getQbCustomerDirectory(filters);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Clientes"
        title="Directorio de clientes"
        description="Consulta las cuentas y ubicaciones utilizadas para crear pedidos QB."
      />
      <Card className="border-white/60 bg-card/92 shadow-sm">
        <CardHeader className="gap-4">
          <div>
            <CardTitle>Clientes registrados</CardTitle>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {data.customers.length} cliente
              {data.customers.length === 1 ? "" : "s"} en el directorio
              operativo. Busca por negocio, responsable, teléfono o correo.
            </p>
          </div>
          <form
            className="grid gap-3 md:grid-cols-[1fr_160px_auto]"
            action="/clientes"
          >
            <Input
              name="q"
              defaultValue={filters.q ?? ""}
              placeholder="Buscar cliente, responsable o teléfono"
              className="rounded-xl"
            />
            <select
              name="status"
              defaultValue={filters.status ?? "all"}
              className="h-10 rounded-xl border border-input bg-white/75 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
            >
              <option value="all">Todos</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
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
                  <TableHead>Cliente</TableHead>
                  <TableHead>Responsable</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <p className="font-medium">{customer.businessName}</p>
                      <p className="text-xs text-muted-foreground">
                        {customer.email}
                      </p>
                    </TableCell>
                    <TableCell>{customer.responsibleName}</TableCell>
                    <TableCell>{customer.phone ?? "Pendiente"}</TableCell>
                    <TableCell>
                      <p>{customer.locationLabel ?? "Sin ubicación"}</p>
                      <p className="text-xs text-muted-foreground">
                        {customer.address ?? "Dirección pendiente"}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          customer.isActive
                            ? "rounded-full border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "rounded-full border-slate-200 bg-slate-100 text-slate-600"
                        }
                      >
                        {customer.isActive ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {!data.customers.length ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-24 text-center text-muted-foreground"
                    >
                      {data.error ?? "No hay clientes para estos filtros."}
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
