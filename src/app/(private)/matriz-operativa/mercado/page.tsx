import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";

import { PrintReceiptButton } from "@/components/qb-receipts/print-receipt-button";
import { Button } from "@/components/ui/button";
import { AllPendingSummaryView } from "@/components/operational-matrix/all-pending-summary-view";
import { OperationalDateFilter } from "@/components/operational-matrix/operational-date-filter";
import { PendingWorkBar } from "@/components/operational-matrix/pending-work-bar";
import { requireRoleAccess } from "@/lib/auth/session";
import { todayInBolivia } from "@/lib/date-time";
import { buildMarketSheetModel } from "@/lib/market-sheet/model";
import { getOperationalMatrixData } from "@/lib/operational-matrix/data";
import { getPendingProvisionWork } from "@/lib/operational-matrix/pending-work";

import { MarketSheetTable } from "./market-sheet-table";

function validDate(value: string | undefined, fallback: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

export default async function MarketPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; fecha?: string; allPending?: string }>;
}) {
  const auth = await requireRoleAccess("/matriz-operativa");
  if (auth.user.role !== "administrador") redirect("/matriz-operativa");
  const params = await searchParams;
  const isAllPending = params.allPending === "1";

  const pendingSummary = await getPendingProvisionWork();

  const explicitDate = params.date ?? params.fecha;
  const date = validDate(
    explicitDate,
    pendingSummary.oldestPendingDate ?? todayInBolivia(),
  );

  const data = !isAllPending
    ? await getOperationalMatrixData(date, auth.user.role)
    : null;
  const model = data ? buildMarketSheetModel(data) : null;

  return (
    <div className="space-y-4">
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
          {!isAllPending ? (
            <Button asChild variant="outline">
              <a href={`/api/matriz-operativa/mercado.xlsx?date=${encodeURIComponent(date)}`}>
                Descargar Excel
              </a>
            </Button>
          ) : null}
          <PrintReceiptButton />
        </div>
      </div>

      <div className="print:hidden">
        <PendingWorkBar
          summary={pendingSummary}
          currentDate={date}
          isAllPending={isAllPending}
          basePath="/matriz-operativa/mercado"
        />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <input type="hidden" name="date" value={date} />
        <OperationalDateFilter
          currentDate={date}
          basePath="/matriz-operativa/mercado"
          label="Fecha de provisión"
        />
        <p className="text-xs text-muted-foreground self-end">
          Se genera directamente desde los pedidos. No descuenta stock físico ni crea reservas automáticas.
        </p>
      </div>

      {isAllPending ? (
        <AllPendingSummaryView
          summary={pendingSummary}
          basePath="/matriz-operativa/mercado"
        />
      ) : model ? (
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
      ) : null}
    </div>
  );
}
