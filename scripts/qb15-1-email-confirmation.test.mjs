import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getSafeCustomerConfirmationReturnPath,
  getSafeCustomerReturnPathFromRedirect,
} from "../src/lib/customer-registration/validation.ts";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const confirmSource = source("../src/app/mi-cuenta/auth/confirm/route.ts");
const callbackSource = source("../src/app/mi-cuenta/auth/callback/route.ts");
const confirmationSource = source("../src/lib/customer-registration/confirmation.ts");
const accountSource = source("../src/lib/customer-registration/account.ts");
const customerAccountActionsSource = source("../src/lib/customer-account/actions.ts");
const recoveryPageSource = source("../src/app/mi-cuenta/recuperar/page.tsx");
const cartSource = source("../src/hooks/use-local-cart.ts");
const loginPageSource = source("../src/app/login/page.tsx");
const docsSource = source("../docs/QB15_1_EMAIL_CONFIRMATION_TEMPLATE.md");
const smtpDocsSource = source("../docs/QB_SMTP_RESEND_SETUP.md");
const migrationNames = source("../supabase/migrations/20260712091900_qb15_public_customer_registration.sql");

const siteOrigin = "https://qb-insumos.vercel.app";

test("token_hash confirmation accepts only email and recovery types", () => {
  assert.match(confirmSource, /requestedType !== "email" && !isRecovery/);
  assert.doesNotMatch(confirmSource, /"signup"/);
  assert.match(confirmSource, /supabase\.auth\.verifyOtp\(\{/);
  assert.match(confirmSource, /token_hash: tokenHash/);
  assert.match(confirmSource, /type: isRecovery \? "recovery" : "email"/);
});

test("password recovery token_hash works without browser PKCE state", () => {
  assert.match(confirmSource, /requestedType === "recovery"/);
  assert.match(confirmSource, /new URL\("\/mi-cuenta\/restablecer", url\.origin\)/);
  assert.doesNotMatch(confirmSource, /exchangeCodeForSession/);
});

test("invalid, expired or already-used recovery links have a safe retry path", () => {
  assert.match(confirmSource, /\/mi-cuenta\/recuperar\?error=invalid-link/);
  assert.match(callbackSource, /next === "\/mi-cuenta\/restablecer"/);
  assert.match(
    recoveryPageSource,
    /El enlace de recuperación no es válido, ya fue utilizado o venció\. Solicita uno nuevo\./,
  );
});

test("password recovery request remains neutral and uses the production callback", () => {
  assert.match(customerAccountActionsSource, /resetPasswordForEmail\(parsed\.data\.email/);
  assert.match(
    customerAccountActionsSource,
    /Si el correo pertenece a una cuenta, recibiras un enlace de recuperacion\./,
  );
  assert.match(
    customerAccountActionsSource,
    /\/mi-cuenta\/auth\/callback\?next=\/mi-cuenta\/restablecer/,
  );
});

test("successful password update closes the recovery session and returns to login", () => {
  assert.match(customerAccountActionsSource, /updateUser\(\{ password: parsed\.data\.password \}\)/);
  assert.match(customerAccountActionsSource, /signOut\(\{ scope: "local" \}\)/);
  assert.match(customerAccountActionsSource, /redirect\("\/login\?reason=password-updated"\)/);
  assert.match(loginPageSource, /Tu contraseña fue actualizada\. Inicia sesión con tu nueva contraseña\./);
});

test("the SSR client persists the verified session through server cookies", () => {
  assert.match(confirmSource, /createSupabaseServerClient\(\)/);
  assert.match(confirmSource, /await supabase\.auth\.verifyOtp/);
  assert.doesNotMatch(confirmSource, /createSupabaseBrowserClient|service_role/i);
});

test("confirmation obtains the authenticated user and completes only its account", () => {
  assert.match(confirmationSource, /supabase\.auth\.getUser\(\)/);
  assert.match(confirmationSource, /completeOwnCustomerAccount/);
  assert.match(accountSource, /register_own_customer_account/);
  assert.doesNotMatch(confirmationSource, /\.from\("profiles"\)|qb_customer_locations|qb_orders/);
});

test("final redirects never copy token_hash or code", () => {
  assert.doesNotMatch(confirmSource, /searchParams\.set\([^\n]*(token_hash|code)/);
  assert.doesNotMatch(callbackSource, /searchParams\.set\([^\n]*(token_hash|code)/);
  assert.match(confirmSource, /withConfirmationState\(next, "confirmed"\)/);
});

test("legacy code links remain supported with exchangeCodeForSession", () => {
  assert.match(callbackSource, /url\.searchParams\.get\("code"\)/);
  assert.match(callbackSource, /exchangeCodeForSession\(code\)/);
});

test("missing PKCE context has a dedicated confirmed-email result", () => {
  assert.match(callbackSource, /isMissingPkceContext\(error\)/);
  assert.match(callbackSource, /getLoginNoticePath\("email-confirmed", registrationNext\)/);
  assert.match(confirmationSource, /pkce_code_verifier_not_found/);
  assert.match(confirmationSource, /flow_state_not_found/);
  assert.match(confirmationSource, /bad_code_verifier/);
  assert.match(loginPageSource, /Tu correo fue confirmado\. Inicia sesión para continuar\./);
});

test("invalid confirmations and recoverable linking errors use different messages", () => {
  assert.match(
    loginPageSource,
    /El enlace de confirmación no es válido o ya venció\. Solicita uno nuevo\./,
  );
  assert.match(
    loginPageSource,
    /No pudimos completar tu acceso automáticamente\. Inicia sesión para continuar\./,
  );
});

test("approved relative and same-origin absolute returns are accepted", () => {
  assert.equal(
    getSafeCustomerReturnPathFromRedirect("/mi-cuenta", siteOrigin),
    "/mi-cuenta",
  );
  assert.equal(
    getSafeCustomerReturnPathFromRedirect(
      "https://qb-insumos.vercel.app/catalogo/checkout?source=email",
      siteOrigin,
    ),
    "/catalogo/checkout",
  );
  assert.equal(
    getSafeCustomerReturnPathFromRedirect(
      "https://qb-insumos.vercel.app/catalogo",
      siteOrigin,
    ),
    "/catalogo",
  );
});

test("the same-origin legacy callback safely preserves its nested checkout return", () => {
  assert.equal(
    getSafeCustomerConfirmationReturnPath({
      authorizedOrigin: siteOrigin,
      redirectTo:
        "https://qb-insumos.vercel.app/mi-cuenta/auth/callback?registration=1&next=%2Fcatalogo%2Fcheckout",
    }),
    "/catalogo/checkout",
  );
  assert.equal(
    getSafeCustomerConfirmationReturnPath({
      authorizedOrigin: siteOrigin,
      redirectTo:
        "https://qb-insumos.vercel.app/mi-cuenta/auth/callback?registration=1&next=https%3A%2F%2Fevil.example",
    }),
    "/mi-cuenta",
  );
});

test("external, protocol-relative, script and arbitrary returns are rejected", () => {
  for (const unsafe of [
    "https://evil.example/catalogo/checkout",
    "//evil.example/catalogo/checkout",
    "javascript:alert(1)",
    "data:text/html,evil",
    "\\\\evil.example\\checkout",
    "/administracion",
  ]) {
    assert.equal(getSafeCustomerReturnPathFromRedirect(unsafe, siteOrigin), "/mi-cuenta");
  }
});

test("customer account completion remains idempotent and blocks internal users", () => {
  assert.match(accountSource, /code === "created" \|\| code === "already_registered"/);
  assert.match(migrationNames, /internal_user/);
  assert.match(migrationNames, /already_registered/);
});

test("confirmation does not touch the local cart", () => {
  assert.match(cartSource, /insumos-pro:catalog-cart:v1/);
  assert.doesNotMatch(confirmSource + callbackSource + confirmationSource, /localStorage|removeItem|saveLocalCart/);
});

test("confirmation and recovery sources do not log credentials or authentication parameters", () => {
  const authSources =
    confirmSource + callbackSource + confirmationSource + customerAccountActionsSource;
  assert.doesNotMatch(authSources, /console\.(log|info|debug|error)|service_role/i);
  assert.doesNotMatch(authSources, /message:\s*(error|tokenHash|code)\b/);
});

test("documentation contains the future token_hash template and production URLs", () => {
  assert.match(docsSource, /token_hash=\{\{ \.TokenHash \}\}&type=email&redirect_to=\{\{ \.RedirectTo \}\}/);
  assert.match(docsSource, /NEXT_PUBLIC_SITE_URL=https:\/\/qb-insumos\.vercel\.app/);
  assert.match(docsSource, /https:\/\/qb-insumos\.vercel\.app\/mi-cuenta\/auth\/callback/);
  assert.doesNotMatch(docsSource, /https:\/\/qb-insumos\.vercel\.app\/\*\*[^\n]*producci/i);
  assert.match(
    docsSource,
    /comodines amplios[^]*desarrollo\s+local[^]*previews de Vercel/i,
  );
  assert.match(docsSource, /No se debe\s+agregar manualmente un `returnTo`/);
  assert.match(docsSource, /Reenvío de confirmación/);
});

test("SMTP guide documents token_hash recovery and exact production URLs without secrets", () => {
  assert.match(
    smtpDocsSource,
    /token_hash=\{\{ \.TokenHash \}\}&type=recovery/,
  );
  assert.match(smtpDocsSource, /Site URL \| `https:\/\/qb-insumos\.vercel\.app`/);
  assert.match(
    smtpDocsSource,
    /https:\/\/qb-insumos\.vercel\.app\/mi-cuenta\/auth\/callback/,
  );
  assert.doesNotMatch(smtpDocsSource, /epxmrfwtssbcqsytuwhf|wfhvuzigmkgojdoofjib/);
  assert.doesNotMatch(smtpDocsSource, /re_[A-Za-z0-9]{16,}|service_role/);
});

test("QB-15.1 adds no migration or SQL execution path", () => {
  assert.doesNotMatch(confirmSource + callbackSource + confirmationSource, /\.sql|db push|migration/i);
});
