"use client";

import { useActionState } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";

import { useActionToast } from "@/hooks/use-action-toast";
import {
  setQbStrictStockControlAction,
  type OperationalSettingsActionState,
} from "@/lib/operational-settings/actions";
import type { QbOperationalSettings } from "@/types/operational-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: OperationalSettingsActionState = { success: false };

export function StockControlSettings({
  settings,
}: {
  settings: QbOperationalSettings;
}) {
  const [state, action, pending] = useActionState(
    setQbStrictStockControlAction,
    initialState,
  );
  useActionToast(state);

  return (
    <Card className="border-amber-200 bg-amber-50/45">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5" />
              Operación e inventario
            </CardTitle>
            <CardDescription className="mt-2">
              Control estricto de stock
            </CardDescription>
          </div>
          <Badge variant="outline" className="rounded-full bg-white">
            {settings.strictStockControl ? "Activado" : "Desactivado — piloto"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm leading-6 text-muted-foreground">
          {settings.strictStockControl
            ? "Las futuras entregas no pueden dejar existencias negativas. Los pedidos y movimientos anteriores permanecen sin cambios."
            : "Stock provisional: las operaciones están habilitadas, pero los saldos pueden no coincidir con la existencia física hasta registrar el inventario de apertura."}
        </p>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Saldo negativo", settings.negativeProducts],
            ["Sin unidad base", settings.productsWithoutBaseUnit],
            ["Sin stock de apertura", settings.productsWithoutOpeningStock],
            ["Por regularizar", settings.pendingRegularization],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-xl border bg-white/75 p-3"
            >
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-semibold">{value}</p>
            </div>
          ))}
        </div>

        <form
          action={action}
          className="space-y-3 rounded-2xl border bg-white/75 p-4"
        >
          <input
            type="hidden"
            name="enabled"
            value={String(!settings.strictStockControl)}
          />
          {!settings.strictStockControl ? (
            <>
              <div className="flex items-start gap-2 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <p>
                  Al activar, las futuras entregas con existencia insuficiente
                  serán bloqueadas. No se corrigen ni eliminan saldos previos.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="strict-stock-confirmation">
                  Confirmación administrativa
                </Label>
                <Input
                  id="strict-stock-confirmation"
                  name="confirmation"
                  placeholder="ACTIVAR CONTROL ESTRICTO"
                  autoComplete="off"
                  required
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Al volver al modo piloto se permitirán saldos negativos,
              manteniendo todos los movimientos y la auditoría.
            </p>
          )}
          <Button
            type="submit"
            disabled={pending}
            variant={settings.strictStockControl ? "outline" : "default"}
          >
            {pending
              ? "Guardando…"
              : settings.strictStockControl
                ? "Desactivar control estricto"
                : "Activar control estricto"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
