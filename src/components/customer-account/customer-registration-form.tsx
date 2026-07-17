"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Phone,
  Store,
  UserRound,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocalCart } from "@/hooks/use-local-cart";
import {
  registerCustomerAction,
  type CustomerRegistrationActionState,
} from "@/lib/customer-registration/actions";
import type { CustomerRegistrationReturnPath } from "@/lib/customer-registration/validation";

const initialState: CustomerRegistrationActionState = { success: false };

function RegistrationSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="h-11 w-full rounded-xl" disabled={pending}>
      {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
      {pending ? "Creando cuenta..." : "Crear cuenta"}
    </Button>
  );
}

function FieldMessage({ messages }: { messages?: string[] }) {
  return messages?.[0] ? <p className="text-sm text-rose-700">{messages[0]}</p> : null;
}

export function CustomerRegistrationForm({
  initialMessage,
  returnTo,
}: {
  initialMessage?: string;
  returnTo: CustomerRegistrationReturnPath;
}) {
  const [state, formAction] = useActionState(registerCustomerAction, initialState);
  const cart = useLocalCart();
  const loginHref = `/login?returnTo=${encodeURIComponent(returnTo)}`;

  if (state.confirmationRequired) {
    return (
      <div className="space-y-5">
        <Alert className="rounded-2xl border-emerald-200 bg-emerald-50 text-emerald-900">
          <CheckCircle2 className="size-4" />
          <AlertTitle>Confirma tu cuenta</AlertTitle>
          <AlertDescription>
            {state.message} El carrito permanece guardado en este navegador.
          </AlertDescription>
        </Alert>
        <Button asChild className="h-11 w-full rounded-xl">
          <Link href={loginHref}>Volver a iniciar sesión</Link>
        </Button>
        {cart.length ? (
          <Button asChild variant="outline" className="h-11 w-full rounded-xl">
            <Link href="/catalogo/checkout">Continuar sin cuenta</Link>
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="return_to" value={returnTo} />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[10000px] h-px w-px overflow-hidden"
      >
        <Label htmlFor="registration-company-website">Sitio web</Label>
        <input
          id="registration-company-website"
          name="company_website"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      {state.message || initialMessage ? (
        <Alert
          variant="destructive"
          className="rounded-2xl border-rose-200 bg-rose-50 text-rose-800"
        >
          <AlertCircle className="size-4" />
          <AlertTitle>No pudimos completar el registro</AlertTitle>
          <AlertDescription>{state.message ?? initialMessage}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="business-name">Nombre del negocio</Label>
          <div className="relative">
            <Store className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="business-name"
              name="business_name"
              required
              minLength={2}
              maxLength={120}
              autoComplete="organization"
              className="h-11 rounded-xl pl-10"
            />
          </div>
          <FieldMessage messages={state.fieldErrors?.business_name} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="responsible-name">Nombre del responsable</Label>
          <div className="relative">
            <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="responsible-name"
              name="responsible_name"
              required
              minLength={2}
              maxLength={120}
              autoComplete="name"
              className="h-11 rounded-xl pl-10"
            />
          </div>
          <FieldMessage messages={state.fieldErrors?.responsible_name} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="registration-phone">WhatsApp</Label>
        <div className="relative">
          <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="registration-phone"
            name="phone"
            type="tel"
            required
            minLength={7}
            maxLength={25}
            autoComplete="tel"
            className="h-11 rounded-xl pl-10"
          />
        </div>
        <FieldMessage messages={state.fieldErrors?.phone} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="registration-email">Correo</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="registration-email"
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            className="h-11 rounded-xl pl-10"
          />
        </div>
        <FieldMessage messages={state.fieldErrors?.email} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="registration-password">Contraseña</Label>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="registration-password"
              name="password"
              type="password"
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              className="h-11 rounded-xl pl-10"
            />
          </div>
          <FieldMessage messages={state.fieldErrors?.password} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="registration-password-confirmation">Confirmar contraseña</Label>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="registration-password-confirmation"
              name="password_confirmation"
              type="password"
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              className="h-11 rounded-xl pl-10"
            />
          </div>
          <FieldMessage messages={state.fieldErrors?.password_confirmation} />
        </div>
      </div>

      <RegistrationSubmitButton />

      <div className="grid gap-2 pt-1 sm:grid-cols-2">
        <Button asChild variant="outline" className="h-11 rounded-xl">
          <Link href={loginHref}>Ya tengo cuenta · Iniciar sesión</Link>
        </Button>
        {cart.length ? (
          <Button asChild variant="ghost" className="h-11 rounded-xl">
            <Link href="/catalogo/checkout">Continuar sin cuenta</Link>
          </Button>
        ) : (
          <Button asChild variant="ghost" className="h-11 rounded-xl">
            <Link href="/catalogo">Volver al Catálogo</Link>
          </Button>
        )}
      </div>
    </form>
  );
}
