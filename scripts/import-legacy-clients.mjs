import fs from "node:fs/promises";
import process from "node:process";
import { exec } from "node:child_process";
import { promisify } from "node:util";

import { createClient } from "@supabase/supabase-js";

const execAsync = promisify(exec);

function parseEnv(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/))
      .filter(Boolean)
      .map((match) => {
        const value = match[2].replace(/^(['"])(.*)\1$/, "$2");
        return [match[1], value.replaceAll("\\n", "\n")];
      }),
  );
}

function unescapeCopy(value) {
  if (value === "\\N") return null;
  return value
    .replaceAll("\\t", "\t")
    .replaceAll("\\n", "\n")
    .replaceAll("\\r", "\r")
    .replaceAll("\\\\", "\\");
}

function legacyClients(sql) {
  const marker =
    "COPY public.users (id, email, password_digest, name, role, active, phone, address, notes, created_at, updated_at, password_changed) FROM stdin;";
  const start = sql.indexOf(marker);
  if (start < 0) throw new Error("No se encontró public.users en el dump.");
  const rows = sql.slice(start + marker.length).trimStart().split(/\r?\n/);
  const clients = [];
  for (const row of rows) {
    if (row === "\\.") break;
    const fields = row.split("\t").map(unescapeCopy);
    const [legacyId, email, , name, role, active, phone, address] = fields;
    if (
      role !== "client" ||
      active !== "t" ||
      !email?.trim() ||
      !name?.trim()
    ) {
      continue;
    }
    clients.push({
      legacyId,
      email: email.trim().toLowerCase(),
      name: name.trim().replace(/\s+/g, " "),
      phone: phone?.trim() || null,
      address: address?.trim() || "Dirección pendiente de confirmar",
    });
  }
  return clients;
}

async function authUsersByEmail(admin) {
  const users = new Map();
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;
    for (const user of data.users) {
      if (user.email) users.set(user.email.toLowerCase(), user);
    }
    if (data.users.length < 1000) break;
  }
  return users;
}

const [dumpPath, envPath] = process.argv.slice(2);
if (!dumpPath || !envPath) {
  throw new Error(
    "Uso: node scripts/import-legacy-clients.mjs <dump.sql> <env-file>",
  );
}

const sql = await fs.readFile(dumpPath, "utf8");
let url;
let serviceKey;
if (envPath.startsWith("supabase:")) {
  const projectRef = envPath.slice("supabase:".length);
  if (!/^[a-z0-9]{20}$/.test(projectRef)) {
    throw new Error("Referencia de proyecto Supabase inválida.");
  }
  const { stdout } = await execAsync(
    `npx supabase projects api-keys --project-ref ${projectRef} --output json`,
    { maxBuffer: 1024 * 1024 },
  );
  const keys = JSON.parse(stdout);
  serviceKey = keys.find((item) => item.name === "service_role")?.api_key;
  url = `https://${projectRef}.supabase.co`;
} else {
  const env = parseEnv(await fs.readFile(envPath, "utf8"));
  url = env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL;
  serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
}
if (!url || !serviceKey) {
  throw new Error("El archivo de entorno no contiene Supabase service role.");
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const clients = legacyClients(sql);
const [{ data: accounts, error: accountError }, authUsers] = await Promise.all([
  admin.from("customer_accounts").select("id,email"),
  authUsersByEmail(admin),
]);
if (accountError) throw accountError;

const accountsByEmail = new Map(
  (accounts ?? []).map((account) => [account.email.toLowerCase(), account]),
);
const result = { source: clients.length, created: 0, completed: 0, skipped: 0 };

for (const client of clients) {
  let account = accountsByEmail.get(client.email);
  let authUser = authUsers.get(client.email);
  let createdAuth = false;

  if (!account) {
    if (!authUser) {
      const { data, error } = await admin.auth.admin.createUser({
        email: client.email,
        email_confirm: true,
        user_metadata: {
          full_name: client.name,
          account_type: "customer",
          legacy_user_id: client.legacyId,
        },
      });
      if (error || !data.user) throw error ?? new Error("Auth sin usuario.");
      authUser = data.user;
      authUsers.set(client.email, authUser);
      createdAuth = true;
    }

    const { data, error } = await admin
      .from("customer_accounts")
      .insert({
        id: authUser.id,
        email: client.email,
        full_name: client.name,
        business_name: client.name,
        responsible_name: client.name,
        phone: client.phone,
        is_active: true,
      })
      .select("id,email")
      .single();
    if (error) {
      if (createdAuth) await admin.auth.admin.deleteUser(authUser.id);
      throw error;
    }
    account = data;
    accountsByEmail.set(client.email, account);
    result.created += 1;
  } else {
    result.skipped += 1;
  }

  const { count, error: locationCountError } = await admin
    .from("qb_customer_locations")
    .select("id", { count: "exact", head: true })
    .eq("customer_account_id", account.id)
    .eq("is_active", true);
  if (locationCountError) throw locationCountError;
  if (!count) {
    const { error } = await admin.from("qb_customer_locations").insert({
      customer_account_id: account.id,
      label: "Principal",
      address: client.address,
      phone: client.phone,
      is_primary: true,
      is_active: true,
    });
    if (error) throw error;
    result.completed += 1;
  }
}

console.log(JSON.stringify(result));
