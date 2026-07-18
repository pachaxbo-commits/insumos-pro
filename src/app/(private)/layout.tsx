import { Suspense, type ReactNode } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { requireAuthenticatedUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

function PrivateLayoutFallback() {
  return (
    <div
      className="min-h-screen bg-transparent"
      aria-label="Cargando aplicación"
    >
      <div className="mx-auto flex min-h-screen max-w-[1680px] gap-4 p-3 lg:p-5">
        <div className="hidden w-[318px] shrink-0 lg:block">
          <div className="h-[calc(100vh-2.5rem)] animate-pulse rounded-[1.75rem] bg-slate-900/90" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="h-20 animate-pulse rounded-[1.5rem] border border-white/60 bg-white/70" />
          <main className="flex-1 rounded-[1.75rem] border border-white/55 bg-white/45 p-4 md:p-6">
            <div className="h-80 animate-pulse rounded-2xl bg-white/60" />
          </main>
        </div>
      </div>
    </div>
  );
}

async function AuthenticatedPrivateLayout({
  children,
}: {
  children: ReactNode;
}) {
  const auth = await requireAuthenticatedUser();

  return (
    <div className="min-h-screen bg-transparent">
      <div className="mx-auto flex min-h-screen max-w-[1680px] gap-4 p-3 lg:p-5">
        <div className="hidden w-[318px] shrink-0 lg:block">
          <div className="sticky top-5 h-[calc(100vh-2.5rem)]">
            <AppSidebar user={auth.user} />
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <AppHeader user={auth.user} />
          <main className="flex-1 rounded-[1.75rem] border border-white/55 bg-white/45 p-4 shadow-sm backdrop-blur md:p-6">
            {children}
          </main>
        </div>
      </div>
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
