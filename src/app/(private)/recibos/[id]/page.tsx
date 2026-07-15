import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { QbInsumosBrand } from "@/components/branding/qb-insumos-brand";
import { PrintReceiptButton } from "@/components/qb-receipts/print-receipt-button";
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

function quantity(value: number) {
  return new Intl.NumberFormat("es-BO", { maximumFractionDigits: 3 }).format(value);
}

function dateText(value: string | null) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("es-BO", { day: "2-digit", month: "long", year: "numeric" });
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

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button asChild variant="outline">
          <Link href="/recibos">
            <ArrowLeft className="size-4" />
            Volver
          </Link>
        </Button>
        <PrintReceiptButton />
      </div>

      <section className="rounded-lg border bg-background p-6 print:border-none">
        <div className="flex flex-wrap items-start justify-between gap-6 border-b pb-5">
          <QbInsumosBrand variant="compact" showSubtitle />
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Recibo no fiscal</p>
            <h1 className="font-mono text-2xl font-semibold">{receipt.number}</h1>
            <p className="text-sm text-muted-foreground">
              Estado: {receipt.status}
            </p>
          </div>
        </div>

        <div className="grid gap-4 border-b py-5 md:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Cliente</p>
            <p className="mt-1 font-semibold">{receipt.customerName}</p>
            <p className="text-sm text-muted-foreground">{receipt.customerEmail}</p>
            {receipt.customerPhone ? (
              <p className="text-sm text-muted-foreground">{receipt.customerPhone}</p>
            ) : null}
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Periodo</p>
            <p className="mt-1 text-sm">
              {dateText(receipt.periodStart)} - {dateText(receipt.periodEnd)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Emision</p>
            <p className="mt-1 text-sm">{dateText(receipt.issuedAt ?? receipt.createdAt)}</p>
          </div>
        </div>

        <div className="border-b py-5">
          <p className="text-xs font-medium uppercase text-muted-foreground">Pedidos incluidos</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {receipt.orders.map((order) => (
              <span key={order.id} className="rounded-full border px-2 py-1 font-mono text-xs">
                {order.orderReference}
              </span>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto py-5">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-3">Producto</th>
                <th className="py-2 pr-3">Pedido</th>
                <th className="py-2 pr-3 text-right">Cantidad</th>
                <th className="py-2 pr-3 text-right">Precio base</th>
                <th className="py-2 pr-3 text-right">Precio final</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {receipt.lines.map((line) => (
                <tr key={line.id} className="border-b">
                  <td className="py-3 pr-3 font-medium">{line.productName}</td>
                  <td className="py-3 pr-3 font-mono text-xs text-muted-foreground">
                    {line.orderReference}
                  </td>
                  <td className="py-3 pr-3 text-right">
                    {quantity(line.deliveredBaseQuantity)} {line.baseUnitSymbol}
                  </td>
                  <td className="py-3 pr-3 text-right">{money(line.basePriceUsed)}</td>
                  <td className="py-3 pr-3 text-right">{money(line.finalUnitPrice)}</td>
                  <td className="py-3 text-right font-semibold">{money(line.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-4 border-t py-5 md:grid-cols-[1fr_280px]">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Factores aplicados</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Distancia {receipt.distanceFactorPercent}% · Exigencia {receipt.exigencyFactorPercent}% ·
              Clima {receipt.weatherFactorPercent}% · Extraordinario {receipt.extraordinaryFactorPercent}%
            </p>
            {receipt.visibleNote ? (
              <p className="mt-4 rounded-md bg-muted p-3 text-sm">{receipt.visibleNote}</p>
            ) : null}
          </div>
          <div className="space-y-2 rounded-lg border p-4">
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span>{receipt.hasPendingPrices ? "Precio pendiente" : money(receipt.subtotalAmount)}</span>
            </div>
            <div className="flex justify-between text-lg font-semibold">
              <span>Total</span>
              <span>{receipt.hasPendingPrices ? "Precio pendiente" : money(receipt.totalAmount)}</span>
            </div>
          </div>
        </div>

        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-center text-sm font-medium text-amber-800">
          No constituye factura fiscal ni comprobante de pago. No registra cobro, caja ni metodo de pago.
        </p>
      </section>
    </div>
  );
}
