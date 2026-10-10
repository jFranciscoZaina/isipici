import { test } from "node:test"
import assert from "node:assert/strict"
import { loader } from "./helpers/load-ts.mjs"
const owner = "11111111-1111-4111-8111-111111111111"
const client = "22222222-2222-4222-8222-222222222222"
const account = "33333333-3333-4333-8333-333333333333"
const { parsePayment, PaymentError } = loader()("src/lib/payments/validation.ts")
const legacy = { clientId: client, plan: "Starter", amount: "5000", periodFrom: "2026-10-01", periodTo: "2026-10-31" }

test("legacy manual and recurring payments retain ARS defaults without invented metadata", () => {
  const p = parsePayment(legacy)
  assert.equal(p.provider, "manual"); assert.equal(p.paymentType, "recurring"); assert.equal(p.currency, "ARS")
  assert.equal(p.amount, 5000); assert.equal(p.debt, 0); assert.equal(p.concept, null); assert.equal(p.receiptNote, null)
})
test("one-off payment needs no plan, period or recurring agreement and carries its context", () => {
  const p = parsePayment({ clientId: client, paymentType: "one_off", amount: 50000, concept: "Cena de fin de año", serviceDate: "2026-11-07", receiptNote: "Mesa para dos" })
  assert.equal(p.recurringAgreementId, null); assert.equal(p.periodTo, null); assert.equal(p.debt, null)
  assert.equal(p.concept, "Cena de fin de año"); assert.equal(p.serviceDate, "2026-11-07"); assert.equal(p.receiptNote, "Mesa para dos"); assert.equal(p.currency, "ARS")
})
test("server rejects invalid metadata, dates, amounts, currencies and browser provider identifiers", () => {
  for (const changed of [{ paymentType: "event" }, { provider: "other" }, { provider: "stripe" }, { currency: "USD" },
    { receiptNote: "x".repeat(1001) }, { receiptNote: "bad\u0000note" }, { concept: "x".repeat(201) },
    { serviceDate: "2026-02-30" }, { serviceDate: "07/11/2026" }, { amount: Infinity }, { amount: -1 }, { amount: 1.001 }, { amount: true },
    { providerPaymentId: "browser-supplied" }, { providerAccountId: account }, { ownerId: owner }, { periodFrom: "2027-01-01" }]) {
    assert.throws(() => parsePayment({ ...legacy, ...changed }), PaymentError)
  }
  assert.equal(parsePayment({ ...legacy, paymentType: "one_off" }).nextPaymentDate,null)
  assert.throws(() => parsePayment({ ...legacy, clientId: "invalid" }), PaymentError)
  assert.throws(() => parsePayment({ ...legacy, recurringAgreementId: "invalid" }), PaymentError)
})
test("trusted provider input still requires a known provider and internal account", () => {
  assert.throws(() => parsePayment(legacy, "provider"), PaymentError)
  const p = parsePayment({ ...legacy, provider: "stripe", providerPaymentId: "charge-1", providerAccountId: account }, "provider")
  assert.equal(p.provider, "stripe"); assert.equal(p.providerPaymentId, "charge-1")
})
function service({ owned = true, rpcError = null, duplicate = false, emailFails = false, ownerCurrency = "ARS" } = {}) {
  const calls = [], emails = []
  const db = { rpc: async (name, args) => {
    calls.push([name, args])
    const p = args.p_input
    return { error: rpcError, data: { payment: {
      id: "payment-1", owner_id: owner, client_id: p.clientId, amount: p.amount, plan: p.plan, currency: p.currency,
      payment_type: p.paymentType, concept: p.concept, service_date: p.serviceDate, receipt_note: p.receiptNote, created_at: "2026-10-10T12:00:00Z", debt: p.debt ?? 0, period_from: p.periodFrom, period_to: p.periodTo, next_payment_date: p.nextPaymentDate,
    }, duplicate } }
  }, from: table => {
    const q = new Proxy({}, { get: (_, method) => (...args) => {
      calls.push([table, method, ...args])
      return method === "single" ? Promise.resolve({ data: table === "clients" ? { name: "Client", email: "client@example.test" } : { name: "Owner", default_currency: ownerCurrency } }) : q
    } }); return q
  } }
  const load = loader({ "server-only": {}, "@/lib/supabaseClient": { supabase: db }, "@/lib/auth": { ownedClientColumn: async () => owned ? "gym_id" : null },
    "@/lib/email": { sendPaymentReceiptEmail: async input => { emails.push(input); if (emailFails) throw Error("unavailable"); return { status: "sent" } } } })
  return { ...load("src/lib/payments/service.ts"), calls, emails, load }
}
test("central service passes all payment metadata and scopes receipt fetches to the owner", async () => {
  const s = service({ ownerCurrency: "AUD" })
  const result = await s.registerManualPayment(owner, { clientId: client, paymentType: "one_off", amount: 42, concept: "Dinner", serviceDate: "2026-11-07", receiptNote: "Table 4" })
  assert.equal(result.payment.concept, "Dinner"); assert.equal(result.payment.service_date, "2026-11-07"); assert.equal(result.payment.receipt_note, "Table 4")
  assert.equal(s.emails[0].currency, "AUD"); assert.equal(s.emails[0].receiptNote, "Table 4")
  assert.ok(s.calls.some(c => c[0] === "clients" && c[1] === "eq" && c[2] === "gym_id" && c[3] === owner))
})
test("foreign owners never call the canonical RPC", async () => {
  const s = service({ owned: false })
  await assert.rejects(s.registerManualPayment(owner, legacy), e => e.status === 404)
  assert.equal(s.calls.length, 0)
})
test("agreement ownership and currency conflicts fail closed with safe API errors", async () => {
  for (const [message, status] of [["PAYMENT_AGREEMENT_DENIED",404], ["PAYMENT_ACCOUNT_DENIED",404], ["PAYMENT_CURRENCY_CONFLICT",409], ["PAYMENT_ID_CONFLICT",409]]) {
    await assert.rejects(service({ rpcError: { message } }).registerManualPayment(owner, legacy), e => e.status === status)
  }
})
test("email failure never undoes a confirmed payment", async () => {
  const s = service({ emailFails: true })
  const result = await s.registerManualPayment(owner, legacy)
  assert.equal(result.payment.id, "payment-1"); assert.equal(result.receiptStatus, "failed")
})
test("provider replay uses the same canonical id and receipt deduplication key", async () => {
  const s = service({ duplicate: true })
  const input = { ...legacy, provider: "mercadopago", providerAccountId: account, providerPaymentId: "mp-1" }
  const result = await s.registerConfirmedProviderPayment(owner, input, "paid")
  assert.equal(result.duplicate, true); assert.equal(result.payment.id, "payment-1")
  assert.equal(s.emails[0].deduplicationKey, `payment-receipt:${owner}:payment-1`)
  assert.throws(() => s.registerConfirmedProviderPayment(owner, input, "pending"), /Solo pagos confirmados/)
  assert.throws(() => s.registerConfirmedProviderPayment(owner, input, "failed"), /Solo pagos confirmados/)
})
test("API preserves manual response and rechecks authentication; browser IDs are rejected", async () => {
  const s = service({ emailFails: true })
  const route = loader({ "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    "@/lib/supabaseClient": {}, "@/lib/auth": { getSessionOwnerId: async () => owner }, "@/lib/payments/service": s,
    "@/lib/payments/validation": s.load("src/lib/payments/validation.ts") })("src/app/api/payments/route.ts")
  const result = await route.POST({ json: async () => legacy })
  assert.equal(result.status, 201); assert.equal(result.body.id, "payment-1"); assert.equal(result.body.receipt_status, "failed")
  assert.equal((await route.POST({ json: async () => ({ ...legacy, provider: "stripe" }) })).status,400)
})
test("receipt uses payment currency, escapes notes and omits empty context sections", () => {
  const load = loader()
  const { renderPaymentReceipt } = load("src/lib/emails/templates/payment-receipt.ts")
  const base = { to: "client@example.test", clientName: "Client", ownerName: "Business", amount: 50, dueDate: null }
  const receipt = renderPaymentReceipt({ ...base, currency: "AUD", concept: "Dinner", serviceDate: "2026-11-07", receiptNote: '<script>alert(1)</script>\nTable 4' })
  assert.ok(receipt.html.includes("AUD")); assert.ok(receipt.html.includes("Dinner")); assert.ok(receipt.html.includes("07/11/2026"))
  assert.ok(receipt.html.includes("&lt;script&gt;")); assert.equal(receipt.html.includes("<script>"), false)
  assert.ok(receipt.html.includes("<br />Table 4")); assert.equal(receipt.html.includes("Vence el"), false)
  const empty = renderPaymentReceipt(base).html
  assert.equal(empty.includes("Nota del comprobante"),false); assert.equal(empty.includes("Fecha del servicio"),false)
  assert.equal(empty.includes("i.postimg.cc"),false)
})

 test("manual currency comes from the authenticated owner; browser input fails before persistence", async () => {
  for (const currency of ["ARS", "AUD"]) {
    const s = service({ ownerCurrency: currency })
    const result = await s.registerManualPayment(owner, legacy)
    assert.equal(result.payment.currency,currency)
    assert.equal(s.emails[0].currency,currency)
    assert.equal(s.emails[0].paymentDate,"2026-10-10T12:00:00Z")
    const before=s.calls.length
    await assert.rejects(s.registerManualPayment(owner,{...legacy,currency}),e=>e.status===400)
    assert.equal(s.calls.length,before)
  }
  await assert.rejects(service({ownerCurrency:"AUD"}).registerConfirmedProviderPayment(owner,{...legacy,provider:"stripe",providerAccountId:account,providerPaymentId:"paid-1",currency:"ARS"},"paid"), e=>e.status===409)
 })
 test("one-off accepts its own balance and rejects recurrence metadata", () => {
  const base={clientId:client,paymentType:"one_off",concept:"Dinner",amount:50,periodFrom:"2026-11-07"}
  for(const extra of [{frequency:"weekly",anchorDate:"2026-10-14"},{recurringAgreementId:account}]) assert.throws(()=>parsePayment({...base,...extra}),PaymentError)
  assert.equal(parsePayment({...base,debt:20}).debt,20)
  assert.throws(()=>parsePayment({...base,debt:-1}),PaymentError)
  assert.equal(parsePayment({...base,serviceDate:"2026-11-07"}).serviceDate,"2026-11-07")
 })
 test("receipt separates payment date and service date and suppresses recurring context for one-off", () => {
  const render=loader()("src/lib/emails/templates/payment-receipt.ts").renderPaymentReceipt
  const base={to:"client@example.test",clientName:"Client",ownerName:"Business",amount:50,currency:"AUD",concept:"<Dinner>",paymentDate:"2026-10-10T12:00:00Z",dueDate:"2026-11-15",remainingDebt:20}
  const unique=render({...base,paymentType:"one_off",serviceDate:"2026-11-07"}).html
  assert.ok(unique.includes("10/10/2026"));assert.ok(unique.includes("07/11/2026"));assert.ok(unique.includes("&lt;Dinner&gt;"));assert.ok(unique.includes("AUD"))
  assert.ok(unique.includes("Saldo pendiente:"));assert.equal(unique.includes("Vence el"),false);assert.equal(unique.includes("15/11/2026"),false)
  assert.ok(render({...base,paymentType:"recurring"}).html.includes("15/11/2026"))
 })

test("shared calendar single mode replaces the date; range mode still selects from/to and keeps markers", () => {
  const createElement=(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)})
  const Calendar=loader({react:{default:{createElement},useEffect:()=>{},useMemo:fn=>fn(),useState:initial=>[typeof initial==="function"?initial():initial,()=>{}]}})("src/app/dashboard/components/RangeCalendar.tsx").default
  let value={from:new Date(2026,9,1)}
  const render=mode=>Calendar({value,selectionMode:mode,numberOfMonths:1,onChange:next=>{value=next},markers:{"2026-10-15":"paid"}})
  const find=(tree,day)=> {
    if(!tree||typeof tree!=="object")return null
    if(tree.type==="button"&&tree.children.some(c=>c?.type==="span"&&c.children.includes(day)))return tree
    for(const c of tree.children??[]){const match=find(c,day);if(match)return match}
    return null
  }
  find(render("single"),10).props.onClick()
  assert.equal(value.from.getDate(),10);assert.equal(value.to,undefined)
  const day15=find(render("single"),15)
  assert.ok(day15.children.some(c=>c?.type==="span"&&c.props.className?.includes("bg-[var(--status-paid)]")))
  day15.props.onClick()
  assert.equal(value.from.getDate(),15);assert.equal(value.to,undefined)
  value={}
  // Seed the visible month without selecting a day.
  const empty=Calendar({value:{from:new Date(2026,9,1),to:new Date(2026,9,2)},numberOfMonths:1,onChange:next=>{value=next}})
  find(empty,10).props.onClick()
  find(render("range"),15).props.onClick()
  assert.equal(value.from.getDate(),10);assert.equal(value.to.getDate(),15)
})


test("calendar previews recurring dates in dark gray without selecting them", () => {
  const createElement=(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)})
  const Calendar=loader({react:{default:{createElement},useEffect:()=>{},useMemo:fn=>fn(),useState:initial=>[typeof initial==="function"?initial():initial,()=>{}]}})("src/app/dashboard/components/RangeCalendar.tsx").default
  const collect=tree=>!tree||typeof tree!=="object"?[]:[...(tree.type==="button"&&tree.props.title==="Próximo cobro recurrente"?[tree]:[]),...(tree.children??[]).flatMap(collect)]
  for(const [frequency,date,expected] of [["weekly",new Date(2026,9,14),[21,28]],["biweekly",new Date(2026,9,14),[28]],["monthly",new Date(2026,0,31),[28]]]) {
    const tree=Calendar({value:{from:date},selectionMode:"single",numberOfMonths:frequency==="monthly"?2:1,onChange:()=>{},recurrence:{frequency,anchorDate:frequency==="monthly"?"2026-01-31":"2026-10-14"}})
    const upcoming=collect(tree)
    assert.deepEqual(upcoming.map(button=>button.children[0].children[0]),expected)
    assert.ok(upcoming.every(button=>button.props.className.includes("bg-black")&&!button.props["aria-pressed"]))
    assert.equal(collect(Calendar({value:{from:date},selectionMode:"range",numberOfMonths:2,onChange:()=>{},recurrence:{frequency,anchorDate:"2026-01-31"}})).length,0)
  }
})

test('one-off requires a selected date and accepts a day or range',()=>{
 const base={clientId:client,paymentType:'one_off',concept:'Event',amount:50};
 assert.throws(()=>parsePayment(base),/Seleccioná una fecha/);
 assert.throws(()=>parsePayment({...base,periodFrom:'',periodTo:''}),/Seleccioná una fecha/);
 assert.equal(parsePayment({...base,periodFrom:'2026-11-07'}).periodTo,'2026-11-07');
 assert.equal(parsePayment({...base,periodFrom:'2026-11-07',periodTo:'2026-11-09'}).periodTo,'2026-11-09');
});
