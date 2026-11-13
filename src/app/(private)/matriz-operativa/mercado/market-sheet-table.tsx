"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import type { MarketSheetModel, MarketSheetRow } from "@/lib/market-sheet/model";
import styles from "./market-sheet-table.module.css";
import { costPerBaseUnitFromReference, costPerReferenceUnitFromBase } from "@/lib/market-sheet/model";
import {
  updateMarketSheetProductCostAction,
  updateMarketSheetProductActualAction,
} from "@/lib/market-sheet/actions";

function formatQuantity(value: number) {
  return new Intl.NumberFormat("es-BO", { maximumFractionDigits: 3 }).format(
    value,
  );
}

function formatNullableQuantity(value: number | null) {
  return value === null ? "Revisar" : formatQuantity(value);
}

function formatMoney(value: number | null) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("es-BO", {
    style: "currency",
    currency: "BOB",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function preparationWeightText(line: MarketSheetRow["lines"][number]) {
  if (line.actualWeightValue !== null && line.actualWeightUnitSymbol) {
    return `Peso preparado ${formatQuantity(line.actualWeightValue)} ${line.actualWeightUnitSymbol}`;
  }
  if (line.actualWeightKg !== null) {
    return `Peso preparado ${formatQuantity(line.actualWeightKg)} KG (normalizado; unidad original no registrada)`;
  }
  return null;
}

function deliveryWeightText(line: MarketSheetRow["lines"][number]) {
  if (line.deliveredWeightValue !== null && line.deliveredWeightUnitSymbol) {
    return `Peso real entregado ${formatQuantity(line.deliveredWeightValue)} ${line.deliveredWeightUnitSymbol}`;
  }
  if (line.deliveredWeightKg !== null) {
    return `Peso real entregado ${formatQuantity(line.deliveredWeightKg)} KG (normalizado; unidad original no registrada)`;
  }
  return null;
}

export function MarketSheetTable({
  model,
  isAdmin,
}: {
  model: MarketSheetModel;
  isAdmin: boolean;
}) {
  const customerPages = Array.from(
    { length: Math.ceil(model.customers.length / 2) },
    (_, index) => model.customers.slice(index * 2, index * 2 + 2),
  );

  return (
    <>
    <div className={`${styles.screenTable} mt-3 overflow-x-auto`}>
      <table className="w-full min-w-max border-collapse text-[10px]">
        <thead>
          <tr className="bg-slate-200">
            <th className="border border-slate-500 px-2 py-2">N°</th>
            <th className="min-w-52 border border-slate-500 px-2 py-2 text-left">
              PRODUCTO
            </th>
            <th className="border border-slate-500 px-2 py-2">UD</th>
            {model.customers.map((customer) => (
              <th key={customer.key} className="min-w-52 border border-slate-500 px-2 py-2 text-center">
                <div>{customer.name}</div>
                <div className="mt-1 grid grid-cols-[minmax(0,1fr)_2rem] text-[9px] font-medium">
                  <span>Solicitado · Entregado · Pendiente</span>
                  <span>Notas</span>
                </div>
              </th>
            ))}
            <th className="border border-slate-500 bg-emerald-100 px-2 py-2 font-bold">
              SOLICITADO
            </th>
            <th className="border border-slate-500 bg-emerald-50 px-2 py-2 font-bold">
              ENTREGADO
            </th>
            <th className="border border-slate-500 bg-amber-50 px-2 py-2 font-bold">
              PENDIENTE
            </th>
            <th className="border border-slate-500 bg-sky-100 px-2 py-2 font-bold">
              STOCK ACTUAL DISPONIBLE
            </th>
            <th className="border border-slate-500 bg-amber-100 px-2 py-2 font-bold">
              A PROVISIONAR
            </th>
            <th className="min-w-28 border border-slate-500 bg-slate-100 px-2 py-2 font-bold">
              PESO / CANT. REAL
            </th>
            <th className="min-w-28 border border-slate-500 bg-indigo-50 px-2 py-2 font-bold">
              COSTO DE PROVISIÓN POR UNIDAD FÍSICA
            </th>
          </tr>
        </thead>
        <tbody>
          {model.rows.map((row, index) => (
            <MarketSheetTableRow
              key={row.key}
              row={row}
              costReferenceUnits={model.costReferenceUnits}
              index={index}
              customers={model.customers}
              isAdmin={isAdmin}
            />
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-emerald-100 font-bold">
            <th
              colSpan={3}
              className="border-y-2 border-emerald-800 px-2 py-2 text-left"
            >
              PRODUCTOS CON PEDIDO · {model.totalLineCount} CLIENTE-PRODUCTO
            </th>
            {model.customers.map((customer, customerIndex) => (
              <th key={customer.key} className="border-y-2 border-emerald-800 p-0">
                <div className="grid min-w-32 grid-cols-2">
                  <span className="px-1 py-2 text-center">{model.customerLineCounts[customerIndex]}</span>
                  <span aria-hidden="true" className="border-l border-emerald-800 px-1 py-2">&nbsp;</span>
                </div>
              </th>
            ))}
            <th className="border-y-2 border-emerald-800" colSpan={7} />
          </tr>
        </tfoot>
      </table>
    </div>
    <div className={styles.printPages}>
      {customerPages.map((customers, pageIndex) => {
        const customerIndexes = customers.map((customer) => model.customers.indexOf(customer));
        return (
          <section key={pageIndex} className={styles.printPage}>
            <h2 className="mb-1 text-center text-base font-bold">QB INSUMOS · HOJA DE PROVISIÓN</h2>
            <p className="mb-2 text-center text-xs">Fecha operativa: {model.operationalDate} · Clientes {customers.map((customer) => customer.name).join(" · ")}</p>
            <table>
              <thead>
                <tr>
                  <th style={{ width: "3%" }}>N°</th>
                  <th style={{ width: "13%" }}>PRODUCTO</th>
                  <th style={{ width: "5%" }}>UD</th>
                  {customers.map((customer) => <th key={customer.key} style={{ width: "17%" }}>{customer.name}<br />Solicitado · Entregado · Pendiente</th>)}
                  <th style={{ width: "5.5%" }}>SOLICITADO</th>
                  <th style={{ width: "5.5%" }}>ENTREGADO</th>
                  <th style={{ width: "5.5%" }}>PENDIENTE</th>
                  <th style={{ width: "5.5%" }}>STOCK</th>
                  <th style={{ width: "5.5%" }}>A PROVISIONAR</th>
                  <th style={{ width: "6%" }}>PESO / CANT. REAL</th>
                  <th style={{ width: "8%" }}>COSTO PROVISIÓN</th>
                </tr>
              </thead>
              <tbody>
                {model.rows.map((row, rowIndex) => (
                  <tr key={row.key} style={{ backgroundColor: row.productColor ?? "#fff" }}>
                    <td>{rowIndex + 1}</td>
                    <td>{row.productName}</td>
                    <td>{row.unit}</td>
                    {customerIndexes.map((customerIndex) => (
                      <td key={customerIndex}>
                        {row.customerLines[customerIndex]?.map((line) => (
                          <div key={line.orderItemId}>
                            Sol. {formatQuantity(line.requestedQuantity)} {line.requestedUnitLabel}<br />
                            Ent. {formatQuantity(line.deliveredDisplayQuantity)} {line.deliveredUnitLabel}
                            {deliveryWeightText(line) ? ` · ${deliveryWeightText(line)}` : ""}<br />
                            {preparationWeightText(line) ? <>{preparationWeightText(line)}<br /></> : null}
                            {line.deliveredDisplayWarning ? <span className="font-semibold text-amber-800">{line.deliveredDisplayWarning}<br /></span> : null}
                            Pend. {line.pendingBaseQuantity === null ? "Revisar conversión" : `${formatQuantity(line.pendingBaseQuantity)} ${row.unit}`}
                          </div>
                        ))}
                      </td>
                    ))}
                    <td>{formatNullableQuantity(row.requestedTotal)} {row.unit}</td>
                    <td>{formatNullableQuantity(row.deliveredTotal)} {row.unit}</td>
                    <td>{formatNullableQuantity(row.pendingTotal)} {row.unit}</td>
                    <td>{formatNullableQuantity(row.stockAvailable)} {row.stockAvailable === null ? "" : row.unit}</td>
                    <td>{row.toProvision === null ? "Revisar unidad" : row.pendingTotal === 0 ? "Sin pendiente" : `${formatQuantity(row.toProvision)} ${row.unit}`}</td>
                    <td>{row.actualWeightOrQuantity === null ? "—" : `${formatQuantity(row.actualWeightOrQuantity)} ${row.controlsActualWeight ? "KG normalizado" : row.unit}`}</td>
                    <td>{isAdmin && row.provisionCostUnit !== null ? `${formatMoney(row.provisionCostUnit)} / ${row.unit}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
    </>
  );
}

function MarketSheetTableRow({
  row,
  costReferenceUnits,
  index,
  customers,
  isAdmin,
}: {
  row: MarketSheetRow;
  costReferenceUnits: MarketSheetModel["costReferenceUnits"];
  index: number;
  customers: MarketSheetModel["customers"];
  isAdmin: boolean;
}) {
  const [actualInput, setActualInput] = useState<string>(
    row.actualWeightOrQuantity !== null ? String(row.actualWeightOrQuantity) : "",
  );
  const [costInput, setCostInput] = useState<string>(
    row.provisionCostUnit !== null ? String(row.provisionCostUnit) : "",
  );
  const [costReferenceUnitId, setCostReferenceUnitId] = useState("base");
  const [isSavingActual, startActualTransition] = useTransition();
  const [isSavingCost, startCostTransition] = useTransition();
  const [savedActual, setSavedActual] = useState(false);
  const [savedCost, setSavedCost] = useState(false);

  const handleBlurActual = () => {
    if (row.unitReviewRequired) {
      toast.error("Resuelve la unidad base de este producto antes de distribuir cantidades.");
      return;
    }
    const raw = actualInput.trim();
    const parsed = raw === "" ? null : Number(raw.replace(",", "."));
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) {
      toast.error("Ingresa una cantidad o peso válido.");
      return;
    }
    if (parsed === row.actualWeightOrQuantity) return;

    startActualTransition(async () => {
      const res = await updateMarketSheetProductActualAction(
        row.productId,
        row.controlsActualWeight,
        parsed,
        row.lines,
      );
      if (res.success) {
        setSavedActual(true);
        setTimeout(() => setSavedActual(false), 2000);
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    });
  };

  const handleBlurCost = () => {
    if (!isAdmin || row.unitReviewRequired) return;
    const raw = costInput.trim();
    const parsed = raw === "" ? null : Number(raw.replace(",", "."));
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) {
      toast.error("Ingresa un costo de provisión válido.");
      return;
    }
    const baseFactor = row.baseUnitKgFactor;
    const referenceFactor = costReferenceUnits.find((unit) => unit.id === costReferenceUnitId)?.kilograms
      ?? baseFactor;
    const normalizedCost = parsed === null
      ? null
      : baseFactor !== null && referenceFactor !== null
        ? costPerBaseUnitFromReference(parsed, referenceFactor, baseFactor)
        : parsed;
    if (parsed !== null && normalizedCost === null) {
      toast.error("No hay una equivalencia física validada para convertir este costo.");
      return;
    }
    const existingAtReference = row.provisionCostUnit === null
      ? null
      : baseFactor !== null && referenceFactor !== null
        ? costPerReferenceUnitFromBase(row.provisionCostUnit, referenceFactor, baseFactor)
        : row.provisionCostUnit;
    if (parsed === existingAtReference) return;

    startCostTransition(async () => {
      const lineIds = row.lines.map((line) => line.orderItemId);
      const res = await updateMarketSheetProductCostAction(
        lineIds,
        normalizedCost,
      );
      if (res.success) {
        setSavedCost(true);
        setTimeout(() => setSavedCost(false), 2000);
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    });
  };

  return (
    <tr
      style={{ backgroundColor: row.productColor ?? "#FFFFFF" }}
      className="border-b border-slate-300"
    >
      <td className="border-r border-slate-300 px-2 py-1 text-center font-mono">
        {index + 1}
      </td>
      <td className="border-r border-slate-300 px-2 py-1 font-medium text-slate-900">
        {row.productName}
      </td>
      <td className="border-r border-slate-300 px-2 py-1 text-center font-medium text-slate-700">
        {row.unit}
      </td>

      {/* Customer order quantities */}
      {row.customerLines.map((lines, customerIndex) => (
        <td
          key={customers[customerIndex]?.key}
          aria-label={`${row.productName} para ${customers[customerIndex]?.name}: ${lines.length} línea(s), solicitado, entregado y pendiente detallados`}
          className="border-r border-slate-500 p-0"
        >
          <div className="min-w-52 divide-y divide-slate-200">
            {lines.length ? lines.map((line) => (
              <div key={line.orderItemId} className="px-2 py-1 text-[9px] leading-4">
                <div><b>Solicitado:</b> {formatQuantity(line.requestedQuantity)} {line.requestedUnitLabel}</div>
                <div>
                  <b>Entregado:</b> {formatQuantity(line.deliveredDisplayQuantity)} {line.deliveredUnitLabel}
                  {deliveryWeightText(line) ? ` · ${deliveryWeightText(line)}` : ""}
                </div>
                {preparationWeightText(line) ? <div>{preparationWeightText(line)}</div> : null}
                {line.deliveredDisplayWarning ? <div className="font-semibold text-amber-800">{line.deliveredDisplayWarning}</div> : null}
                <div className={line.pendingBaseQuantity === null ? "font-semibold text-amber-800" : "text-slate-600"}>
                  <b>Pendiente:</b> {line.pendingBaseQuantity === null ? "Revisar conversión" : `${formatQuantity(line.pendingBaseQuantity)} ${row.unit}`}
                </div>
              </div>
            )) : <span aria-hidden="true" className="block min-h-6 px-2 py-1">&nbsp;</span>}
          </div>
        </td>
      ))}

      {/* Physical quantities are reported only in the product's base unit. */}
      <td className="border-r border-slate-400 bg-emerald-50 px-2 py-1 text-center font-bold text-slate-900">
        {formatNullableQuantity(row.requestedTotal)}
      </td>
      <td className="border-r border-slate-300 bg-emerald-50 px-2 py-1 text-center font-medium text-slate-900">
        {formatNullableQuantity(row.deliveredTotal)}
      </td>
      <td className="border-r border-slate-300 bg-amber-50 px-2 py-1 text-center font-medium text-slate-900">
        {formatNullableQuantity(row.pendingTotal)}
      </td>

      {/* Available stock */}
      <td className="border-r border-slate-300 bg-sky-50 px-2 py-1 text-center font-medium text-slate-900">
        {formatNullableQuantity(row.stockAvailable)}
      </td>

      {/* To provision */}
      <td
        className={`border-r border-slate-300 px-2 py-1 text-center font-bold ${
          row.isCoveredByStock === true
            ? "bg-emerald-100 text-emerald-900"
            : row.isCoveredByStock === false ? "bg-rose-50 text-rose-700" : "bg-amber-100 text-amber-900"
        }`}
      >
        {row.toProvision === null ? (
          <span className="font-semibold">Revisar unidad</span>
        ) : row.toProvision > 0 ? (
          formatQuantity(row.toProvision)
        ) : row.pendingTotal === 0 ? (
          <span className="inline-block rounded bg-slate-100 px-1 py-0.5 text-[9px] font-semibold text-slate-700">
            Sin pendiente
          </span>
        ) : (
          <span className="inline-block rounded bg-emerald-200 px-1 py-0.5 text-[9px] font-semibold text-emerald-800">
            Cubierto por stock
          </span>
        )}
      </td>

      {/* Real weight / quantity editable */}
      <td className="border-r border-slate-300 bg-slate-50/70 px-1.5 py-1 text-center">
        {row.unitReviewRequired ? (
          <span className="text-[9px] font-semibold text-amber-800">Revisar unidad base</span>
        ) : null}
        {row.controlsActualWeight ? (
          <div className="space-y-1">
            {row.actualWeightOrQuantity === null ? (
              <div className="font-medium text-slate-800">Peso pendiente</div>
            ) : (
              <div className="space-y-0.5 text-left">
                <div className="font-medium text-slate-800">
                  Total normalizado: {formatQuantity(row.actualWeightOrQuantity)} KG
                </div>
                {row.lines.filter((line) => line.actualWeightKg !== null).map((line) => (
                  <div key={line.orderItemId} className="text-[9px] text-slate-600">
                    {line.actualWeightValue !== null && line.actualWeightUnitSymbol
                      ? `${formatQuantity(line.actualWeightValue)} ${line.actualWeightUnitSymbol}`
                      : `${formatQuantity(line.actualWeightKg!)} KG · unidad original no registrada`}
                  </div>
                ))}
              </div>
            )}
            <p className="text-[9px] leading-tight text-slate-600 print:hidden">
              Edita el peso y su unidad original desde Preparación.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-center gap-1 print:hidden">
              <input
                type="text"
                inputMode="decimal"
                value={actualInput}
                onChange={(e) => setActualInput(e.target.value)}
                onBlur={handleBlurActual}
                onKeyDown={(e) => e.key === "Enter" && handleBlurActual()}
                disabled={isSavingActual || row.unitReviewRequired || row.lines.length > 1}
                placeholder={row.actualWeightOrQuantity !== null ? String(row.actualWeightOrQuantity) : "—"}
                aria-label={`Peso o cantidad real de ${row.productName}`}
                className="h-6 w-16 rounded border border-slate-300 bg-white px-1 text-right text-[10px] font-medium text-slate-900 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:opacity-60"
              />
              <span className="text-[9px] text-slate-500">{row.unit}</span>
              {isSavingActual ? (
                <Loader2 className="size-3 animate-spin text-slate-400" />
              ) : savedActual ? (
                <Check className="size-3 text-emerald-600" />
              ) : null}
            </div>
            {row.lines.length > 1 ? (
              <p className="print:hidden text-[9px] leading-tight text-amber-800">
                Fila agrupada: edita cada pedido desde Preparación.
              </p>
            ) : null}
            <div className="hidden print:block text-center font-medium">
              {row.actualWeightOrQuantity !== null
                ? `${formatQuantity(row.actualWeightOrQuantity)} ${row.controlsActualWeight ? "KG normalizado" : row.unit}`
                : "—"}
            </div>
          </>
        )}
      </td>

      {/* Provision cost editable */}
      <td className="border-r border-slate-300 bg-indigo-50/40 px-1.5 py-1 text-center">
        {isAdmin ? (
          <div className="flex flex-col items-center justify-center gap-1 print:hidden">
            <span className="text-[9px] font-medium text-slate-600">
              Bs / {costReferenceUnits.find((unit) => unit.id === costReferenceUnitId)?.symbol || row.unit} (se guarda por {row.unit})
            </span>
            {row.baseUnitKgFactor !== null && costReferenceUnits.length > 0 ? (
              <select
                aria-label={`Unidad de referencia del costo de ${row.productName}`}
                className="h-6 max-w-28 rounded border border-slate-300 bg-white px-1 text-[9px]"
                value={costReferenceUnitId}
                disabled={row.unitReviewRequired}
                onChange={(event) => {
                  const nextId = event.target.value;
                  const oldFactor = costReferenceUnits.find((unit) => unit.id === costReferenceUnitId)?.kilograms ?? row.baseUnitKgFactor!;
                  const nextFactor = costReferenceUnits.find((unit) => unit.id === nextId)?.kilograms ?? row.baseUnitKgFactor!;
                  const current = costInput.trim() ? Number(costInput.replace(",", ".")) : null;
                  setCostInput(current !== null && Number.isFinite(current)
                    ? String(Number((current * nextFactor / oldFactor).toFixed(8)))
                    : costInput);
                  setCostReferenceUnitId(nextId);
                }}
              >
                <option value="base">Por {row.unit} (base)</option>
                {costReferenceUnits.map((unit) => <option key={unit.id} value={unit.id}>Por {unit.symbol || unit.name}</option>)}
              </select>
            ) : null}
            <div className="flex items-center justify-center gap-1">
            <span className="text-[9px] text-slate-500">Bs</span>
            <input
              type="text"
              inputMode="decimal"
              value={costInput}
              onChange={(e) => setCostInput(e.target.value)}
              onBlur={handleBlurCost}
              onKeyDown={(e) => e.key === "Enter" && handleBlurCost()}
              disabled={isSavingCost || row.unitReviewRequired}
              placeholder={row.provisionCostUnit !== null ? String(row.provisionCostUnit) : "—"}
              aria-label={`Costo de provisión en bolivianos por ${costReferenceUnits.find((unit) => unit.id === costReferenceUnitId)?.symbol || row.unit} para ${row.productName}`}
              className="h-6 w-16 rounded border border-slate-300 bg-white px-1 text-right text-[10px] font-medium text-slate-900 shadow-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 disabled:opacity-60"
            />
            {isSavingCost ? (
              <Loader2 className="size-3 animate-spin text-slate-400" />
            ) : savedCost ? (
              <Check className="size-3 text-emerald-600" />
            ) : null}
            </div>
          </div>
        ) : (
          <span className="print:hidden">
            {row.provisionCostUnit !== null ? formatMoney(row.provisionCostUnit) : "—"}
          </span>
        )}
        <div className="hidden print:block text-center font-medium">
          {row.provisionCostUnit !== null ? `${formatMoney(row.provisionCostUnit)} / ${row.unit}` : "—"}
        </div>
      </td>
    </tr>
  );
}
