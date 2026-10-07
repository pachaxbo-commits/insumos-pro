import { PageHeader } from "@/components/layout/page-header";
import { MarketSheetActions } from "@/components/operational-matrix/market-sheet-actions";
import { OperationalMatrix } from "@/components/operational-matrix/operational-matrix";
import { OperationalDateFilter } from "@/components/operational-matrix/operational-date-filter";
import { PendingWorkBar } from "@/components/operational-matrix/pending-work-bar";
import { AllPendingSummaryView } from "@/components/operational-matrix/all-pending-summary-view";
import { requireRoleAccess } from "@/lib/auth/session";
import { todayInBolivia } from "@/lib/date-time";
import { getOperationalMatrixData } from "@/lib/operational-matrix/data";
import {
  getPendingDeliveryWork,
  getPendingPreparationWork,
} from "@/lib/operational-matrix/pending-work";
import type { MatrixStage } from "@/types/operational-matrix";

function validDate(value: string | undefined, fallback: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
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
    allPending?: string;
  }>;
}) {
  const auth = await requireRoleAccess("/matriz-operativa");
  const params = await searchParams;
  const isInventory = auth.user.role === "inventario";
  const isDelivery = auth.user.role === "entregador";
  const isAdmin = auth.user.role === "administrador";

  const requestedMode = validMode(params.mode);
  const activeStage: MatrixStage =
    requestedMode ?? (isInventory ? "preparacion" : isDelivery ? "entrega" : "preparacion");
  const isAllPending = params.allPending === "1";

  // Only preparacion and entrega stages have operational pending work bars
  const hasPendingSupport = activeStage === "preparacion" || activeStage === "entrega";

  // Fetch pending work ONLY for stages that support it
  const pendingSummary =
    activeStage === "entrega"
      ? await getPendingDeliveryWork()
      : activeStage === "preparacion"
        ? await getPendingPreparationWork()
        : null;

  // If no date was explicitly provided, default to oldest pending date (if any and supported), otherwise today
  const explicitDate = params.date ?? params.fecha;
  const date = validDate(
    explicitDate,
    hasPendingSupport && pendingSummary?.oldestPendingDate
      ? pendingSummary.oldestPendingDate
      : todayInBolivia(),
  );

  const data = !(hasPendingSupport && isAllPending)
    ? await getOperationalMatrixData(date, auth.user.role!)
    : null;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={undefined}
        title={
          isAdmin
            ? "Preparación y entregas"
            : isInventory
              ? "Preparar pedidos"
              : "Registrar entregas"
        }
        description=""
      />

      {hasPendingSupport && pendingSummary ? (
        <PendingWorkBar
          summary={pendingSummary}
          currentDate={date}
          isAllPending={isAllPending}
          basePath="/matriz-operativa"
          mode={activeStage}
        />
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <OperationalDateFilter
          currentDate={date}
          mode={activeStage}
          basePath="/matriz-operativa"
        />
        {isAdmin ? <MarketSheetActions date={date} /> : null}
      </div>

      {hasPendingSupport && isAllPending && pendingSummary ? (
        <AllPendingSummaryView
          summary={pendingSummary}
          basePath="/matriz-operativa"
          mode={activeStage}
        />
      ) : data ? (
        <OperationalMatrix
          key={`${date}:${activeStage}`}
          data={data}
          initialStage={activeStage}
          initialOrderId={params.order}
        />
      ) : null}
    </div>
  );
}
