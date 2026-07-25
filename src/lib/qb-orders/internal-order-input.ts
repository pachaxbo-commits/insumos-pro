import { z } from "zod";

const normalizeOptionalText = (value: unknown) =>
  value === null || value === undefined ? "" : value;

const normalizeOptionalValue = (value: unknown) =>
  value === null || value === undefined || value === "" ? undefined : value;

const optionalText = (maximum: number) =>
  z.preprocess(
    normalizeOptionalText,
    z
      .string({ error: "Ingresa texto válido." })
      .trim()
      .max(maximum, "El texto supera la longitud permitida."),
  );

const optionalEmail = z.preprocess(
  normalizeOptionalText,
  z.union(
    [
      z.literal(""),
      z
        .string({ error: "Ingresa un correo válido." })
        .trim()
        .email("Ingresa un correo válido.")
        .max(254, "El correo supera la longitud permitida."),
    ],
    { error: "Ingresa un correo válido." },
  ),
);

const optionalUuid = (message: string) =>
  z.preprocess(
    normalizeOptionalValue,
    z.string({ error: message }).uuid(message).optional(),
  );

const nullableUuid = (message: string) =>
  z.preprocess(
    (value) =>
      value === null || value === undefined || value === "" ? null : value,
    z.string({ error: message }).uuid(message).nullable(),
  );

const optionalPositiveNumber = (message: string, maximum: number) =>
  z.preprocess(
    normalizeOptionalValue,
    z
      .number({ error: message })
      .finite(message)
      .positive(message)
      .max(maximum, message)
      .optional(),
  );

export const internalOrderItemSchema = z
  .object(
    {
      productId: z
        .string({ error: "Selecciona un producto." })
        .uuid("Selecciona un producto."),
      inputMode: z
        .literal("quantity", {
          error: "El pedido debe registrar una cantidad.",
        })
        .optional()
        .default("quantity"),
      allowedUnitId: optionalUuid("Selecciona una unidad."),
      quantity: optionalPositiveNumber("Ingresa una cantidad válida.", 10000),
      requestedAmountBs: optionalPositiveNumber(
        "Ingresa un importe válido.",
        1000000,
      ),
      notes: optionalText(500),
    },
    { error: "Completa o elimina esta línea." },
  )
  .superRefine((item, context) => {
    if (!item.allowedUnitId) {
      context.addIssue({
        code: "custom",
        path: ["allowedUnitId"],
        message: "Selecciona una unidad.",
      });
    }
    if (item.quantity === undefined) {
      context.addIssue({
        code: "custom",
        path: ["quantity"],
        message: "Ingresa una cantidad válida.",
      });
    }
  });

function isCompletelyEmptyLine(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const line = value as Record<string, unknown>;
  return [
    line.productId,
    line.allowedUnitId,
    line.quantity,
    line.requestedAmountBs,
    line.notes,
  ].every(
    (field) =>
      field === null ||
      field === undefined ||
      (typeof field === "string" && field.trim() === ""),
  );
}

const internalOrderItemsSchema = z.preprocess(
  (value) =>
    Array.isArray(value)
      ? value.filter((line) => !isCompletelyEmptyLine(line))
      : value,
  z
    .array(internalOrderItemSchema, { error: "Agrega productos válidos." })
    .min(1, "Agrega al menos un producto.")
    .max(100, "El pedido admite hasta 100 productos."),
);

export const createInternalOrderSchema = z
  .object({
    orderMode: z.literal("registered", {
      error: "Selecciona un cliente registrado.",
    }),
    customerAccountId: nullableUuid("Selecciona un cliente."),
    customerLocationId: nullableUuid("Selecciona una ubicación."),
    businessName: optionalText(120),
    responsibleName: optionalText(120),
    phone: optionalText(25),
    email: optionalEmail,
    address: optionalText(300),
    locationLabel: optionalText(80),
    locationReference: optionalText(300),
    customerNotes: optionalText(1000),
    idempotencyKey: z
      .string({ error: "No pudimos preparar el envío. Inténtalo nuevamente." })
      .uuid("No pudimos preparar el envío. Inténtalo nuevamente."),
    items: internalOrderItemsSchema,
  })
  .superRefine((value, context) => {
    if (
      new Set(value.items.map((item) => item.productId)).size !==
      value.items.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "No repitas un producto en el mismo pedido.",
      });
    }

    if (!value.customerAccountId) {
      context.addIssue({
        code: "custom",
        path: ["customerAccountId"],
        message: "Selecciona un cliente.",
      });
    }
    if (!value.customerLocationId) {
      context.addIssue({
        code: "custom",
        path: ["customerLocationId"],
        message: "Selecciona una ubicación.",
      });
    }
  });

export type QbInternalOrderInput = z.infer<typeof createInternalOrderSchema>;

export function parseInternalOrderFormData(formData: FormData) {
  let items: unknown = null;
  const serializedItems = formData.get("items");
  if (typeof serializedItems === "string") {
    try {
      items = JSON.parse(serializedItems);
    } catch {
      items = null;
    }
  }

  return createInternalOrderSchema.safeParse({
    orderMode: formData.get("order_mode"),
    customerAccountId: formData.get("customer_account_id"),
    customerLocationId: formData.get("customer_location_id"),
    businessName: formData.get("business_name"),
    responsibleName: formData.get("responsible_name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    address: formData.get("address"),
    locationLabel: formData.get("location_label"),
    locationReference: formData.get("location_reference"),
    customerNotes: formData.get("customer_notes"),
    idempotencyKey: formData.get("idempotency_key"),
    items,
  });
}
