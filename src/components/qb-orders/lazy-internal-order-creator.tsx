"use client";

import { useEffect, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { Plus } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getInternalOrderCreationDataAction } from "@/lib/qb-orders/creation-actions";
import type {
  QbInternalOrder,
  QbInternalOrderCreationData,
} from "@/types/qb-orders";

const InternalOrderCreator = dynamic(
  () =>
    import("@/components/qb-orders/internal-order-creator").then(
      (module) => module.InternalOrderCreator,
    ),
  {
    loading: () => (
      <Button type="button" disabled>
        Cargando formulario…
      </Button>
    ),
  },
);

export function LazyInternalOrderCreator({
  initialData,
  editingOrder,
  onCancelEdit,
}: {
  initialData?: QbInternalOrderCreationData;
  editingOrder?: QbInternalOrder | null;
  onCancelEdit?: () => void;
}) {
  const [data, setData] = useState<QbInternalOrderCreationData | null>(
    initialData ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function loadData() {
    setError(null);
    startTransition(async () => {
      const result = await getInternalOrderCreationDataAction();
      if (result.success) setData(result.data);
      else setError(result.message);
    });
  }

  useEffect(() => {
    if (!editingOrder || data || error) return;
    let cancelled = false;
    void getInternalOrderCreationDataAction().then((result) => {
      if (cancelled) return;
      if (result.success) setData(result.data);
      else setError(result.message);
    });
    return () => {
      cancelled = true;
    };
  }, [data, editingOrder, error]);

  if (data)
    return (
      <InternalOrderCreator
        key={editingOrder?.id ?? "new-order"}
        {...data}
        initiallyOpen={Boolean(editingOrder) || !initialData}
        editingOrder={editingOrder}
        onCancelEdit={onCancelEdit}
      />
    );

  return (
    <div className="space-y-3">
      <Button
        type="button"
        disabled={pending || Boolean(editingOrder)}
        onClick={loadData}
      >
        <Plus className="size-4" />
        {pending || editingOrder ? "Cargando opciones…" : "Nuevo pedido"}
      </Button>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudieron cargar las opciones</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
