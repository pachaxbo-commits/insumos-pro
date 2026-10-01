"use client";

import { useActionState } from "react";

import { saveAppAppearanceAction, type AppearanceActionState } from "@/lib/app-appearance/actions";
import type { AppAppearance } from "@/lib/app-appearance/data";
import { menuKeys } from "@/lib/app-appearance/model";

const initialState: AppearanceActionState = { success: false, message: "" };

export function AppearanceForm({ appearance }: { appearance: AppAppearance }) {
  const [state, action, pending] = useActionState(saveAppAppearanceAction, initialState);
  return <form action={action} className="space-y-4 rounded-lg border bg-white p-4">
    <div><h2 className="font-semibold">Identidad y menú</h2><p className="text-sm text-slate-500">Los textos visibles pueden cambiar; rutas y permisos permanecen iguales.</p></div>
    <label className="block text-sm">Nombre visible del sistema
      <input name="system_name" defaultValue={appearance.systemName} minLength={2} maxLength={60} required className="mt-1 h-10 w-full rounded-md border px-3" />
    </label>
    <label className="block text-sm">Logo (JPEG, PNG o WebP; hasta 2 MB)
      <input name="logo" type="file" accept="image/jpeg,image/png,image/webp"
        className="mt-1 block w-full cursor-pointer rounded-md border border-slate-300 bg-white p-2 text-sm text-slate-600 transition-colors hover:border-emerald-700 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-emerald-900 file:px-4 file:py-2 file:font-medium file:text-white hover:file:bg-emerald-800" />
    </label>
    {appearance.logoUrl ? <p className="text-xs text-slate-500">Hay un logo personalizado activo. Deja el archivo vacío para conservarlo.</p> : null}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {menuKeys.map((key) => <label key={key} className="text-sm">{key}
        <input name={`label_${key}`} defaultValue={appearance.menuLabels[key]} maxLength={40} required className="mt-1 h-10 w-full rounded-md border px-3" />
      </label>)}
    </div>
    {state.message ? <p role="status" className={`text-sm ${state.success ? "text-emerald-700" : "text-rose-700"}`}>{state.message}</p> : null}
    <button type="submit" disabled={pending} className="rounded-md bg-emerald-900 px-4 py-2 text-sm text-white disabled:opacity-50">{pending ? "Guardando…" : "Guardar configuración"}</button>
  </form>;
}
