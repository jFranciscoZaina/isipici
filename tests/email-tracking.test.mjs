import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createHmac, createHash } from "node:crypto"
import vm from "node:vm"
import ts from "typescript"
import { Resend } from "resend"
import { testPostgres } from "./helpers/postgres.mjs"
import { loader } from "./helpers/load-ts.mjs"

function load(path, mocks, env = {}) {
  const exports = {}
  const source = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  vm.runInNewContext(source, { exports, require: name => { if (!(name in mocks)) throw new Error(`Unexpected import ${name}`); return mocks[name] }, process: { env }, Buffer, Date, URL, console })
  return exports
}
const json = (body, options) => ({ body, status: options?.status ?? 200 })
const signingKey = Buffer.from("synthetic-webhook-secret-32-bytes!")
const secret = `whsec_${signingKey.toString("base64")}`
const event = { type: "email.delivered", created_at: "2026-10-07T10:00:00Z", data: { email_id: "provider-a", owner_id: "attacker", client_id: "attacker" } }
const payload = JSON.stringify(event)
function headers(body = payload, offset = 0) {
  const id = "msg-test"
  const timestamp = String(Math.floor(Date.now() / 1000) + offset)
  const signature = `v1,${createHmac("sha256", signingKey).update(`${id}.${timestamp}.${body}`).digest("base64")}`
  return new Map([["svix-id", id], ["svix-timestamp", timestamp], ["svix-signature", signature]])
}
function webhook(processEvent) {
  return load("src/app/api/webhooks/resend/route.ts", {
    "next/server": { NextResponse: { json } },
    "@/lib/emails/provider": { getResend: () => new Resend("re_synthetic") },
    "@/lib/emails/events": { processResendEvent: processEvent },
  }, { RESEND_WEBHOOK_SECRET: secret })
}

test("official SDK rejects unsigned, tampered and expired webhooks before persistence", async () => {
  let calls = 0
  const route = webhook(async () => { calls++; return {} })
  for (const request of [
    { headers: new Map(), text: async () => payload },
    { headers: headers(), text: async () => payload + " " },
    { headers: headers(payload, -1000), text: async () => payload },
  ]) assert.equal((await route.POST(request)).status, 401)
  assert.equal(calls, 0)
  assert.equal((await route.POST({ headers: headers(), text: async () => payload })).status, 200)
  assert.equal(calls, 1)
})

test("verified event uses provider identity only; database errors cause retryable response", async () => {
  let args
  const processor = load("src/lib/emails/events.ts", { "server-only": {}, "@/lib/supabaseClient": { supabase: { rpc: async (name, input) => { args = input; return { data: true } } } } })
  const route = webhook(processor.processResendEvent)
  assert.equal((await route.POST({ headers: headers(), text: async () => payload })).status, 200)
  assert.equal(args.p_email_id, "provider-a")
  assert.equal("owner_id" in args, false)
  assert.equal("client_id" in args, false)
  const broken = webhook(async () => { throw new Error("database unavailable") })
  assert.equal((await broken.POST({ headers: headers(), text: async () => payload })).status, 503)
})

test("email history scopes successful queries by owner and client and exposes no diagnostics", async () => {
  for (const path of ["src/app/api/clients/emails/route.ts", "src/app/api/clients/[id]/emails/route.ts"]) {
    const calls = []
    const query = new Proxy({}, { get: (_, method) => (...args) => { calls.push([method, ...args]); return method === "order" ? Promise.resolve({ data: [] }) : query } })
    const route = load(path, {
      "next/server": { NextResponse: { json } },
      "@/lib/auth": { getSessionOwnerId: async () => "owner-a", ownedClientColumn: async () => "owner_id" },
      "@/lib/supabaseClient": { supabase: { from: () => query } },
    })
    // URL es necesaria para la variante de querystring.
    const request = { url: "https://test.invalid/api?clientId=client-a" }
    const response = await route.GET(request, { params: Promise.resolve({ id: "client-a" }) })
    assert.equal(response.status, 200)
    assert.ok(calls.some(([method, key, value]) => method === "eq" && key === "owner_id" && value === "owner-a"))
    assert.ok(calls.some(([method, key, value]) => method === "eq" && key === "client_id" && value === "client-a"))
    const selected = calls.find(([method]) => method === "select")[1]
    assert.equal(selected.includes("error_details"), false)
    assert.equal(selected.includes("recipient_email"), false)
  }
})

test("PostgreSQL migration handles replays, out-of-order states, early events and isolation", async () => {
  const db = testPostgres()
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE public.email_logs (
        id text PRIMARY KEY, owner_id text, client_id text, type text,
        subject text, due_date date, status text CHECK (status IN ('sent','failed')),
        sent_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO public.email_logs(id,owner_id,client_id,type,status) VALUES ('legacy','owner-a','client-a','upcoming_due','sent');
      GRANT ALL ON public.email_logs TO service_role;
    `)
    await db.exec(readFileSync(new URL("../supabase/migrations/20261007_email_delivery_tracking.sql", import.meta.url), "utf8"))
    await db.exec(`INSERT INTO public.email_logs(id,owner_id,client_id,type,status,delivery_status,provider,provider_email_id,sent_at)
      VALUES ('a','owner-a','client-a','payment_receipt','sent','sent','resend','provider-a',null),
             ('b','owner-b','client-b','payment_receipt','sent','sent','resend','provider-b',null);`)
    await db.exec("SET ROLE service_role")
    const record = async (id, provider, type, timestamp) => (await db.query("SELECT public.record_resend_event($1,$2,$3,$4::timestamptz,null) AS inserted", [id, provider, type, timestamp])).rows[0].inserted
    const summary = async id => (await db.query("SELECT * FROM public.email_logs WHERE id=$1", [id])).rows[0]
    assert.equal(await record("delivered", "provider-a", "email.delivered", "2026-10-07T10:01:00Z"), true)
    assert.equal(await record("delivered", "provider-a", "email.delivered", "2026-10-07T10:01:00Z"), false)
    await record("sent-late", "provider-a", "email.sent", "2026-10-07T10:00:00Z")
    assert.equal((await summary("a")).delivery_status, "delivered")
    await record("delayed-late", "provider-a", "email.delivery_delayed", "2026-10-07T10:00:30Z")
    assert.equal((await summary("a")).delivery_status, "delivered")
    await record("click", "provider-a", "email.clicked", "2026-10-07T10:03:00Z")
    await record("open", "provider-a", "email.opened", "2026-10-07T10:02:00Z")
    assert.equal((await summary("a")).delivery_status, "clicked")
    assert.ok((await summary("a")).opened_at)
    await record("bounce", "provider-a", "email.bounced", "2026-10-07T10:04:00Z")
    assert.equal((await summary("a")).delivery_status, "bounced")
    await record("complaint", "provider-a", "email.complained", "2026-10-07T10:05:00Z")
    assert.equal((await summary("a")).delivery_status, "complained")
    assert.equal((await summary("b")).delivery_status, "sent")
    assert.equal((await db.query("SELECT count(*)::int AS total FROM public.email_events")).rows[0].total, 7)
    await record("early", "provider-early", "email.delivered", "2026-10-07T10:01:00Z")
    await db.exec(`INSERT INTO public.email_logs(id,status,provider,provider_email_id,sent_at) VALUES ('early','sent','resend','provider-early',null)`)
    await db.query("SELECT public.reconcile_resend_email($1)", ["provider-early"])
    assert.equal((await summary("early")).delivery_status, "delivered")
    await record("failed", "provider-b", "email.failed", "2026-10-07T10:01:00Z")
    assert.equal((await summary("b")).delivery_status, "failed")
    assert.ok((await summary("b")).failed_at)
    await db.exec("SET ROLE anon")
    await assert.rejects(db.query("SELECT * FROM public.email_events"), /permission denied/)
    await assert.rejects(db.query("SELECT public.reconcile_resend_email('provider-a')"), /permission denied/)
  } finally { await db.close() }
})

test("service persists provider ids, does not throw on failures, and never resends reserved keys", async () => {
  for (const mode of ["success", "failure", "transport", "duplicate", "log-failure"]) {
    let sends = 0
    let update
    const query = new Proxy({}, { get: (_, method) => {
      if (method === "then") return resolve => resolve({})
      return (...args) => {
        if (method === "update") update = args[0]
        if (method === "single") return Promise.resolve(mode === "duplicate" ? { error: { code: "23505" } } : mode === "log-failure" ? { error: { code: "connection" } } : { data: { id: "log-a" } })
        if (method === "maybeSingle") return Promise.resolve({ data: { id: "log-a", provider_email_id: "provider-a", delivery_status: "delivered" } })
        return query
      }
    } })
    const render = () => ({ subject: "Synthetic receipt", html: "<p>Receipt</p>" })
    const service = load("src/lib/emails/service.ts", {
      "server-only": {}, "node:crypto": { createHash },
      "@/lib/auth": { ownedClientColumn: async () => "owner_id" },
      "@/lib/supabaseClient": { supabase: { from: () => query, rpc: async () => ({ data: true }) } },
      "./templates/payment-receipt": { renderPaymentReceipt: render },
      "./templates/upcoming-payment": { renderUpcomingPayment: render },
      "./provider": { getResend: () => ({ emails: { send: async () => {
        sends++
        if (mode === "transport") throw new Error("timeout")
        return mode === "failure" ? { error: { name: "validation_error" } } : { data: { id: "provider-a" } }
      } } }) },
    }, { EMAIL_FROM: "sender@example.test", RESEND_API_KEY: "re_synthetic" })
    const result = await service.sendPaymentReceiptEmail({ ownerId: "owner-a", clientId: "client-a", deduplicationKey: "receipt-a", to: "client@example.test", dueDate: null })
    assert.equal(result.status, { success: "sent", failure: "failed", transport: "pending", duplicate: "already_recorded", "log-failure": "failed" }[mode])
    assert.equal(sends, ["duplicate", "log-failure"].includes(mode) ? 0 : 1)
    if (mode === "success") { assert.equal(result.providerEmailId, "provider-a"); assert.equal(update.provider_email_id, "provider-a") }
    if (mode === "failure") { assert.equal(update.delivery_status, "failed"); assert.ok(update.failed_at) }
    if (mode === "transport") { assert.equal(update.delivery_status, "pending"); assert.equal(update.failed_at, null) }
  }
})

test("payment API preserves the canonical service result when the email fails", async () => {
  const payment = { id: "payment-a" }
  const db = { from: table => {
    const query = new Proxy({}, { get: (_, method) => {
      if (method === "then") return resolve => resolve({})
      return () => method === "single" ? Promise.resolve({ data: table === "payments" ? payment : table === "clients" ? { name: "Client", email: "client@example.test" } : { name: "Business" } }) : query
    } })
    return query
  } }
  const route = load("src/app/api/payments/route.ts", {
    "next/server": { NextResponse: { json } },
    "@/lib/auth": { getSessionOwnerId: async () => "owner-a", ownedClientColumn: async () => "owner_id" },
    "@/lib/supabaseClient": { supabase: db },
    "@/lib/email": { sendPaymentReceiptEmail: async () => { throw new Error("provider unavailable") } },
    "@/lib/payments/validation": loader()("src/lib/payments/validation.ts"),
    "@/lib/payments/service": { registerManualPayment: async () => ({ payment, duplicate: false, receiptStatus: "failed" }) },
  })
  const result = await route.POST({ json: async () => ({ clientId: "client-a", plan: "Service", amount: 100 }) })
  assert.equal(result.status, 201)
  assert.equal(result.body.id, "payment-a")
})

test("templates escape client data, use generic copy and format dates without timezone shifts", () => {
  const format = loader()("src/lib/emails/format.ts")
  const reminder = load("src/lib/emails/templates/upcoming-payment.ts", { "../format": format })
  const receipt = load("src/lib/emails/templates/payment-receipt.ts", { "../format": format, "../../payments/schedule": loader()("src/lib/payments/schedule.ts") })
  const input = { to: "client@example.test", clientName: '<img src=x onerror="alert(1)">', ownerName: "Business", dueDate: "2026-10-07", amount: 100, remainingDebt: 30, plan: "<script>bad</script>" }
  for (const template of [reminder.renderUpcomingPayment(input), receipt.renderPaymentReceipt(input)]) {
    assert.equal(template.html.includes(input.clientName), false)
    assert.equal(template.html.includes("entrenando"), false)
    assert.ok(template.html.includes("&lt;img"))
    assert.ok(template.html.includes("07/10/2026"))
  }
})
