export type OperationalImportType = "prices" | "conversions" | "initial_stock";

export type OperationalPreviewRow = {
  rowNumber: number;
  productId: string;
  productName: string;
  currentValue: string;
  newValue: string;
  status: "valid" | "invalid" | "unchanged" | "unknown" | "duplicate" | "ambiguous";
  message: string;
  normalized?: Record<string, string | number | null>;
};

export type OperationalPreview = {
  success: boolean;
  message?: string;
  importType: OperationalImportType;
  fileHash: string;
  total: number;
  valid: number;
  invalid: number;
  unchanged: number;
  unknown: number;
  duplicates: number;
  ambiguous: number;
  rows: OperationalPreviewRow[];
  canApply: boolean;
};

export type OperationalActivationSummary = {
  published_products: number;
  bs_backed: number;
  bs_available: number;
  missing_prices: number;
  receiving_configured: number;
  pending_conversions: number;
  negative_stock: number;
  without_movements: number;
  last_imports: Partial<Record<OperationalImportType, string>>;
};
