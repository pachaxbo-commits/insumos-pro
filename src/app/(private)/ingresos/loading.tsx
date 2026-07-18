export default function IngresosLoading() {
  return (
    <div className="space-y-4" aria-live="polite" aria-busy="true">
      <div className="h-9 w-48 animate-pulse rounded-xl bg-muted" />
      <p className="text-sm text-muted-foreground">Cargando presentaciones…</p>
      <div className="h-80 animate-pulse rounded-2xl border bg-white/55" />
    </div>
  );
}
