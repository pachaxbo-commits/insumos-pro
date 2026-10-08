"use client";

import { Fragment, useActionState, useMemo, useState } from "react";
import Link from "next/link";
import Decimal from "decimal.js";
import { setQbReceiptLinePricingAction } from "@/lib/qb-receipts/actions";
import { resolveReceiptCostSnapshot } from "@/lib/qb-receipts/cost-source";
import { calculateReceiptLine, sumReceiptAmounts } from "@/lib/qb-receipts/line-pricing";
import type { QbReceipt, QbReceiptLine } from "@/types/qb-receipts";

type Draft = { cost: string; distance: string; exigency: string; weather: string;
  extraordinary: string; notes: string };

const money = (value: number | string | null) => value === null ? "Pendiente" :
  new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2,
    maximumFractionDigits: 2 }).format(Number(value));

function initialDraft(line: QbReceiptLine): Draft {
  const knownCost = line.costBaseUnitSnapshot ?? resolveReceiptCostSnapshot({
    deliveredQuantity: line.deliveredBaseQuantity,
    purchaseCostTotal: line.purchaseCostTotal,
  })?.costBaseUnit;
  return { cost: knownCost?.toString() ?? "",
    distance: String(line.distanceFactorPercent), exigency: String(line.exigencyFactorPercent),
    weather: String(line.weatherFactorPercent), extraordinary: String(line.extraordinaryFactorPercent),
    notes: line.notes ?? "" };
}

function linePreview(line: QbReceiptLine, draft: Draft, issuedSnapshot = false) {
  if (issuedSnapshot && line.costBaseUnitSnapshot !== null
    && line.costTotalPrecise !== null && line.saleTotalPrecise !== null
    && line.profitTotalPrecise !== null) {
    const quantity = new Decimal(line.deliveredBaseQuantity);
    const saleTotal = new Decimal(line.saleTotalPrecise);
    const profitTotal = new Decimal(line.profitTotalPrecise);
    return {
      factorTotalPct: new Decimal(line.distanceFactorPercent).plus(line.exigencyFactorPercent)
        .plus(line.weatherFactorPercent).plus(line.extraordinaryFactorPercent).toString(),
      costBaseUnit: line.costBaseUnitSnapshot,
      unitSale: quantity.isZero() ? "0" : saleTotal.div(quantity).toString(),
      unitProfit: line.profitUnitPrecise ?? (quantity.isZero() ? "0" : profitTotal.div(quantity).toString()),
      costTotal: line.costTotalPrecise,
      saleTotal: line.saleTotalPrecise,
      profitTotal: line.profitTotalPrecise,
    };
  }
  if (draft.cost.trim() === "") return null;
  try {
    return calculateReceiptLine({ quantity: line.deliveredBaseQuantity, costBaseUnit: draft.cost,
      factors: { distance: draft.distance, exigency: draft.exigency,
        weather: draft.weather, extraordinary: draft.extraordinary },
      fixedSaleTotal: line.inputMode === "amount_bs" ? line.fixedLineAmount : null });
  } catch { return null; }
}

export function ReceiptLineWorkspace({ receipt, relatedReceipts, emitAction, emitPending,
  voidAction, voidPending, hideMonthlySummary = false }: {
  receipt: QbReceipt; relatedReceipts: QbReceipt[];
  emitAction: (formData: FormData) => void; emitPending: boolean;
  voidAction: (formData: FormData) => void; voidPending: boolean;
  hideMonthlySummary?: boolean;
}) {
  const [state, action, pending] = useActionState(setQbReceiptLinePricingAction,
    { success: false });
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(receipt.lines.map((line) => [line.id, initialDraft(line)])));
  const [month, setMonth] = useState((receipt.periodEnd ?? receipt.createdAt).slice(0, 7));
  const [viewOrder, setViewOrder] = useState("all");
  const editable = receipt.status === "borrador";
  const hasUnsavedChanges = receipt.lines.some((line) =>
    JSON.stringify(drafts[line.id] ?? initialDraft(line)) !== JSON.stringify(initialDraft(line)));
  const lines = receipt.lines.filter((line) => viewOrder === "all" || line.orderId === viewOrder);
  const payload = JSON.stringify(receipt.lines.map((line) => {
    const draft = drafts[line.id] ?? initialDraft(line);
    return { lineId: line.id, costBaseUnit: draft.cost,
      distanceFactorPercent: draft.distance, exigencyFactorPercent: draft.exigency,
      weatherFactorPercent: draft.weather, extraordinaryFactorPercent: draft.extraordinary,
      notes: draft.notes };
  }));
  const previews = useMemo(() => receipt.lines.map((line) =>
    linePreview(line, drafts[line.id] ?? initialDraft(line), !editable)),
    [drafts, editable, receipt.lines]);
  const complete = previews.every(Boolean) && previews.length > 0;
  const totals = complete ? sumReceiptAmounts(previews.map((item) => ({
    costTotal: item!.costTotal, saleTotal: item!.saleTotal,
  }))) : null;
  const monthly = relatedReceipts.filter((item) => item.status === "emitido"
    && item.customerId === receipt.customerId
    && (item.periodEnd ?? item.issuedAt ?? item.createdAt).slice(0, 7) === month);
  const monthlyKnown = monthly.filter((item) => item.costTotalPrecise !== null
    || (item.lines.length > 0 && item.lines.every((line) => line.purchaseCostTotal !== null)));
  const monthlyAmounts = sumReceiptAmounts(monthlyKnown.map((item) => ({
    costTotal: item.costTotalPrecise ?? item.lines.reduce((sum, line) => sum + (line.purchaseCostTotal ?? 0), 0),
    saleTotal: item.saleTotalPrecise ?? item.totalAmount,
  })));

  function change(lineId: string, field: keyof Draft, value: string) {
    setDrafts((current) => ({ ...current, [lineId]: {
      ...(current[lineId] ?? initialDraft(receipt.lines.find((line) => line.id === lineId)!)),
      [field]: value,
    } }));
  }

  return <div className={hideMonthlySummary ? "min-w-0" : "grid gap-4 xl:grid-cols-[minmax(0,1fr)_270px]"}>
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h3 className="font-semibold">{receipt.customerName} · {receipt.number}</h3>
          <p className="text-xs text-muted-foreground">Cantidad real entregada y precio por producto</p></div>
        <label className="text-xs">Pedido
          <select className="ml-2 h-8 rounded border bg-white px-2" value={viewOrder}
            onChange={(event) => setViewOrder(event.target.value)}>
            <option value="all">Todos los pedidos</option>
            {receipt.orders.map((order) => <option key={order.orderId} value={order.orderId}>
              {order.orderReference}</option>)}
          </select>
        </label>
      </div>
      {state.message && <p role="status" className="rounded border px-2 py-1 text-sm">{state.message}</p>}
      <form action={action} className="space-y-3">
        <input type="hidden" name="receipt_id" value={receipt.id} />
        <input type="hidden" name="lines" value={payload} />
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[1380px] text-xs">
            <thead className="sticky top-0 z-10 bg-slate-100 text-left">
              <tr>{[
                "N°", "Código", "Producto", "UD", "Cant.", "Dist. %", "Exig. %", "Clima %",
                "Extra. %", "Factor total %", "Costo base/UD", "Precio anterior", "Precio venta/UD",
                "Precio ref. / @", "Costo total Bs", "Venta total Bs", "Utilidad Bs", "Utilidad Bs/UD", "Observación"
              ].map((name) => (
                <th key={name} className="whitespace-nowrap px-2 py-2 font-semibold">{name}</th>
              ))}</tr>
            </thead>
            <tbody>
              {receipt.orders.filter((order) => viewOrder === "all" || order.orderId === viewOrder)
                .map((order) => {
                  const orderLines = lines.filter((line) => line.orderId === order.orderId);
                  const categories = [...new Set(orderLines.map((line) => line.categoryName ?? "Sin categoría"))];
                  return categories.map((category) => <Fragment key={`${order.orderId}:${category}`}>
                    <tr className="bg-slate-50">
                      <td colSpan={19} className="px-2 py-1.5 font-semibold">
                        {order.orderReference} · {category}</td></tr>
                    {orderLines.filter((line) => (line.categoryName ?? "Sin categoría") === category)
                      .map((line, index) => {
                        const draft = drafts[line.id] ?? initialDraft(line);
                        const preview = linePreview(line, draft, !editable);
                        const arrobaRatio =
                          line.arrobaFactor !== null
                            ? line.arrobaFactor
                            : line.finalUnitPrice && line.finalUnitPrice > 0 && line.salePricePerArroba
                              ? line.salePricePerArroba / line.finalUnitPrice
                              : line.basePriceUsed && line.basePriceUsed > 0 && line.basePricePerArroba
                                ? line.basePricePerArroba / line.basePriceUsed
                                : null;
                        const previewUnitSale = preview?.unitSale ? Number(preview.unitSale) : null;
                        const arrobaDisplay =
                          previewUnitSale !== null && arrobaRatio !== null
                            ? Number((previewUnitSale * arrobaRatio).toFixed(2))
                            : line.salePricePerArroba;
                        const input = (field: keyof Draft, width = "w-16") =>
                          <input aria-label={`${field} ${line.productName}`} type={field === "notes" ? "text" : "number"}
                            min={field === "notes" ? undefined : 0} step={field === "notes" ? undefined : "any"}
                            disabled={!editable || (line.inputMode === "amount_bs" &&
                              ["distance","exigency","weather","extraordinary"].includes(field))}
                            className={`${width} h-8 rounded border bg-white px-1.5 text-right disabled:bg-slate-100`}
                            value={draft[field]} onChange={(event) => change(line.id, field, event.target.value)} />;
                        return <tr key={line.id} className="border-t align-middle">
                          <td className="px-2 py-1.5">{index + 1}</td>
                          <td className="px-2 py-1.5">{line.productCode ?? "—"}</td>
                          <td className="max-w-48 px-2 py-1.5 font-medium">{line.productName}</td>
                          <td className="px-2 py-1.5">{line.baseUnitSymbol}</td>
                          <td className="px-2 py-1.5 text-right">{line.deliveredBaseQuantity}</td>
                          <td className="px-1 py-1">{input("distance")}</td>
                          <td className="px-1 py-1">{input("exigency")}</td>
                          <td className="px-1 py-1">{input("weather")}</td>
                          <td className="px-1 py-1">{input("extraordinary")}</td>
                          <td className="px-2 py-1.5 text-right">{preview ? `${preview.factorTotalPct}%` : "—"}</td>
                          <td className="px-1 py-1">{input("cost", "w-24")}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-slate-600">
                            {line.previousSalePrice !== null ? money(line.previousSalePrice) : "Sin referencia"}
                          </td>
                          <td className="px-2 py-1.5 text-right font-semibold">{money(preview?.unitSale ?? null)}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-slate-600">
                            {arrobaDisplay !== null ? money(arrobaDisplay) : "Sin equivalencia"}
                          </td>
                          <td className="px-2 py-1.5 text-right">{money(preview?.costTotal ?? null)}</td>
                          <td className="px-2 py-1.5 text-right font-bold text-red-700">{money(preview?.saleTotal ?? null)}</td>
                          <td className="px-2 py-1.5 text-right">{money(preview?.profitTotal ?? null)}</td>
                          <td className="px-2 py-1.5 text-right">{money(preview?.unitProfit ?? null)}</td>
                          <td className="px-1 py-1">{input("notes", "w-28")}</td>
                        </tr>;
                      })}
                  </Fragment>);
                })}
            </tbody>
          </table>
        </div>
        {receipt.lines.some((line) => line.inputMode === "amount_bs") &&
          <p className="text-xs text-amber-700">Las líneas pedidas por Bs conservan su venta fija; sus factores no se editan.</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded border bg-emerald-50 p-3 text-sm">
          <span>Costo <b>{money(totals?.costTotal ?? null)} Bs</b></span>
          <span className="font-bold text-red-700">VENTA TOTAL (Bs): <b>{money(totals?.saleTotal ?? null)}</b> <span className="font-normal">· importe final a cobrar</span></span>
          <span>Utilidad <b>{money(totals?.profitTotal ?? null)} Bs</b></span>
          <span>Margen <b>{totals ? `${money(totals.marginPercent)}%` : "Pendiente"}</b></span>
        </div>
        {editable && <div className="flex flex-wrap gap-2">
          <button disabled={pending} className="rounded bg-emerald-800 px-3 py-2 text-sm text-white disabled:opacity-50">
            {pending ? "Guardando…" : "Guardar factores y costos"}</button>
          <Link href={`/recibos/${receipt.id}`} className="rounded border px-3 py-2 text-sm">Vista cliente</Link>
        </div>}
      </form>
      {editable && <div className="flex flex-wrap items-center gap-2">
        <form action={emitAction}><input type="hidden" name="receipt_id" value={receipt.id} />
          <button disabled={emitPending || receipt.hasPendingPrices || !complete || hasUnsavedChanges}
            className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">
            {emitPending ? "Emitiendo…" : "Emitir recibo"}</button></form>
        <form action={voidAction} className="flex gap-2">
          <input type="hidden" name="receipt_id" value={receipt.id} />
          <input name="reason" placeholder="Motivo de anulación" className="h-9 rounded border px-2 text-sm" />
          <button disabled={voidPending} className="rounded border px-3 text-sm">Anular</button>
        </form>
        {hasUnsavedChanges && <span className="text-xs text-amber-700">Guarda los cambios antes de emitir.</span>}
      </div>}
    </div>
    {!hideMonthlySummary && <aside className="self-start rounded-lg border p-3 text-sm">
      <label className="block text-xs font-medium">Resumen mensual
        <input type="month" value={month} onChange={(event) => setMonth(event.target.value)}
          className="mt-1 block h-8 w-full rounded border px-2" /></label>
      <div className="mt-3 space-y-2">
        {monthly.map((item) => {
          const knownCost = item.costTotalPrecise ?? (item.lines.every((line) => line.purchaseCostTotal !== null)
            ? item.lines.reduce((sum, line) => sum + (line.purchaseCostTotal ?? 0), 0) : null);
          const profit = knownCost === null ? null : new Decimal(item.saleTotalPrecise ?? item.totalAmount)
            .minus(knownCost).toString();
          const margin = profit === null || new Decimal(item.saleTotalPrecise ?? item.totalAmount).isZero()
            ? null : new Decimal(profit).div(item.saleTotalPrecise ?? item.totalAmount).times(100).toString();
          return <Link key={item.id} href={`/recibos/${item.id}`} className="block border-b pb-2">
            <span className="font-mono text-xs">{item.orders.map((order) => order.orderReference).join(", ")} · {item.number}</span>
            <span className="block text-xs text-muted-foreground">{(item.periodEnd ?? item.issuedAt ?? "").slice(0, 10)} · {item.paymentStatus.toUpperCase()}</span>
            <span className="block">Venta {money(item.saleTotalPrecise ?? item.totalAmount)} · Utilidad {profit === null ? "Sin costo histórico" : money(profit)} · {margin === null ? "—" : `${money(margin)}%`}</span>
          </Link>;
        })}
        {!monthly.length && <p className="text-muted-foreground">Sin recibos emitidos en este mes.</p>}
      </div>
      {monthlyKnown.length !== monthly.length && <p className="mt-2 text-xs text-amber-700">Hay recibos históricos sin costo; no se incluyen en el total de utilidad.</p>}
      <div className="mt-3 border-t pt-2 font-semibold">Venta {money(monthlyAmounts.saleTotal)} Bs<br />
        Utilidad {money(monthlyAmounts.profitTotal)} Bs<br />Margen {money(monthlyAmounts.marginPercent)}%</div>
    </aside>}
  </div>;
}
