import { QbInsumosBrand } from "@/components/branding/qb-insumos-brand";
import { formatBoliviaDate } from "@/lib/date-time";
import type { QbReceipt } from "@/types/qb-receipts";

type ReceiptDocumentVariant = "admin" | "customer-export" | "delivery-note";

function money(value: number | null) {
  if (value === null || value <= 0) return "Precio pendiente";
  return new Intl.NumberFormat("es-BO", {
    style: "currency",
    currency: "BOB",
    maximumFractionDigits: 2,
  }).format(value);
}

function quantity(value: number) {
  return new Intl.NumberFormat("es-BO", { maximumFractionDigits: 3 }).format(
    value,
  );
}

export function ReceiptDocument({
  id,
  receipt,
  variant,
}: {
  id?: string;
  receipt: QbReceipt;
  variant: ReceiptDocumentVariant;
}) {
  const isCustomerExport = variant === "customer-export";
  const isDeliveryNote = variant === "delivery-note";
  const isExternalDocument = isCustomerExport || isDeliveryNote;
  const showsPrices = !isDeliveryNote;

  return (
    <section
      id={id}
      data-qb-receipt-document={variant}
      data-qb-receipt-export={isExternalDocument ? true : undefined}
      className="qb-receipt-export-surface rounded-lg border bg-background p-6 print:border-none"
    >
      <div className="flex flex-wrap items-start justify-between gap-6 border-b pb-5">
        <QbInsumosBrand variant="compact" showSubtitle />
        <div className="text-right">
          <p className="text-sm text-muted-foreground">
            {isDeliveryNote
              ? "Documento de recepción"
              : isCustomerExport
                ? "Recibo"
                : "Recibo no fiscal"}
          </p>
          <h1 className="font-mono text-2xl font-semibold">
            {isDeliveryNote
              ? "Nota de entrega"
              : isCustomerExport
                ? "Comprobante de entrega"
                : receipt.number}
          </h1>
          {isCustomerExport ? (
            <p className="mt-1 font-mono text-sm text-muted-foreground">
              {receipt.number}
            </p>
          ) : null}
          {!isExternalDocument ? (
            <p className="text-sm text-muted-foreground">
              Estado: {receipt.status}
            </p>
          ) : null}
        </div>
      </div>

      <div
        className={`grid gap-4 border-b py-5 ${
          isExternalDocument ? "md:grid-cols-2" : "md:grid-cols-3"
        }`}
      >
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Cliente
          </p>
          <p className="mt-1 font-semibold">{receipt.customerName}</p>
          {!isExternalDocument ? (
            <>
              <p className="text-sm text-muted-foreground">
                {receipt.customerEmail}
              </p>
              {receipt.customerPhone ? (
                <p className="text-sm text-muted-foreground">
                  {receipt.customerPhone}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
        <div
          className={
            isExternalDocument ? "justify-self-end text-right" : undefined
          }
        >
          <p className="text-xs font-medium uppercase text-muted-foreground">
            {isExternalDocument ? "Fecha de entrega" : "Periodo"}
          </p>
          <p className="mt-1 text-sm">
            {isExternalDocument ? (
              formatBoliviaDate(receipt.periodEnd ?? receipt.periodStart)
            ) : (
              <>
                {formatBoliviaDate(receipt.periodStart)} -{" "}
                {formatBoliviaDate(receipt.periodEnd)}
              </>
            )}
          </p>
        </div>
        {!isExternalDocument ? (
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">
              {receipt.status === "borrador" ? "Creado" : "Emisión"}
            </p>
            <p className="mt-1 text-sm">
              {formatBoliviaDate(receipt.issuedAt ?? receipt.createdAt)}
            </p>
          </div>
        ) : null}
      </div>

      {!isExternalDocument ? <div className="border-b py-5">
        <p className="text-xs font-medium uppercase text-muted-foreground">
          Pedidos incluidos
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {receipt.orders.map((order) => (
            <span
              key={order.id}
              className="rounded-full border px-2 py-1 font-mono text-xs"
            >
              {order.orderReference}
            </span>
          ))}
        </div>
      </div> : null}

      <div data-qb-receipt-table className="overflow-x-auto py-5">
        <table
          className={`w-full text-sm ${isExternalDocument ? "min-w-[480px]" : "min-w-[760px]"}`}
        >
          <thead>
            <tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="py-2 pr-3">Producto</th>
              {!isExternalDocument ? <th className="py-2 pr-3">Pedido</th> : null}
              <th className="py-2 pr-3 text-right">Cantidad</th>
              {!isExternalDocument ? (
                <th className="py-2 pr-3 text-right">Venta antes de ajustes</th>
              ) : null}
              {showsPrices ? (
                <>
                  <th className="py-2 pr-3 text-right">Precio unitario</th>
                  <th className="py-2 text-right">Total</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {receipt.lines.map((line, index) => (
              <tr key={line.id} className="border-b">
                <td className="py-3 pr-3 font-medium">
                  {index + 1}. {line.productName}
                </td>
                {!isExternalDocument ? (
                  <td className="py-3 pr-3 font-mono text-xs text-muted-foreground">
                    {line.orderReference}
                  </td>
                ) : null}
                <td className="py-3 pr-3 text-right">
                  {quantity(line.deliveredBaseQuantity)} {line.baseUnitSymbol}
                </td>
                {!isExternalDocument ? (
                  <td className="py-3 pr-3 text-right">
                    {line.inputMode === "amount_bs"
                      ? `${money(line.originalBasePrice)} (referencia)`
                      : money(line.basePriceUsed)}
                  </td>
                ) : null}
                {showsPrices ? (
                  <>
                    <td className="py-3 pr-3 text-right">
                      {line.inputMode === "amount_bs"
                        ? `Importe fijo ${money(line.requestedAmountBs)}`
                        : money(line.finalUnitPrice)}
                    </td>
                    <td className="py-3 text-right font-semibold">
                      {money(line.lineTotal)}
                    </td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showsPrices ? <div
        className={`grid gap-4 border-t py-5 ${
          isCustomerExport ? "justify-end" : "md:grid-cols-[1fr_280px]"
        }`}
      >
        {!isExternalDocument ? (
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Factores aplicados
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Distancia {receipt.distanceFactorPercent}% · Exigencia{" "}
              {receipt.exigencyFactorPercent}% · Clima{" "}
              {receipt.weatherFactorPercent}% · Extraordinario{" "}
              {receipt.extraordinaryFactorPercent}%
            </p>
          </div>
        ) : null}
        <div className="w-[280px] space-y-2 rounded-lg border p-4">
          {!isExternalDocument ? (
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span>
                {receipt.hasPendingPrices
                  ? "Precio pendiente"
                  : money(receipt.subtotalAmount)}
              </span>
            </div>
          ) : null}
          <div className="flex justify-between text-lg font-semibold">
            <span>Total</span>
            <span>
              {receipt.hasPendingPrices
                ? "Precio pendiente"
                : money(receipt.totalAmount)}
            </span>
          </div>
        </div>
      </div> : (
        <div className="border-t py-5 text-sm text-muted-foreground">
          Documento sin precios para verificar las cantidades realmente entregadas.
        </div>
      )}

      {!isDeliveryNote && receipt.visibleNote ? (
        <div className="mb-5 rounded-md bg-muted p-3 text-sm">
          <p className="font-medium">Nota</p>
          <p className="mt-1 text-muted-foreground">{receipt.visibleNote}</p>
        </div>
      ) : null}

      {!isExternalDocument ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-center text-sm font-medium text-amber-800">
          No constituye factura fiscal ni comprobante de pago. No registra
          cobro, caja ni metodo de pago.
        </p>
      ) : null}
    </section>
  );
}
