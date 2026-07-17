"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, LocateFixed, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const COCHABAMBA = { lat: -17.3935, lng: -66.157 };
const MAP_UNAVAILABLE_MESSAGE =
  "El mapa no está disponible en este momento. Puedes escribir la dirección manualmente.";
const PLACE_SELECTION_ERROR_MESSAGE =
  "No pudimos completar esa dirección. Selecciona el punto en el mapa o escríbela manualmente.";

type LatLngLiteral = { lat: number; lng: number };
type LatLngValue = LatLngLiteral | { lat(): number; lng(): number };
type MapsListener = { remove(): void };

type MapInstance = {
  addListener(eventName: "click", handler: (event: { latLng?: LatLngValue | null }) => void): MapsListener;
  setCenter(position: LatLngLiteral): void;
  setZoom(zoom: number): void;
};

type MarkerInstance = {
  addListener(eventName: "dragend", handler: () => void): MapsListener;
  gmpDraggable: boolean;
  map: MapInstance | null;
  position: LatLngValue | null;
};

type GeocoderResult = {
  formatted_address?: string;
  place_id?: string;
};

type GeocoderInstance = {
  geocode(input: { location: LatLngLiteral }): Promise<{ results?: GeocoderResult[] }>;
};

type PlaceValue = {
  fetchFields(input: { fields: string[] }): Promise<void>;
  formattedAddress?: string;
  id?: string;
  location?: LatLngValue | null;
};

type PlaceAutocompleteElementInstance = HTMLElement & {
  includedRegionCodes?: string[];
  locationBias?: { center: LatLngLiteral; radius: number };
};

type GoogleMapsNamespace = {
  Geocoder: new () => GeocoderInstance;
  importLibrary(name: string): Promise<Record<string, unknown>>;
};

declare global {
  interface Window {
    google?: { maps?: GoogleMapsNamespace };
  }
}

export type GoogleLocationSelection = {
  address: string;
  latitude: number | null;
  longitude: number | null;
  googlePlaceId: string | null;
};

type GoogleLocationPickerProps = {
  idPrefix: string;
  initialSelection?: Partial<GoogleLocationSelection>;
  mode: "guest" | "registered";
  onChange?: (selection: GoogleLocationSelection) => void;
  readOnly?: boolean;
};

function finiteCoordinate(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function coordinatesFrom(value: LatLngValue | null | undefined): LatLngLiteral | null {
  if (!value) return null;
  const lat = typeof value.lat === "function" ? value.lat() : value.lat;
  const lng = typeof value.lng === "function" ? value.lng() : value.lng;
  return finiteCoordinate(lat, -90, 90) && finiteCoordinate(lng, -180, 180)
    ? { lat, lng }
    : null;
}

function geolocationMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return "No se pudo acceder a tu ubicación. Busca la dirección o selecciónala en el mapa.";
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return "No pudimos obtener tu ubicación actual.";
  }
  return "La ubicación tardó demasiado. Inténtalo nuevamente o busca la dirección.";
}

export function GoogleLocationPicker({
  idPrefix,
  initialSelection,
  mode,
  onChange,
  readOnly = false,
}: GoogleLocationPickerProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "";
  const configuredMapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim() ?? "";
  const initialLatitude = initialSelection?.latitude ?? null;
  const initialLongitude = initialSelection?.longitude ?? null;
  const initialCoordinates =
    finiteCoordinate(initialLatitude, -90, 90) &&
    finiteCoordinate(initialLongitude, -180, 180)
      ? { lat: initialLatitude, lng: initialLongitude }
      : null;
  const [selection, setSelection] = useState<GoogleLocationSelection>({
    address: initialSelection?.address?.trim() ?? "",
    latitude: initialCoordinates?.lat ?? null,
    longitude: initialCoordinates?.lng ?? null,
    googlePlaceId: initialSelection?.googlePlaceId?.trim() || null,
  });
  const [mapStatus, setMapStatus] = useState<"idle" | "loading" | "ready" | "unavailable">(
    apiKey ? "idle" : "unavailable",
  );
  const [locationStatus, setLocationStatus] = useState<"idle" | "loading" | "error" | "ready">(
    "idle",
  );
  const [message, setMessage] = useState(apiKey ? "" : MAP_UNAVAILABLE_MESSAGE);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const autocompleteContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const markerRef = useRef<MarkerInstance | null>(null);
  const geocoderRef = useRef<GeocoderInstance | null>(null);
  const initializedRef = useRef(false);
  const initializationRequestRef = useRef(0);
  const selectionRequestRef = useRef(0);
  const selectionRef = useRef(selection);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  function publish(next: GoogleLocationSelection) {
    selectionRef.current = next;
    setSelection(next);
    onChangeRef.current?.(next);
  }

  async function reverseGeocode(
    position: LatLngLiteral,
    placeId: string | null,
    requestId: number,
  ) {
    let address = selectionRef.current.address;
    let resolvedPlaceId = placeId;

    try {
      const response = await geocoderRef.current?.geocode({ location: position });
      const result = response?.results?.[0];
      if (result?.formatted_address) address = result.formatted_address;
      if (!resolvedPlaceId && result?.place_id) resolvedPlaceId = result.place_id;
    } catch {
      if (requestId === selectionRequestRef.current) {
        setMessage("Seleccionamos el punto. Verifica o escribe la dirección manualmente.");
      }
    }

    if (requestId !== selectionRequestRef.current) return;

    publish({
      address,
      latitude: position.lat,
      longitude: position.lng,
      googlePlaceId: resolvedPlaceId,
    });
  }

  async function selectPosition(position: LatLngLiteral, placeId: string | null = null) {
    const requestId = ++selectionRequestRef.current;
    if (!finiteCoordinate(position.lat, -90, 90) || !finiteCoordinate(position.lng, -180, 180)) {
      setMessage("No pudimos validar la ubicación seleccionada.");
      return;
    }

    if (markerRef.current) markerRef.current.position = position;
    mapRef.current?.setCenter(position);
    mapRef.current?.setZoom(17);
    await reverseGeocode(position, placeId, requestId);
  }

  async function initializeMap() {
    const mapContainer = mapContainerRef.current;
    if (initializedRef.current || !apiKey || !mapContainer) return;

    const initializationRequestId = initializationRequestRef.current + 1;
    initializationRequestRef.current = initializationRequestId;
    initializedRef.current = true;
    setMapStatus("loading");

    const isCurrentInitialization = () =>
      initializationRequestRef.current === initializationRequestId &&
      mapContainerRef.current === mapContainer;

    try {
      const maps = window.google?.maps;
      if (!maps) throw new Error("maps_unavailable");
      const [mapsLibrary, markerLibrary, geocodingLibrary] = await Promise.all([
        maps.importLibrary("maps"),
        maps.importLibrary("marker"),
        maps.importLibrary("geocoding"),
      ]);
      if (!isCurrentInitialization()) return;

      const MapConstructor = mapsLibrary.Map as new (
        element: HTMLElement,
        options: Record<string, unknown>,
      ) => MapInstance;
      const MarkerConstructor = markerLibrary.AdvancedMarkerElement as new (
        options: Record<string, unknown>,
      ) => MarkerInstance;
      const GeocoderConstructor = geocodingLibrary.Geocoder as new () => GeocoderInstance;
      if (
        typeof MapConstructor !== "function" ||
        typeof MarkerConstructor !== "function" ||
        typeof GeocoderConstructor !== "function"
      ) {
        throw new Error("maps_library_incomplete");
      }

      const geocoder = new GeocoderConstructor();
      const center = initialCoordinates ?? COCHABAMBA;
      const map = new MapConstructor(mapContainer, {
        center,
        zoom: initialCoordinates ? 17 : 13,
        mapId: configuredMapId || "DEMO_MAP_ID",
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: true,
      });
      const marker = new MarkerConstructor({
        map: initialCoordinates ? map : null,
        position: center,
        gmpDraggable: !readOnly,
        title: "Ubicación seleccionada",
      });
      if (!isCurrentInitialization()) {
        marker.map = null;
        return;
      }

      mapRef.current = map;
      markerRef.current = marker;
      geocoderRef.current = geocoder;

      if (!readOnly) {
        map.addListener("click", (event) => {
          const position = coordinatesFrom(event.latLng);
          if (position) {
            marker.map = map;
            void selectPosition(position);
          }
        });
        marker.addListener("dragend", () => {
          const position = coordinatesFrom(marker.position);
          if (position) void selectPosition(position);
        });
      }

      if (!readOnly && autocompleteContainerRef.current) {
        try {
          const placesLibrary = await maps.importLibrary("places");
          if (!isCurrentInitialization()) return;

          const AutocompleteConstructor = placesLibrary.PlaceAutocompleteElement as new (
            options?: Record<string, unknown>,
          ) => PlaceAutocompleteElementInstance;
          const autocomplete = new AutocompleteConstructor({});
          autocomplete.includedRegionCodes = ["bo"];
          autocomplete.locationBias = { center: COCHABAMBA, radius: 50_000 };
          autocomplete.setAttribute("aria-label", "Buscar dirección en Google Maps");
          autocomplete.addEventListener("gmp-select", (event) => {
            const requestId = ++selectionRequestRef.current;
            const prediction = (event as Event & {
              placePrediction?: { toPlace(): PlaceValue };
            }).placePrediction;
            void (async () => {
              try {
                if (!prediction) {
                  if (requestId === selectionRequestRef.current) {
                    setMessage(PLACE_SELECTION_ERROR_MESSAGE);
                  }
                  return;
                }

                const place = prediction.toPlace();
                await place.fetchFields({ fields: ["formattedAddress", "location", "id"] });
                if (requestId !== selectionRequestRef.current) return;

                const position = coordinatesFrom(place.location);
                if (!position) {
                  setMessage(PLACE_SELECTION_ERROR_MESSAGE);
                  return;
                }

                marker.map = map;
                marker.position = position;
                map.setCenter(position);
                map.setZoom(17);
                publish({
                  address: place.formattedAddress?.trim() || selectionRef.current.address,
                  latitude: position.lat,
                  longitude: position.lng,
                  googlePlaceId: place.id?.trim() || null,
                });
              } catch {
                if (requestId === selectionRequestRef.current) {
                  setMessage(PLACE_SELECTION_ERROR_MESSAGE);
                }
              }
            })();
          });
          autocomplete.addEventListener("gmp-error", () => {
            setMessage(MAP_UNAVAILABLE_MESSAGE);
          });
          autocompleteContainerRef.current.replaceChildren(autocomplete);
        } catch {
          setMessage("La búsqueda visual no está disponible. Puedes usar el mapa o escribir la dirección.");
        }
      }

      if (isCurrentInitialization()) setMapStatus("ready");
    } catch {
      if (!isCurrentInitialization()) return;

      initializedRef.current = false;
      setMapStatus("unavailable");
      setMessage(MAP_UNAVAILABLE_MESSAGE);
    }
  }

  function requestCurrentLocation() {
    if (!("geolocation" in navigator)) {
      setLocationStatus("error");
      setMessage("No pudimos obtener tu ubicación actual.");
      return;
    }

    setLocationStatus("loading");
    setMessage("Buscando tu ubicación…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const selected = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setLocationStatus("ready");
        setMessage("Ubicación seleccionada. Verifica la dirección antes de guardar.");
        if (markerRef.current && mapRef.current) markerRef.current.map = mapRef.current;
        void selectPosition(selected);
      },
      (error) => {
        setLocationStatus("error");
        setMessage(geolocationMessage(error));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  useEffect(
    () => () => {
      initializationRequestRef.current += 1;
      selectionRequestRef.current += 1;
      initializedRef.current = false;
      if (markerRef.current) markerRef.current.map = null;
      mapRef.current = null;
      markerRef.current = null;
      geocoderRef.current = null;
      autocompleteContainerRef.current?.replaceChildren();
    },
    [],
  );

  useEffect(() => {
    if (apiKey && window.google?.maps && mapContainerRef.current) {
      void initializeMap();
    }
  });

  const scriptUrl = apiKey
    ? `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async&v=weekly&language=es&region=BO`
    : "";
  const showMap = !readOnly || Boolean(initialCoordinates);

  return (
    <div className="space-y-3" data-location-mode={mode}>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-address`}>Dirección</Label>
        <Input
          id={`${idPrefix}-address`}
          name="address"
          autoComplete="street-address"
          maxLength={300}
          value={selection.address}
          readOnly={readOnly}
          required={!readOnly}
          onChange={(event) => {
            selectionRequestRef.current += 1;
            publish({ ...selectionRef.current, address: event.target.value });
          }}
        />
      </div>

      <input type="hidden" name="latitude" value={selection.latitude ?? ""} />
      <input type="hidden" name="longitude" value={selection.longitude ?? ""} />
      <input type="hidden" name="google_place_id" value={selection.googlePlaceId ?? ""} />

      {!readOnly && apiKey ? (
        <div className="space-y-2">
          <Label>Buscar dirección</Label>
          <div
            ref={autocompleteContainerRef}
            className="min-h-11 overflow-hidden rounded-md border bg-background [&_gmp-place-autocomplete]:w-full"
          />
        </div>
      ) : null}

      {showMap ? (
        <div className="relative min-h-64 overflow-hidden rounded-xl border bg-muted/30 sm:min-h-72">
          <div ref={mapContainerRef} className="absolute inset-0" aria-label="Mapa de la ubicación" />
          {mapStatus !== "ready" ? (
            <div className="absolute inset-0 flex items-center justify-center p-5 text-center text-sm text-muted-foreground">
              {mapStatus === "loading" ? (
                <span className="inline-flex items-center gap-2">
                  <LoaderCircle className="size-4 animate-spin" /> Cargando mapa…
                </span>
              ) : (
                <span className="inline-flex max-w-md items-center gap-2">
                  <MapPin className="size-4 shrink-0" /> {MAP_UNAVAILABLE_MESSAGE}
                </span>
              )}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          Esta ubicación fue guardada sin un punto en el mapa.
        </p>
      )}

      {!readOnly ? (
        <Button
          type="button"
          variant="outline"
          disabled={locationStatus === "loading"}
          onClick={requestCurrentLocation}
        >
          {locationStatus === "loading" ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <LocateFixed className="size-4" />
          )}
          {locationStatus === "loading" ? "Buscando tu ubicación…" : "Usar mi ubicación actual"}
        </Button>
      ) : null}

      {message ? (
        <p
          role={locationStatus === "error" || mapStatus === "unavailable" ? "alert" : "status"}
          className="text-sm text-muted-foreground"
        >
          {message}
        </p>
      ) : null}

      {apiKey && showMap ? (
        <Script
          id="qb-google-maps-javascript"
          src={scriptUrl}
          strategy="afterInteractive"
          onReady={() => void initializeMap()}
          onError={() => {
            initializationRequestRef.current += 1;
            initializedRef.current = false;
            setMapStatus("unavailable");
            setMessage(MAP_UNAVAILABLE_MESSAGE);
          }}
        />
      ) : null}
    </div>
  );
}
