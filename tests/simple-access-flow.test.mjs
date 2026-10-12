import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("web and mobile expose a direct, remembered login flow", async () => {
  const [web, mobile] = await Promise.all([read("app/page.tsx"), read("mobile/src/App.tsx")]);
  for (const source of [web, mobile]) {
    assert.match(source, /pontonorte_login_hint/);
    assert.match(source, /reset-password/);
    assert.match(source, /Redefinir senha/);
  }
  assert.doesNotMatch(mobile, /pontonorte_pending_activation/);
});

test("new companies become active immediately with a trial period", async () => {
  const source = await read("supabase/functions/register-company/index.ts");
  assert.match(source, /status:"active"/);
  assert.match(source, /license_status:"active"/);
  assert.match(source, /trial_until/);
  assert.doesNotMatch(source, /activation_token|employee_secrets|pin/i);
});

test("employee creation generates a temporary password without a terminal PIN", async () => {
  const [web, mobile, fn] = await Promise.all([
    read("app/page.tsx"),
    read("mobile/src/App.tsx"),
    read("supabase/functions/manage-user/index.ts"),
  ]);
  assert.match(web, /Senha provisória/);
  assert.match(mobile, /Senha inicial \(opcional\)/);
  assert.match(fn, /temporary_password/);
  assert.doesNotMatch(fn, /employee_secrets/);
});
