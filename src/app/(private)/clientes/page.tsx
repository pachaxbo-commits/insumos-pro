import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { getCustomersData } from "@/lib/sales/data";
import { CUSTOMER_TYPES, type CustomerFilters } from "@/types/sales";

type ClientesPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    type?: string;
  }>;
};

function normalizeFilters(params: Awaited<ClientesPageProps["searchParams"]>): CustomerFilters {
  const customerTypes: readonly string[] = CUSTOMER_TYPES;

  return {
    q: params.q,
    status:
      params.status === "active" || params.status === "inactive" || params.status === "all"
        ? params.status
        : "all",
    type:
      params.type === "all" || customerTypes.includes(params.type ?? "")
        ? (params.type as CustomerFilters["type"])
        : "all",
  };
}

export default async function ClientesPage({ searchParams }: ClientesPageProps) {
  await requireRoleAccess("/clientes");
  const filters = normalizeFilters(await searchParams);
  const data = await getCustomersData(filters);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Clientes"
        title="Clientes en transicion"
        description="Consulta temporal de datos de contacto. La gestion de ubicaciones y pedidos se habilitara en fases posteriores de QB Insumos."
      />
      <Card className="border-white/60 bg-card/92 shadow-sm">
        <CardHeader className="gap-4">
          <div>
            <CardTitle>Directorio transitorio</CardTitle>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Vista sin cobros, saldos, credito ni acciones comerciales antiguas.
            </p>
          </div>
          <form className="grid gap-3 md:grid-cols-[1fr_160px_auto]" action="/clientes">
            <Input
              name="q"
              defaultValue={filters.q ?? ""}
              placeholder="Buscar por nombre o telefono"
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
                  <TableHead>Telefono</TableHead>
                  <TableHead>Direccion</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{customer.name}</p>
                        {customer.business_name ? (
                          <p className="text-xs text-muted-foreground">{customer.business_name}</p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{customer.phone ?? "N/D"}</TableCell>
                    <TableCell>{customer.address ?? "N/D"}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          customer.is_active
                            ? "rounded-full border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "rounded-full border-slate-200 bg-slate-100 text-slate-600"
                        }
                      >
                        {customer.is_active ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {!data.customers.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      No hay clientes para estos filtros.
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
