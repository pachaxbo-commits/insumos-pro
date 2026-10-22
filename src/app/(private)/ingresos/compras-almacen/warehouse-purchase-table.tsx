"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { confirmQbMerchandiseReceiptAction, createQbMerchandiseReceiptAction } from "@/lib/qb-ingresos/actions";
import { measureWarehousePurchaseAction, updateWarehousePurchaseAction } from "@/lib/warehouse-purchases/actions";
import type { WarehouseOperatingExpense, WarehousePurchase } from "@/lib/warehouse-purchases/data";
import { autoReferencePriceFromPurchaseUnit, purchaseTotal } from "@/lib/warehouse-purchases/model";
import { getWarehousePurchaseUnits } from "@/lib/warehouse-purchases/allowed-units";

import { WarehouseExpenseSection } from "./warehouse-expense-section";
import { PurchaseCard } from "./warehouse-purchase-sheet";

type Product = { id: string; name: string; matrixColor: string | null; baseUnitId: string | null; baseDimensionId: string | null; baseDimensionCode: string | null; baseFactorToBase: number | null; hasPhysicalBase: boolean };
type Unit = { id: string; name: string; symbol: string; dimensionId: string; dimensionCode: string; factorToBase: number; isActive: boolean };
type AllowedUnit = { id: string; productId: string; context: string; unitId: string | null; presentationId: string | null; isActive: boolean };
type Presentation = { id: string; productId: string; name: string; symbol: string; baseUnitId: string; baseQuantity: number; conversionFactorToBase: number; isActive: boolean; allowPurchase: boolean };
const UNMEASURED_COMMERCIAL = "commercial:unmeasured";
type Draft = { id: number; productId: string; purchaseOptionId: string; commercialLabel: string; quantity: string; unitPrice: string; referenceUnitId: string; referencePrice: string; referenceMode: "auto" | "manual"; notes: string };

const newDraft = (id: number): Draft => ({ id, productId: "", purchaseOptionId: "", commercialLabel: "", quantity: "", unitPrice: "", referenceUnitId: "", referencePrice: "", referenceMode: "auto", notes: "" });
const money = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

export function WarehousePurchaseTable({ date, rows, expenses, products, units, allowedUnits, presentations, canManage, canConfigureUnits }: {
  date: string; rows: WarehousePurchase[]; expenses: WarehouseOperatingExpense[]; products: Product[]; units: Unit[];
  allowedUnits: AllowedUnit[]; presentations: Presentation[]; canManage: boolean; canConfigureUnits: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; success: boolean } | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [nextId, setNextId] = useState(1);
  const [pickerId, setPickerId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const unitById = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);
  const presentationById = useMemo(() => new Map(presentations.map((item) => [item.id, item])), [presentations]);
  const referenceUnits = units.filter((unit) => unit.isActive && /arroba|cuartilla|libra/i.test(`${unit.name} ${unit.symbol}`));
  const normalizedSearch = search.trim().toLocaleLowerCase("es");
  const filteredProducts = normalizedSearch ? products.filter((product) => product.name.toLocaleLowerCase("es").includes(normalizedSearch)) : [];
  const sheetTotal = rows.reduce((sum, row) => sum + row.total, 0);

  function updateDraft(id: number, patch: Partial<Draft>) {
    setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...patch } : draft));
  }

  function unitLabel(allowed: AllowedUnit) {
    if (allowed.unitId) {
      const unit = unitById.get(allowed.unitId);
      return unit ? `${unit.name} (${unit.symbol})` : "Unidad";
    }
    const presentation = presentationById.get(allowed.presentationId ?? "");
    return presentation ? `${presentation.name} (${presentation.symbol})` : "Presentación";
  }

  function purchaseOptionsFor(productId: string) {
    const product = products.find((item) => item.id === productId);
    return getWarehousePurchaseUnits({
      productId,
      baseUnitId: product?.baseUnitId ?? null,
      baseDimensionId: product?.baseDimensionId ?? null,
      baseDimensionCode: product?.baseDimensionCode ?? null,
      baseFactorToBase: product?.baseFactorToBase ?? null,
      allowedUnits,
      units,
      presentations,
    });
  }

  function purchaseOptionLabel(optionId: string, productId: string) {
    const option = purchaseOptionsFor(productId).find((item) => item.id === optionId);
    if (option?.unitId) {
      const unit = unitById.get(option.unitId);
      return unit ? `${unit.name} (${unit.symbol})` : "Unidad física";
    }
    const allowed = allowedUnits.find((item) => item.id === option?.allowedUnitId);
    return allowed ? unitLabel(allowed) : "Presentación";
  }

  function referenceFor(draft: Draft) {
    const option = purchaseOptionsFor(draft.productId).find((item) => item.id === draft.purchaseOptionId);
    const source = option?.unitId ? unitById.get(option.unitId) : null;
    const target = unitById.get(draft.referenceUnitId);
    return source && target && draft.unitPrice !== ""
      ? source.dimensionCode === "legacy_dump" && source.id !== target.id ? null : autoReferencePriceFromPurchaseUnit(Number(draft.unitPrice),
        { dimensionId: source.dimensionId, factorToBase: source.factorToBase, label: `${source.name} ${source.symbol}` },
        { dimensionId: target.dimensionId, factorToBase: target.factorToBase })
      : null;
  }

  function saveDraft(draft: Draft) {
    const auto = referenceFor(draft);
    const referencePrice = draft.referenceMode === "auto" ? auto?.toString() ?? "" : draft.referencePrice;
    const isUnmeasuredCommercial = draft.purchaseOptionId === UNMEASURED_COMMERCIAL;
    const option = purchaseOptionsFor(draft.productId).find((item) => item.id === draft.purchaseOptionId);
    // The free-form commercial option is intentionally not part of the configured
    // purchase options: it has no physical conversion and must be saved as such.
    if (!option && !isUnmeasuredCommercial) return;
    const form = new FormData();
    Object.entries({
      receipt_date: date, reference_code: "HOJA-COMPRAS-ALMACEN", supplier_name: "",
      product_id: draft.productId, allowed_unit_id: option?.allowedUnitId ?? "", purchase_unit_id: option?.allowedUnitId ? "" : option?.unitId ?? "", commercial_label: isUnmeasuredCommercial ? draft.commercialLabel : "", source_quantity: draft.quantity,
      unit_cost: draft.unitPrice, requires_classification: "false", notes: draft.notes,
      reference_unit_id: draft.referenceUnitId, reference_price: referencePrice,
      reference_price_origin: draft.referenceMode === "auto" && auto !== null ? "calculated" : referencePrice !== "" ? "manual" : "",
      warehouse_purchase: "true",
    }).forEach(([key, value]) => form.set(key, value));
    startTransition(async () => {
      const result = await createQbMerchandiseReceiptAction({ success: false }, form);
      setMessage({ text: result.message ?? "", success: result.success });
      if (result.success) {
        setDrafts((current) => current.filter((item) => item.id !== draft.id));
        router.refresh();
      }
    });
  }

  function updatePurchase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateWarehousePurchaseAction(form);
      setMessage({ text: result.message ?? "", success: result.success });
      if (result.success) router.refresh();
    });
  }

  function measurePurchase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await measureWarehousePurchaseAction(form);
      setMessage({ text: result.message ?? "", success: result.success });
      if (result.success) router.refresh();
    });
  }

  function confirmPurchase() {
    if (!confirmId) return;
    const form = new FormData();
    form.set("id", confirmId);
    form.set("confirmation", "CONFIRMAR");
    startTransition(async () => {
      const result = await confirmQbMerchandiseReceiptAction({ success: false }, form);
      setMessage({ text: result.message ?? "", success: result.success });
      if (result.success) { setConfirmId(null); router.refresh(); }
    });
  }

  return <div className="space-y-4">
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
    {message?.text ? <p role={message.success ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-sm print:hidden ${message.success ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}>{message.text}</p> : null}
    <section className="rounded-2xl border bg-white p-3 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div><h2 className="font-semibold">Hoja de compras · {date}</h2><p className="text-xs text-muted-foreground">Una fila por compra. Las compras repetidas permanecen separadas.</p></div>
        <strong>Total Bs {money(sheetTotal)}</strong>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[1120px] border-collapse text-sm">
          <thead className="bg-slate-100 text-left text-xs uppercase"><tr>
            <th className="w-10 border-r p-2">N°</th><th className="min-w-56 border-r p-2">Descripción</th><th className="min-w-40 border-r p-2">Ud</th>
            <th className="w-24 border-r p-2 text-right">Cant</th><th className="w-24 border-r p-2 text-right">PU</th><th className="w-24 border-r p-2 text-right">Total Bs</th>
            <th className="min-w-52 border-r p-2">PU @-CUART-LIBRA</th><th className="min-w-52 border-r p-2">Observaciones</th><th className="w-36 p-2 print:hidden">Estado / acción</th>
          </tr></thead>
          <tbody>
            {rows.map((row, index) => <FragmentRow key={row.id} row={row} index={index} productColor={products.find((product) => product.id === row.productId)?.matrixColor ?? null} expanded={expandedId === row.id} onToggle={() => setExpandedId(expandedId === row.id ? null : row.id)} units={units} pending={pending} canManage={canManage} onUpdate={updatePurchase} onMeasure={measurePurchase} onConfirm={setConfirmId} />)}
            {drafts.map((draft, index) => {
              const product = products.find((item) => item.id === draft.productId);
              const purchaseUnits = purchaseOptionsFor(draft.productId);
              const hasPhysicalBase = Boolean(product?.hasPhysicalBase);
              const auto = referenceFor(draft);
              const referencePrice = draft.referenceMode === "auto" ? auto?.toString() ?? "" : draft.referencePrice;
              const total = draft.quantity !== "" && draft.unitPrice !== "" ? purchaseTotal(Number(draft.quantity), Number(draft.unitPrice)) : 0;
              const valid = !!draft.productId && !!draft.purchaseOptionId && (draft.purchaseOptionId !== UNMEASURED_COMMERCIAL || draft.commercialLabel.trim().length > 0) && Number(draft.quantity) > 0 && draft.unitPrice !== "" && Number(draft.unitPrice) >= 0;
              return <tr key={draft.id} className="border-t bg-emerald-50/40 align-top print:hidden">
                <td className="border-r p-2">{rows.length + index + 1}</td>
                <td className="border-r p-2"><button type="button" onClick={() => { setPickerId(draft.id); setSearch(""); }} style={product?.matrixColor ? { borderLeft: `4px solid ${product.matrixColor}`, backgroundColor: `color-mix(in srgb, ${product.matrixColor} 16%, white)` } : undefined} className="w-full rounded-md border bg-white px-2 py-2 text-left font-medium text-slate-950 hover:border-emerald-700 focus-visible:outline-2 focus-visible:outline-emerald-700 print:[print-color-adjust:exact]">{product?.name ?? "Seleccionar producto…"}</button></td>
                <td className="border-r p-2"><select aria-label={`Unidad de compra fila ${index + 1}`} value={draft.purchaseOptionId} onChange={(event) => updateDraft(draft.id, { purchaseOptionId: event.target.value, commercialLabel: "" })} disabled={!product || (purchaseUnits.length === 0 && !hasPhysicalBase)} className="w-full rounded-md border bg-white px-2 py-2 disabled:bg-slate-100"><option value="">{purchaseUnits.length ? "Seleccionar" : "Sin unidades físicas compatibles"}</option>{purchaseUnits.map((unit) => <option key={unit.id} value={unit.id}>{purchaseOptionLabel(unit.id, draft.productId)}</option>)}{hasPhysicalBase ? <option value={UNMEASURED_COMMERCIAL}>Presentación comercial sin equivalencia</option> : null}</select>{draft.purchaseOptionId === UNMEASURED_COMMERCIAL ? <><input aria-label={`Nombre de presentación comercial fila ${index + 1}`} value={draft.commercialLabel} onChange={(event) => updateDraft(draft.id, { commercialLabel: event.target.value })} maxLength={120} placeholder="Ej.: CARGA, CHIPA, AMARRO" className="mt-1 w-full rounded-md border px-2 py-1.5" /><p className="mt-1 max-w-48 text-xs text-amber-800">Se guarda sin conversión. Registra la cantidad física útil medida antes de ingresar stock.</p></> : null}{product && purchaseUnits.length === 0 && !hasPhysicalBase ? <p role="status" className="mt-1 max-w-48 text-xs text-amber-800">Este producto no tiene una unidad física base válida. Configura la unidad de inventario antes de registrar la compra. {canConfigureUnits ? <Link className="font-semibold underline" href="/parametrizacion">Revisar configuración</Link> : "Solicita al administrador que revise la unidad de inventario."}</p> : null}</td>
                <td className="border-r p-2"><input aria-label={`Cantidad fila ${index + 1}`} type="number" min="0.000001" step="any" value={draft.quantity} onChange={(event) => updateDraft(draft.id, { quantity: event.target.value })} className="w-full rounded-md border px-2 py-2 text-right" /></td>
                <td className="border-r p-2"><input aria-label={`Precio unitario fila ${index + 1}`} type="number" min="0" step="any" value={draft.unitPrice} onChange={(event) => updateDraft(draft.id, { unitPrice: event.target.value })} className="w-full rounded-md border px-2 py-2 text-right" /></td>
                <td className="border-r p-2 text-right font-medium">{money(Number.isFinite(total) ? total : 0)}</td>
                <td className="border-r p-2"><div className="flex gap-1"><select aria-label={`Unidad de referencia fila ${index + 1}`} value={draft.referenceUnitId} onChange={(event) => updateDraft(draft.id, { referenceUnitId: event.target.value })} className="min-w-0 flex-1 rounded-md border px-1 py-2"><option value="">Sin definir</option>{referenceUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} ({unit.symbol})</option>)}</select><input aria-label={`Precio referencial fila ${index + 1}`} type="number" min="0" step="any" value={referencePrice} onChange={(event) => updateDraft(draft.id, { referencePrice: event.target.value, referenceMode: "manual" })} className="w-20 rounded-md border px-1 py-2 text-right" /></div><span className="text-[11px] text-slate-500">{draft.referenceMode === "auto" && auto !== null ? "Calculado; editable" : "Manual o sin equivalencia segura"}</span>{auto !== null && draft.referenceMode === "manual" ? <button type="button" onClick={() => updateDraft(draft.id, { referenceMode: "auto" })} className="ml-1 text-[11px] text-emerald-800 underline">Usar cálculo</button> : null}</td>
                <td className="border-r p-2"><input aria-label={`Observaciones fila ${index + 1}`} maxLength={2000} value={draft.notes} onChange={(event) => updateDraft(draft.id, { notes: event.target.value })} className="w-full rounded-md border px-2 py-2" /></td>
                <td className="p-2"><button type="button" disabled={!valid || pending} onClick={() => saveDraft(draft)} className="rounded-md bg-emerald-800 px-2 py-1.5 text-xs text-white disabled:opacity-50">Guardar fila</button><button type="button" onClick={() => setDrafts((current) => current.filter((item) => item.id !== draft.id))} className="ml-1 text-xs text-slate-600 underline">Quitar</button></td>
              </tr>;
            })}
            {rows.length === 0 && drafts.length === 0 ? <tr><td colSpan={9} className="p-5 text-center text-slate-500">No hay compras en esta fecha. Agrega una fila para comenzar.</td></tr> : null}
          </tbody>
          <tfoot><tr className="border-t-2 bg-slate-50 font-semibold"><td colSpan={5} className="p-2 text-right">TOTAL GUARDADO</td><td className="p-2 text-right">{money(sheetTotal)}</td><td colSpan={3} /></tr></tfoot>
        </table>
      </div>
      {canManage ? <button type="button" onClick={() => { setDrafts((current) => [...current, newDraft(nextId)]); setNextId((id) => id + 1); }} className="mt-3 rounded-lg border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-50 print:hidden">+ Agregar fila</button> : null}
      <p className="mt-2 text-xs text-slate-500 print:hidden">Guardar una fila crea un borrador. El stock cambia solamente al confirmar su ingreso físico.</p>
    </section>
    <WarehouseExpenseSection key={date} date={date} initialExpenses={expenses} merchandiseTotal={sheetTotal} canManage={canManage} />
    {pickerId !== null ? <WarehouseProductPicker products={filteredProducts} query={search} onQuery={setSearch} onClose={() => setPickerId(null)} onSelect={(product) => { updateDraft(pickerId, { productId: product.id, purchaseOptionId: "", commercialLabel: "", referenceUnitId: "", referencePrice: "", referenceMode: "auto" }); setPickerId(null); }} /> : null}
    {confirmId ? <div role="dialog" aria-modal="true" aria-label="Confirmar ingreso a stock" className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4 print:hidden"><div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><h3 className="text-lg font-semibold">Confirmar ingreso a stock</h3><p className="mt-2 text-sm">{rows.find((row) => row.receiptId === confirmId)?.productName}: esta compra sumará físicamente al stock una sola vez. Verifica que la cantidad medida sea correcta.</p>{message?.text && !message.success ? <p role="alert" className="mt-2 text-sm text-rose-700">{message.text}</p> : null}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setConfirmId(null)} className="rounded-lg border px-3 py-2">Cancelar</button><button type="button" disabled={pending} onClick={confirmPurchase} className="rounded-lg bg-emerald-800 px-3 py-2 text-white disabled:opacity-50">Confirmar ingreso</button></div></div></div> : null}
  </div>;
}

function WarehouseProductPicker({ products, query, onQuery, onClose, onSelect }: {
  products: Product[];
  query: string;
  onQuery: (value: string) => void;
  onClose: () => void;
  onSelect: (product: Product) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function moveActive(delta: number) {
    setActiveIndex((current) => {
      const next = Math.max(0, Math.min(products.length - 1, current + delta));
      requestAnimationFrame(() => {
        optionRefs.current[next]?.scrollIntoView({ block: "nearest" });
      });
      return next;
    });
  }

  return <div role="dialog" aria-modal="true" aria-label="Seleccionar producto" className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4 print:hidden"><div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl"><div className="mb-3 flex items-center justify-between"><h3 className="text-lg font-semibold">Seleccionar producto</h3><button type="button" onClick={onClose} aria-label="Cerrar selector de producto" className="rounded-md border px-2 py-1">Cerrar</button></div><input autoFocus aria-label="Buscar producto" placeholder="Buscar producto…" value={query} onChange={(event) => { onQuery(event.target.value); setActiveIndex(0); }} onKeyDown={(event) => {
    if (event.key === "ArrowDown" && products.length) { event.preventDefault(); moveActive(1); }
    else if (event.key === "ArrowUp" && products.length) { event.preventDefault(); moveActive(-1); }
    else if (event.key === "Enter" && products[activeIndex]) { event.preventDefault(); onSelect(products[activeIndex]); }
    else if (event.key === "Escape") { event.preventDefault(); onClose(); }
  }} className="mb-3 w-full rounded-lg border px-3 py-2" /><div ref={listRef} className="max-h-80 overflow-y-auto rounded-lg border">{!query.trim() ? <p className="p-3 text-sm text-slate-500">Escribe el nombre para buscar productos.</p> : products.length === 0 ? <p className="p-3 text-sm text-slate-500">Sin coincidencias.</p> : products.map((product, index) => <button ref={(element) => { optionRefs.current[index] = element; }} key={product.id} type="button" onMouseEnter={() => setActiveIndex(index)} onClick={() => onSelect(product)} className={`block w-full border-b px-3 py-2 text-left text-sm ${index === activeIndex ? "bg-emerald-50 outline outline-1 outline-emerald-700" : "hover:bg-emerald-50"}`}>{product.name}</button>)}</div></div></div>;
}

function FragmentRow({ row, index, productColor, expanded, onToggle, units, pending, canManage, onUpdate, onMeasure, onConfirm }: {
  row: WarehousePurchase; index: number; productColor: string | null; expanded: boolean; onToggle: () => void; units: Unit[]; pending: boolean; canManage: boolean;
  onUpdate: (event: React.FormEvent<HTMLFormElement>) => void; onMeasure: (event: React.FormEvent<HTMLFormElement>) => void; onConfirm: (id: string) => void;
}) {
  return <>
    <tr className="border-t align-top"><td className="border-r p-2">{index + 1}</td><td style={productColor ? { borderLeft: `4px solid ${productColor}`, backgroundColor: `color-mix(in srgb, ${productColor} 16%, white)` } : undefined} className="border-r p-2 font-medium text-slate-950 print:[print-color-adjust:exact]">{row.productName}</td><td className="border-r p-2">{row.unitLabel}</td><td className="border-r p-2 text-right">{row.quantity}</td><td className="border-r p-2 text-right">{money(row.unitPrice)}</td><td className="border-r p-2 text-right">{money(row.total)}</td><td className="border-r p-2">{row.referencePrice === null ? "—" : `${money(row.referencePrice)} / ${units.find((unit) => unit.id === row.referenceUnitId)?.symbol ?? "UD"}`}</td><td className="border-r p-2">{row.notes || "—"}</td><td className="p-2 print:hidden"><span className="block text-xs">{row.status === "confirmado" ? "Confirmado" : "Borrador"}</span><button type="button" aria-expanded={expanded} onClick={onToggle} className="mt-1 text-xs text-emerald-800 underline">{expanded ? "Cerrar detalle" : "Editar / confirmar"}</button></td></tr>
    {expanded ? <tr className="border-t bg-slate-50 print:hidden"><td colSpan={9} className="p-3"><PurchaseCard row={row} index={index} units={units} pending={pending} canManage={canManage} onUpdate={onUpdate} onMeasure={onMeasure} onConfirm={onConfirm} compact /></td></tr> : null}
  </>;
}
