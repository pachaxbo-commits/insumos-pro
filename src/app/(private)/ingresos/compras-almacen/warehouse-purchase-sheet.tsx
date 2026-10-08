"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  confirmQbMerchandiseReceiptAction,
  createQbMerchandiseReceiptAction,
} from "@/lib/qb-ingresos/actions";
import { measureWarehousePurchaseAction, updateWarehousePurchaseAction } from "@/lib/warehouse-purchases/actions";
import type { WarehousePurchase } from "@/lib/warehouse-purchases/data";
import { autoReferencePriceFromPurchaseUnit, purchaseTotal } from "@/lib/warehouse-purchases/model";

type Product = { id: string; name: string };
type Unit = { id: string; name: string; symbol: string; dimensionId: string; factorToBase: number; isActive: boolean };
type AllowedUnit = { id: string; productId: string; context: string; unitId: string | null; presentationId: string | null; isActive: boolean };
type Presentation = { id: string; name: string; symbol: string };

function money(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function WarehousePurchaseSheet({ date, rows, products, units, allowedUnits, presentations, canManage }: {
  date: string;
  rows: WarehousePurchase[];
  products: Product[];
  units: Unit[];
  allowedUnits: AllowedUnit[];
  presentations: Presentation[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [productId, setProductId] = useState("");
  const [allowedId, setAllowedId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [referenceUnitId, setReferenceUnitId] = useState("");
  const [referencePrice, setReferencePrice] = useState("");
  const [referenceMode, setReferenceMode] = useState<"auto" | "manual">("auto");
  const [notes, setNotes] = useState("");

  const filteredProducts = products.filter((product) => product.name.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es")));
  const purchaseUnits = useMemo(() => allowedUnits.filter((unit) => unit.productId === productId && unit.context === "recepcion" && unit.isActive), [allowedUnits, productId]);
  const referenceUnits = units.filter((unit) => unit.isActive && /arroba|cuartilla|libra/i.test(`${unit.name} ${unit.symbol}`));
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const presentationById = new Map(presentations.map((item) => [item.id, item]));
  const selectedPurchaseUnit = purchaseUnits.find((unit) => unit.id === allowedId);
  const sourceUnit = selectedPurchaseUnit?.unitId ? unitById.get(selectedPurchaseUnit.unitId) : null;
  const targetUnit = unitById.get(referenceUnitId);
  const autoReferencePrice = sourceUnit && targetUnit && unitPrice !== ""
    ? autoReferencePriceFromPurchaseUnit(Number(unitPrice),
      { dimensionId: sourceUnit.dimensionId, factorToBase: sourceUnit.factorToBase,
        label: `${sourceUnit.name} ${sourceUnit.symbol}` },
      { dimensionId: targetUnit.dimensionId, factorToBase: targetUnit.factorToBase }) : null;
  const displayedReferencePrice = referenceMode === "auto"
    ? autoReferencePrice?.toString() ?? "" : referencePrice;
  const total = Number(quantity) > 0 && Number(unitPrice) >= 0 &&
    Number.isFinite(Number(quantity)) && Number.isFinite(Number(unitPrice))
    ? purchaseTotal(Number(quantity), Number(unitPrice)) : 0;
  const sheetTotal = rows.reduce((sum, row) => sum + row.total, 0);

  function purchaseUnitLabel(unit: AllowedUnit) {
    if (unit.unitId) {
      const source = unitById.get(unit.unitId);
      return source ? `${source.name} (${source.symbol})` : "Unidad";
    }
    const presentation = presentationById.get(unit.presentationId ?? "");
    return presentation ? `${presentation.name} (${presentation.symbol})` : "Presentación";
  }

  function submitPurchase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData();
    Object.entries({
      receipt_date: date, reference_code: "HOJA-COMPRAS-ALMACEN", supplier_name: "",
      product_id: productId, allowed_unit_id: allowedId, source_quantity: quantity,
      unit_cost: unitPrice, requires_classification: "false", notes,
      reference_unit_id: referenceUnitId, reference_price: displayedReferencePrice,
      reference_price_origin: referenceMode === "auto" && autoReferencePrice !== null ? "calculated" :
        displayedReferencePrice !== "" ? "manual" : "",
      warehouse_purchase: "true",
    }).forEach(([key, value]) => form.set(key, value));
    startTransition(async () => {
      const result = await createQbMerchandiseReceiptAction({ success: false }, form);
      setMessage(result.message ?? "");
      if (result.success) {
        setQuantity(""); setUnitPrice(""); setReferencePrice(""); setReferenceMode("auto"); setNotes("");
        router.refresh();
      }
    });
  }

  function confirmPurchase(receiptId: string) {
    if (!window.confirm("¿Confirmar esta compra e ingresar físicamente al stock una sola vez?")) return;
    const form = new FormData();
    form.set("id", receiptId);
    form.set("confirmation", "CONFIRMAR");
    startTransition(async () => {
      const result = await confirmQbMerchandiseReceiptAction({ success: false }, form);
      setMessage(result.message ?? "");
      if (result.success) router.refresh();
    });
  }

  function updatePurchase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateWarehousePurchaseAction(form);
      setMessage(result.message ?? "");
      if (result.success) router.refresh();
    });
  }

  function measurePurchase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await measureWarehousePurchaseAction(form);
      setMessage(result.message ?? "");
      if (result.success) router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <form action="/ingresos/compras-almacen" className="flex flex-wrap items-end gap-2">
          <label className="text-sm font-medium">Fecha de compras<br /><input type="date" name="date" defaultValue={date} className="mt-1 rounded-lg border px-3 py-2" /></label>
          <button className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white">Ver fecha</button>
        </form>
        <div className="flex gap-2">
          <a href={`/api/ingresos/compras-almacen.xlsx?date=${encodeURIComponent(date)}`} className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">Descargar Excel</a>
          <button type="button" onClick={() => window.print()} className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">Imprimir</button>
        </div>
      </div>
      {message ? <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 print:hidden">{message}</p> : null}
      {canManage ? (
        <form onSubmit={submitPurchase} className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm print:hidden">
          <h2 className="font-semibold">Agregar compra real</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm">Buscar producto<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto..." className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
            <label className="text-sm">Producto<select required value={productId} onChange={(e) => { setProductId(e.target.value); setAllowedId(""); }} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="">Seleccionar</option>{filteredProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
            <label className="text-sm">Unidad compra<select required value={allowedId} onChange={(e) => setAllowedId(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="">Seleccionar</option>{purchaseUnits.map((unit) => <option key={unit.id} value={unit.id}>{purchaseUnitLabel(unit)}</option>)}</select></label>
            <label className="text-sm">Cantidad<input required min="0.000001" step="any" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
            <label className="text-sm">PU compra (Bs)<input required min="0" step="any" type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
            <div className="text-sm">Total Bs<div className="mt-1 rounded-lg bg-slate-50 px-3 py-2 font-semibold">{money(Number.isFinite(total) ? total : 0)}</div></div>
            <label className="text-sm">Unidad de referencia<select value={referenceUnitId} onChange={(e) => setReferenceUnitId(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="">Sin definir</option>{referenceUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} ({unit.symbol})</option>)}</select></label>
            <label className="text-sm">Precio referencial (Bs)<input min="0" step="any" type="number" value={displayedReferencePrice} onChange={(e) => { setReferenceMode("manual"); setReferencePrice(e.target.value); }} className="mt-1 w-full rounded-lg border px-3 py-2" />
              <span className="mt-1 block text-xs text-muted-foreground">{referenceMode === "auto" && autoReferencePrice !== null ? "Calculado con unidades configuradas; puedes editarlo." : "Sin equivalencia segura: escribe el valor cuando lo conozcas."}</span>
              {autoReferencePrice !== null && referenceMode === "manual" ? <button type="button" onClick={() => setReferenceMode("auto")} className="mt-1 text-xs text-emerald-800 underline">Usar cálculo</button> : null}
            </label>
          </div>
          <label className="block text-sm">Observaciones<textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} placeholder="Opcional: descarte, merma, compra urgente..." className="mt-1 min-h-16 w-full rounded-lg border px-3 py-2" /></label>
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">El cálculo solo aparece con equivalencia segura; puedes corregirlo. Guardar no suma stock.</p><button disabled={pending} className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Guardar compra</button></div>
        </form>
      ) : null}
      <section className="rounded-2xl border bg-white p-3 sm:p-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><h2 className="font-semibold">Hoja de compras · {date}</h2><p className="text-xs text-muted-foreground">{rows.length} líneas · Las compras repetidas permanecen separadas.</p></div><strong>Total Bs {money(sheetTotal)}</strong></div>
        {rows.length === 0 ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-muted-foreground">No hay compras registradas para esta fecha.</p> : null}
        <div className="space-y-3 md:hidden print:hidden">{rows.map((row, index) => <PurchaseCard key={row.id} row={row} index={index} units={units} pending={pending} canManage={canManage} onUpdate={updatePurchase} onMeasure={measurePurchase} onConfirm={confirmPurchase} />)}</div>
        <div className="hidden overflow-x-auto md:block print:block"><table className="w-full table-fixed border-collapse text-xs"><thead><tr className="bg-slate-100 text-left"><th className="w-8 p-2">N°</th><th className="w-[20%] p-2">Descripción</th><th className="p-2">Ud compra</th><th className="p-2 text-right">Cant.</th><th className="p-2 text-right">PU compra</th><th className="p-2 text-right">Total Bs</th><th className="p-2">Unidad referencia</th><th className="p-2 text-right">Precio referencial</th><th className="w-[16%] p-2">Observaciones</th><th className="p-2 print:hidden">Estado</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.id} className="border-t align-top"><td className="p-2">{index + 1}</td><td className="break-words p-2 font-medium">{row.productName}</td><td className="break-words p-2">{row.unitLabel}</td><td className="p-2 text-right">{row.quantity}</td><td className="p-2 text-right">{money(row.unitPrice)}</td><td className="p-2 text-right">{money(row.total)}</td><td className="p-2">{units.find((unit) => unit.id === row.referenceUnitId)?.name ?? "—"}</td><td className="p-2 text-right">{money(row.referencePrice)}</td><td className="break-words p-2">{row.notes || "—"}</td><td className="p-2 print:hidden">{row.status === "confirmado" ? "Confirmado" : "Borrador"}</td></tr>)}</tbody><tfoot><tr className="border-t-2 font-semibold"><td colSpan={5} className="p-2 text-right">TOTAL</td><td className="p-2 text-right">{money(sheetTotal)}</td><td colSpan={4} /></tr></tfoot></table></div>
        <div className="mt-4 space-y-2 print:hidden">{rows.map((row, index) => <div key={row.id} className="hidden md:block"><PurchaseCard row={row} index={index} units={units} pending={pending} canManage={canManage} onUpdate={updatePurchase} onMeasure={measurePurchase} onConfirm={confirmPurchase} compact /></div>)}</div>
      </section>
    </div>
  );
}

function PurchaseCard({ row, index, units, pending, canManage, onUpdate, onMeasure, onConfirm, compact = false }: {
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
