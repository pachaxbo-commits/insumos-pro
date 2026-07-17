import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL(
  "../src/components/locations/google-location-picker.tsx",
  import.meta.url,
);
const source = await readFile(componentPath, "utf8");

test("carga maps, marker y geocoding antes de construir el mapa", () => {
  assert.match(
    source,
    /Promise\.all\(\[\s*maps\.importLibrary\("maps"\),\s*maps\.importLibrary\("marker"\),\s*maps\.importLibrary\("geocoding"\),/s,
  );
  assert.match(source, /geocodingLibrary\.Geocoder/);
  assert.doesNotMatch(source, /new maps\.Geocoder\(/);
});

test("mantiene Places como biblioteca independiente para el autocompletado", () => {
  assert.match(source, /await maps\.importLibrary\("places"\)/);
  assert.match(source, /placesLibrary\.PlaceAutocompleteElement/);
});

test("no inicia hasta disponer de API key, namespace y contenedor", () => {
  assert.match(source, /initializedRef\.current \|\| !apiKey \|\| !mapContainer/);
  assert.match(source, /apiKey && window\.google\?\.maps && mapContainerRef\.current/);
});

test("una carga lenta no activa un timeout ni el fallback prematuramente", () => {
  assert.doesNotMatch(source, /setTimeout|Promise\.race|AbortSignal\.timeout/);
  assert.match(source, /setMapStatus\("loading"\)/);
  assert.match(source, /if \(isCurrentInitialization\(\)\) setMapStatus\("ready"\)/);
});

test("un error real del script activa el fallback manual", () => {
  assert.match(
    source,
    /onError=\{\(\) => \{[\s\S]*setMapStatus\("unavailable"\);[\s\S]*setMessage\(MAP_UNAVAILABLE_MESSAGE\);/,
  );
  assert.match(
    source,
    /El mapa no está disponible en este momento\. Puedes escribir la dirección manualmente\./,
  );
});

test("los constructores ausentes quedan contenidos por la inicialización", () => {
  assert.match(source, /typeof MapConstructor !== "function"/);
  assert.match(source, /typeof MarkerConstructor !== "function"/);
  assert.match(source, /typeof GeocoderConstructor !== "function"/);
  assert.match(source, /throw new Error\("maps_library_incomplete"\)/);
  assert.match(source, /} catch \{\s*if \(!isCurrentInitialization\(\)\) return;/s);
});

test("el desmontaje invalida inicializaciones y selecciones pendientes", () => {
  assert.match(source, /initializationRequestRef\.current \+= 1;/);
  assert.match(source, /selectionRequestRef\.current \+= 1;/);
  assert.match(source, /initializedRef\.current = false;/);
});

test("el desmontaje libera mapa, marcador, geocoder y autocompletado", () => {
  assert.match(source, /markerRef\.current\.map = null;/);
  assert.match(source, /mapRef\.current = null;/);
  assert.match(source, /markerRef\.current = null;/);
  assert.match(source, /geocoderRef\.current = null;/);
  assert.match(source, /autocompleteContainerRef\.current\?\.replaceChildren\(\)/);
});

test("una inicialización obsoleta no publica estado ni conserva marcador", () => {
  assert.match(source, /initializationRequestRef\.current === initializationRequestId/);
  assert.match(source, /mapContainerRef\.current === mapContainer/);
  assert.match(source, /if \(!isCurrentInitialization\(\)\) \{\s*marker\.map = null;\s*return;/s);
});

test("conserva el Map ID configurado y la alternativa oficial", () => {
  assert.match(source, /configuredMapId \|\| "DEMO_MAP_ID"/);
  assert.match(source, /mapId: configuredMapId \|\| "DEMO_MAP_ID"/);
});
