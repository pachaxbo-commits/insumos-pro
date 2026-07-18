"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit/log";
import { QB_ALLOWED_UNIT_CONTEXTS, QB_CLASSIFICATION_MODES } from "@/types/products";

type ActionState = {
  success: boolean;
  message?: string;
};

const booleanField = z.union([
  z.boolean(),
  z.enum(["true", "false"]).transform((value) => value === "true"),
]);

const optionalText = z.preprocess(
  (value) => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  },
  z.string().nullable(),
);

const optionalUuid = z.preprocess(
  (value) => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  },
  z.uuid().nullable(),
);

const optionalPositiveNumber = z.preprocess(
  (value) => {
    if (typeof value !== "string" && typeof value !== "number") return null;
    if (typeof value === "string" && !value.trim()) return null;
    return value;
  },
  z.coerce.number().finite().positive().nullable(),
);

const optionalPercentage = z.preprocess(
  (value) => {
    if (typeof value !== "string" && typeof value !== "number") return null;
    if (typeof value === "string" && !value.trim()) return null;
    return value;
  },
  z.coerce.number().finite().min(0).max(100).nullable(),
);

const qbCodeSchema = z
  .string()
  .trim()
  .min(1, "El codigo es obligatorio.")
  .regex(/^[a-z0-9_]+$/, "Usa solo minusculas, numeros y guion bajo.");

const productSchema = z.object({
    name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres."),
    sku: optionalText,
    category_id: z.uuid("Selecciona una categoria."),
    unit_id: z.uuid("Selecciona una unidad."),
    stock_min: z.coerce
      .number()
      .finite("El stock minimo debe ser valido.")
      .min(0, "El stock minimo no puede ser negativo."),
    supplier_name: optionalText,
    image_url: optionalText,
    requires_classification: booleanField,
    is_sellable: booleanField,
    catalog_description: z.preprocess(
      (value) => {
        if (typeof value !== "string") return null;
        const trimmed = value.trim();
        return trimmed.length ? trimmed : null;
      },
      z.string().max(1000, "La descripcion publica no puede superar 1000 caracteres.").nullable(),
    ),
    catalog_sort_order: z.coerce
      .number()
      .int("El orden publico debe ser un entero.")
      .min(0, "El orden publico no puede ser negativo."),
    catalog_min_quantity: z.coerce
      .number()
      .finite("La cantidad minima debe ser valida.")
      .positive("La cantidad minima debe ser mayor a cero."),
    catalog_quantity_step: z.coerce
      .number()
      .finite("El incremento debe ser valido.")
      .positive("El incremento debe ser mayor a cero."),
    is_active: booleanField,
  });

const PRODUCT_IMAGE_BUCKET = "product-images";
const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;

function detectProductImage(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", extension: "jpg" };
  }
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    .every((value, index) => bytes[index] === value)) {
    return { mime: "image/png", extension: "png" };
  }
  if (
    bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return { mime: "image/webp", extension: "webp" };
  }
  return null;
}

async function uploadProductImage(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  productId: string,
  value: FormDataEntryValue | null,
) {
  if (!(value instanceof File) || value.size === 0) return { path: null, publicUrl: null };
  if (value.size > MAX_PRODUCT_IMAGE_BYTES) throw new Error("La imagen no puede superar 5 MB.");

  const bytes = new Uint8Array(await value.arrayBuffer());
  const detected = detectProductImage(bytes);
  if (!detected || value.type !== detected.mime) {
    throw new Error("Selecciona una imagen JPEG, PNG o WebP válida.");
  }

  const path = `${productId}/${crypto.randomUUID()}.${detected.extension}`;
  const { error } = await supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(path, bytes, { contentType: detected.mime, cacheControl: "0", upsert: true });
  if (error) throw new Error("No se pudo subir la fotografía del producto.");

  return {
    path,
    publicUrl: supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl,
  };
}

function productImagePath(publicUrl: string | null | undefined) {
  if (!publicUrl) return null;
  const marker = `/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/`;
  const markerIndex = publicUrl.indexOf(marker);
  return markerIndex >= 0 ? decodeURIComponent(publicUrl.slice(markerIndex + marker.length)) : null;
}

const catalogSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres."),
  description: optionalText,
  catalog_slug: optionalText,
  catalog_sort_order: z.coerce
    .number()
    .int("El orden publico debe ser un entero.")
    .min(0, "El orden publico no puede ser negativo."),
  is_active: booleanField,
});

const unitSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres."),
  abbreviation: z.string().trim().min(1, "La abreviatura es obligatoria.").max(12),
  is_active: booleanField,
});

const qbUnitDimensionSchema = z.object({
  code: qbCodeSchema,
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres."),
  base_unit_code: qbCodeSchema,
  is_active: booleanField,
  sort_order: z.coerce
    .number()
    .int("El orden debe ser un entero.")
    .min(0, "El orden no puede ser negativo."),
});

const qbUnitSchema = z.object({
  dimension_id: z.uuid("Selecciona una dimension."),
  code: qbCodeSchema,
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres."),
  symbol: z.string().trim().min(1, "El simbolo es obligatorio.").max(24),
  conversion_factor_to_base: z.coerce
    .number()
    .finite("El factor debe ser valido.")
    .positive("El factor debe ser mayor a cero."),
  is_base: booleanField,
  is_active: booleanField,
  sort_order: z.coerce
    .number()
    .int("El orden debe ser un entero.")
    .min(0, "El orden no puede ser negativo."),
});

const qbProductUnitSettingsSchema = z
  .object({
    product_id: z.uuid("Selecciona un producto."),
    base_inventory_unit_id: z.uuid("Selecciona la unidad base de inventario."),
    base_price_unit_id: z.uuid("Selecciona la unidad base de precio."),
    is_visible_in_qb_catalog: booleanField,
    is_classifiable: booleanField,
    classification_mode: z.enum(QB_CLASSIFICATION_MODES),
    is_qb_active: booleanField,
    internal_notes: optionalText,
    notes: optionalText,
  })
  .superRefine((settings, context) => {
    if (settings.is_classifiable || settings.classification_mode === "none") return;

    context.addIssue({
      code: "custom",
      path: ["classification_mode"],
      message: "Un producto no clasificable debe usar modo none.",
    });
  });

const qbProductBasePriceSchema = z.object({
  product_id: z.uuid("Producto invalido."),
  expected_price: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value : null),
    z.coerce.number().finite().nonnegative().nullable(),
  ),
  new_price: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value : null),
    z.coerce.number().finite().positive("El precio debe ser mayor a cero.").nullable(),
  ),
  remove_price: booleanField,
  confirm_replacement: z.preprocess((value) => value === "true" || value === "on", z.boolean()),
});

const qbProductPresentationSchema = z
  .object({
    product_id: z.uuid("Selecciona un producto."),
    name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres."),
    symbol: z.string().trim().min(1, "El simbolo es obligatorio.").max(24),
    contained_quantity: z.coerce
      .number()
      .finite("La cantidad contenida debe ser valida.")
      .positive("La cantidad contenida debe ser mayor a cero."),
    contained_unit_id: z.uuid("Selecciona la unidad contenida."),
    base_quantity: z.coerce
      .number()
      .finite("La equivalencia base debe ser valida.")
      .positive("La equivalencia base debe ser mayor a cero."),
    base_unit_id: z.uuid("Selecciona la unidad base."),
    conversion_factor_to_base: z.coerce
      .number()
      .finite("El factor debe ser valido.")
      .positive("El factor debe ser mayor a cero."),
    allow_purchase: booleanField,
    allow_order: booleanField,
    allow_sale: booleanField,
    allow_inventory: booleanField,
    is_active: booleanField,
    sort_order: z.coerce
      .number()
      .int("El orden debe ser un entero.")
      .min(0, "El orden no puede ser negativo."),
    notes: optionalText,
  })
  .superRefine((presentation, context) => {
    if (
      presentation.allow_purchase ||
      presentation.allow_order ||
      presentation.allow_sale ||
      presentation.allow_inventory
    ) {
      return;
    }

    context.addIssue({
      code: "custom",
      path: ["allow_purchase"],
      message: "Selecciona al menos un contexto para esta presentacion.",
    });
  });

const qbProductAllowedUnitSchema = z
  .object({
    product_id: z.uuid("Selecciona un producto."),
    usage_context: z.enum(QB_ALLOWED_UNIT_CONTEXTS),
    unit_id: optionalUuid,
    presentation_id: optionalUuid,
    is_default: booleanField,
    quantity_step: optionalPositiveNumber,
    min_quantity: optionalPositiveNumber,
    is_active: booleanField,
    sort_order: z.coerce
      .number()
      .int("El orden debe ser un entero.")
      .min(0, "El orden no puede ser negativo."),
    notes: optionalText,
  })
  .superRefine((allowedUnit, context) => {
    const selectedTargets = Number(Boolean(allowedUnit.unit_id)) + Number(Boolean(allowedUnit.presentation_id));

    if (selectedTargets === 1) return;

    context.addIssue({
      code: "custom",
      path: ["unit_id"],
      message: "Selecciona una unidad universal o una presentacion, pero no ambas.",
    });
  });

const qbProductClassificationOutputSchema = z
  .object({
    source_product_id: z.uuid("Selecciona el producto clasificable."),
    output_type: z.enum(["product", "loss"]),
    output_product_id: optionalUuid,
    label: z.string().trim().min(2, "La etiqueta debe tener al menos 2 caracteres."),
    expected_percentage: optionalPercentage,
    is_active: booleanField,
    sort_order: z.coerce
      .number()
      .int("El orden debe ser un entero.")
      .min(0, "El orden no puede ser negativo."),
    notes: optionalText,
  })
  .superRefine((output, context) => {
    if (output.output_type === "product" && !output.output_product_id) {
      context.addIssue({
        code: "custom",
        path: ["output_product_id"],
        message: "Selecciona el producto resultado.",
      });
    }

    if (output.output_type === "loss" && output.output_product_id) {
      context.addIssue({
        code: "custom",
        path: ["output_product_id"],
        message: "La merma no debe apuntar a un producto resultado.",
      });
    }

    if (output.output_product_id === output.source_product_id) {
      context.addIssue({
        code: "custom",
        path: ["output_product_id"],
        message: "El producto resultado no puede ser el mismo producto origen.",
      });
    }
  });

function normalizeCatalogSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getCategoryPayload(category: z.infer<typeof catalogSchema>) {
  const catalogSlug = normalizeCatalogSlug(category.catalog_slug ?? category.name);

  return {
    success: true as const,
    data: {
      ...category,
      catalog_slug: catalogSlug || null,
    },
  };
}

async function assertCanMutateProducts() {
  const auth = await requireAuthenticatedUser();

  if (auth.user.role !== "administrador") {
    return {
      allowed: false as const,
      message: "Solo un administrador puede configurar productos.",
    };
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return {
      allowed: false as const,
      message: "Supabase no esta configurado.",
    };
  }

  return { allowed: true as const, supabase, userId: auth.user.id };
}

async function assertCanManageBasePrices() {
  const auth = await requireAuthenticatedUser();

  if (auth.user.role !== "administrador") {
    return {
      allowed: false as const,
      message: "Solo un administrador puede cambiar precios base.",
    };
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return { allowed: false as const, message: "Supabase no esta configurado." };
  }

  return { allowed: true as const, supabase };
}

function parseId(formData: FormData) {
  const id = formData.get("id");
  return typeof id === "string" ? id : "";
}

function revalidateProducts() {
  revalidatePath("/productos");
  revalidatePath("/catalogo");
}

function revalidateQbParametrization() {
  revalidatePath("/productos");
  revalidatePath("/parametrizacion");
}

export async function createProductAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertCanMutateProducts();

  if (!access.allowed) return { success: false, message: access.message };

  const parsed = productSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Revisa los datos del producto.",
    };
  }

  const productId = crypto.randomUUID();
  let uploaded: Awaited<ReturnType<typeof uploadProductImage>> = { path: null, publicUrl: null };
  try {
    uploaded = await uploadProductImage(access.supabase, productId, formData.get("image_file"));
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "No se pudo validar la fotografía." };
  }

  const { data, error } = await access.supabase
    .from("products")
    .insert({ ...parsed.data, id: productId, image_url: uploaded.publicUrl, stock_current: 0, purchase_price: 0, sale_price: 0 })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    if (uploaded.path) await access.supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([uploaded.path]);
    return { success: false, message: error.message };
  }

  await writeAuditLog({
    supabase: access.supabase,
    userId: access.userId,
    action: "create_product",
    entityType: "product",
    entityId: data?.id,
    metadata: {
      name: parsed.data.name,
      sku: parsed.data.sku,
      is_sellable: parsed.data.is_sellable,
    },
  });

  revalidateProducts();
  return { success: true, message: "Producto creado correctamente." };
}

export async function updateProductAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertCanMutateProducts();

  if (!access.allowed) return { success: false, message: access.message };

  const id = parseId(formData);
  const parsed = productSchema.safeParse(Object.fromEntries(formData));

  if (!z.uuid().safeParse(id).success) {
    return { success: false, message: "Producto invalido." };
  }

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Revisa los datos del producto.",
    };
  }

  const existingProductResult = await access.supabase
    .from("products")
    .select("image_url")
    .eq("id", id)
    .maybeSingle<{ image_url: string | null }>();

  if (existingProductResult.error || !existingProductResult.data) {
    return { success: false, message: "No se pudo cargar el producto que deseas editar." };
  }

  const existingImageUrl = existingProductResult.data.image_url;
  let uploaded: Awaited<ReturnType<typeof uploadProductImage>> = { path: null, publicUrl: null };
  try {
    uploaded = await uploadProductImage(access.supabase, id, formData.get("image_file"));
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "No se pudo validar la fotografía." };
  }

  const { error } = await access.supabase
    .from("products")
    .update({ ...parsed.data, image_url: uploaded.publicUrl ?? existingImageUrl })
    .eq("id", id);

  if (error) {
    if (uploaded.path) await access.supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([uploaded.path]);
    return { success: false, message: error.message };
  }

  const previousPath = productImagePath(existingImageUrl);
  if (uploaded.path && previousPath && previousPath !== uploaded.path) {
    await access.supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([previousPath]);
  }

  await writeAuditLog({
    supabase: access.supabase,
    userId: access.userId,
    action: "update_product",
    entityType: "product",
    entityId: id,
    metadata: {
      name: parsed.data.name,
      sku: parsed.data.sku,
      is_sellable: parsed.data.is_sellable,
    },
  });

  revalidateProducts();
  return { success: true, message: "Producto actualizado correctamente." };
}

export async function deactivateProductAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertCanMutateProducts();

  if (!access.allowed) return { success: false, message: access.message };

  const id = parseId(formData);

  if (!z.uuid().safeParse(id).success) {
    return { success: false, message: "Producto invalido." };
  }

  const { error } = await access.supabase.from("products").update({ is_active: false }).eq("id", id);

  if (error) return { success: false, message: error.message };

  await writeAuditLog({
    supabase: access.supabase,
    userId: access.userId,
    action: "deactivate_product",
    entityType: "product",
    entityId: id,
  });

  revalidateProducts();
  return { success: true, message: "Producto desactivado correctamente." };
}

export async function createCategoryAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertCanMutateProducts();

  if (!access.allowed) return { success: false, message: access.message };

  const parsed = catalogSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Revisa los datos de la categoria.",
    };
  }

  const payload = getCategoryPayload(parsed.data);

  const { error } = await access.supabase.from("product_categories").insert(payload.data);

  if (error) return { success: false, message: error.message };

  revalidateProducts();
  return { success: true, message: "Categoria creada correctamente." };
}

export async function updateCategoryAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertCanMutateProducts();

  if (!access.allowed) return { success: false, message: access.message };

  const id = parseId(formData);
  const parsed = catalogSchema.safeParse(Object.fromEntries(formData));

  if (!z.uuid().safeParse(id).success) {
    return { success: false, message: "Categoria invalida." };
  }

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Revisa los datos de la categoria.",
    };
  }

  const payload = getCategoryPayload(parsed.data);

  const { error } = await access.supabase
    .from("product_categories")
    .update(payload.data)
    .eq("id", id);

  if (error) return { success: false, message: error.message };

  revalidateProducts();
  return { success: true, message: "Categoria actualizada correctamente." };
}

export async function createUnitAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertCanMutateProducts();

  if (!access.allowed) return { success: false, message: access.message };

  const parsed = unitSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Revisa los datos de la unidad.",
    };
  }

  const { error } = await access.supabase.from("units_of_measure").insert(parsed.data);

  if (error) return { success: false, message: error.message };

  revalidateProducts();
  return { success: true, message: "Unidad creada correctamente." };
}

export async function updateUnitAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertCanMutateProducts();

  if (!access.allowed) return { success: false, message: access.message };

  const id = parseId(formData);
  const parsed = unitSchema.safeParse(Object.fromEntries(formData));

  if (!z.uuid().safeParse(id).success) {
    return { success: false, message: "Unidad invalida." };
  }

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Revisa los datos de la unidad.",
    };
  }

  const { error } = await access.supabase
    .from("units_of_measure")
    .update(parsed.data)
    .eq("id", id);

  if (error) return { success: false, message: error.message };

  revalidateProducts();
  return { success: true, message: "Unidad actualizada correctamente." };
}

export async function createQbUnitDimensionAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertCanMutateProducts();

  if (!access.allowed) return { success: false, message: access.message };

  const parsed = qbUnitDimensionSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Revisa los datos de la dimension.",
    };
  }

  const { error } = await access.supabase.from("qb_unit_dimensions").insert({
    ...parsed.data,
    created_by: access.userId,
    updated_by: access.userId,
  });

  if (error) return { success: false, message: error.message };

  revalidateQbParametrization();
  return { success: true, message: "Dimension QB creada correctamente." };
}

export async function updateQbUnitDimensionAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertCanMutateProducts();

  if (!access.allowed) return { success: false, message: access.message };

  const id = parseId(formData);
  const parsed = qbUnitDimensionSchema.safeParse(Object.fromEntries(formData));

  if (!z.uuid().safeParse(id).success) {
    return { success: false, message: "Dimension QB invalida." };
  }

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Revisa los datos de la dimension.",
    };
  }

  const { error } = await access.supabase
    .from("qb_unit_dimensions")
    .update({ ...parsed.data, updated_by: access.userId })
    .eq("id", id);

  if (error) return { success: false, message: error.message };

  revalidateQbParametrization();
  return { success: true, message: "Dimension QB actualizada correctamente." };
}

export async function createQbUnitAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertCanMutateProducts();

  if (!access.allowed) return { success: false, message: access.message };

  const parsed = qbUnitSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Revisa los datos de la unidad QB.",
    };
  }

  const { error } = await access.supabase.from("qb_units").insert({
    ...parsed.data,
    created_by: access.userId,
    updated_by: access.userId,
  });

  if (error) return { success: false, message: error.message };

  revalidateQbParametrization();
  return { success: true, message: "Unidad QB creada correctamente." };
}

export async function updateQbUnitAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertCanMutateProducts();

  if (!access.allowed) return { success: false, message: access.message };

  const id = parseId(formData);
  const parsed = qbUnitSchema.safeParse(Object.fromEntries(formData));

  if (!z.uuid().safeParse(id).success) {
    return { success: false, message: "Unidad QB invalida." };
  }

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Revisa los datos de la unidad QB.",
    };
  }

  const { error } = await access.supabase
    .from("qb_units")
    .update({ ...parsed.data, updated_by: access.userId })
    .eq("id", id);

  if (error) return { success: false, message: error.message };

  revalidateQbParametrization();
  return { success: true, message: "Unidad QB actualizada correctamente." };
}

export async function upsertQbProductUnitSettingsAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertCanMutateProducts();

  if (!access.allowed) return { success: false, message: access.message };

  const parsed = qbProductUnitSettingsSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      success: false,
      message:
        parsed.error.issues[0]?.message ?? "Revisa la unidad base parametrica del producto.",
    };
  }

  const { data: existingRow, error: lookupError } = await access.supabase
    .from("qb_product_unit_settings")
    .select("product_id, base_sale_price")
    .eq("product_id", parsed.data.product_id)
    .maybeSingle<{ product_id: string; base_sale_price: number | null }>();

  if (lookupError) return { success: false, message: lookupError.message };

  const payload = {
    product_id: parsed.data.product_id,
    base_unit_id: parsed.data.base_inventory_unit_id,
    inventory_unit_id: parsed.data.base_inventory_unit_id,
    base_inventory_unit_id: parsed.data.base_inventory_unit_id,
    base_price_unit_id: parsed.data.base_price_unit_id,
    base_sale_price: existingRow?.base_sale_price ?? null,
    is_visible_in_qb_catalog: parsed.data.is_visible_in_qb_catalog,
    is_classifiable: parsed.data.is_classifiable,
    classification_mode: parsed.data.is_classifiable ? parsed.data.classification_mode : "none",
    is_qb_active: parsed.data.is_qb_active,
    internal_notes: parsed.data.internal_notes,
    notes: parsed.data.notes,
    updated_by: access.userId,
  };

  const { error } = existingRow
    ? await access.supabase
        .from("qb_product_unit_settings")
        .update(payload)
        .eq("product_id", parsed.data.product_id)
    : await access.supabase.from("qb_product_unit_settings").insert({
        ...payload,
        created_by: access.userId,
      });

  if (error) return { success: false, message: error.message };

  revalidateQbParametrization();
  return { success: true, message: "Producto QB guardado correctamente." };
}

export async function updateQbProductBasePriceAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertCanManageBasePrices();
  if (!access.allowed) return { success: false, message: access.message };

  const parsed = qbProductBasePriceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Revisa el precio base.",
    };
  }

  const input = parsed.data;
  if (!input.remove_price && input.new_price === null) {
    return { success: false, message: "Ingresa un precio positivo." };
  }
  if (
    input.new_price !== null
    && Math.abs(input.new_price * 100 - Math.round(input.new_price * 100)) > 0.00000001
  ) {
    return { success: false, message: "El precio admite como maximo dos decimales." };
  }
  if (!input.remove_price && input.expected_price !== null && !input.confirm_replacement) {
    return { success: false, message: "Confirma el reemplazo del precio actual." };
  }

  const { data, error } = await access.supabase.rpc("update_qb_product_base_price", {
    p_product_id: input.product_id,
    p_new_price: input.remove_price ? null : input.new_price,
    p_expected_price: input.expected_price,
    p_remove_price: input.remove_price,
  });

  if (error) {
    const messages: Record<string, string> = {
      QB_PRICE_CONCURRENT_CHANGE: "El precio cambio mientras editabas. Actualiza la pagina y revisalo nuevamente.",
      QB_PRICE_INVALID: "El precio debe ser positivo y tener como maximo dos decimales.",
      QB_PRICE_PRODUCT_INACTIVE: "No se puede actualizar el precio de un producto inactivo.",
      QB_PRICE_UNIT_INVALID: "La unidad de precio no es valida para este producto.",
      QB_PRICE_ADMIN_REQUIRED: "Solo un administrador puede cambiar precios base.",
    };
    const code = Object.keys(messages).find((candidate) => error.message.includes(candidate));
    return { success: false, message: code ? messages[code] : "No se pudo actualizar el precio base." };
  }

  const result = data as { status?: string } | null;
  revalidateProducts();
  revalidatePath("/pedidos");
  return {
    success: true,
    message: result?.status === "removed" ? "Precio retirado correctamente." : "Precio actualizado correctamente.",
  };
}

export async function createQbProductPresentationAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertCanMutateProducts();

  if (!access.allowed) return { success: false, message: access.message };

  const parsed = qbProductPresentationSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Revisa los datos de la presentacion.",
    };
  }

  const { error } = await access.supabase.from("qb_product_presentations").insert({
    ...parsed.data,
    created_by: access.userId,
    updated_by: access.userId,
  });

  if (error) return { success: false, message: error.message };

  revalidateQbParametrization();
  return { success: true, message: "Presentacion QB creada correctamente." };
}

export async function updateQbProductPresentationAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertCanMutateProducts();

  if (!access.allowed) return { success: false, message: access.message };

  const id = parseId(formData);
  const parsed = qbProductPresentationSchema.safeParse(Object.fromEntries(formData));

  if (!z.uuid().safeParse(id).success) {
    return { success: false, message: "Presentacion QB invalida." };
  }

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Revisa los datos de la presentacion.",
    };
  }

  const { error } = await access.supabase
    .from("qb_product_presentations")
    .update({ ...parsed.data, updated_by: access.userId })
    .eq("id", id);

  if (error) return { success: false, message: error.message };

  revalidateQbParametrization();
  return { success: true, message: "Presentacion QB actualizada correctamente." };
}

export async function createQbProductAllowedUnitAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertCanMutateProducts();

  if (!access.allowed) return { success: false, message: access.message };

  const parsed = qbProductAllowedUnitSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Revisa la unidad permitida del producto.",
    };
  }

  const { error } = await access.supabase.from("qb_product_allowed_units").insert({
    ...parsed.data,
    created_by: access.userId,
    updated_by: access.userId,
  });

  if (error) return { success: false, message: error.message };

  revalidateQbParametrization();
  return { success: true, message: "Unidad permitida QB creada correctamente." };
}

export async function updateQbProductAllowedUnitAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertCanMutateProducts();

  if (!access.allowed) return { success: false, message: access.message };

  const id = parseId(formData);
  const parsed = qbProductAllowedUnitSchema.safeParse(Object.fromEntries(formData));

  if (!z.uuid().safeParse(id).success) {
    return { success: false, message: "Unidad permitida QB invalida." };
  }

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Revisa la unidad permitida del producto.",
    };
  }

  const { error } = await access.supabase
    .from("qb_product_allowed_units")
    .update({ ...parsed.data, updated_by: access.userId })
    .eq("id", id);

  if (error) return { success: false, message: error.message };

  revalidateQbParametrization();
  return { success: true, message: "Unidad permitida QB actualizada correctamente." };
}

export async function createQbProductClassificationOutputAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertCanMutateProducts();

  if (!access.allowed) return { success: false, message: access.message };

  const parsed = qbProductClassificationOutputSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      success: false,
      message:
        parsed.error.issues[0]?.message ?? "Revisa la salida de clasificacion del producto.",
    };
  }

  const { error } = await access.supabase.from("qb_product_classification_outputs").insert({
    ...parsed.data,
    output_product_id:
      parsed.data.output_type === "loss" ? null : parsed.data.output_product_id,
    created_by: access.userId,
    updated_by: access.userId,
  });

  if (error) return { success: false, message: error.message };

  revalidateQbParametrization();
  return { success: true, message: "Salida de clasificacion QB creada correctamente." };
}

export async function updateQbProductClassificationOutputAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertCanMutateProducts();

  if (!access.allowed) return { success: false, message: access.message };

  const id = parseId(formData);
  const parsed = qbProductClassificationOutputSchema.safeParse(Object.fromEntries(formData));

  if (!z.uuid().safeParse(id).success) {
    return { success: false, message: "Salida de clasificacion QB invalida." };
  }

  if (!parsed.success) {
    return {
      success: false,
      message:
        parsed.error.issues[0]?.message ?? "Revisa la salida de clasificacion del producto.",
    };
  }

  const { error } = await access.supabase
    .from("qb_product_classification_outputs")
    .update({
      ...parsed.data,
      output_product_id:
        parsed.data.output_type === "loss" ? null : parsed.data.output_product_id,
      updated_by: access.userId,
    })
    .eq("id", id);

  if (error) return { success: false, message: error.message };

  revalidateQbParametrization();
  return { success: true, message: "Salida de clasificacion QB actualizada correctamente." };
}
