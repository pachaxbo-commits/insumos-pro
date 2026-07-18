"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { Plus } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getInternalOrderCreationDataAction } from "@/lib/qb-orders/creation-actions";
import type { QbInternalOrderCreationData } from "@/types/qb-orders";

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
}: {
  initialData?: QbInternalOrderCreationData;
}) {
  const [data, setData] = useState<QbInternalOrderCreationData | null>(
    initialData ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (data)
    return <InternalOrderCreator {...data} initiallyOpen={!initialData} />;

  return (
    <div className="space-y-3">
      <Button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await getInternalOrderCreationDataAction();
            if (result.success) setData(result.data);
            else setError(result.message);
          });
        }}
      >
        <Plus className="size-4" />
        {pending ? "Cargando opciones…" : "Nuevo pedido"}
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
