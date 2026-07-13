"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, LoaderCircle, LockKeyhole, Mail } from "lucide-react";

import { loginAction, type LoginActionState } from "@/lib/auth/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: LoginActionState = {
  success: false,
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="h-11 w-full rounded-xl" disabled={pending}>
      {pending ? (
        <>
          <LoaderCircle className="size-4 animate-spin" />
          Ingresando...
        </>
      ) : (
        "Iniciar sesión"
      )}
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-5">
      {state.message ? (
        <Alert
          variant="destructive"
          className="rounded-2xl border-rose-200 bg-rose-50 text-rose-800"
        >
          <AlertCircle className="size-4" />
          <AlertTitle>Acceso no disponible</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="email">Correo</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="correo@empresa.com"
            autoComplete="email"
            className="h-11 rounded-xl pl-10"
          />
        </div>
        {state.fieldErrors?.email?.length ? (
          <p className="text-sm text-rose-700">{state.fieldErrors.email[0]}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Contrasena</Label>
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="Tu contrasena"
            autoComplete="current-password"
            className="h-11 rounded-xl pl-10"
          />
        </div>
        {state.fieldErrors?.password?.length ? (
          <p className="text-sm text-rose-700">{state.fieldErrors.password[0]}</p>
        ) : null}
      </div>

      <SubmitButton />
    </form>
  );
}
