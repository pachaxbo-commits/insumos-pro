export type CoveragePresentation = {
  status: "complete" | "short" | "over" | "unverified";
  label: string;
  missingBaseQuantity: number;
  excessBaseQuantity: number;
};

export function coveragePresentation(input: {
  status: CoveragePresentation["status"];
  missingBaseQuantity?: number;
  excessBaseQuantity?: number;
  baseUnitSymbol: string;
}): CoveragePresentation {
  if (input.status === "complete") {
    return { status: "complete", label: "COMPLETO", missingBaseQuantity: 0, excessBaseQuantity: 0 };
  }
  if (input.status === "short") {
    const missingBaseQuantity = input.missingBaseQuantity ?? 0;
    const missing = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 3 }).format(missingBaseQuantity);
    return { status: "short", label: `FALTA ${missing} ${input.baseUnitSymbol}`, missingBaseQuantity, excessBaseQuantity: 0 };
  }
  if (input.status === "over") {
    const excessBaseQuantity = input.excessBaseQuantity ?? 0;
    const excess = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 3 }).format(excessBaseQuantity);
    return { status: "over", label: `REVISAR · excede ${excess} ${input.baseUnitSymbol}`, missingBaseQuantity: 0, excessBaseQuantity };
  }
  return { status: "unverified", label: "REVISAR · conversión no verificable", missingBaseQuantity: 0, excessBaseQuantity: 0 };
}
