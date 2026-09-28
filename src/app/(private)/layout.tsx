import { Suspense, type ReactNode } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { requireAuthenticatedUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

function PrivateLayoutFallback() {
  return <div className="min-h-screen bg-white" aria-label="Cargando aplicación" />;
}

async function AuthenticatedPrivateLayout({ children }: { children: ReactNode }) {
  const auth = await requireAuthenticatedUser();
  return (
    <div className="min-h-screen bg-slate-50/60">
      <div className="qb-app-header"><AppHeader user={auth.user} /></div>
      <main className="qb-app-main mx-auto w-full max-w-[2200px] px-3 py-4 lg:px-5">
        {children}
      </main>
    </div>
  );
}

export default function PrivateLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<PrivateLayoutFallback />}>
      <AuthenticatedPrivateLayout>{children}</AuthenticatedPrivateLayout>
    </Suspense>
  );
}
