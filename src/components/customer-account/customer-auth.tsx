"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { KeyRound, LogIn, ShoppingBasket, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  customerLoginAction,
  customerSignupAction,
} from "@/lib/customer-account/actions";
import type { CustomerAuthActionState } from "@/types/customer-account";

const initialState: CustomerAuthActionState = { success: false };

export function CustomerAuth({ authError = false }: { authError?: boolean }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loginState, loginAction, loginPending] = useActionState(
    customerLoginAction,
    initialState,
  );
  const [signupState, signupAction, signupPending] = useActionState(
    customerSignupAction,
    initialState,
  );
  const state = mode === "login" ? loginState : signupState;

  return (
    <main className="min-h-screen bg-[#f5f1e8] px-4 py-8 text-[#28372f] sm:px-6">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl overflow-hidden rounded-[2rem] border border-[#dcd8ca] bg-[#fffdf8] shadow-[0_28px_90px_rgba(42,58,48,0.14)] lg:grid-cols-[0.9fr_1.1fr]">
        <section className="relative overflow-hidden bg-[#244d3c] p-7 text-white sm:p-10">
          <div className="absolute inset-0 opacity-35 [background-image:radial-gradient(#ffffff40_1px,transparent_1px)] [background-size:24px_24px]" />
          <div className="relative flex h-full flex-col justify-between gap-12">
            <div>
              <Link href="/catalogo" className="inline-flex items-center gap-2 font-heading text-xl font-bold">
                <ShoppingBasket className="size-6" />
                QB Insumos
              </Link>
              <h1 className="mt-16 max-w-md font-heading text-4xl font-bold leading-tight">
                Tus pedidos, ordenados y siempre a mano.
              </h1>
              <p className="mt-4 max-w-md leading-7 text-white/72">
                Guarda tus datos habituales, revisa tu historial y vuelve a pedir desde el
                catalogo QB.
              </p>
            </div>
            <p className="text-sm text-white/60">
              La cuenta de cliente no otorga acceso al panel interno.
            </p>
          </div>
        </section>

        <section className="flex items-center p-6 sm:p-10">
          <div className="mx-auto w-full max-w-md">
            <div className="grid grid-cols-2 rounded-2xl bg-[#eeece3] p-1">
              <button
                type="button"
                onClick={() => setMode("login")}
                className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${
                  mode === "login" ? "bg-white shadow-sm" : "text-[#737970]"
                }`}
              >
                Iniciar sesion
              </button>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${
                  mode === "signup" ? "bg-white shadow-sm" : "text-[#737970]"
                }`}
              >
                Crear cuenta
              </button>
            </div>

            <div className="mt-7">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#758078]">
                Area de clientes
              </p>
              <h2 className="mt-2 font-heading text-3xl font-bold">
                {mode === "login" ? "Bienvenido de vuelta" : "Crea tu cuenta"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#6d746d]">
                {mode === "login"
                  ? "Ingresa con el correo usado para tu cuenta de cliente."
                  : "Tu cuenta no otorga acceso al panel interno de operaciones."}
              </p>
            </div>

            {authError ? (
              <p className="mt-5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
                El enlace de acceso no es valido o ya vencio.
              </p>
            ) : null}

            {state.message ? (
              <p
                role="status"
                className={`mt-5 rounded-xl px-4 py-3 text-sm ${
                  state.success ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
                }`}
              >
                {state.message}
              </p>
            ) : null}

            <form
              action={mode === "login" ? loginAction : signupAction}
              className="mt-6 space-y-4"
            >
              {mode === "signup" ? (
                <div className="space-y-2">
                  <Label htmlFor="customer-full-name">Nombre</Label>
                  <Input
                    id="customer-full-name"
                    name="full_name"
                    required
                    minLength={2}
                    maxLength={120}
                    autoComplete="name"
                    className="h-12 rounded-xl"
                  />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="customer-email">Correo</Label>
                <Input
                  id="customer-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="h-12 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-password">Contrasena</Label>
                <Input
                  id="customer-password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  maxLength={72}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="h-12 rounded-xl"
                />
              </div>
              <Button
                type="submit"
                disabled={loginPending || signupPending}
                className="h-12 w-full rounded-xl bg-[#244d3c] text-white hover:bg-[#193f2f]"
              >
                {mode === "login" ? <LogIn /> : <UserPlus />}
                {loginPending || signupPending
                  ? "Procesando..."
                  : mode === "login"
                    ? "Entrar a mi cuenta"
                    : "Crear cuenta"}
              </Button>
            </form>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
              <Link
                href="/mi-cuenta/recuperar"
                className="inline-flex items-center gap-2 font-semibold text-[#315f46]"
              >
                <KeyRound className="size-4" />
                Olvide mi contrasena
              </Link>
              <Link href="/catalogo" className="text-[#6d746d] hover:text-[#315f46]">
                Volver al catalogo
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
