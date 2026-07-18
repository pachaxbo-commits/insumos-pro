"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ActionState = {
  success: boolean;
  message?: string;
};

type QbUnitRow = {
  id: string;
  dimension_id: string;
  code: string;
  name: string;
  symbol: string;
  conversion_factor_to_base: number;
  is_base: boolean;
  is_active: boolean;
};

type QbProductPresentationRow = {
  id: string;
  product_id: string;
  name: string;
  symbol: string;
  contained_quantity: number;
  contained_unit_id: string;
  base_quantity: number;
  base_unit_id: string;
  conversion_factor_to_base: number;
  allow_purchase: boolean;
  is_active: boolean;
};

type QbProductAllowedUnitRow = {
  id: string;
  product_id: string;
  usage_context: string;
  unit_id: string | null;
  presentation_id: string | null;
  quantity_step: number | null;
  min_quantity: number | null;
  is_active: boolean;
};

type QbProductUnitSettingsRow = {
  product_id: string;
  base_unit_id: string;
  inventory_unit_id: string | null;
  base_inventory_unit_id: string | null;
  is_classifiable: boolean;
  classification_mode: string;
  is_qb_active: boolean;
};

const mutationRoles = new Set(["administrador", "inventario"]);
const initialState: ActionState = { success: false };

const optionalText = z.preprocess(
  (value) => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  },
  z.string().nullable(),
);

const optionalNonNegativeNumber = z.preprocess(
  (value) => {
    if (typeof value !== "string" && typeof value !== "number") return null;
    if (typeof value === "string" && !value.trim()) return null;
    return value;
  },
  z.coerce.number().finite().min(0).nullable(),
);

const booleanField = z.union([
  z.boolean(),
  z.enum(["true", "false"]).transform((value) => value === "true"),
]);

const createReceiptSchema = z.object({
  receipt_date: z.string().min(10, "Selecciona una fecha."),
  reference_code: optionalText,
  supplier_name: optionalText,
  product_id: z.uuid("Selecciona un producto."),
  allowed_unit_id: z.uuid("Selecciona una unidad o presentacion de recepcion."),
  source_quantity: z.coerce
    .number()
    .finite("La cantidad recibida debe ser valida.")
    .positive("La cantidad recibida debe ser mayor a cero."),
  unit_cost: optionalNonNegativeNumber,
  requires_classification: booleanField,
  notes: optionalText,
});

const lineIdSchema = z.object({
  line_id: z.uuid("Linea invalida."),
});

const confirmReceiptSchema = z.object({
  id: z.uuid("Ingreso invalido."),
  confirmation: z.literal("CONFIRMAR", {
    error: "Escribe CONFIRMAR para confirmar el ingreso.",
  }),
});

const annulReceiptSchema = z.object({
  id: z.uuid("Ingreso invalido."),
  reason: z.string().trim().min(4, "El motivo debe tener al menos 4 caracteres."),
});

const resultPercentageSchema = z.coerce
  .number()
  .finite("El porcentaje debe ser válido.")
  .min(0, "El porcentaje no puede ser negativo.")
  .max(100, "El porcentaje no puede superar 100%.");

async function assertCanManageQbIngresos() {
  const auth = await requireAuthenticatedUser();

  if (!auth.user.role || !mutationRoles.has(auth.user.role)) {
    return {
      allowed: false as const,
      message: "Tu rol solo permite lectura en ingresos QB.",
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

function revalidateQbIngresos() {
  revalidatePath("/ingresos");
  revalidatePath("/productos");
  revalidatePath("/inventario");
}

function isStepAligned(quantity: number, step: number | null) {
  if (!step) return true;
  const ratio = quantity / step;
  return Math.abs(ratio - Math.round(ratio)) < 0.000001;
}

function roundQuantity(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function roundMoney(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function normalizeBusinessMessage(message?: string) {
  if (!message) return "No se pudo completar la operacion.";

  const classificationMessages: Array<[string, string]> = [
    ["QB_CLASSIFICATION_AUTH_REQUIRED", "Inicia sesion nuevamente para guardar la clasificacion."],
    ["QB_CLASSIFICATION_ROLE_REQUIRED", "Tu usuario no puede registrar clasificaciones."],
    ["QB_CLASSIFICATION_LINE_NOT_FOUND", "No se encontro la linea de ingreso."],
    ["QB_CLASSIFICATION_DRAFT_REQUIRED", "Solo se puede clasificar un ingreso en borrador."],
    ["QB_CLASSIFICATION_NOT_REQUIRED", "Esta linea no requiere clasificacion."],
    ["QB_CLASSIFICATION_RESULTS_REQUIRED", "Agrega los productos resultado de la clasificacion."],
    ["QB_CLASSIFICATION_INVALID_PERCENTAGE", "Revisa los porcentajes ingresados."],
    ["QB_CLASSIFICATION_DUPLICATE_OUTPUT", "Un producto resultado esta repetido."],
    ["QB_CLASSIFICATION_OUTPUT_INVALID", "La configuracion contiene un resultado no permitido."],
    ["QB_CLASSIFICATION_PRODUCT_INACTIVE", "Uno de los productos resultado no esta activo."],
    ["QB_CLASSIFICATION_PERCENTAGE_TOTAL", "Los porcentajes deben sumar exactamente 100%."],
    ["QB_CLASSIFICATION_POSITIVE_RESULT_REQUIRED", "Al menos un resultado debe tener porcentaje positivo."],
    ["QB_CLASSIFICATION_NON_POSITIVE_QUANTITY", "Un porcentaje positivo produjo una cantidad no valida."],
    ["QB_CLASSIFICATION_CONSERVATION_FAILED", "No se pudo conservar exactamente la cantidad recibida."],
  ];

  const classificationMessage = classificationMessages.find(([code]) => message.includes(code));
  if (classificationMessage) return classificationMessage[1];

  if (message.includes("clasificacion debe sumar")) {
    return "La clasificacion debe sumar exactamente la cantidad base recibida.";
  }

  if (message.includes("ya tiene movimientos")) {
    return "Este ingreso ya fue confirmado o tiene movimientos asociados.";
  }

  if (message.includes("Solo se pueden confirmar")) {
    return "Solo se pueden confirmar ingresos en borrador.";
  }

  return message;
}

async function loadReceiptLine(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  lineId: string,
) {
  const { data, error } = await supabase
    .from("qb_merchandise_receipt_lines")
    .select(
      "id, receipt_id, product_id, base_quantity, total_cost, requires_classification, receipt:qb_merchandise_receipts(id, status)",
    )
    .eq("id", lineId)
    .maybeSingle<{
      id: string;
      receipt_id: string;
      product_id: string;
      base_quantity: number;
      total_cost: number;
      requires_classification: boolean;
      receipt: { id: string; status: string } | { id: string; status: string }[] | null;
    }>();

  if (error) return { ok: false as const, message: error.message };
  if (!data) return { ok: false as const, message: "Linea de ingreso no encontrada." };

  const receipt = Array.isArray(data.receipt) ? data.receipt[0] ?? null : data.receipt;

  if (!receipt || receipt.status !== "borrador") {
    return { ok: false as const, message: "Solo se puede clasificar un ingreso en borrador." };
  }

  if (!data.requires_classification) {
    return { ok: false as const, message: "Esta linea no requiere clasificacion." };
  }

  return { ok: true as const, data };
}

export async function createQbMerchandiseReceiptAction(
  _previousState: ActionState = initialState,
  formData: FormData,
): Promise<ActionState> {
  void _previousState;
  const access = await assertCanManageQbIngresos();

  if (!access.allowed) return { success: false, message: access.message };

  const parsed = createReceiptSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Revisa el ingreso de mercaderia.",
    };
  }

  const input = parsed.data;
  const [productResult, settingsResult, allowedUnitResult] = await Promise.all([
    access.supabase
      .from("products")
      .select("id, name, is_active, requires_classification")
      .eq("id", input.product_id)
      .maybeSingle<{ id: string; name: string; is_active: boolean; requires_classification: boolean }>(),
    access.supabase
      .from("qb_product_unit_settings")
      .select(
        "product_id, base_unit_id, inventory_unit_id, base_inventory_unit_id, is_classifiable, classification_mode, is_qb_active",
      )
      .eq("product_id", input.product_id)
      .maybeSingle<QbProductUnitSettingsRow>(),
    access.supabase
      .from("qb_product_allowed_units")
      .select(
        "id, product_id, usage_context, unit_id, presentation_id, quantity_step, min_quantity, is_active",
      )
      .eq("id", input.allowed_unit_id)
      .maybeSingle<QbProductAllowedUnitRow>(),
  ]);

  const firstError = productResult.error ?? settingsResult.error ?? allowedUnitResult.error;
  if (firstError) return { success: false, message: firstError.message };

  if (!productResult.data?.is_active) {
    return { success: false, message: "El producto recibido no existe o esta inactivo." };
  }

  const settings = settingsResult.data;
  if (!settings?.is_qb_active) {
    return { success: false, message: "Configura y activa este producto para QB antes de recibir." };
  }

  const allowedUnit = allowedUnitResult.data;
  if (
    !allowedUnit?.is_active ||
    allowedUnit.product_id !== input.product_id ||
    allowedUnit.usage_context !== "recepcion"
  ) {
    return {
      success: false,
      message: "La unidad seleccionada no esta permitida para recepcion de este producto.",
    };
  }

  if (allowedUnit.min_quantity && input.source_quantity < allowedUnit.min_quantity) {
    return {
      success: false,
      message: `La cantidad minima para esta recepcion es ${allowedUnit.min_quantity}.`,
    };
  }

  if (!isStepAligned(input.source_quantity, allowedUnit.quantity_step)) {
    return {
      success: false,
      message: `La cantidad debe respetar el incremento ${allowedUnit.quantity_step}.`,
    };
  }

  const requiresClassification = Boolean(
    productResult.data.requires_classification || settings.is_classifiable,
  );

  if (requiresClassification && (!settings.is_classifiable || settings.classification_mode !== "percentage")) {
    return {
      success: false,
      message: "Este producto requiere una configuracion de clasificacion porcentual valida.",
    };
  }

  if (requiresClassification) {
    const { count, error: outputsError } = await access.supabase
      .from("qb_product_classification_outputs")
      .select("id", { count: "exact", head: true })
      .eq("source_product_id", input.product_id)
      .eq("output_type", "product")
      .eq("is_active", true);

    if (outputsError) return { success: false, message: outputsError.message };
    if (!count) {
      return {
        success: false,
        message: "Este producto requiere clasificación, pero todavía no tiene productos resultantes configurados.",
      };
    }
  }

  const baseUnitId =
    settings.base_inventory_unit_id ?? settings.inventory_unit_id ?? settings.base_unit_id;

  const baseUnitResult = await access.supabase
    .from("qb_units")
    .select("id, dimension_id, code, name, symbol, conversion_factor_to_base, is_base, is_active")
    .eq("id", baseUnitId)
    .maybeSingle<QbUnitRow>();

  if (baseUnitResult.error) return { success: false, message: baseUnitResult.error.message };
  if (!baseUnitResult.data?.is_active) {
    return { success: false, message: "La unidad base de inventario del producto no esta activa." };
  }

  const baseUnit = baseUnitResult.data;
  const dimensionResult = await access.supabase
    .from("qb_unit_dimensions")
    .select("code")
    .eq("id", baseUnit.dimension_id)
    .maybeSingle<{ code: string }>();

  if (dimensionResult.error) return { success: false, message: dimensionResult.error.message };

  const dimensionCode = dimensionResult.data?.code ?? "desconocida";
  let sourceKind: "universal_unit" | "product_presentation";
  let sourceLabel: string;
  let sourceUnitId: string | null = null;
  let presentationId: string | null = null;
  let conversionFactorToBase: number;
  let snapshotPayload: Record<string, unknown>;

  if (allowedUnit.unit_id) {
    const unitResult = await access.supabase
      .from("qb_units")
      .select("id, dimension_id, code, name, symbol, conversion_factor_to_base, is_base, is_active")
      .eq("id", allowedUnit.unit_id)
      .maybeSingle<QbUnitRow>();

    if (unitResult.error) return { success: false, message: unitResult.error.message };
    if (!unitResult.data?.is_active) {
      return { success: false, message: "La unidad de recepcion no esta activa." };
    }

    const sourceUnit = unitResult.data;

    if (sourceUnit.dimension_id !== baseUnit.dimension_id) {
      return {
        success: false,
        message: "La unidad de recepcion y la unidad base del producto pertenecen a dimensiones distintas.",
      };
    }

    sourceKind = "universal_unit";
    sourceUnitId = sourceUnit.id;
    sourceLabel = `${sourceUnit.name} (${sourceUnit.symbol})`;
    conversionFactorToBase =
      Number(sourceUnit.conversion_factor_to_base) / Number(baseUnit.conversion_factor_to_base);
    snapshotPayload = {
      source_unit: sourceUnit,
      base_unit: baseUnit,
      allowed_unit_id: allowedUnit.id,
    };
  } else if (allowedUnit.presentation_id) {
    const presentationResult = await access.supabase
      .from("qb_product_presentations")
      .select(
        "id, product_id, name, symbol, contained_quantity, contained_unit_id, base_quantity, base_unit_id, conversion_factor_to_base, allow_purchase, is_active",
      )
      .eq("id", allowedUnit.presentation_id)
      .maybeSingle<QbProductPresentationRow>();

    if (presentationResult.error) {
      return { success: false, message: presentationResult.error.message };
    }
    if (
      !presentationResult.data?.is_active ||
      !presentationResult.data.allow_purchase ||
      presentationResult.data.product_id !== input.product_id
    ) {
      return { success: false, message: "La presentacion de recepcion no esta activa para este producto." };
    }

    const presentation = presentationResult.data;
    const presentationBaseUnitResult = await access.supabase
      .from("qb_units")
      .select("id, dimension_id, code, name, symbol, conversion_factor_to_base, is_base, is_active")
      .eq("id", presentation.base_unit_id)
      .maybeSingle<QbUnitRow>();

    if (presentationBaseUnitResult.error) {
      return { success: false, message: presentationBaseUnitResult.error.message };
    }
    if (!presentationBaseUnitResult.data?.is_active) {
      return { success: false, message: "La unidad base de la presentacion no esta activa." };
    }

    const presentationBaseUnit = presentationBaseUnitResult.data;

    if (presentationBaseUnit.dimension_id !== baseUnit.dimension_id) {
      return {
        success: false,
        message: "La presentacion y la unidad base del producto pertenecen a dimensiones distintas.",
      };
    }

    sourceKind = "product_presentation";
    presentationId = presentation.id;
    sourceLabel = `${presentation.name} (${presentation.symbol})`;
    conversionFactorToBase =
      Number(presentation.conversion_factor_to_base) *
      (Number(presentationBaseUnit.conversion_factor_to_base) /
        Number(baseUnit.conversion_factor_to_base));
    snapshotPayload = {
      presentation,
      presentation_base_unit: presentationBaseUnit,
      base_unit: baseUnit,
      allowed_unit_id: allowedUnit.id,
    };
  } else {
    return { success: false, message: "La unidad permitida no tiene unidad ni presentacion." };
  }

  const baseQuantity = roundQuantity(input.source_quantity * conversionFactorToBase);
  const totalCost = roundMoney((input.unit_cost ?? 0) * input.source_quantity);

  const { data: receipt, error: receiptError } = await access.supabase
    .from("qb_merchandise_receipts")
    .insert({
      receipt_date: input.receipt_date,
      reference_code: input.reference_code,
      supplier_name: input.supplier_name,
      notes: input.notes,
      created_by: access.userId,
      updated_by: access.userId,
    })
    .select("id")
    .single<{ id: string }>();

  if (receiptError || !receipt) {
    return { success: false, message: receiptError?.message ?? "No se pudo crear el ingreso." };
  }

  const { data: line, error: lineError } = await access.supabase
    .from("qb_merchandise_receipt_lines")
    .insert({
      receipt_id: receipt.id,
      product_id: input.product_id,
      allowed_unit_id: allowedUnit.id,
      source_kind: sourceKind,
      source_unit_id: sourceUnitId,
      product_presentation_id: presentationId,
      source_label: sourceLabel,
      source_quantity: input.source_quantity,
      base_unit_id: baseUnit.id,
      base_unit_symbol: baseUnit.symbol,
      base_quantity: baseQuantity,
      conversion_factor_to_base: conversionFactorToBase,
      unit_cost: input.unit_cost,
      total_cost: totalCost,
      requires_classification: requiresClassification,
      notes: input.notes,
      created_by: access.userId,
      updated_by: access.userId,
    })
    .select("id")
    .single<{ id: string }>();

  if (lineError || !line) {
    return { success: false, message: lineError?.message ?? "No se pudo crear la linea del ingreso." };
  }

  const { data: snapshot, error: snapshotError } = await access.supabase
    .from("qb_conversion_snapshots")
    .insert({
      source_table: "qb_merchandise_receipt_lines",
      source_id: line.id,
      product_id: input.product_id,
      dimension_code: dimensionCode,
      source_kind: sourceKind,
      source_unit_id: sourceUnitId,
      product_presentation_id: presentationId,
      source_label: sourceLabel,
      source_quantity: input.source_quantity,
      base_unit_id: baseUnit.id,
      base_unit_symbol: baseUnit.symbol,
      base_quantity: baseQuantity,
      conversion_factor_to_base: conversionFactorToBase,
      snapshot: snapshotPayload,
      created_by: access.userId,
    })
    .select("id")
    .single<{ id: string }>();

  if (snapshotError || !snapshot) {
    return { success: false, message: snapshotError?.message ?? "No se pudo guardar el snapshot." };
  }

  const { error: lineSnapshotError } = await access.supabase
    .from("qb_merchandise_receipt_lines")
    .update({ conversion_snapshot_id: snapshot.id, updated_by: access.userId })
    .eq("id", line.id);

  if (lineSnapshotError) return { success: false, message: lineSnapshotError.message };

  await writeAuditLog({
    supabase: access.supabase,
    userId: access.userId,
    action: "create_qb_merchandise_receipt",
    entityType: "qb_merchandise_receipt",
    entityId: receipt.id,
    metadata: {
      product_id: input.product_id,
      source_label: sourceLabel,
      source_quantity: input.source_quantity,
      base_quantity: baseQuantity,
      requires_classification: requiresClassification,
    },
  });

  revalidateQbIngresos();
  return { success: true, message: "Ingreso QB creado como borrador." };
}

export async function saveQbMerchandiseClassificationAction(
  _previousState: ActionState = initialState,
  formData: FormData,
): Promise<ActionState> {
  void _previousState;
  const access = await assertCanManageQbIngresos();

  if (!access.allowed) return { success: false, message: access.message };

  const parsed = lineIdSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Linea de clasificacion invalida.",
    };
  }

  const lineResult = await loadReceiptLine(access.supabase, parsed.data.line_id);
  if (!lineResult.ok) return { success: false, message: lineResult.message };

  const parsedCount = z.coerce.number().int().min(1).max(30).safeParse(formData.get("result_count"));

  if (!parsedCount.success) {
    return { success: false, message: "La clasificacion tiene una cantidad de filas invalida." };
  }

  const rows: Array<{ output_id: string; percentage: number }> = [];

  for (let index = 0; index < parsedCount.data; index += 1) {
    const outputId = formData.get(`output_id_${index}`);
    const percentage = formData.get(`percentage_${index}`);

    if (typeof outputId !== "string" || !outputId.trim()) continue;

    const parsedPercentage = resultPercentageSchema.safeParse(percentage);
    if (!parsedPercentage.success) {
      return {
        success: false,
        message: `Fila ${index + 1}: ${parsedPercentage.error.issues[0]?.message ?? "porcentaje inválido."}`,
      };
    }

    rows.push({
      output_id: outputId,
      percentage: parsedPercentage.data,
    });
  }

  if (!rows.length) {
    return { success: false, message: "Agrega al menos un producto resultado." };
  }

  const total = rows.reduce((sum, row) => sum + row.percentage, 0);
  if (Math.abs(total - 100) > 0.000001) {
    return {
      success: false,
      message: "Los porcentajes deben sumar exactamente 100%.",
    };
  }

  const { error } = await access.supabase.rpc("save_qb_merchandise_classification_percentages", {
    p_line_id: lineResult.data.id,
    p_results: rows,
  });

  if (error) return { success: false, message: normalizeBusinessMessage(error.message) };

  revalidateQbIngresos();
  return { success: true, message: "Distribución porcentual guardada." };
}

export async function confirmQbMerchandiseReceiptAction(
  _previousState: ActionState = initialState,
  formData: FormData,
): Promise<ActionState> {
  void _previousState;
  const access = await assertCanManageQbIngresos();

  if (!access.allowed) return { success: false, message: access.message };

  const parsed = confirmReceiptSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Revisa la confirmacion.",
    };
  }

  const { error } = await access.supabase.rpc("confirm_qb_merchandise_receipt", {
    p_receipt_id: parsed.data.id,
  });

  if (error) return { success: false, message: normalizeBusinessMessage(error.message) };

  revalidateQbIngresos();
  return { success: true, message: "Ingreso QB confirmado y stock actualizado." };
}

export async function annulQbMerchandiseReceiptAction(
  _previousState: ActionState = initialState,
  formData: FormData,
): Promise<ActionState> {
  void _previousState;
  const access = await assertCanManageQbIngresos();

  if (!access.allowed) return { success: false, message: access.message };

  const parsed = annulReceiptSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Revisa el motivo de anulacion.",
    };
  }

  const { data: receipt, error: receiptError } = await access.supabase
    .from("qb_merchandise_receipts")
    .select("id, status")
    .eq("id", parsed.data.id)
    .maybeSingle<{ id: string; status: string }>();

  if (receiptError) return { success: false, message: receiptError.message };
  if (!receipt) return { success: false, message: "Ingreso QB no encontrado." };
  if (receipt.status !== "borrador") {
    return {
      success: false,
      message: "Solo se anulan borradores. La reversion de ingresos confirmados queda fuera de QB-4.",
    };
  }

  const { count, error: movementError } = await access.supabase
    .from("qb_merchandise_receipt_movements")
    .select("id", { count: "exact", head: true })
    .eq("receipt_id", receipt.id);

  if (movementError) return { success: false, message: movementError.message };
  if ((count ?? 0) > 0) {
    return { success: false, message: "No se puede anular un ingreso con movimientos." };
  }

  const { error } = await access.supabase
    .from("qb_merchandise_receipts")
    .update({
      status: "anulado",
      annulled_by: access.userId,
      annulled_at: new Date().toISOString(),
      annulled_reason: parsed.data.reason,
      updated_by: access.userId,
    })
    .eq("id", receipt.id);

  if (error) return { success: false, message: error.message };

  await writeAuditLog({
    supabase: access.supabase,
    userId: access.userId,
    action: "annul_qb_merchandise_receipt",
    entityType: "qb_merchandise_receipt",
    entityId: receipt.id,
    metadata: {
      reason: parsed.data.reason,
    },
  });

  revalidateQbIngresos();
  return { success: true, message: "Ingreso QB anulado sin afectar inventario." };
}
