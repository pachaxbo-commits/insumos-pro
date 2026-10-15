"use client";

import { useMemo, useState, useTransition } from "react";

import { saveWarehouseOperatingExpensesAction } from "@/lib/warehouse-purchases/actions";
import type { WarehouseOperatingExpense } from "@/lib/warehouse-purchases/data";

type ExpenseDraft = {
  id: string | null;
  clientKey: string;
  concept: string;
  amount: string;
  createdAt: string | null;
  updatedAt: string | null;
};

function toDraft(expense: WarehouseOperatingExpense): ExpenseDraft {
  return {
    id: expense.id,
    clientKey: expense.clientKey,
    concept: expense.concept,
    amount: String(expense.amount),
    createdAt: expense.createdAt,
    updatedAt: expense.updatedAt,
  };
}

const money = (amount: number) => new Intl.NumberFormat("es-BO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(amount);

const formatTimestamp = (value: string) => new Intl.DateTimeFormat("es-BO", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/La_Paz",
}).format(new Date(value));

export function WarehouseExpenseSection({
  date,
  initialExpenses,
  merchandiseTotal,
  canManage,
}: {
  date: string;
  initialExpenses: WarehouseOperatingExpense[];
  merchandiseTotal: number;
  canManage: boolean;
}) {
  const [expenses, setExpenses] = useState(() => initialExpenses.map(toDraft));
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const expenseTotal = useMemo(() => expenses.reduce((sum, row) => {
    const amount = Number(row.amount);
    return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
  }, 0), [expenses]);

  function addExpense() {
    setExpenses((current) => [...current, {
      id: null,
      clientKey: crypto.randomUUID(),
      concept: "",
      amount: "",
      createdAt: null,
      updatedAt: null,
    }]);
  }

  function updateExpense(clientKey: string, patch: Partial<ExpenseDraft>) {
    setExpenses((current) => current.map((row) => row.clientKey === clientKey ? { ...row, ...patch } : row));
  }

  function removeExpense(row: ExpenseDraft) {
    if (row.id) setDeletedIds((current) => current.includes(row.id!) ? current : [...current, row.id!]);
    setExpenses((current) => current.filter((item) => item.clientKey !== row.clientKey));
  }

  function saveExpenses() {
    if (expenses.some((row) => !row.concept.trim() || !Number.isFinite(Number(row.amount)) || Number(row.amount) <= 0)) {
      setMessage("Completa cada concepto y escribe un importe mayor que cero antes de guardar.");
      return;
    }
    setMessage("");
    startTransition(async () => {
      const result = await saveWarehouseOperatingExpensesAction(date, expenses.map((row) => ({
        clientKey: row.clientKey,
        concept: row.concept.trim(),
        amount: Number(row.amount),
      })), deletedIds);
      setMessage(result.message);
      if (result.success) {
        setDeletedIds([]);
        window.location.reload();
      }
    });
  }

  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Gastos operativos</h2>
          <p className="mt-1 text-sm text-muted-foreground">Gastos de la jornada sin movimiento de inventario ni efecto en costos de Recibos.</p>
        </div>
        {canManage ? <div className="flex gap-2 print:hidden">
          <button type="button" onClick={addExpense} className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted">+ Agregar gasto</button>
          <button type="button" onClick={saveExpenses} disabled={pending} className="rounded-lg bg-emerald-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Guardando…" : "Guardar gastos"}</button>
        </div> : null}
      </div>
      {message ? <p role="status" className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 print:hidden">{message}</p> : null}
      <div className="mt-4 overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead className="bg-slate-100 text-left text-xs uppercase"><tr>
            <th className="w-12 border-r p-2">N°</th>
            <th className="border-r p-2">Concepto</th>
            <th className="w-40 p-2 text-right">Importe (Bs)</th>
            {canManage ? <th className="w-28 p-2 print:hidden">Acción</th> : null}
          </tr></thead>
          <tbody>
            {expenses.map((row, index) => <tr key={row.clientKey} className="border-t align-top">
              <td className="border-r p-2">{index + 1}</td>
              <td className="border-r p-2">
                {canManage ? <input aria-label={`Concepto de gasto ${index + 1}`} maxLength={180} value={row.concept} onChange={(event) => updateExpense(row.clientKey, { concept: event.target.value })} placeholder="Carretilla, transporte…" className="w-full rounded-md border px-2 py-1.5 print:hidden" /> : row.concept}
                {canManage ? <span className="hidden print:inline">{row.concept}</span> : null}
                {row.createdAt ? <p className="mt-1 text-[11px] text-slate-500">Registro: {formatTimestamp(row.createdAt)} · Actualización: {formatTimestamp(row.updatedAt ?? row.createdAt)}</p> : null}
              </td>
              <td className="p-2 text-right">
                {canManage ? <input aria-label={`Importe de gasto ${index + 1}`} type="number" min="0.01" step="0.01" value={row.amount} onChange={(event) => updateExpense(row.clientKey, { amount: event.target.value })} className="w-full rounded-md border px-2 py-1.5 text-right print:hidden" /> : money(Number(row.amount))}
                {canManage ? <span className="hidden print:inline">{money(Number(row.amount))}</span> : null}
              </td>
              {canManage ? <td className="p-2 print:hidden"><button type="button" onClick={() => removeExpense(row)} className="text-xs text-rose-700 underline">Quitar</button></td> : null}
            </tr>)}
            {expenses.length === 0 ? <tr><td colSpan={canManage ? 4 : 3} className="p-4 text-center text-sm text-muted-foreground">No hay gastos operativos guardados para {date}.</td></tr> : null}
          </tbody>
          <tfoot className="border-t-2 bg-slate-50 font-semibold">
            <tr><td colSpan={2} className="p-2 text-right">SUBTOTAL GASTOS OPERATIVOS</td><td className="p-2 text-right">Bs {money(expenseTotal)}</td>{canManage ? <td className="print:hidden" /> : null}</tr>
            <tr><td colSpan={2} className="p-2 text-right">SUBTOTAL MERCADERÍA</td><td className="p-2 text-right">Bs {money(merchandiseTotal)}</td>{canManage ? <td className="print:hidden" /> : null}</tr>
            <tr className="bg-emerald-100"><td colSpan={2} className="p-2 text-right">TOTAL EGRESOS</td><td className="p-2 text-right">Bs {money(expenseTotal + merchandiseTotal)}</td>{canManage ? <td className="print:hidden" /> : null}</tr>
          </tfoot>
        </table>
      </div>
      {canManage ? <p className="mt-2 text-xs text-muted-foreground print:hidden">Los cambios quedan en esta pantalla hasta pulsar Guardar gastos. Quitar conserva la entrada en la auditoría como anulada.</p> : null}
    </section>
  );
}
