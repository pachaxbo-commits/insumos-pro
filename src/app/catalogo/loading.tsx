export default function CatalogLoading() {
  return (
    <main className="min-h-screen bg-[#f5f1e8] px-4 py-8">
      <div className="mx-auto max-w-7xl animate-pulse space-y-6">
        <div className="h-20 rounded-3xl bg-white/80" />
        <div className="h-48 rounded-[2rem] bg-[#dfe8d7]" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-80 rounded-3xl bg-white/80" />
          ))}
        </div>
      </div>
    </main>
  );
}
