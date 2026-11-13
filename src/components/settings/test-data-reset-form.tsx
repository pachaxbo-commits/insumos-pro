"use client";

import { useActionState, useState } from "react";

import { resetTestDataAction, type ResetActionState, type ResetMode, type ResetPreview } from "@/lib/test-data-reset/actions";

const initialState: ResetActionState = { success: false, message: "" };

export function TestDataResetForm({ previews }: { previews: Record<ResetMode, ResetPreview> }) {
  const [mode, setMode] = useState<ResetMode>("receipts");
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [state, action, pending] = useActionState(resetTestDataAction, initialState);
  const preview = previews[mode];
  const receiptCount = mode === "receipts" ? selected.length : mode === "orders" || mode === "orders_stock" ? preview.receipts : 0;
  return <div className="space-y-4 rounded-lg border bg-white p-4">
    <p className="text-sm text-slate-600">Selecciona el alcance de limpieza. La vista previa refleja los registros afectados por esa opción.</p>
    <fieldset className="space-y-2 text-sm">
      <legend className="font-medium">Datos operativos</legend>
      <label className="flex items-center gap-2"><input type="radio" name="choice" checked={mode === "receipts"} onChange={() => { setMode("receipts"); setOpen(false); }} /> Solo Recibos</label>
      <label className="flex items-center gap-2"><input type="radio" name="choice" checked={mode === "orders"} onChange={() => { setMode("orders"); setOpen(false); }} /> Pedidos y operación</label>
      <label className="flex items-center gap-2"><input type="radio" name="choice" checked={mode === "stock"} disabled={preview.orders > 0} onChange={() => { setMode("stock"); setOpen(false); }} /> Solo stock</label>
      <label className="flex items-center gap-2"><input type="radio" name="choice" checked={mode === "orders_stock"} onChange={() => { setMode("orders_stock"); setOpen(false); }} /> Pedidos y stock</label>
    </fieldset>
    {mode === "stock" && preview.orders > 0
      ? <p role="alert" className="rounded border border-amber-400 bg-amber-50 p-2 text-sm text-amber-900">Hay {preview.orders} pedidos dependientes. Solo stock está bloqueado. Elige Pedidos + stock.</p>
      : null}
    {mode === "receipts" ? <fieldset className="max-h-60 space-y-2 overflow-auto rounded border p-3 text-sm">
      <legend>Recibos a borrar</legend>
      {preview.receipt_options.map((receipt) => <label key={receipt.id} className="flex gap-2">
        <input type="checkbox" checked={selected.includes(receipt.id)} onChange={(event) =>
          setSelected((current) => event.target.checked ? [...current, receipt.id] : current.filter((id) => id !== receipt.id))} />
        {receipt.label} · {receipt.status}
      </label>)}
    </fieldset> : <p className="text-sm font-semibold text-rose-800">{mode === "stock" ? "Este modo deja el stock en cero y elimina movimientos e ingresos de inventario." : "Este modo elimina pedidos y sus derivados."}</p>}
    <div className="grid gap-2 rounded-md bg-slate-50 p-3 text-sm sm:grid-cols-2">
      {mode !== "stock" && <p>Recibos a eliminar: <strong>{receiptCount}</strong></p>}<p>Pedidos a eliminar: <strong>{preview.orders}</strong></p>
      <p>Preparaciones: <strong>{preview.preparations}</strong></p><p>Confirmaciones de entrega: <strong>{preview.deliveries}</strong></p>
      <p>Movimientos relacionados: <strong>{preview.delivery_stock_movements}</strong></p>
      {(mode === "stock" || mode === "orders_stock") && <p>Productos con existencias que quedarán en cero: <strong>{preview.products_stock_zeroed}</strong></p>}
      {(mode === "stock" || mode === "orders_stock") && <>
        <p>Movimientos a eliminar: <strong>{preview.inventory_movements}</strong></p>
        <p>Ingresos de mercadería: <strong>{preview.merchandise_receipts}</strong></p>
        <p>Lotes FIFO: <strong>{preview.inventory_lots}</strong></p>
      </>}
    </div>
    <p className="text-sm text-emerald-800">Se conservan clientes ({preview.customers_preserved}), productos ({preview.products_preserved}), perfiles ({preview.profiles_preserved}), unidades y configuración.{mode !== "stock" && mode !== "orders_stock" ? " Los movimientos independientes también se conservan." : ""}</p>
    {!open ? <button type="button" disabled={(receiptCount === 0 && preview.orders === 0 && preview.inventory_movements === 0) || (mode === "stock" && preview.orders > 0)} onClick={() => { setConfirmation(""); setOpen(true); }} className="rounded border border-rose-500 px-4 py-2 text-rose-800 disabled:opacity-50">Borrar datos seleccionados</button> : null}
    {open ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4">
      <div role="dialog" aria-modal="true" aria-label="Confirmar borrado" className="w-full max-w-lg rounded-lg border border-rose-300 bg-white p-5 shadow-xl">
      <h2 className="font-semibold text-rose-900">Confirmar limpieza de datos de prueba</h2>
      <p className="my-2 text-sm">{mode === "receipts"
        ? `Se borrarán ${receiptCount} recibos seleccionados. Pedidos y stock se conservan.`
        : mode === "orders"
          ? `Se borrarán ${preview.orders} pedidos y ${receiptCount} recibos derivados. Se revertirán únicamente sus movimientos vinculados.`
          : mode === "stock"
            ? `Se borrarán ${preview.inventory_movements} movimientos, ${preview.merchandise_receipts} ingresos y ${preview.inventory_lots} lotes. ${preview.products_stock_zeroed} productos quedarán con stock cero.`
            : `Se borrarán ${preview.orders} pedidos, ${receiptCount} recibos y todos los registros de inventario indicados. ${preview.products_stock_zeroed} productos quedarán con stock cero.`} Esta acción no se puede deshacer desde la aplicación.</p>
      <form action={action} className="space-y-3">
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="revision" value={preview.revision} />
        {mode === "receipts" ? selected.map((id) => <input key={id} type="hidden" name="receipt" value={id} />) : null}
        <label className="block text-sm">Escribe “BORRAR DATOS” para confirmar.
          <input name="confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" className="mt-1 h-10 w-full rounded-md border px-3" />
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={() => { setOpen(false); setConfirmation(""); }} className="rounded-md border px-4 py-2 text-sm">Cancelar</button>
          <button type="submit" disabled={pending || confirmation !== "BORRAR DATOS"} className="rounded-md bg-rose-800 px-4 py-2 text-sm text-white disabled:opacity-50">{pending ? "Borrando…" : "Confirmar borrado"}</button>
        </div>
      </form>
      </div>
    </div> : null}
    {state.message ? <p role="status" className={`text-sm ${state.success ? "text-emerald-700" : "text-rose-700"}`}>{state.message}</p> : null}
  </div>;
}
