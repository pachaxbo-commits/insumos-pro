"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";

type ActionState = {
  success: boolean;
  message?: string;
};

const mutationRoles = new Set(["administrador", "inventario"]);

const optionalText = z.preprocess(
  (value) => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  },
  z.string().nullable(),
);

const productSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres."),
  sku: optionalText,
  category_id: z.uuid("Selecciona una categoria."),
  unit_id: z.uuid("Selecciona una unidad."),
  stock_current: z.coerce.number().min(0, "El stock actual no puede ser negativo."),
  stock_min: z.coerce.number().min(0, "El stock minimo no puede ser negativo."),
  purchase_price: z.coerce.number().min(0, "El precio de compra no puede ser negativo."),
  sale_price: z.coerce.number().min(0, "El precio de venta no puede ser negativo."),
  supplier_name: optionalText,
  image_url: optionalText,
  is_active: z.coerce.boolean().default(true),
});

const catalogSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres."),
  description: optionalText,
  is_active: z.coerce.boolean().default(true),
});

const unitSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres."),
  abbreviation: z.string().trim().min(1, "La abreviatura es obligatoria.").max(12),
  is_active: z.coerce.boolean().default(true),
});

async function assertCanMutateProducts() {
  const auth = await requireAuthenticatedUser();

  if (!auth.user.role || !mutationRoles.has(auth.user.role)) {
    return {
      allowed: false as const,
      message: "Tu rol solo permite lectura en este modulo.",
    };
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return {
      allowed: false as const,
      message: "Supabase no esta configurado.",
    };
  }

  return { allowed: true as const, supabase };
}

function parseId(formData: FormData) {
  const id = formData.get("id");
  return typeof id === "string" ? id : "";
}

function revalidateProducts() {
  revalidatePath("/productos");
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

  const { error } = await access.supabase.from("products").insert(parsed.data);

  if (error) return { success: false, message: error.message };

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

  const { error } = await access.supabase.from("products").update(parsed.data).eq("id", id);

  if (error) return { success: false, message: error.message };

  revalidateProducts();
  return { success: true, message: "Producto actualizado correctamente." };
}

export async function deactivateProductAction(formData: FormData) {
  const access = await assertCanMutateProducts();

  if (!access.allowed) return;

  const id = parseId(formData);

  if (!z.uuid().safeParse(id).success) return;

  await access.supabase.from("products").update({ is_active: false }).eq("id", id);
  revalidateProducts();
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

  const { error } = await access.supabase.from("product_categories").insert(parsed.data);

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

  const { error } = await access.supabase
    .from("product_categories")
    .update(parsed.data)
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
