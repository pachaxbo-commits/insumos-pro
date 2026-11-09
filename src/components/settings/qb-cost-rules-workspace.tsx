"use client";

import { useActionState, useMemo, useState } from "react";
import { saveQbProductCostRuleAction, type CostRuleActionState } from "@/lib/qb-receipts/cost-rules-actions";

export type CostRuleRow = {
  productId: string; productName: string; sku: string | null; allowedUnitId: string;
  commercialUnitLabel: string; costBasis: "commercial_unit" | "actual_weight";
  rateAmount: string; referenceWeightUnitId: string; active: boolean;
  rowVersion: number | null; configured: boolean;
};
type WeightUnit = { id: string; symbol: string; name: string };

function CostRuleEditor({ row, weightUnits }: { row: CostRuleRow; weightUnits: WeightUnit[] }) {
  const [state, action, pending] = useActionState<CostRuleActionState, FormData>(
    saveQbProductCostRuleAction, { success: false });
  const [basis, setBasis] = useState(row.costBasis);
  const [rate, setRate] = useState(row.rateAmount);
  const [referenceUnitId, setReferenceUnitId] = useState(row.referenceWeightUnitId);
  const rateUnitLabel = basis === "commercial_unit"
    ? row.commercialUnitLabel
    : weightUnits.find((unit) => unit.id === referenceUnitId)?.symbol || "unidad de peso";
  return <form action={action} className="grid min-w-[920px] grid-cols-[minmax(190px,1.4fr)_110px_160px_150px_180px_120px] items-center gap-2 border-t p-2 text-sm">
    <input type="hidden" name="product_id" value={row.productId} />
    <input type="hidden" name="allowed_unit_id" value={row.allowedUnitId} />
    <input type="hidden" name="row_version" value={row.rowVersion ?? ""} />
    <div className="min-w-0"><div className="truncate font-medium">{row.productName}</div>
      <div className="text-xs text-muted-foreground">{row.sku || "Sin código"} · {row.commercialUnitLabel}</div></div>
    <label className="text-xs">Base
      <select name="cost_basis" value={basis} onChange={(event) => setBasis(event.target.value as typeof basis)}
        className="mt-1 h-9 w-full rounded border bg-white px-2 text-sm">
        <option value="commercial_unit">Unidad comercial</option><option value="actual_weight">Peso real</option>
      </select></label>
    <label className="text-xs">Tarifa (Bs / {rateUnitLabel})
      <input name="rate_amount" type="number" inputMode="decimal" min="0.00000001" step="0.00000001"
        required value={rate} onChange={(event) => setRate(event.target.value)}
        placeholder="Sin configurar" className="mt-1 h-9 w-full rounded border px-2 text-right text-sm tabular-nums" />
    </label>
    <label className="text-xs">Referencia por
      {basis === "actual_weight" ? <select name="reference_weight_unit_id" required={basis === "actual_weight"}
        value={referenceUnitId} onChange={(event) => setReferenceUnitId(event.target.value)}
        className="mt-1 h-9 w-full rounded border bg-white px-2 text-sm">
        <option value="">Selecciona unidad</option>
        {weightUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.symbol} · {unit.name}</option>)}
      </select> : <><select aria-label="Unidad de peso no aplica" disabled className="mt-1 h-9 w-full rounded border bg-slate-100 px-2 text-sm"><option>No aplica</option></select>
        <input type="hidden" name="reference_weight_unit_id" value="" /></>}
    </label>
    <label className="text-xs">Estado
      <select name="is_active" defaultValue={String(row.active)} className="mt-1 h-9 w-full rounded border bg-white px-2 text-sm">
        <option value="true">Activa</option><option value="false">Inactiva</option>
      </select></label>
    <button type="submit" disabled={pending} className="h-9 rounded bg-emerald-900 px-3 text-sm font-medium text-white disabled:opacity-50">
      {pending ? "Guardando…" : row.configured ? "Guardar regla" : "Configurar"}
    </button>
    {state.message && <p role={state.success ? "status" : "alert"} className={`col-span-full text-xs ${state.success ? "text-emerald-800" : "text-rose-700"}`}>{state.message}</p>}
  </form>;
}

export function QbCostRulesWorkspace({ rows, weightUnits }: { rows: CostRuleRow[]; weightUnits: WeightUnit[] }) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    return query ? rows.filter((row) => `${row.productName} ${row.sku ?? ""} ${row.commercialUnitLabel}`
      .toLocaleLowerCase("es").includes(query)) : rows;
  }, [rows, search]);
  return <section className="space-y-3">
    <label className="block max-w-md text-sm font-medium">Buscar producto o presentación
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ej.: pimentón, KG, unidad…"
        className="mt-1 h-10 w-full rounded-md border bg-white px-3" />
    </label>
    <div className="overflow-x-auto rounded-lg border bg-white">
      <div className="grid min-w-[920px] grid-cols-[minmax(190px,1.4fr)_110px_160px_150px_180px_120px] gap-2 bg-slate-100 px-2 py-2 text-xs font-semibold">
        <span>Producto y presentación de pedido</span><span>Base de costo</span><span>Tarifa</span><span>Referencia</span><span>Estado</span><span>Acción</span>
      </div>
      {filtered.map((row) => <CostRuleEditor key={row.allowedUnitId} row={row} weightUnits={weightUnits} />)}
      {!filtered.length && <p className="p-4 text-sm text-muted-foreground">No hay presentaciones de pedido para esta búsqueda.</p>}
    </div>
    <p className="text-xs text-muted-foreground">La regla de costo y la tarifa de venta son independientes. Las tarifas se guardan en PostgreSQL como decimales, con control de versión y autorización de Administración.</p>
  </section>;
}
