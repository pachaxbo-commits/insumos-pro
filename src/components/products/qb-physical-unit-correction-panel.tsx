"use client";

import { useActionState, useMemo, useState } from "react";
import { setQbProductPhysicalUnitSafelyAction } from "@/lib/products/actions";
import type { PhysicalUnitCorrectionCandidate } from "@/lib/products/physical-unit-corrections";
import type { QbUnit } from "@/types/products";

type ActionState = { success: boolean; message?: string };
type Filter = "all" | "safe" | "regularizable" | "blocked" | "solid" | "liquid" | "review";
const initialState: ActionState = { success: false };

function ProductCorrectionRow({ candidate, units }: { candidate: PhysicalUnitCorrectionCandidate; units: QbUnit[] }) {
  const [state, formAction, pending] = useActionState(setQbProductPhysicalUnitSafelyAction, initialState);
  const [unitId, setUnitId] = useState(candidate.suggestedUnitId ?? "");
  const [legacyUnitId, setLegacyUnitId] = useState(candidate.suggestedUnitId ?? "");
  const unit = units.find((item) => item.id === unitId);
  const permitted = candidate.status === "safe" || (candidate.manualUnitChoiceAllowed && Boolean(unitId));

  return (
    <form action={formAction} className="grid gap-3 border-t px-4 py-4 lg:grid-cols-[minmax(12rem,1.2fr)_minmax(8rem,.7fr)_minmax(10rem,.8fr)_minmax(14rem,1.2fr)_auto] lg:items-start">
      <input type="hidden" name="product_id" value={candidate.id} />
      <input type="hidden" name="unit_id" value={unitId} />
      <input type="hidden" name="legacy_unit_id" value={legacyUnitId} />
      <div>
        <p className="font-semibold">{candidate.name}</p>
        <p className="text-xs text-muted-foreground">{candidate.category}</p>
        <p className="mt-1 text-xs text-muted-foreground">Catálogo: {candidate.legacyUnit} · Inventario QB: {candidate.qbUnit} · Unidad de precio: {candidate.priceUnit}</p>
        <p className="mt-1 text-xs text-muted-foreground">Stock {candidate.stock} · Compra Bs {candidate.purchasePrice} · Venta Bs {candidate.salePrice} · Precio base QB Bs {candidate.qbBaseSalePrice ?? 0}</p>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase text-slate-500">Tipo</p>
        <p className="text-sm">{candidate.kind === "solid" ? "Sólido" : candidate.kind === "liquid" ? "Líquido" : "Por revisar"}</p>
        <p className="mt-2 text-xs font-semibold uppercase text-slate-500">Estado</p>
        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${candidate.status === "safe" ? "bg-emerald-100 text-emerald-800" : candidate.status === "blocked" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-900"}`}>
          {candidate.status === "safe" ? "Seguro" : candidate.status === "blocked" ? "Bloqueado" : "Requiere revisión"}
        </span>
      </div>
      <label className="text-sm">Unidad física propuesta
        <select value={unitId} onChange={(event) => setUnitId(event.target.value)} disabled={!candidate.suggestedUnitId && !candidate.manualUnitChoiceAllowed} className="mt-1 block h-10 w-full rounded-lg border bg-white px-2 disabled:bg-slate-100">
          <option value="">Selecciona y valida una unidad</option>
          {units.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.symbol}){item.id === candidate.suggestedUnitId ? " · sugerida" : ""}</option>)}
        </select>
        {candidate.kind === "solid" ? <span className="mt-1 block text-xs text-muted-foreground">La propuesta para sólidos es KG.</span> : null}
        {candidate.kind === "liquid" ? <span className="mt-1 block text-xs text-muted-foreground">La propuesta para líquidos es L.</span> : null}
        {candidate.kind === "review" ? <span className="mt-1 block text-xs text-amber-800">Elige explícitamente la unidad física después de verificar el producto.</span> : null}
      </label>
      <div className="space-y-2 text-xs">
        <p className={candidate.status === "safe" ? "font-medium text-emerald-800" : "font-medium text-amber-900"}>{candidate.statusReason}</p>
        {candidate.conversionSummary.map((summary) => <p key={summary} className="text-muted-foreground">{summary}</p>)}
        {candidate.allowedUnitSummary.length ? <details>
          <summary className="cursor-pointer font-medium text-slate-700">Unidades configuradas ({candidate.allowedUnitSummary.length})</summary>
          <ul className="mt-1 list-inside list-disc text-muted-foreground">
            {candidate.allowedUnitSummary.map((summary, index) => <li key={index}>{summary}</li>)}
          </ul>
        </details> : null}
        {candidate.legacyAllowedUnitDetails.length ? <details open>
          <summary className="cursor-pointer font-medium text-amber-900">Asociaciones heredadas que se retirarían ({candidate.legacyAllowedUnitDetails.length})</summary>
          <ul className="mt-1 list-inside list-disc text-muted-foreground">
            {candidate.legacyAllowedUnitDetails.map((item, index) => <li key={`${item.context}-${item.unit}-${index}`}>
              {item.context}: {item.unit} · {item.active ? "activa" : "inactiva"}{item.isDefault ? " · predeterminada" : ""} · mínimo {item.minQuantity ?? "sin definir"} · incremento {item.quantityStep ?? "sin definir"} · {item.references.length ? `referencias: ${item.references.map((reference) => `${reference.table} (${reference.count})`).join(", ")}` : "sin referencias directas"}
            </li>)}
          </ul>
          <p className="mt-2 text-amber-900">No se copiarán el mínimo ni el incremento a KG/L. Las asociaciones con historial detendrán la operación.</p>
          <p className="mt-1">{candidate.operationalEnabled
            ? "Resultado previsto: unidad base física; KG/L directo en inventario y recepción; pedido usará la unidad base mediante la sincronización existente. No se activa venta ni se cambia el estado del producto."
            : "Resultado previsto: unidad base física en catálogo; no se habilitarán contextos operativos porque el producto o QB está inactivo."}</p>
        </details> : null}
        {Object.keys(candidate.referenceCounts).length ? <details>
          <summary className="cursor-pointer font-medium text-slate-700">Referencias encontradas</summary>
          <ul className="mt-1 list-inside list-disc text-muted-foreground">
            {Object.entries(candidate.referenceCounts).map(([label, count]) => <li key={label}>{label}: {count}</li>)}
          </ul>
        </details> : <p className="text-muted-foreground">Sin referencias en las tablas con clave foránea a productos.</p>}
        {candidate.legacyAllowedUnitDetails.length && candidate.legacyRegularizationAllowed ? <label className="flex items-start gap-2 text-amber-950"><input type="checkbox" name="confirmation" value="REGULARIZAR" required className="mt-0.5" />Confirmo retirar las asociaciones heredadas sin trasladar sus cantidades ni modificar registros históricos.</label> : permitted ? <label className="flex items-start gap-2 text-slate-700"><input type="checkbox" name="confirmation" value="CORREGIR" required className="mt-0.5" />Confirmo esta unidad para este producto; no se convertirán importes ni registros históricos.</label> : null}
        {state.message ? <p role={state.success ? "status" : "alert"} className={state.success ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>{state.message}</p> : null}
      </div>
      <button type="submit" name="mode" value="physical_correction" disabled={!permitted || !unit || pending} className="rounded-lg bg-emerald-800 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Revisando…" : "Corregir"}</button>
      {candidate.legacyAllowedUnitDetails.length ? <div className="lg:col-span-full rounded-xl border border-amber-200 bg-amber-50 p-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(12rem,1fr)_auto] sm:items-end">
          <label className="text-sm">Regularizar unidades heredadas
            <select value={legacyUnitId} onChange={(event) => setLegacyUnitId(event.target.value)} disabled={!candidate.legacyRegularizationAllowed} className="mt-1 block h-10 w-full rounded-lg border bg-white px-2 disabled:bg-slate-100">
              <option value="">Selecciona KG o L</option>
              {units.filter((item) => ["kg", "l", "litro"].includes(item.code.toLocaleLowerCase()) || ["kg", "l", "litro"].includes(item.symbol.toLocaleLowerCase())).filter((item) => candidate.kind === "solid" ? item.code.toLocaleLowerCase() === "kg" : candidate.kind === "liquid" ? ["l", "litro"].includes(item.code.toLocaleLowerCase()) || ["l", "litro"].includes(item.symbol.toLocaleLowerCase()) : true).map((item) => <option key={item.id} value={item.id}>{item.name} ({item.symbol}){item.id === candidate.suggestedUnitId ? " · sugerida" : ""}</option>)}
            </select>
          </label>
          <button type="submit" name="mode" value="legacy_regularization" disabled={!candidate.legacyRegularizationAllowed || !legacyUnitId || pending} className="rounded-lg bg-amber-900 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Regularizando…" : "Regularizar unidades heredadas"}</button>
        </div>
        <p className="mt-2 text-sm font-medium text-amber-950">{candidate.legacyRegularizationReason}</p>
      </div> : null}
    </form>
  );
}

export function QbPhysicalUnitCorrectionPanel({
  candidates, units, totalProductsReviewed, auditError, canManage,
}: {
  candidates: PhysicalUnitCorrectionCandidate[];
  units: QbUnit[];
  totalProductsReviewed: number;
  auditError: string | null;
  canManage: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const filtered = useMemo(() => candidates.filter((candidate) => {
    if (filter === "all") return true;
    if (filter === "safe" || filter === "blocked") return candidate.status === filter;
    if (filter === "regularizable") return candidate.legacyRegularizationAllowed;
    if (filter === "solid" || filter === "liquid") return candidate.kind === filter;
    return candidate.status === "review" || candidate.kind === "review";
  }), [candidates, filter]);
  if (!canManage) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
      <div className="border-b bg-amber-50 p-4">
        <h2 className="text-lg font-semibold text-amber-950">Auditoría de unidades BS/BOB ({candidates.length})</h2>
        <p className="mt-1 text-sm text-amber-900">Se revisaron {totalProductsReviewed} productos mediante páginas de 100. Sólidos: KG; líquidos: L. Los precios y documentos históricos no se convierten.</p>
        <p className="mt-1 text-sm text-amber-950">Con asociaciones legacy: {candidates.filter((candidate) => candidate.legacyAllowedUnitDetails.length > 0).length} · regularizables tras validar dependencias: {candidates.filter((candidate) => candidate.legacyRegularizationAllowed).length}.</p>
        {auditError ? <p role="alert" className="mt-2 rounded-lg bg-rose-100 p-2 text-sm font-medium text-rose-900">Auditoría incompleta: {auditError}. No se habilitan correcciones hasta verificar todas las relaciones.</p> : null}
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Filtrar productos revisados">
          {(["all", "safe", "regularizable", "blocked", "solid", "liquid", "review"] as Filter[]).map((value) => {
            const label = value === "all" ? "Todos" : value === "safe" ? "Corregibles" : value === "regularizable" ? "Regularizables (legacy)" : value === "blocked" ? "Bloqueados" : value === "solid" ? "Sólidos" : value === "liquid" ? "Líquidos" : "Requieren revisión";
            return <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value} className={`rounded-full border px-3 py-1.5 text-sm ${filter === value ? "border-emerald-800 bg-emerald-800 text-white" : "bg-white text-slate-700 hover:bg-slate-100"}`}>{label}</button>;
          })}
        </div>
      </div>
      {!candidates.length ? <p className="p-4 text-sm text-muted-foreground">No se encontraron productos con unidad BS/BOB en la auditoría consultada.</p> : filtered.map((candidate) => <ProductCorrectionRow key={candidate.id} candidate={candidate} units={units} />)}
      {candidates.length > 0 && filtered.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No hay productos en este filtro.</p> : null}
    </section>
  );
}
