"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import type { MarketSheetModel, MarketSheetRow } from "@/lib/market-sheet/model";
import {
  updateMarketSheetProductCostAction,
  updateMarketSheetProductActualAction,
} from "@/lib/market-sheet/actions";

function formatQuantity(value: number) {
  return new Intl.NumberFormat("es-BO", { maximumFractionDigits: 3 }).format(
    value,
  );
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

export function MarketSheetTable({
  model,
  isAdmin,
}: {
  model: MarketSheetModel;
  isAdmin: boolean;
}) {
  return (
    <div className="mt-3 overflow-x-auto print:overflow-visible">
      <table className="w-full min-w-max border-collapse text-[10px]">
        <thead>
          <tr className="bg-slate-200">
            <th className="border border-slate-500 px-2 py-2">N°</th>
            <th className="min-w-52 border border-slate-500 px-2 py-2 text-left">
              PRODUCTO
            </th>
            <th className="border border-slate-500 px-2 py-2">UD</th>
            {model.customers.map((customer) => (
              <th
                key={customer.key}
                className="max-w-28 border border-slate-500 px-2 py-2"
              >
                {customer.name}
              </th>
            ))}
            <th className="border border-slate-500 bg-emerald-100 px-2 py-2 font-bold">
              DEMANDA TOTAL
            </th>
            <th className="border border-slate-500 bg-sky-100 px-2 py-2 font-bold">
              STOCK DISPONIBLE
            </th>
            <th className="border border-slate-500 bg-amber-100 px-2 py-2 font-bold">
              A PROVISIONAR
            </th>
            <th className="min-w-28 border border-slate-500 bg-slate-100 px-2 py-2 font-bold">
              PESO / CANT. REAL
            </th>
            <th className="min-w-28 border border-slate-500 bg-indigo-50 px-2 py-2 font-bold">
              COSTO DE PROVISIÓN (Bs/UD)
            </th>
          </tr>
        </thead>
        <tbody>
          {model.rows.map((row, index) => (
            <MarketSheetTableRow
              key={row.key}
              row={row}
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
              LÍNEAS PEDIDAS
            </th>
            {model.customers.map((customer, customerIndex) => (
              <th
                key={customer.key}
                className="border-y-2 border-emerald-800 px-2 py-2"
              >
                {model.customerLineCounts[customerIndex]}
              </th>
            ))}
            <th className="border-y-2 border-emerald-800 px-2 py-2 text-center">
              {model.totalLineCount}
            </th>
            <th className="border-y-2 border-emerald-800" colSpan={4} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function MarketSheetTableRow({
  row,
  index,
  customers,
  isAdmin,
}: {
  row: MarketSheetRow;
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
  const [isSavingActual, startActualTransition] = useTransition();
  const [isSavingCost, startCostTransition] = useTransition();
  const [savedActual, setSavedActual] = useState(false);
  const [savedCost, setSavedCost] = useState(false);

  const handleBlurActual = () => {
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
    if (!isAdmin) return;
    const raw = costInput.trim();
    const parsed = raw === "" ? null : Number(raw.replace(",", "."));
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) {
      toast.error("Ingresa un costo de provisión válido.");
      return;
    }
    if (parsed === row.provisionCostUnit) return;

    startCostTransition(async () => {
      const lineIds = row.lines.map((line) => line.orderItemId);
      const res = await updateMarketSheetProductCostAction(
        lineIds,
        parsed,
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
      {row.quantities.map((value, customerIndex) => (
        <td
          key={customers[customerIndex]?.key}
          className="border-r border-slate-300 px-2 py-1 text-center"
        >
          {value > 0 ? formatQuantity(value) : ""}
        </td>
      ))}

      {/* Total demand */}
      <td className="border-r border-slate-400 bg-emerald-50 px-2 py-1 text-center font-bold text-slate-900">
        {formatQuantity(row.total)}
      </td>

      {/* Available stock */}
      <td className="border-r border-slate-300 bg-sky-50 px-2 py-1 text-center font-medium text-slate-900">
        {formatQuantity(row.stockAvailable)}
      </td>

      {/* To provision */}
      <td
        className={`border-r border-slate-300 px-2 py-1 text-center font-bold ${
          row.isCoveredByStock
            ? "bg-emerald-100 text-emerald-900"
            : "bg-rose-50 text-rose-700"
        }`}
      >
        {row.toProvision > 0 ? (
          formatQuantity(row.toProvision)
        ) : (
          <span className="inline-block rounded bg-emerald-200 px-1 py-0.5 text-[9px] font-semibold text-emerald-800">
            Cubierto por stock
          </span>
        )}
      </td>

      {/* Real weight / quantity editable */}
      <td className="border-r border-slate-300 bg-slate-50/70 px-1.5 py-1 text-center">
        <div className="flex items-center justify-center gap-1 print:hidden">
          <input
            type="text"
            inputMode="decimal"
            value={actualInput}
            onChange={(e) => setActualInput(e.target.value)}
            onBlur={handleBlurActual}
            onKeyDown={(e) => e.key === "Enter" && handleBlurActual()}
            disabled={isSavingActual}
            placeholder={row.actualWeightOrQuantity !== null ? String(row.actualWeightOrQuantity) : "—"}
            aria-label={`Peso o cantidad real de ${row.productName}`}
            className="h-6 w-16 rounded border border-slate-300 bg-white px-1 text-right text-[10px] font-medium text-slate-900 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:opacity-60"
          />
          <span className="text-[9px] text-slate-500">
            {row.controlsActualWeight ? "kg" : row.unit}
          </span>
          {isSavingActual ? (
            <Loader2 className="size-3 animate-spin text-slate-400" />
          ) : savedActual ? (
            <Check className="size-3 text-emerald-600" />
          ) : null}
        </div>
        <div className="hidden print:block text-center font-medium">
          {row.actualWeightOrQuantity !== null
            ? `${formatQuantity(row.actualWeightOrQuantity)} ${row.controlsActualWeight ? "kg" : row.unit}`
            : "—"}
        </div>
      </td>

      {/* Provision cost editable */}
      <td className="border-r border-slate-300 bg-indigo-50/40 px-1.5 py-1 text-center">
        {isAdmin ? (
          <div className="flex items-center justify-center gap-1 print:hidden">
            <span className="text-[9px] text-slate-500">Bs</span>
            <input
              type="text"
              inputMode="decimal"
              value={costInput}
              onChange={(e) => setCostInput(e.target.value)}
              onBlur={handleBlurCost}
              onKeyDown={(e) => e.key === "Enter" && handleBlurCost()}
              disabled={isSavingCost}
              placeholder={row.provisionCostUnit !== null ? String(row.provisionCostUnit) : "—"}
              aria-label={`Costo de provisión de ${row.productName}`}
              className="h-6 w-16 rounded border border-slate-300 bg-white px-1 text-right text-[10px] font-medium text-slate-900 shadow-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 disabled:opacity-60"
            />
            {isSavingCost ? (
              <Loader2 className="size-3 animate-spin text-slate-400" />
            ) : savedCost ? (
              <Check className="size-3 text-emerald-600" />
            ) : null}
          </div>
        ) : (
          <span className="print:hidden">
            {row.provisionCostUnit !== null ? formatMoney(row.provisionCostUnit) : "—"}
          </span>
        )}
        <div className="hidden print:block text-center font-medium">
          {row.provisionCostUnit !== null ? formatMoney(row.provisionCostUnit) : "—"}
        </div>
      </td>
    </tr>
  );
}
