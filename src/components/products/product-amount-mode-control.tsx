"use client";

import { useActionState } from "react";

import { useActionToast } from "@/hooks/use-action-toast";
import { setQbProductAmountModeAction } from "@/lib/products/actions";
import { Button } from "@/components/ui/button";

type ActionState = { success: boolean; message?: string };
const initialState: ActionState = { success: false };

export function ProductAmountModeControl({
  productId,
  enabled,
  canManage,
  compact = false,
}: {
  productId: string;
  enabled: boolean;
  canManage: boolean;
  compact?: boolean;
}) {
  const [state, action, pending] = useActionState(
    setQbProductAmountModeAction,
    initialState,
  );
  useActionToast(state);

  return (
    <form
      action={action}
      className={compact ? "min-w-44" : "rounded-2xl border bg-muted/25 p-4"}
    >
      <input type="hidden" name="product_id" value={productId} />
      <input type="hidden" name="enabled" value={String(!enabled)} />
      {!compact ? (
        <div className="mb-3">
          <p className="font-medium">Permitir pedidos por importe en Bs</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Requiere producto vendible, unidades compatibles, precio base
            positivo y unidad de precio habilitada para pedidos.
          </p>
        </div>
      ) : null}
      <Button
        type="submit"
        size={compact ? "sm" : "default"}
        variant={enabled ? "outline" : "default"}
        disabled={!canManage || pending}
        className="rounded-xl"
      >
        {pending
          ? "Guardando…"
          : enabled
            ? "Deshabilitar Por Bs"
            : "Habilitar Por Bs"}
      </Button>
    </form>
  );
}
