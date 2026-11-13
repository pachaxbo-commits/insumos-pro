"use client";

import { Fragment, useActionState, useMemo, useState } from "react";
import Link from "next/link";
import Decimal from "decimal.js";
import { reviewQbLegacyReceiptCostAction, resolveQbDraftSaleTariffsAction, setQbReceiptLinePricingAction } from "@/lib/qb-receipts/actions";
import { resolveReceiptCostSnapshot } from "@/lib/qb-receipts/cost-source";
import { calculateIndependentSale } from "@/lib/qb-receipts/cost-basis";
import { calculateReceiptLine, sumReceiptAmounts } from "@/lib/qb-receipts/line-pricing";
import {
  formatReceiptActualWeight,
  formatReceiptCommercialQuantity,
} from "@/lib/qb-receipts/line-display";
import type { QbReceipt, QbReceiptLine } from "@/types/qb-receipts";

type Draft = { cost: string; distance: string; exigency: string; weather: string;
  extraordinary: string; notes: string };

const money = (value: number | string | null) => value === null ? "Pendiente" :
  new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2,
    maximumFractionDigits: 2 }).format(Number(value));
const actualWeight = (line: QbReceiptLine) => formatReceiptActualWeight(line);
const commercialQuantity = (line: QbReceiptLine) => formatReceiptCommercialQuantity(line);

function needsLegacyCostReview(line: QbReceiptLine) {
  return !line.salePriceIndependentSnapshot && line.costSource === "purchase_snapshot" &&
    !line.costRuleId && line.purchaseCostTotal === null && line.costBaseUnitSnapshot !== null &&
    line.purchaseCostReferenceValue === Number(line.costBaseUnitSnapshot) &&
    Boolean(line.purchaseCostReferenceUnitSymbol &&
      line.purchaseCostReferenceUnitSymbol.trim().toUpperCase() !== line.baseUnitSymbol.trim().toUpperCase());
}

function LegacyCostReview({ receiptId, line }: { receiptId: string; line: QbReceiptLine }) {
  const [state, action, pending] = useActionState(reviewQbLegacyReceiptCostAction, { success: false });
  const [cost, setCost] = useState("");
  const tariff = line.currentBasePriceUnitSymbol?.trim().toUpperCase() === "KG" ? line.currentBasePrice : null;
  const canReview = line.inputMode === "quantity" && line.baseUnitSymbol.trim().toUpperCase() === "KG" &&
    tariff !== null && tariff > 0 && line.costBaseUnitSnapshot !== null && line.saleTotalPrecise !== null;
  const validCost = /^\d+(?:\.\d{1,8})?$/.test(cost) && Number(cost) <= 99999999;
  const sale = canReview ? calculateIndependentSale({
    quantity: line.deliveredBaseQuantity,
    baseUnitPrice: tariff,
    factorsPercent: [line.distanceFactorPercent, line.exigencyFactorPercent,
      line.weatherFactorPercent, line.extraordinaryFactorPercent],
  }) : null;
  return <details className="rounded border border-amber-300 bg-amber-50 p-2 text-sm">
    <summary className="cursor-pointer font-semibold">Revisar costo histórico · {line.productName}</summary>
    <p className="mt-1">La referencia de compra de {money(line.purchaseCostReferenceValue)} Bs/{line.purchaseCostReferenceUnitSymbol}
      {" "}figura aplicada como {money(line.costBaseUnitSnapshot)} Bs/{line.baseUnitSymbol}.</p>
    {canReview && sale ? <form action={action} className="mt-2 space-y-2">
      <input type="hidden" name="receiptId" value={receiptId} />
      <input type="hidden" name="lineId" value={line.id} />
      <input type="hidden" name="oldCost" value={line.costBaseUnitSnapshot ?? ""} />
      <input type="hidden" name="oldSale" value={line.saleTotalPrecise ?? ""} />
      <input type="hidden" name="tariff" value={tariff} />
      <label className="block">Costo aprobado (Bs/KG)
        <input name="cost" type="number" min={0} max={99999999} step="0.00000001" required value={cost}
          onChange={(event) => setCost(event.target.value)} className="ml-2 w-32 rounded border bg-white p-1" />
      </label>
      <p>Costo total: {money(line.costTotalPrecise)} → {validCost ? money(new Decimal(cost).times(line.deliveredBaseQuantity).toString()) : "Pendiente"} Bs</p>
      <p>Venta total: {money(line.saleTotalPrecise)} → {money(sale.saleTotalPrecise)} Bs
        {" "}con tarifa de catálogo de {money(tariff)} Bs/KG y los factores guardados.</p>
      <label className="block">Motivo <input name="reason" required minLength={3} maxLength={500}
        className="ml-2 rounded border bg-white p-1" /></label>
      <label className="block"><input type="checkbox" name="confirmed" required /> Confirmo el costo, la tarifa y los importes revisados.</label>
      <button type="submit" disabled={pending || !validCost} className="rounded border bg-white px-2 py-1">Guardar corrección en borrador</button>
    </form> : <p>Requiere una tarifa aprobada en Bs/KG y una entrega histórica verificable en KG.</p>}
    {state.message ? <p role="status">{state.message}</p> : null}
  </details>;
}

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
  if (line.costCalculationStatus === "pending_weight") return null;
  if (line.costCalculationStatus === "pending_quantity" || line.costCalculationStatus === "invalid_reference") return null;
  const costValue = line.costRuleId ? line.costBaseUnitSnapshot : draft.cost;
  if (costValue === null || String(costValue).trim() === "") return null;
  try {
    if (line.salePriceIndependentSnapshot && line.inputMode !== "amount_bs") {
      if (line.basePriceUsed === null) return null;
      const quantity = new Decimal(line.deliveredBaseQuantity);
      const sale = calculateIndependentSale({ quantity: quantity.toString(), baseUnitPrice: line.basePriceUsed,
        factorsPercent: [draft.distance, draft.exigency, draft.weather, draft.extraordinary] });
      const saleTotal = new Decimal(sale.saleTotalPrecise);
      const costTotal = line.costRuleId && line.costTotalPrecise !== null
        ? new Decimal(line.costTotalPrecise)
        : quantity.times(costValue);
      const profitTotal = saleTotal.minus(costTotal);
      return {
        factorTotalPct: sale.factorTotalPercent,
        costBaseUnit: String(costValue),
        unitSale: quantity.isZero() ? "0" : saleTotal.div(quantity).toString(),
        unitProfit: quantity.isZero() ? "0" : profitTotal.div(quantity).toString(),
        costTotal: costTotal.toString(),
        saleTotal: saleTotal.toString(),
        profitTotal: profitTotal.toString(),
      };
    }
    return calculateReceiptLine({ quantity: line.deliveredBaseQuantity, costBaseUnit: costValue,
      factors: { distance: draft.distance, exigency: draft.exigency,
        weather: draft.weather, extraordinary: draft.extraordinary },
      fixedSaleTotal: line.inputMode === "amount_bs" ? line.fixedLineAmount : null });
  } catch { return null; }
}

type ReceiptLineWorkspaceProps = {
  receipt: QbReceipt; relatedReceipts: QbReceipt[];
  emitAction: (formData: FormData) => void; emitPending: boolean;
  voidAction: (formData: FormData) => void; voidPending: boolean;
  hideMonthlySummary?: boolean;
};

export function ReceiptLineWorkspace(props: ReceiptLineWorkspaceProps) {
  return <AdminReceiptLineWorkspace {...props} />;
}

function AdminReceiptLineWorkspace({ receipt, relatedReceipts, emitAction, emitPending,
  voidAction, voidPending, hideMonthlySummary = false }: ReceiptLineWorkspaceProps) {
  const [state, action, pending] = useActionState(setQbReceiptLinePricingAction,
    { success: false });
  const [tariffState, resolveTariffs, resolvingTariffs] = useActionState(resolveQbDraftSaleTariffsAction,
    { success: false });
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(receipt.lines.map((line) => [line.id, initialDraft(line)])));
  const [month, setMonth] = useState((receipt.periodEnd ?? receipt.createdAt).slice(0, 7));
  const [viewOrder, setViewOrder] = useState("all");
  const editable = receipt.status === "borrador";
  const legacyCostLines = receipt.lines.filter(needsLegacyCostReview);
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
      {editable && receipt.lines.some((line) => line.inputMode === "quantity" &&
        line.salePriceIndependentSnapshot && line.basePriceUsed === null) ? (
        <form action={resolveTariffs} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="receipt_id" value={receipt.id} />
          <button type="submit" disabled={resolvingTariffs || pending} className="rounded border px-3 py-2 text-sm">
            Aplicar tarifas pendientes del catálogo
          </button>
        </form>
      ) : null}
      {tariffState.message ? <p role="status" className="text-sm">{tariffState.message}</p> : null}
      {editable ? legacyCostLines.map((line) => <LegacyCostReview key={line.id} receiptId={receipt.id} line={line} />) : null}
      <form action={action} className="space-y-3">
        <input type="hidden" name="receipt_id" value={receipt.id} />
        <input type="hidden" name="lines" value={payload} />
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[1380px] text-xs">
            <thead className="sticky top-0 z-10 bg-slate-100 text-left">
              <tr>{[
                "N°", "Código", "Producto", "UD", "Cantidad comercial", "Peso real", "Dist. %", "Exig. %", "Clima %",
                "Extra. %", "Factor total %", "Tarifa de costo", "Precio anterior", "Tarifa de venta",
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
                      <td colSpan={20} className="px-2 py-1.5 font-semibold">
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
                            : editable ? null : line.salePricePerArroba;
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
                          <td className="whitespace-nowrap px-2 py-1.5 text-right">{commercialQuantity(line)}</td>
                          <td className="whitespace-nowrap px-2 py-1.5">{actualWeight(line)}</td>
                          <td className="px-1 py-1">{input("distance")}</td>
                          <td className="px-1 py-1">{input("exigency")}</td>
                          <td className="px-1 py-1">{input("weather")}</td>
                          <td className="px-1 py-1">{input("extraordinary")}</td>
                          <td className="px-2 py-1.5 text-right">{preview ? `${preview.factorTotalPct}%` : "—"}</td>
                          <td className="px-2 py-1.5">{line.costRuleId ? <span className="whitespace-nowrap text-xs">
                            {money(line.costRateSnapshot)} Bs / {line.costBasisSnapshot === "actual_weight" ? line.costReferenceUnitSymbolSnapshot : line.commercialUnitLabelSnapshot}
                            {line.costCalculationStatus !== "ready" && <span className="ml-1 text-amber-700">· {line.costCalculationStatus === "pending_weight" ? "Peso pendiente" : "Revisar regla"}</span>}
                          </span> : <div className="whitespace-nowrap">
                            {needsLegacyCostReview(line) ? <>
                              <span>{money(line.costBaseUnitSnapshot)} Bs/{line.baseUnitSymbol} aplicado</span>
                              <span className="block font-medium text-amber-800">
                                Revisar · {money(line.purchaseCostReferenceValue)} Bs/{line.purchaseCostReferenceUnitSymbol} de referencia
                              </span>
                            </> : <>{input("cost", "w-24")} <span>Bs/{line.baseUnitSymbol}</span></>}
                          </div>}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-slate-600">
                            {line.previousSalePrice !== null ? money(line.previousSalePrice) : "Sin referencia"}
                          </td>
                          <td className="px-2 py-1.5 text-right font-semibold">{money(preview?.unitSale ?? null)} {preview && line.inputMode !== "amount_bs" ? "Bs/" + line.baseUnitSymbol : null}</td>
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
          <button disabled={pending || legacyCostLines.length > 0} className="rounded bg-emerald-800 px-3 py-2 text-sm text-white disabled:opacity-50">
            {pending ? "Guardando…" : "Guardar factores y costos"}</button>
          <Link href={`/recibos/${receipt.id}`} className="rounded border px-3 py-2 text-sm">Vista cliente</Link>
        </div>}
      </form>
      {editable && <div className="flex flex-wrap items-center gap-2">
        <form action={emitAction}><input type="hidden" name="receipt_id" value={receipt.id} />
          <button disabled={emitPending || legacyCostLines.length > 0 || receipt.hasPendingPrices || !complete || hasUnsavedChanges}
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
