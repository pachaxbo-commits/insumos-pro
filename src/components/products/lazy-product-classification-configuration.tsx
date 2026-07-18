"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getProductClassificationEditorDataAction } from "@/lib/products/classification-actions";
import type {
  ProductWithRelations,
  QbClassificationEditorData,
} from "@/types/products";

const ProductClassificationConfiguration = dynamic(() =>
  import("@/components/products/product-classification-configuration").then(
    (module) => module.ProductClassificationConfiguration,
  ),
);

export function LazyProductClassificationConfiguration({
  sourceProduct,
  canManage,
}: {
  sourceProduct: ProductWithRelations;
  canManage: boolean;
}) {
  const [data, setData] = useState<QbClassificationEditorData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void getProductClassificationEditorDataAction(sourceProduct.id).then(
      (result) => {
        if (!current) return;
        if (result.success) setData(result.data);
        else setError(result.message);
      },
    );
    return () => {
      current = false;
    };
  }, [sourceProduct.id]);

  if (error) {
    return (
      <Alert variant="destructive" className="mt-5">
        <AlertTitle>No se pudo cargar la clasificación</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!data) {
    return (
      <section
        className="mt-5 space-y-3 border-t pt-5"
        aria-label="Cargando clasificación"
      >
        <div className="h-6 w-64 animate-pulse rounded bg-muted" />
        <div className="h-24 animate-pulse rounded-2xl bg-muted" />
      </section>
    );
  }

  return (
    <ProductClassificationConfiguration
      sourceProduct={sourceProduct}
      products={data.products}
      settings={data.settings ?? undefined}
      presentations={data.presentations}
      outputs={data.outputs}
      units={data.units}
      canManage={canManage}
    />
  );
}
