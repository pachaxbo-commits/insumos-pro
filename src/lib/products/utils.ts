import type { ProductWithRelations } from "@/types/products";

export function calculateMarginPercentage(purchasePrice: number, salePrice: number) {
  if (salePrice <= 0) return 0;

  return ((salePrice - purchasePrice) / salePrice) * 100;
}

export function getStockStatus(product: {
  stock_current: number;
  stock_min: number;
}): ProductWithRelations["stock_status"] {
  if (product.stock_current <= 0) return "sin_stock";
  if (product.stock_current <= product.stock_min) return "stock_bajo";
  return "ok";
}
