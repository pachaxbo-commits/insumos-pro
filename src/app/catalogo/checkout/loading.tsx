export default function PublicCheckoutLoading() {
  return (
    <main className="min-h-screen bg-[#f5f1e8] px-4 py-8">
      <div className="mx-auto grid max-w-5xl animate-pulse gap-5 lg:grid-cols-[1fr_360px]">
        <div className="h-[38rem] rounded-[2rem] bg-white/80" />
        <div className="h-96 rounded-[2rem] bg-white/80" />
      </div>
    </main>
  );
}
