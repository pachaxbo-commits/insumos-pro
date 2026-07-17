"use client";

import { useState } from "react";
import { MapPin, Plus } from "lucide-react";

import { CustomerLocationForm } from "@/components/customer-account/customer-location-form";
import { GoogleLocationPicker } from "@/components/locations/google-location-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { QbCustomerLocation } from "@/types/qb-catalog";

export function CheckoutLocationSelector({
  locations,
  selectedId,
  onSelect,
}: {
  locations: QbCustomerLocation[];
  selectedId: string;
  onSelect: (locationId: string) => void;
}) {
  const [showNew, setShowNew] = useState(locations.length === 0);
  const selected = locations.find((location) => location.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      {locations.length ? (
        <div className="space-y-2">
          <Label htmlFor="location-id-select">Ubicación guardada</Label>
          <select
            id="location-id-select"
            value={selectedId}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            onChange={(event) => onSelect(event.target.value)}
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.label} - {location.address}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
          Agrega una ubicación para enviar el pedido.
        </p>
      )}

      {selected ? (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <MapPin className="size-4 text-emerald-700" />
            <div>
              <p className="font-medium">{selected.label}</p>
              {selected.reference ? (
                <p className="text-xs text-muted-foreground">{selected.reference}</p>
              ) : null}
            </div>
          </div>
          <GoogleLocationPicker
            key={selected.id}
            idPrefix={`checkout-preview-${selected.id}`}
            mode="registered"
            readOnly
            initialSelection={{
              address: selected.address,
              latitude: selected.latitude,
              longitude: selected.longitude,
              googlePlaceId: selected.googlePlaceId,
            }}
          />
        </div>
      ) : null}

      <Button type="button" variant="outline" onClick={() => setShowNew((current) => !current)}>
        <Plus className="size-4" />
        {showNew ? "Cerrar nueva ubicación" : "Agregar nueva ubicación"}
      </Button>

      {showNew ? (
        <CustomerLocationForm
          key="checkout-new-location"
          submitLabel="Guardar y seleccionar"
          onCancel={() => setShowNew(false)}
          onSaved={(locationId) => {
            onSelect(locationId);
            setShowNew(false);
          }}
        />
      ) : null}
    </div>
  );
}
