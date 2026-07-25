import { PageHeader } from "@/components/layout/page-header";
import { OperationalMatrix } from "@/components/operational-matrix/operational-matrix";
import { requireRoleAccess } from "@/lib/auth/session";
import { getOperationalMatrixData } from "@/lib/operational-matrix/data";
import type { MatrixStage } from "@/types/operational-matrix";

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

function validMode(value: string | undefined): MatrixStage | undefined {
  return value &&
    ["pedido", "preparacion", "entrega", "resumen"].includes(value)
    ? (value as MatrixStage)
    : undefined;
}

export default async function MatrizOperativaPage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    fecha?: string;
    mode?: string;
    order?: string;
  }>;
}) {
  const auth = await requireRoleAccess("/matriz-operativa");
  const params = await searchParams;
  const date = validDate(params.date ?? params.fecha);
  const mode = validMode(params.mode);
  const data = await getOperationalMatrixData(date, auth.user.role!);
  const isInventory = auth.user.role === "inventario";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          isInventory
            ? "Paso 2 de 3 · Inventario"
            : "Paso 3 de 3 · Entregador"
        }
        title={isInventory ? "Preparar pedidos" : "Registrar entregas"}
        description={
          isInventory
            ? "Revisa únicamente los pedidos del día y confirma lo que queda preparado."
            : "Registra las cantidades exactas entregadas al cliente y confirma la entrega."
        }
      />
      <form className="flex flex-wrap items-end gap-3" method="get">
        <label className="text-sm font-medium">
          Fecha operativa (Bolivia)
          <input
            className="mt-1 block h-10 rounded-md border bg-background px-3"
            type="date"
            name="date"
            defaultValue={date}
          />
        </label>
        <button className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
          Ver fecha
        </button>
      </form>
      <OperationalMatrix
        key={date}
        data={data}
        initialStage={mode}
        initialOrderId={params.order}
      />
    </div>
  );
}
