const DEFAULT_ACTUAL_WEIGHT_CATEGORIES = new Set([
  "frutas frescas",
  "verduras",
]);

function normalizeCategoryName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("es");
}

export function usesActualWeightByDefault(categoryName: string) {
  return DEFAULT_ACTUAL_WEIGHT_CATEGORIES.has(
    normalizeCategoryName(categoryName).replace(/^\d+\s+/, ""),
  );
}
