import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  customerRegistrationSchema,
  getSafeCustomerReturnPath,
  isValidWhatsApp,
  normalizeRegistrationText,
} from "../src/lib/customer-registration/validation.ts";

const registrationFormSource = readFileSync(
  new URL(
    "../src/components/customer-account/customer-registration-form.tsx",
    import.meta.url,
  ),
  "utf8",
);
const loginSource = readFileSync(
  new URL("../src/components/auth/login-form.tsx", import.meta.url),
  "utf8",
);
const cartSource = readFileSync(
  new URL("../src/hooks/use-local-cart.ts", import.meta.url),
  "utf8",
);
const callbackSource = readFileSync(
  new URL("../src/app/mi-cuenta/auth/callback/route.ts", import.meta.url),
  "utf8",
);

function validRegistration(overrides = {}) {
  return {
    business_name: "Mercado Central",
    responsible_name: "María López",
    phone: "+591 70000000",
    email: "cliente@example.com",
    password: "segura123",
    password_confirmation: "segura123",
    return_to: "/catalogo/checkout",
    company_website: "",
    ...overrides,
  };
}

test("registration normalizes business, responsible and WhatsApp spacing", () => {
  const parsed = customerRegistrationSchema.parse(
    validRegistration({
      business_name: "  Mercado   Central ",
      responsible_name: " María   López ",
      phone: " +591   70000000 ",
    }),
  );

  assert.equal(parsed.business_name, "Mercado Central");
  assert.equal(parsed.responsible_name, "María López");
  assert.equal(parsed.phone, "+591 70000000");
  assert.equal(normalizeRegistrationText(" a   b "), "a b");
});

test("different passwords are rejected", () => {
  const parsed = customerRegistrationSchema.safeParse(
    validRegistration({ password_confirmation: "otra-clave" }),
  );
  assert.equal(parsed.success, false);
  assert.equal(parsed.error?.issues[0]?.path[0], "password_confirmation");
});

test("invalid email and empty WhatsApp are rejected", () => {
  assert.equal(
    customerRegistrationSchema.safeParse(validRegistration({ email: "correo-invalido" }))
      .success,
    false,
  );
  assert.equal(
    customerRegistrationSchema.safeParse(validRegistration({ phone: "   " })).success,
    false,
  );
});

test("WhatsApp requires 7 to 15 digits and rejects symbol-only values", () => {
  for (const phone of ["-------", "+++++++", "()()()", "123", "   "]) {
    assert.equal(
      customerRegistrationSchema.safeParse(validRegistration({ phone })).success,
      false,
    );
  }
  assert.equal(isValidWhatsApp("1234567"), true);
  assert.equal(isValidWhatsApp("123456789012345"), true);
  assert.equal(isValidWhatsApp("1234567890123456"), false);
});

test("WhatsApp accepts normalized business formats", () => {
  for (const phone of [
    "+591 70707070",
    "70707070",
    "(591) 70707070",
    "591-70707070",
  ]) {
    const parsed = customerRegistrationSchema.safeParse(validRegistration({ phone }));
    assert.equal(parsed.success, true, phone);
  }
});

test("password follows the current minimum contract", () => {
  assert.equal(
    customerRegistrationSchema.safeParse(
      validRegistration({ password: "1234567", password_confirmation: "1234567" }),
    ).success,
    false,
  );
  assert.equal(customerRegistrationSchema.safeParse(validRegistration()).success, true);
});

test("password confirmation enforces the same 8 to 72 character bounds", () => {
  assert.equal(
    customerRegistrationSchema.safeParse(
      validRegistration({ password: "12345678", password_confirmation: "1234567" }),
    ).success,
    false,
  );
  const tooLong = "a".repeat(73);
  assert.equal(
    customerRegistrationSchema.safeParse(
      validRegistration({ password: tooLong, password_confirmation: tooLong }),
    ).success,
    false,
  );
});

test("only the three approved internal return paths are accepted", () => {
  assert.equal(getSafeCustomerReturnPath("/mi-cuenta"), "/mi-cuenta");
  assert.equal(getSafeCustomerReturnPath("/catalogo"), "/catalogo");
  assert.equal(getSafeCustomerReturnPath("/catalogo/checkout"), "/catalogo/checkout");
  assert.equal(getSafeCustomerReturnPath("https://example.com"), "/mi-cuenta");
  assert.equal(getSafeCustomerReturnPath("//example.com"), "/mi-cuenta");
  assert.equal(getSafeCustomerReturnPath("\\example.com"), "/mi-cuenta");
  assert.equal(getSafeCustomerReturnPath("/administracion"), "/mi-cuenta");
});

test("registration blocks duplicate submits and never stores passwords", () => {
  assert.match(registrationFormSource, /disabled=\{pending\}/);
  assert.doesNotMatch(
    registrationFormSource,
    /localStorage|sessionStorage|console\.(log|info|debug)|password.*JSON\.stringify/i,
  );
});

test("login exposes registration while preserving the safe return", () => {
  assert.match(loginSource, /\/registro\?returnTo=/);
  assert.match(loginSource, /Crear una cuenta/);
  assert.match(loginSource, /Olvidé mi contraseña/);
});

test("registration callback preserves only the normalized return path on failure", () => {
  assert.match(callbackSource, /getSafeCustomerReturnPath\(requestedNext\)/);
  assert.match(callbackSource, /registrationUrl\.searchParams\.set\("returnTo", next\)/);
  assert.match(callbackSource, /registrationUrl\.searchParams\.set\(\s*"error"/);
  assert.doesNotMatch(callbackSource, /completion\.code[^\n]*searchParams/);
});

test("the canonical cart remains in localStorage and registration never clears it", () => {
  assert.match(cartSource, /insumos-pro:catalog-cart:v1/);
  assert.match(cartSource, /window\.localStorage\.setItem/);
  assert.doesNotMatch(registrationFormSource, /saveLocalCart\(\[\]\)|removeItem/);
});
