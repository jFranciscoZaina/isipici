import { test } from "node:test"
import assert from "node:assert/strict"
import { loader } from "./helpers/load-ts.mjs"
const owner = "11111111-1111-4111-8111-111111111111"
const client = "22222222-2222-4222-8222-222222222222"
const nextTurn = () => new Promise(resolve => setImmediate(resolve))

// Resolve requests explicitly: validates ordering/concurrency without latency thresholds.
test("subscription reads overlap only after ownership and agenda generation; snapshot is not duplicated", { timeout: 5000 }, async () => {
 for (const status of ["active", "paused"]) {
  const pending = [], calls = []
  let authorized = false
  const db = {
   from(table) {
    assert.equal(authorized, true)
    const query = new Proxy({}, { get: (_, method) => {
     if (method === "then") return resolve => pending.push({ table, resolve })
     return () => query
    } })
    return query
   },
   async rpc(name) { calls.push(name); return { error: null } },
  }
  const service = loader({ "server-only": {}, "@/lib/supabaseClient": { supabase: { ...db, rpc: db.rpc ?? (async()=>({error:{code:"PGRST202"}})) } }, "@/lib/auth": {
   ownedClientColumn: async () => { authorized = true; return "owner_id" },
  } })("src/lib/payments/lifecycle.ts")
  const result = service.getSubscriptionState(owner, client)
  await nextTurn()
  assert.deepEqual(pending.map(q => q.table).sort(), ["clients", "owners"])
  for (const q of pending.splice(0)) q.resolve({ data: q.table === "owners" ? { id: owner } : { archived_at: null, legacy_debt_amount: 10 }, error: null })
  await nextTurn()
  assert.deepEqual(calls, ["ensure_recurring_installments_through"])
  assert.deepEqual(pending.map(q => q.table).sort(), ["payments", "recurring_agreements", "recurring_installments"])
  for (const q of pending.splice(0)) q.resolve({ data: q.table === "recurring_agreements" ? [{ id: "agreement", status, installments_enabled: true }] : q.table === "payments" ? [{ id: "legacy", debt: 10 }] : [{ id: "installment", status: "open", due_date: "2020-01-01", amount_due: 100, payments: [{ amount: 60, discount: 10 }] }], error: null })
  const state = await result
  assert.equal(state.installments[0].remaining, 30)
  assert.equal(state.installments[0].overdue, true)
  assert.equal(calls.filter(name => name === "refresh_installment_snapshot").length, status === "active" ? 0 : 1)
 }
})

test("dashboard summaries preserve unordered histories, owner currency and due debt while queries limit archive/obligations", async () => {
 const now = new Date(), calls = []
 const payment = (id, amount, currency, payment_type, created_at, plan) => ({ id, amount, currency, payment_type, created_at, plan })
 const rows = [{ id: client, name: "Client", archived_at: null, legacy_debt_amount: 5, recurring_agreements: [{ status: "active" }], payments: [
  payment("old", 50, "ARS", "recurring", "2020-01-01", "Old"),
  payment("one", 20, "ARS", "one_off", now.toISOString(), "Extra"),
  payment("foreign", 999, "AUD", "one_off", now.toISOString(), "Extra"),
  payment("recurring", 30, "ARS", "recurring", new Date(now.getTime() - 1000).toISOString(), "Current"),
 ], recurring_installments: [
  { amount_due: 100, status: "open", due_date: "2020-01-01", payments: [{ amount: 60, discount: 10 }] },
  { amount_due: 1000, status: "open", due_date: "9999-12-31", payments: [] },
  { amount_due: 1000, status: "paid", due_date: "2020-01-01", payments: [] },
 ] }]
 const db = { from(table) {
  const q = new Proxy({}, { get: (_, method) => method === "then" ? resolve => resolve({ data: rows, error: null }) : (...args) => {
   calls.push([table, method, ...args])
   return method === "single" ? Promise.resolve({ data: { default_currency: "ARS" }, error: null }) : q
  } })
  return q
 } }
 const route = loader({ "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } }, "@/lib/auth": { getSessionOwnerId: async () => owner }, "@/lib/supabaseClient": { supabase: { ...db, rpc: db.rpc ?? (async()=>({error:{code:"PGRST202"}})) } } })("src/app/api/clients/route.ts")
 const result = await route.GET({ nextUrl: new URL("https://test/api/clients") })
 assert.equal(result.status, 200)
 assert.equal(result.body[0].currentPlan, "Current")
 assert.equal(result.body[0].totalPaidThisMonth, 50)
 assert.equal(result.body[0].currentDebt, 35)
 assert.equal(result.body[0].hasPayments, true)
 assert.ok(calls.some(c => c[1] === "eq" && c[2] === "recurring_installments.status" && c[3] === "open"))
 assert.ok(calls.some(c => c[1] === "lte" && c[2] === "recurring_installments.due_date"))
 assert.ok(calls.some(c => c[1] === "eq" && c[2] === "recurring_installments.payments.owner_id" && c[3] === owner))
 assert.ok(calls.some(c => c[1] === "is" && c[2] === "archived_at" && c[3] === null))
})

test("reminder batch reuses owner reads and refreshes historical agreements once per client", async () => {
 const ownerReads = [], snapshots = []
 const agreements = [1, 2, 3].map(id => ({ id: String(id), owner_id: owner, client_id: client, status: "cancelled", installments_enabled: true }))
 const db = {
  from(table) {
   if (table === "owners") ownerReads.push(owner)
   const data = table === "recurring_agreements" ? agreements : table === "owners" ? { id: owner, name: "Owner", default_currency: "ARS" } : { id: client, name: "Client", archived_at: null }
   const q = new Proxy({}, { get: (_, method) => method === "then" ? resolve => resolve({ data, error: null }) : () => q })
   return q
  },
  async rpc(name) { snapshots.push(name); return { error: null } },
 }
 const service = loader({ "server-only": {}, "@/lib/supabaseClient": { supabase: { ...db, rpc: db.rpc ?? (async()=>({error:{code:"PGRST202"}})) } }, "@/lib/auth": { ownedClientColumn: async () => "owner_id" }, "./service": {} })("src/lib/emails/installment-reminders.ts")
 assert.equal((await service.sendInstallmentReminders("2026-11-10")).length, 0)
 assert.equal(ownerReads.length, 1)
 assert.deepEqual(snapshots, ["refresh_installment_snapshot"])
})
