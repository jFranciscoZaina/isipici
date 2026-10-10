import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import ts from "typescript"
import jwt from "jsonwebtoken"
import { loader } from "./helpers/load-ts.mjs"
const { PaymentError } = loader()("src/lib/payments/validation.ts")

const secret = "test-owner-secret-with-at-least-32-characters"
const adminSecret = "test-admin-secret-with-at-least-32-characters"
function load(path, mocks, env = {}) {
  const exports = {}
  const source = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  vm.runInNewContext(source, { exports, require: name => {
    if (!(name in mocks)) throw new Error(`Unexpected import: ${name}`)
    return mocks[name]
  }, process: { env }, Buffer, URL, console })
  return exports
}
function database(result) {
  const calls = []
  const query = new Proxy({}, { get: (_, method) => method === "then" ? resolve => resolve(result) : (...args) => {
    calls.push([method, ...args])
    return ["single", "maybeSingle", "order"].includes(method) ? Promise.resolve(result) : query
  } })
  return { calls, from: (...args) => { calls.push(["from", ...args]); return query } }
}
const request = token => ({ cookies: { get: () => token ? { value: token } : undefined } })

test("owner sessions reject absent, invalid, disabled and database errors", async () => {
  const token = jwt.sign({ ownerId: "owner-a" }, secret)
  for (const [tokenValue, result, expected] of [
    [undefined, {}, null], ["invalid", {}, null],
    [token, { data: { id: "owner-a", is_active: false } }, null],
    [token, { error: { code: "connection" } }, null],
    [token, { data: { id: "owner-a", is_active: true } }, "owner-a"],
  ]) {
    const db = database(result)
    const auth = load("src/lib/auth.ts", { "server-only": {}, jsonwebtoken: jwt, "@/lib/supabaseClient": { supabase: db } }, { JWT_SECRET: secret })
    assert.equal(await auth.getSessionOwnerId(request(tokenValue)), expected)
  }
})

test("client mutations and email endpoints deny anonymous and foreign owners before data access", async () => {
  for (const [path, methods] of [
    ["src/app/api/clients/[id]/route.ts", ["PATCH", "DELETE"]],
    ["src/app/api/clients/[id]/emails/route.ts", ["GET"]],
    ["src/app/api/clients/emails/route.ts", ["GET"]],
    ["src/app/api/payments/route.ts", ["GET", "POST"]],
  ]) {
    for (const ownerId of [null, "owner-a"]) {
      const db = database({ data: [] })
      const route = load(path, {
        "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
        "@/lib/auth": { getSessionOwnerId: async () => ownerId, ownedClientColumn: async () => null },
        "@/lib/supabaseClient": { supabase: db }, "@/lib/email": {},
        "@/lib/payments/validation": { PaymentError },
        "@/lib/payments/lifecycle": { lifecycleOperation:async()=>{throw new PaymentError("Cliente no encontrado",404)} },
        "@/lib/payments/service": { registerManualPayment: async () => { throw new PaymentError("Cliente no encontrado",404) } },
      })
      for (const method of methods) {
        const res = await route[method]({ url: "https://example.test/api?clientId=foreign", json: async () => ({ clientId: "foreign", plan: "Plan" }) }, { params: Promise.resolve({ id: "foreign" }) })
        assert.equal(res.status, ownerId ? 404 : 401)
      }
      assert.equal(db.calls.length, 0)
    }
  }
})

test("admin verifies independent signing key, role, issuer, audience and operator", async () => {
  const tokens = [undefined, jwt.sign({ ownerId: "owner-a" }, secret), jwt.sign({ role: "operator" }, adminSecret),
    jwt.sign({ role: "operator" }, adminSecret, { subject: "someone-else", issuer: "isipici", audience: "isipici-admin" }),
    jwt.sign({ role: "operator" }, adminSecret, { subject: "operator@example.test", issuer: "isipici", audience: "isipici-admin" })]
  for (const [index, token] of tokens.entries()) {
    const auth = load("src/lib/admin-auth.ts", {
      "server-only": {}, jsonwebtoken: jwt,
      "next/headers": { cookies: async () => ({ get: () => ({ value: token }) }) },
      "next/navigation": { redirect: () => { throw new Error("login redirect") } },
    }, { ADMIN_EMAIL: "operator@example.test", ADMIN_JWT_SECRET: adminSecret, JWT_SECRET: secret })
    if (index === tokens.length - 1) assert.equal(await auth.requireAdmin(), "operator@example.test")
    else await assert.rejects(auth.requireAdmin(), /login redirect/)
  }
})

test("admin mutations reauthorize direct calls", async () => {
  const actions = load("src/app/admin/actions.ts", {
    "next/headers": {}, "next/navigation": {}, bcryptjs: {}, jsonwebtoken: jwt,
    "@/lib/admin-auth": { requireAdmin: async () => { throw new Error("unauthorized") } },
    "@/lib/owner-registration": {}, "@/lib/supabaseClient": {},
  })
  for (const method of ["addOwner", "setOwnerStatus", "setOwnerCurrency", "logoutAdmin"]) await assert.rejects(actions[method](new FormData()), /unauthorized/)
})

test("authorized client mutations scope both id and owner, including legacy column", async () => {
  for (const column of ["owner_id", "gym_id"]) {
    for (const method of ["PATCH", "DELETE"]) {
      const db = database({ data: { id: "client-a" } })
      const route = load("src/app/api/clients/[id]/route.ts", {
        "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
        "@/lib/auth": { getSessionOwnerId: async () => "owner-a", ownedClientColumn: async () => column },
        "@/lib/payments/validation": {PaymentError},
        "@/lib/payments/lifecycle": {lifecycleOperation:async(owner,id)=>{db.calls.push(["archive",owner,id]);return {ok:true}}},
        "@/lib/supabaseClient": { supabase: db },
      })
      const res = await route[method]({ json: async () => ({ phone: "123" }) }, { params: Promise.resolve({ id: "client-a" }) })
      assert.equal(res.status, 200)
      if (method === "DELETE") {
        assert.deepEqual(db.calls, [["archive","owner-a","client-a"]])
      } else {
        assert.ok(db.calls.some(([name,key,value])=>name === "eq"&&key === column&&value === "owner-a"))
        assert.ok(db.calls.some(([name,key,value])=>name === "eq"&&key === "id"&&value === "client-a"))
      }
    }
  }
})

test("internal login fails closed when persistent throttle denies or is unavailable", async () => {
  for (const result of [{ data: false }, { error: { code: "missing_rpc" } }]) {
    let compared = false
    const actions = load("src/app/admin/actions.ts", {
      "next/headers": {}, "next/navigation": { redirect: path => { throw new Error(path) } },
      bcryptjs: { compare: async () => { compared = true; return true } }, jsonwebtoken: jwt,
      "@/lib/admin-auth": {}, "@/lib/owner-registration": {},
      "@/lib/supabaseClient": { supabase: { rpc: async () => result } },
    }, { ADMIN_EMAIL: "operator@example.test", ADMIN_PASSWORD_HASH: "$2a$12$" + "a".repeat(53), ADMIN_JWT_SECRET: adminSecret, JWT_SECRET: secret })
    const form = new FormData()
    form.set("password", "password")
    await assert.rejects(actions.loginAdmin(form), /error=(limit|config)/)
    assert.equal(compared, false)
  }
})

test("cron endpoints fail closed without configured bearer secret", async () => {
  {
    const route = load("src/lib/emails/reminders.ts", {
      "server-only": {},
      "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
      "@/lib/supabaseClient": {}, "./service": {}, "./installment-reminders": {},
    })
    assert.equal((await route.handleUpcomingReminders({ headers: { get: () => "Bearer undefined" } })).status, 401)
  }
})

test("registration validates credentials, hashes password and PIN, and selects only public fields", async () => {
  const calls = []
  const db = { from: () => {
    const query = {
      select: fields => { calls.push(["select", fields]); return query },
      ilike: () => query,
      maybeSingle: async () => ({ data: null }),
      insert: row => { calls.push(["insert", row]); return query },
      single: async () => ({ data: { id: "owner-a", name: "Business", email: "owner@example.test" } }),
    }
    return query
  } }
  const registration = load("src/lib/owner-registration.ts", { "server-only": {}, "@/lib/supabaseClient": { supabase: db }, bcryptjs: { hash: async value => `hashed:${value}` } })
  for (const input of [null, {}, { name: "Name", email: "invalid", password: "short" }, { name: "Name", email: "owner@example.test", password: "a-long-password", pin: "bad" }]) {
    assert.equal((await registration.createOwner(input)).status, 400)
  }
  assert.equal(calls.length, 0)
  const result = await registration.createOwner({ name: "Business", email: "OWNER@example.test", password: "a-long-password", pin: "1234", is_active: false, default_currency: "AUD" })
  assert.deepEqual(Object.keys(result.data).sort(), ["email", "id", "name"])
  const payload = calls.find(([operation]) => operation === "insert")[1]
  assert.equal(payload.default_currency, "ARS")
  assert.equal(payload.password_hash, "hashed:a-long-password")
  assert.equal(payload.pin_hash, "hashed:1234")
  assert.equal("is_active" in payload, false)
  assert.ok(calls.some(([operation, fields]) => operation === "select" && fields === "id, name, email"))
  calls.length = 0
  await registration.createOwner({ name: "Business", email: "owner@example.test", password: "a-long-password" }, { defaultCurrency: "AUD" })
  assert.equal(calls.find(([operation]) => operation === "insert")[1].default_currency, "AUD")
})
