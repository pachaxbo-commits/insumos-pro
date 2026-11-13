export type CoverageStatus = "complete" | "short" | "over" | "unverified";
export type DeliveryState = "confirmed" | "pending" | "mixed";

export type CoveragePresentation = {
  quantityStatus: CoverageStatus;
  quantityLabel: string;
  verificationLabel: string;
  verificationComplete: boolean;
  deliveryLabel: string | null;
  deliveryConfirmed: boolean;
};

export function coveragePresentation(input: {
  status: CoverageStatus;
  missingBaseQuantity?: number;
  excessBaseQuantity?: number;
  baseUnitSymbol: string;
  phase: "preparacion" | "entrega" | "resumen";
  operationalVerified: boolean;
  deliveryState: DeliveryState;
}): CoveragePresentation {
  let quantityLabel: string;
  if (input.status === "complete") quantityLabel = "CANTIDAD COMPLETA";
  else if (input.status === "short") {
    const missing = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 3 }).format(input.missingBaseQuantity ?? 0);
    quantityLabel = `FALTA ${missing} ${input.baseUnitSymbol}`;
  } else if (input.status === "over") {
    const excess = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 3 }).format(input.excessBaseQuantity ?? 0);
    quantityLabel = `REVISAR · excede ${excess} ${input.baseUnitSymbol}`;
  } else quantityLabel = "Revisar equivalencia histórica";

  const deliveryConfirmed = input.phase !== "preparacion" && input.deliveryState === "confirmed";
  const deliveryLabel = input.phase === "preparacion" ? null
    : input.deliveryState === "confirmed" ? "ENTREGA CONFIRMADA"
      : input.deliveryState === "mixed" ? "CONFIRMACIÓN MIXTA · ver cada pedido"
        : "ENTREGA PENDIENTE";
  return {
    quantityStatus: input.status,
    quantityLabel,
    verificationLabel: `${input.phase === "preparacion" ? "Preparación" : "Verificación de entrega"}: ${input.operationalVerified ? "marcada" : "pendiente"}`,
    verificationComplete: input.operationalVerified,
    deliveryLabel,
    deliveryConfirmed,
  };
}
