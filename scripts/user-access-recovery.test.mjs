import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const actions = readFileSync("src/lib/admin-users/actions.ts", "utf8");
const interfaceSource = readFileSync(
  "src/components/admin/user-management.tsx",
  "utf8",
);

test("internal users define their own password through a recovery link", () => {
  assert.match(actions, /auth\.admin\.createUser\(\{/);
  assert.doesNotMatch(actions, /temporaryPassword|generateTemporaryPassword|randomBytes/);
  assert.doesNotMatch(actions, /password:\s*[^,]+/);
  assert.match(actions, /resetPasswordForEmail\(\s*parsed\.email/);
  assert.match(actions, /next=\/mi-cuenta\/restablecer/);
});

test("administrative access reset uses the production-safe callback", () => {
  assert.match(actions, /resetPasswordForEmail\(user\.email, \{/);
  assert.match(actions, /redirectTo: await getPasswordResetRedirectUrl\(\)/);
});

test("the user interface never displays or requests a temporary password", () => {
  assert.doesNotMatch(interfaceSource, /temporaryPassword|Contraseña temporal/);
  assert.match(interfaceSource, /Invitar usuario/);
  assert.match(interfaceSource, /definir su propia contraseña/);
});
