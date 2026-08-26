import Link from "next/link";
import { ArrowLeft, ClipboardList } from "lucide-react";

import { PrintReceiptButton } from "@/components/qb-receipts/print-receipt-button";
import { ReceiptDocument } from "@/components/qb-receipts/receipt-document";
import { ReceiptImageActions } from "@/components/qb-receipts/receipt-image-actions";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

      <Tabs defaultValue="cliente" className="space-y-4">
        <TabsList className="h-auto w-full flex-wrap justify-start rounded-xl bg-muted/70 p-1 print:hidden">
          <TabsTrigger value="cliente" className="min-h-10 flex-none px-4">
            Vista del cliente
          </TabsTrigger>
          <TabsTrigger value="administracion" className="min-h-10 flex-none px-4">
            Información interna
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cliente" className="space-y-3">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 print:hidden">
            Este es el documento que recibe el cliente. Solo muestra productos, cantidades,
            precio unitario de venta y total. Nunca incluye costo de compra ni utilidad.
          </div>
          <ReceiptDocument receipt={receipt} variant="customer-export" />
        </TabsContent>

        <TabsContent value="administracion" className="space-y-3">
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900 print:hidden">
            Información interna · No entregar al cliente. Esta vista contiene referencias de
            pedidos, precio de venta antes de factores y ajustes administrativos.
          </div>
          <ReceiptDocument receipt={receipt} variant="admin" />
        </TabsContent>
      </Tabs>

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
