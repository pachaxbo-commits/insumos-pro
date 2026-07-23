import { PageHeader } from "@/components/layout/page-header";
import { OperationalMatrix } from "@/components/operational-matrix/operational-matrix";
import { requireRoleAccess } from "@/lib/auth/session";
import { getOperationalMatrixData } from "@/lib/operational-matrix/data";

function boliviaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function validDate(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : boliviaToday();
}

export default async function MatrizOperativaPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const auth = await requireRoleAccess("/matriz-operativa");
  const date = validDate((await searchParams).fecha);
  const data = await getOperationalMatrixData(date, auth.user.role!);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operación diaria"
        title="Matriz operativa"
        description="Una sola vista por fecha para pedido, bodega, abastecimiento externo y entrega real."
      />
      <form className="flex flex-wrap items-end gap-3" method="get">
        <label className="text-sm font-medium">
          Fecha operativa (Bolivia)
          <input
            className="mt-1 block h-10 rounded-md border bg-background px-3"
            type="date"
            name="fecha"
            defaultValue={date}
          />
        </label>
        <button className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
          Ver fecha
        </button>
      </form>
      <OperationalMatrix
        key={`${date}:${data.orders.map((order) => `${order.id}:${order.updatedAt}:${order.positionVersion}`).join("|")}:${data.lines.map((line) => `${line.orderItemId}:${line.requestedVersion}:${line.preparationVersion}:${line.deliveryVersion}`).join("|")}`}
        data={data}
      />
    </div>
  );
}
