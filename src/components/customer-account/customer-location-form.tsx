"use client";

import { useActionState, useEffect } from "react";

import { GoogleLocationPicker } from "@/components/locations/google-location-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveQbCustomerLocationAction } from "@/lib/qb-catalog/actions";
import type { QbCatalogActionState, QbCustomerLocation } from "@/types/qb-catalog";

const initialState: QbCatalogActionState = { success: false };

export function CustomerLocationForm({
  location,
  onCancel,
  onSaved,
  submitLabel,
}: {
  location?: QbCustomerLocation | null;
  onCancel?: () => void;
  onSaved?: (locationId: string) => void;
  submitLabel?: string;
}) {
  const [state, action, pending] = useActionState(saveQbCustomerLocationAction, initialState);

  useEffect(() => {
    if (state.success && state.locationId) onSaved?.(state.locationId);
  }, [onSaved, state.locationId, state.success]);

  return (
    <form action={action} className="space-y-4 rounded-xl border bg-background p-4">
      {location ? <input type="hidden" name="id" value={location.id} /> : null}
      <input type="hidden" name="phone" value={location?.phone ?? ""} />

      {state.message ? (
        <p
          role={state.success ? "status" : "alert"}
          className={`rounded-md p-3 text-sm ${
            state.success ? "bg-emerald-50 text-emerald-800" : "bg-destructive/5 text-destructive"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor={`location-label-${location?.id ?? "new"}`}>Nombre de la ubicación</Label>
        <Input
          id={`location-label-${location?.id ?? "new"}`}
          name="label"
          defaultValue={location?.label ?? ""}
          placeholder="Casa, local, sucursal, almacén…"
          minLength={2}
          maxLength={80}
          required
        />
      </div>

      <GoogleLocationPicker
        idPrefix={`location-${location?.id ?? "new"}`}
        mode="registered"
        initialSelection={{
          address: location?.address ?? "",
          latitude: location?.latitude ?? null,
          longitude: location?.longitude ?? null,
          googlePlaceId: location?.googlePlaceId ?? null,
        }}
      />

      <div className="space-y-2">
        <Label htmlFor={`location-reference-${location?.id ?? "new"}`}>Referencia opcional</Label>
        <Input
          id={`location-reference-${location?.id ?? "new"}`}
          name="reference"
          defaultValue={location?.reference ?? ""}
          placeholder="Portón negro, segundo piso, frente a…"
          maxLength={300}
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="is_primary"
          className="size-4"
          defaultChecked={location?.isPrimary ?? false}
        />
        Marcar como principal
      </label>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" disabled={pending} className="flex-1">
          {pending ? "Guardando…" : submitLabel ?? "Guardar ubicación"}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  );
}
