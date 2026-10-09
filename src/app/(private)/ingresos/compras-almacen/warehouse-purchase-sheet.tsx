"use client";

import type { WarehousePurchase } from "@/lib/warehouse-purchases/data";

type Unit = { id: string; name: string; symbol: string; dimensionId: string; factorToBase: number; isActive: boolean };
const money = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
export function PurchaseCard({ row, index, units, pending, canManage, onUpdate, onMeasure, onConfirm, compact = false }: {
  row: WarehousePurchase; index: number; units: Unit[]; pending: boolean; canManage: boolean;
  onUpdate: (event: React.FormEvent<HTMLFormElement>) => void;
  onMeasure: (event: React.FormEvent<HTMLFormElement>) => void;
  onConfirm: (receiptId: string) => void; compact?: boolean;
}) {
  const referenceUnit = units.find((unit) => unit.id === row.referenceUnitId);
  return (
    <article className="rounded-xl border p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <strong>{index + 1}. {row.productName}</strong>
          <p className="text-xs text-muted-foreground">{row.quantity} {row.unitLabel} × Bs {money(row.unitPrice)} · Total Bs {money(row.total)}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{row.status}</span>
      </div>
      {!compact ? <p className="mt-2">Referencia: {row.referencePrice === null ? "Pendiente" : `Bs ${money(row.referencePrice)} / ${referenceUnit?.name ?? "unidad"}`}
        {row.referencePriceOrigin === "calculated" ? " · Calculado" : row.referencePriceOrigin === "manual" ? " · Manual" : ""}
        <br />{row.notes || "Sin observaciones"}</p> : null}
      <p className="mt-1 text-xs text-muted-foreground">Registró: {row.actor} · {new Date(row.createdAt).toLocaleString("es-BO")}</p>
      {canManage && row.status === "borrador" ? (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <form onSubmit={onUpdate} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={row.id} />
            <label className="text-xs">Unidad de referencia
              <select name="reference_unit_id" defaultValue={row.referenceUnitId ?? ""} className="mt-1 block rounded-lg border px-2 py-1">
                <option value="">Sin definir</option>
                {units.filter((unit) => unit.isActive && /arroba|cuartilla|libra/i.test(`${unit.name} ${unit.symbol}`)).map((unit) =>
                  <option value={unit.id} key={unit.id}>{unit.name}</option>)}
              </select>
            </label>
            <label className="text-xs">Precio referencial
              <input name="reference_price" type="number" min="0" step="any" defaultValue={row.referencePrice ?? ""} className="mt-1 block w-28 rounded-lg border px-2 py-1" />
            </label>
            <label className="text-xs">Observaciones
              <input name="notes" maxLength={2000} defaultValue={row.notes} className="mt-1 block max-w-52 rounded-lg border px-2 py-1" />
            </label>
            <button disabled={pending} className="rounded-lg border px-3 py-1.5 disabled:opacity-50">Guardar cambios</button>
          </form>
          <form onSubmit={onMeasure} className="flex items-end gap-2">
            <input type="hidden" name="id" value={row.id} />
            <label className="text-xs">Cantidad física útil ({row.baseUnitSymbol})
              <input required name="actual_base_quantity" type="number" min="0.000001" step="any"
                defaultValue={row.actualBaseQuantityRecorded ? row.baseQuantity : undefined}
                className="mt-1 block w-32 rounded-lg border px-2 py-1" />
            </label>
            <button disabled={pending} className="rounded-lg border px-3 py-1.5 disabled:opacity-50">Guardar peso/cantidad</button>
          </form>
          {row.requiresClassification ?
            <a href="/ingresos" className="rounded-lg border px-3 py-1.5 text-amber-800">Clasificar en Ingresos</a> :
            <button disabled={pending || !row.actualBaseQuantityRecorded} onClick={() => onConfirm(row.receiptId)}
              className="rounded-lg bg-emerald-800 px-3 py-1.5 text-white disabled:opacity-50">Confirmar ingreso a stock</button>}
        </div>
      ) : null}
    </article>
  );
}
