import Link from "next/link";
import { ArrowLeft, ClipboardList } from "lucide-react";

import { PrintReceiptButton } from "@/components/qb-receipts/print-receipt-button";
import { ReceiptDocument } from "@/components/qb-receipts/receipt-document";
import { ReceiptImageActions } from "@/components/qb-receipts/receipt-image-actions";
import { Button } from "@/components/ui/button";
import { requireRoleAccess } from "@/lib/auth/session";
import { getQbReceiptDetailData } from "@/lib/qb-receipts/data";

function money(value: number | null) {
  if (value === null || value <= 0) return "Precio pendiente";
  return new Intl.NumberFormat("es-BO", {
    style: "currency",
    currency: "BOB",
    maximumFractionDigits: 2,
  }).format(value);
}

export default async function ReceiptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRoleAccess("/recibos");
  const { id } = await params;
  const { receipt, error } = await getQbReceiptDetailData(id);

  if (!receipt) {
    return (
      <div className="space-y-4">
        <Button asChild variant="outline">
          <Link href="/recibos">
            <ArrowLeft className="size-4" />
            Volver
          </Link>
        </Button>
        <div className="rounded-lg border bg-background p-8 text-sm text-muted-foreground">
          {error ?? "Recibo QB no disponible."}
        </div>
      </div>
    );
  }

  const receiptTargetId = "qb-receipt-export";
  const receiptTotalText = receipt.hasPendingPrices
    ? "Precio pendiente"
    : money(receipt.totalAmount);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button asChild variant="outline">
          <Link href="/recibos">
            <ArrowLeft className="size-4" />
            Volver
          </Link>
        </Button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {receipt.status !== "anulado" ? (
            <Button asChild variant="outline">
              <Link href={`/recibos/${receipt.id}/nota-entrega`}>
                <ClipboardList className="size-4" />
                Nota sin precios
              </Link>
            </Button>
          ) : null}
          {receipt.status === "emitido" ? (
            <ReceiptImageActions
              receiptNumber={receipt.number}
              targetId={receiptTargetId}
              totalText={receiptTotalText}
            />
          ) : null}
          <PrintReceiptButton />
        </div>
      </div>

      <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 print:hidden">
        Esta es la vista administrativa. Los códigos internos y precios base no aparecen en la
        imagen que se entrega al cliente. La descarga para el cliente se habilita al emitir.
      </div>

      <ReceiptDocument receipt={receipt} variant="admin" />

      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-[-10000px] top-0 w-[900px] print:hidden"
      >
        <ReceiptDocument
          id={receiptTargetId}
          receipt={receipt}
          variant="customer-export"
        />
      </div>
    </div>
  );
}
