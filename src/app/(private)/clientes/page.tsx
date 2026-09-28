import { PageHeader } from "@/components/layout/page-header";
import { CustomerDirectoryManager } from "@/components/customers/customer-directory-manager";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
    <div className="space-y-4">
      <PageHeader
        eyebrow="Clientes"
        title="Directorio de clientes"
        description="Registra y corrige los datos que utiliza el administrador al crear pedidos."
      />
      <Card className="border-white/60 bg-card/92 shadow-sm">
        <CardHeader className="gap-4">
          <div>
            <CardTitle>Clientes registrados</CardTitle>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {data.customers.length} cliente
              {data.customers.length === 1 ? "" : "s"} en el directorio
              operativo. Solo estos clientes aparecen al crear un pedido.
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
          {data.error ? (
            <p className="mb-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
              {data.error}
            </p>
          ) : null}
          <CustomerDirectoryManager customers={data.customers} />
        </CardContent>
      </Card>
    </div>
  );
}
