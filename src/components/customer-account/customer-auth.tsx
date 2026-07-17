import Link from "next/link";
import { KeyRound, LogIn, ShoppingBasket, UserPlus } from "lucide-react";

import { QbInsumosBrand } from "@/components/branding/qb-insumos-brand";
import { Button } from "@/components/ui/button";

export function CustomerAuth({ authError = false }: { authError?: boolean }) {
  return (
    <main className="min-h-screen bg-[#f5f1e8] px-4 py-8 text-[#28372f] sm:px-6">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl overflow-hidden rounded-[2rem] border border-[#dcd8ca] bg-[#fffdf8] shadow-[0_28px_90px_rgba(42,58,48,0.14)] lg:grid-cols-[0.9fr_1.1fr]">
        <section className="relative overflow-hidden bg-[#244d3c] p-7 text-white sm:p-10">
          <div className="absolute inset-0 opacity-35 [background-image:radial-gradient(#ffffff40_1px,transparent_1px)] [background-size:24px_24px]" />
          <div className="relative flex h-full flex-col justify-between gap-12">
            <QbInsumosBrand
              showSubtitle
              textClassName="text-white"
              className="[&_p:last-child]:text-white/65"
            />
            <div>
              <h1 className="max-w-md font-heading text-4xl font-bold leading-tight">
                Tus pedidos, ordenados y siempre a mano.
              </h1>
              <p className="mt-4 max-w-md leading-7 text-white/72">
                Guarda tus ubicaciones, revisa tu historial y vuelve a comprar desde el
                Catálogo de QB Insumos.
              </p>
            </div>
            <p className="text-sm text-white/60">
              La cuenta de cliente no otorga acceso al panel interno.
            </p>
          </div>
        </section>

        <section className="flex items-center p-6 sm:p-10">
          <div className="mx-auto w-full max-w-md">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#758078]">
              Área de clientes
            </p>
            <h2 className="mt-2 font-heading text-3xl font-bold">Accede a tu cuenta</h2>
            <p className="mt-2 text-sm leading-6 text-[#6d746d]">
              Inicia sesión con el acceso unificado o crea una cuenta de cliente.
            </p>

            {authError ? (
              <p className="mt-5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
                El enlace de acceso no es válido o ya venció.
              </p>
            ) : null}

            <div className="mt-7 grid gap-3">
              <Button asChild className="h-12 rounded-xl bg-[#244d3c] text-white hover:bg-[#193f2f]">
                <Link href="/login?returnTo=%2Fmi-cuenta">
                  <LogIn className="size-4" />
                  Iniciar sesión
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-12 rounded-xl">
                <Link href="/registro">
                  <UserPlus className="size-4" />
                  Crear una cuenta
                </Link>
              </Button>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
              <Link
                href="/mi-cuenta/recuperar"
                className="inline-flex items-center gap-2 font-semibold text-[#315f46]"
              >
                <KeyRound className="size-4" />
                Olvidé mi contraseña
              </Link>
              <Link
                href="/catalogo"
                className="inline-flex items-center gap-2 text-[#6d746d] hover:text-[#315f46]"
              >
                <ShoppingBasket className="size-4" />
                Volver al Catálogo
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
