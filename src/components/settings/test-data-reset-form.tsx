"use client";

import { useActionState, useState } from "react";

import { resetTestDataAction, type ResetActionState, type ResetMode, type ResetPreview } from "@/lib/test-data-reset/actions";

const initialState: ResetActionState = { success: false, message: "" };

export function TestDataResetForm({ previews, enabled }: { previews: Record<ResetMode, ResetPreview>; enabled: boolean }) {
  const [mode, setMode] = useState<ResetMode>("receipts");
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [state, action, pending] = useActionState(resetTestDataAction, initialState);
  const preview = previews[mode];
  return <div className="space-y-4 rounded-lg border bg-white p-4">
    <p className="text-sm text-slate-600">Selecciona un grupo. Pedidos incluye automáticamente su operación y recibos para preservar las dependencias.</p>
    <fieldset className="space-y-2 text-sm">
      <legend className="font-medium">Datos operativos</legend>
      <label className="flex items-center gap-2"><input type="radio" name="choice" checked={mode === "receipts"} onChange={() => { setMode("receipts"); setOpen(false); }} /> Solo Recibos</label>
      <label className="flex items-center gap-2"><input type="radio" name="choice" checked={mode === "orders"} onChange={() => { setMode("orders"); setOpen(false); }} /> Pedidos, preparación, entregas y recibos</label>
    </fieldset>
    <div className="grid gap-2 rounded-md bg-slate-50 p-3 text-sm sm:grid-cols-2">
      <p>Recibos: <strong>{preview.receipts}</strong></p><p>Pedidos: <strong>{preview.orders}</strong></p>
      <p>Preparaciones: <strong>{preview.preparations}</strong></p><p>Movimientos de entrega: <strong>{preview.deliveries}</strong></p>
      <p>Movimientos de stock que se revertirán: <strong>{preview.delivery_stock_movements}</strong></p>
    </div>
    <p className="text-sm text-emerald-800">Se conservan clientes ({preview.customers_preserved}), productos ({preview.products_preserved}), perfiles ({preview.profiles_preserved}) y configuración.</p>
    {!enabled ? <p role="status" className="text-sm text-amber-800">La limpieza está desactivada por la configuración del servidor.</p> : null}
    {!open ? <button type="button" disabled={!enabled} onClick={() => setOpen(true)} className="rounded-md border border-rose-500 px-4 py-2 text-sm text-rose-800 disabled:opacity-50">Borrar datos seleccionados</button> : null}
    {open ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4">
      <div role="dialog" aria-modal="true" aria-label="Confirmar borrado" className="w-full max-w-lg rounded-lg border border-rose-300 bg-white p-5 shadow-xl">
      <h2 className="font-semibold text-rose-900">Confirmar limpieza de datos de prueba</h2>
      <p className="my-2 text-sm">Se borrarán los grupos mostrados arriba. Esta acción no se puede deshacer desde la aplicación.</p>
      <form action={action} className="space-y-3">
        <input type="hidden" name="mode" value={mode} />
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
