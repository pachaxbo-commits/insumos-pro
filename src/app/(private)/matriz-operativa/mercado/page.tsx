import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";

import { PrintReceiptButton } from "@/components/qb-receipts/print-receipt-button";
import { Button } from "@/components/ui/button";
import { requireRoleAccess } from "@/lib/auth/session";
import { buildMarketSheetModel } from "@/lib/market-sheet/model";
import { getOperationalMatrixData } from "@/lib/operational-matrix/data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { MarketSheetTable } from "./market-sheet-table";

function todayInBolivia() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz",
  }).format(new Date());
}

async function resolveDate(value: string | undefined) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { date: value, usedLatestDate: false };
  }

  const supabase = await createSupabaseServerClient();
  const { data } = supabase
    ? await supabase
        .from("qb_operational_day_orders")
        .select("operational_date")
        .order("operational_date", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  return {
    date: data?.operational_date ? String(data.operational_date) : todayInBolivia(),
    usedLatestDate: Boolean(data?.operational_date),
  };
}

export default async function MarketPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const auth = await requireRoleAccess("/matriz-operativa");
  if (auth.user.role !== "administrador") redirect("/matriz-operativa");
  const { date: rawDate } = await searchParams;
  const { date, usedLatestDate } = await resolveDate(rawDate);

  const data = await getOperationalMatrixData(date, auth.user.role);
  const model = buildMarketSheetModel(data);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">Hoja de Provisión</h1>
        <Button asChild variant="outline">
          <Link href={`/matriz-operativa?date=${encodeURIComponent(date)}`}>
            <ArrowLeft className="size-4" />
            Preparación y entregas
          </Link>
        </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><a href={`/api/matriz-operativa/mercado.xlsx?date=${encodeURIComponent(date)}`}>Descargar Excel</a></Button>
          <PrintReceiptButton />
        </div>
      </div>
      <form method="get" className="flex flex-wrap items-end gap-2 print:hidden">
        <label className="text-sm">Fecha de provisión
          <input type="date" name="date" defaultValue={date} className="mt-1 block rounded-md border p-2" />
        </label>
        <Button type="submit">Ver fecha</Button>
        <p className="text-sm text-muted-foreground">Se genera directamente desde los pedidos. No descuenta stock físico ni crea reservas automáticas.</p>
      </form>
      {usedLatestDate ? (
        <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 print:hidden">
          Mostramos automáticamente la fecha más reciente con pedidos: {date}.
          Puedes elegir otra fecha arriba.
        </p>
      ) : null}

      <section className="bg-white p-3 text-slate-950 print:p-0">
        <div className="border-b-2 border-emerald-900 pb-2 text-center">
          <h2 className="text-lg font-bold">QB INSUMOS · HOJA DE PROVISIÓN</h2>
          <p className="mt-1 text-sm">Fecha operativa: {model.operationalDate}</p>
          <p className="text-xs text-slate-600">
            Necesidades consolidadas considerando existencias disponibles en almacén.
          </p>
        </div>

        {!model.rows.length ? (
          <p className="p-8 text-center text-sm text-slate-500">
            No hay pedidos solicitados para esta fecha.
          </p>
        ) : (
          <MarketSheetTable
            model={model}
            isAdmin={auth.user.role === "administrador"}
          />
        )}
      </section>
    </div>
  );
}
