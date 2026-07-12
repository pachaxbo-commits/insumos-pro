"use client";

import { useActionState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  requestCustomerPasswordResetAction,
  updateCustomerPasswordAction,
} from "@/lib/customer-account/actions";
import type { CustomerAuthActionState } from "@/types/customer-account";

const initialState: CustomerAuthActionState = { success: false };

export function CustomerRecoveryForm({ mode }: { mode: "request" | "update" }) {
  const action =
    mode === "request"
      ? requestCustomerPasswordResetAction
      : updateCustomerPasswordAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f1e8] px-4 py-10 text-[#28372f]">
      <section className="w-full max-w-md rounded-[2rem] border border-[#dcd8ca] bg-[#fffdf8] p-6 shadow-[0_24px_70px_rgba(55,65,55,0.12)] sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#758078]">
          Acceso seguro
        </p>
        <h1 className="mt-2 font-heading text-3xl font-bold">
          {mode === "request" ? "Recuperar contrasena" : "Nueva contrasena"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#6d746d]">
          {mode === "request"
            ? "Te enviaremos un enlace si el correo corresponde a una cuenta."
            : "Elige una contrasena nueva para tu cuenta de cliente."}
        </p>

        {state.message ? (
          <p
            className={`mt-5 rounded-xl px-4 py-3 text-sm ${
              state.success ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
            }`}
          >
            {state.message}
          </p>
        ) : null}

        <form action={formAction} className="mt-6 space-y-4">
          {mode === "request" ? (
            <div className="space-y-2">
              <Label htmlFor="recovery-email">Correo</Label>
              <Input
                id="recovery-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="h-12 rounded-xl"
              />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="new-password">Nueva contrasena</Label>
                <Input
                  id="new-password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  maxLength={72}
                  autoComplete="new-password"
                  className="h-12 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password-confirmation">Repetir contrasena</Label>
                <Input
                  id="password-confirmation"
                  name="password_confirmation"
                  type="password"
                  required
                  minLength={8}
                  maxLength={72}
                  autoComplete="new-password"
                  className="h-12 rounded-xl"
                />
              </div>
            </>
          )}
          <Button
            type="submit"
            disabled={pending}
            className="h-12 w-full rounded-xl bg-[#244d3c] text-white hover:bg-[#193f2f]"
          >
            {pending
              ? "Procesando..."
              : mode === "request"
                ? "Enviar enlace"
                : "Guardar contrasena"}
          </Button>
        </form>

        <Button asChild variant="ghost" className="mt-3 w-full rounded-xl">
          <Link href="/mi-cuenta">Volver a mi cuenta</Link>
        </Button>
      </section>
    </main>
  );
}
