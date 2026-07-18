import type {
  QbProductAllowedUnit,
  QbProductPresentation,
  QbUnit,
} from "@/types/products";

export function getActiveReceptionSources({
  productId,
  allowedUnits,
  presentations,
  units,
}: {
  productId: string;
  allowedUnits: QbProductAllowedUnit[];
  presentations: QbProductPresentation[];
  units: QbUnit[];
}) {
  const presentationsById = new Map(
    presentations.map((presentation) => [presentation.id, presentation]),
  );
  const unitsById = new Map(units.map((unit) => [unit.id, unit]));

  return allowedUnits
    .filter((allowedUnit) => {
      if (
        allowedUnit.product_id !== productId ||
        allowedUnit.usage_context !== "recepcion" ||
        !allowedUnit.is_active
      ) {
        return false;
      }

      if (allowedUnit.presentation_id) {
        const presentation = presentationsById.get(allowedUnit.presentation_id);
        return Boolean(
          presentation &&
            presentation.product_id === productId &&
            presentation.is_active &&
            presentation.allow_purchase,
        );
      }

      if (allowedUnit.unit_id) {
        return Boolean(unitsById.get(allowedUnit.unit_id)?.is_active);
      }

      return false;
    })
    .sort((a, b) => a.sort_order - b.sort_order);
}
