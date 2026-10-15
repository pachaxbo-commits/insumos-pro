"use client";

import { useActionState } from "react";

import { setQbProductPhysicalUnitSafelyAction } from "@/lib/products/actions";
import type { PhysicalUnitCorrectionCandidate } from "@/lib/products/physical-unit-corrections";
import type { QbUnit } from "@/types/products";

type ActionState = { success: boolean; message?: string };
const initialState: ActionState = { success: false };

function ProductCorrectionRow({ candidate, units }: { candidate: PhysicalUnitCorrectionCandidate; units: QbUnit[] }) {
  const [state, formAction, pending] = useActionState(setQbProductPhysicalUnitSafelyAction, initialState);
  const hasReferences = Object.values(candidate.referenceCounts).some((count) => count > 0);
  const priceReview = candidate.purchasePrice !== 0 || candidate.salePrice !== 0 || (candidate.qbBaseSalePrice ?? 0) !== 0;
  const safeByPreview = candidate.qbUnit !== "Sin configurar" && !candidate.referencesUnavailable && !hasReferences && candidate.stock === 0 && !priceReview;
  const kg = units.find((unit) => unit.is_active && (unit.code.toLowerCase() === "kg" || unit.symbol.toLowerCase() === "kg"));
  const proposedUnitId = kg?.id ?? units[0]?.id ?? "";

  return (
    <form action={formAction} className="grid gap-3 border-t px-4 py-4 lg:grid-cols-[minmax(15rem,1.5fr)_minmax(14rem,1fr)_minmax(16rem,1.3fr)_auto] lg:items-center">
      <input type="hidden" name="product_id" value={candidate.id} />
      <div>
        <p className="font-semibold">{candidate.name}</p>
        <p className="text-xs text-muted-foreground">Unidad catálogo: {candidate.legacyUnit} · Unidad QB: {candidate.qbUnit}</p>
        <p className="text-xs text-muted-foreground">Stock: {candidate.stock} · Precio compra: Bs {candidate.purchasePrice} · Precio venta: Bs {candidate.salePrice}</p>
        <p className="mt-1 text-xs text-muted-foreground">Conversiones comerciales: {candidate.conversionSummary.join(" · ")}</p>
      </div>
      <label className="text-sm">Propuesta de unidad física
        <select name="unit_id" defaultValue={proposedUnitId} required disabled={!safeByPreview || units.length === 0} className="mt-1 block h-10 w-full rounded-lg border bg-white px-2 disabled:opacity-60">
          {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} ({unit.symbol}){unit.id === kg?.id ? " · sugerida" : ""}</option>)}
        </select>
      </label>
      <div className="text-xs">
        {candidate.referencesUnavailable ? <p className="font-medium text-rose-700">No se pudieron verificar las referencias; corrección bloqueada.</p> : null}
        {hasReferences ? <p className="font-medium text-amber-800">Historial: {Object.entries(candidate.referenceCounts).filter(([, count]) => count > 0).map(([name, count]) => `${name} ${count}`).join(" · ")}. Revisión controlada requerida.</p> : null}
        {candidate.stock !== 0 ? <p className="font-medium text-amber-800">El stock actual no está en cero.</p> : null}
        {priceReview ? <p className="font-medium text-amber-800">Hay precios configurados; no se convertirán automáticamente.</p> : null}
        {safeByPreview ? <label className="mt-1 flex items-start gap-2 text-slate-700"><input type="checkbox" name="confirmation" value="CORREGIR" required className="mt-0.5" />Confirmo esta unidad para este producto y autorizo la corrección segura.</label> : null}
        {state.message ? <p role={state.success ? "status" : "alert"} className={`mt-1 font-medium ${state.success ? "text-emerald-700" : "text-rose-700"}`}>{state.message}</p> : null}
      </div>
      <button type="submit" disabled={!safeByPreview || !proposedUnitId || pending} className="rounded-lg bg-emerald-800 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Revisando…" : "Aplicar a este producto"}</button>
    </form>
  );
}

export function QbPhysicalUnitCorrectionPanel({
  candidates,
  units,
  canManage,
}: {
  candidates: PhysicalUnitCorrectionCandidate[];
  units: QbUnit[];
  canManage: boolean;
}) {
  if (!canManage || candidates.length === 0) return null;

  return (
    <section className="rounded-2xl border border-amber-200 bg-white shadow-sm">
      <div className="border-b bg-amber-50 p-4">
        <h2 className="text-lg font-semibold text-amber-950">Revisión de productos con unidad BS ({candidates.length})</h2>
        <p className="mt-1 text-sm text-amber-900">KG aparece como propuesta inicial. Cada producto se revisa y aplica por separado; precios, pedidos, recibos y movimientos históricos nunca se convierten.</p>
      </div>
      {candidates.map((candidate) => <ProductCorrectionRow key={candidate.id} candidate={candidate} units={units} />)}
    </section>
  );
}
