"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAuthenticatedUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { menuKeys } from "@/lib/app-appearance/model";

export type AppearanceActionState = { success: boolean; message: string };

const labelSchema = z.string().trim().min(1).max(40);
const nameSchema = z.string().trim().min(2).max(60);

function imageType(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { mime: "image/jpeg", ext: "jpg" };
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return { mime: "image/png", ext: "png" };
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return { mime: "image/webp", ext: "webp" };
  return null;
}

export async function saveAppAppearanceAction(
  _previous: AppearanceActionState,
  formData: FormData,
): Promise<AppearanceActionState> {
  const auth = await requireAuthenticatedUser();
  if (auth.user.role !== "administrador") return { success: false, message: "Acceso denegado." };
  const name = nameSchema.safeParse(formData.get("system_name"));
  const labels: Record<string, string> = {};
  for (const key of menuKeys) {
    const label = labelSchema.safeParse(formData.get(`label_${key}`));
    if (!label.success) return { success: false, message: `Etiqueta inválida: ${key}.` };
    labels[key] = label.data;
  }
  if (!name.success) return { success: false, message: "El nombre debe tener entre 2 y 60 caracteres." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { success: false, message: "Supabase no está disponible." };

  let logoPath: string | undefined;
  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (logo.size > 2 * 1024 * 1024) return { success: false, message: "El logo no puede superar 2 MB." };
    const bytes = new Uint8Array(await logo.arrayBuffer());
    const type = imageType(bytes);
    if (!type || type.mime !== logo.type) return { success: false, message: "Selecciona un logo JPEG, PNG o WebP válido." };
    logoPath = `branding/${crypto.randomUUID()}.${type.ext}`;
    const { error } = await supabase.storage.from("product-images").upload(logoPath, bytes, {
      contentType: type.mime,
      cacheControl: "0",
      upsert: false,
    });
    if (error) return { success: false, message: "No se pudo subir el logo." };
  }

  const payload: Record<string, unknown> = {
    system_name: name.data,
    menu_labels: labels,
    updated_by: auth.user.id,
    updated_at: new Date().toISOString(),
  };
  if (logoPath) payload.logo_path = logoPath;
  const { error } = await supabase.from("qb_ui_settings").update(payload).eq("id", 1);
  if (error) {
    if (logoPath) await supabase.storage.from("product-images").remove([logoPath]);
    return { success: false, message: "No se pudo guardar la configuración." };
  }
  revalidatePath("/", "layout");
  return { success: true, message: "Configuración guardada." };
}
