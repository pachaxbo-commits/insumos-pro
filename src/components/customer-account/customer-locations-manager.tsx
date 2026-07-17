"use client";

import { useActionState, useState } from "react";
import { Edit3, MapPin, Plus, Star, Trash2 } from "lucide-react";

import { CustomerLocationForm } from "@/components/customer-account/customer-location-form";
import { GoogleLocationPicker } from "@/components/locations/google-location-picker";
import { Button } from "@/components/ui/button";
import {
  deactivateQbCustomerLocationAction,
  setPrimaryQbCustomerLocationAction,
} from "@/lib/qb-catalog/actions";
import type { QbCatalogActionState, QbCustomerLocation } from "@/types/qb-catalog";

const initialState: QbCatalogActionState = { success: false };

export function CustomerLocationsManager({ locations }: { locations: QbCustomerLocation[] }) {
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [primaryState, primaryAction, primaryPending] = useActionState(
    setPrimaryQbCustomerLocationAction,
    initialState,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deactivateQbCustomerLocationAction,
    initialState,
  );
  const editingLocation = locations.find((location) => location.id === editingId) ?? null;
  const viewingLocation = locations.find((location) => location.id === viewingId) ?? null;

  return (
    <section className="rounded-lg border bg-background p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MapPin className="size-5 text-emerald-700" />
          <h2 className="text-lg font-semibold">Ubicaciones</h2>
        </div>
        <Button type="button" size="sm" onClick={() => setEditingId("new")}>
          <Plus className="size-4" />
          Agregar ubicación
        </Button>
      </div>

      {[primaryState.message, deleteState.message].filter(Boolean).map((message) => (
        <p key={message} className="mt-3 rounded-md bg-muted p-3 text-sm" role="status">
          {message}
        </p>
      ))}

      <div className="mt-4 space-y-3">
        {locations.length ? (
          locations.map((location) => (
            <article key={location.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {location.label}
                    {location.isPrimary ? (
                      <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                        Principal
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{location.address}</p>
                  {location.reference ? (
                    <p className="mt-1 text-xs text-muted-foreground">{location.reference}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setViewingId(viewingId === location.id ? null : location.id)}
                  >
                    <MapPin className="size-4" /> Ver en mapa
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingId(location.id)}
                  >
                    <Edit3 className="size-4" /> Editar
                  </Button>
                  {!location.isPrimary ? (
                    <form action={primaryAction}>
                      <input type="hidden" name="id" value={location.id} />
                      <Button type="submit" variant="ghost" size="sm" disabled={primaryPending}>
                        <Star className="size-4" /> Principal
                      </Button>
                    </form>
                  ) : null}
                  <form
                    action={deleteAction}
                    onSubmit={(event) => {
                      if (!window.confirm(`¿Eliminar la ubicación ${location.label}?`)) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="id" value={location.id} />
                    <Button type="submit" variant="ghost" size="sm" disabled={deletePending}>
                      <Trash2 className="size-4" /> Eliminar
                    </Button>
                  </form>
                </div>
              </div>

              {viewingLocation?.id === location.id ? (
                <div className="mt-4 border-t pt-4">
                  <GoogleLocationPicker
                    key={`view-${location.id}`}
                    idPrefix={`view-${location.id}`}
                    mode="registered"
                    readOnly
                    initialSelection={{
                      address: location.address,
                      latitude: location.latitude,
                      longitude: location.longitude,
                      googlePlaceId: location.googlePlaceId,
                    }}
                  />
                </div>
              ) : null}
            </article>
          ))
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Aún no tienes ubicaciones guardadas.
          </p>
        )}
      </div>

      {editingId ? (
        <div className="mt-5 border-t pt-4">
          <h3 className="mb-3 font-medium">
            {editingId === "new" ? "Nueva ubicación" : "Editar ubicación"}
          </h3>
          <CustomerLocationForm
            key={editingId}
            location={editingId === "new" ? null : editingLocation}
            onCancel={() => setEditingId(null)}
            onSaved={() => setEditingId(null)}
          />
        </div>
      ) : null}
    </section>
  );
}
