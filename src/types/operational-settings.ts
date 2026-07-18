export type QbOperationalSettings = {
  strictStockControl: boolean;
  strictStockEnabledAt: string | null;
  updatedAt: string | null;
  negativeProducts: number;
  productsWithoutBaseUnit: number;
  productsWithoutOpeningStock: number;
  pendingRegularization: number;
};
