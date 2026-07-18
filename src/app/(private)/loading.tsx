export default function PrivateModuleLoading() {
  return (
    <div className="space-y-6" aria-label="Cargando módulo">
      <div className="space-y-3">
        <div className="h-4 w-28 animate-pulse rounded bg-muted" />
        <div className="h-9 w-64 max-w-full animate-pulse rounded-xl bg-muted" />
        <div className="h-4 w-full max-w-2xl animate-pulse rounded bg-muted" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-2xl border border-white/60 bg-white/55"
          />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-2xl border border-white/60 bg-white/55" />
    </div>
  );
}
