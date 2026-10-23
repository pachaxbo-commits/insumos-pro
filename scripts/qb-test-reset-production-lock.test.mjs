import assert from "node:assert/strict";
import test from "node:test";

import { testDataResetEnabled } from "../src/lib/test-data-reset/config.ts";

test("an enabled flag cannot enable the legacy reset on the Production deployment", () => {
  const previous = { ...process.env };
  try {
    process.env.ALLOW_TEST_DATA_RESET = "true";
    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://qa-project.supabase.co";
    process.env.NEXT_PUBLIC_SITE_URL = "https://qa.example.test";
    assert.equal(testDataResetEnabled(), false);
  } finally {
    restoreEnvironment(previous);
  }
});

test("the reset remains disabled outside Production even when its flag is enabled", () => {
  const previous = { ...process.env };
  try {
    process.env.ALLOW_TEST_DATA_RESET = "true";
    process.env.VERCEL_ENV = "preview";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://tekfwbhvqtojpfqusosg.supabase.co";
    process.env.NEXT_PUBLIC_SITE_URL = "https://qa.example.test";
    assert.equal(testDataResetEnabled(), false);
  } finally {
    restoreEnvironment(previous);
  }
});

test("the legacy reset stays disabled in QA because QA uses rollback fixtures", () => {
  const previous = { ...process.env };
  try {
    process.env.ALLOW_TEST_DATA_RESET = "true";
    process.env.VERCEL_ENV = "preview";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    assert.equal(testDataResetEnabled(), false);
  } finally {
    restoreEnvironment(previous);
  }
});

function restoreEnvironment(previous) {
  for (const key of Object.keys(process.env)) {
    if (!(key in previous)) delete process.env[key];
  }
  Object.assign(process.env, previous);
}
