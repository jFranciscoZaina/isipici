import { test } from "node:test"
import assert from "node:assert/strict"
import { loader } from "./helpers/load-ts.mjs"
const owner="11111111-1111-4111-8111-111111111111",client="22222222-2222-4222-8222-222222222222"
const env={EMAIL_FROM:"ISIPICI <sender@example.test>",RESEND_API_KEY:"synthetic-test-key",CRON_SECRET:"synthetic-cron"}
const response={json:(body,options)=>({body,status:options?.status??200,headers:options?.headers})}

test("payment API responds with persisted queue state before provider work and survives scheduler errors",async()=>{
 for(const schedulerFails of [false,true]) {
  const callbacks=[],sent=[]
  const route=loader({"next/server":{NextResponse:response,after:fn=>{if(schedulerFails)throw new Error("scheduler unavailable");callbacks.push(fn)}},"@/lib/supabaseClient":{},"@/lib/auth":{getSessionOwnerId:async()=>owner},"@/lib/payments/service":{registerManualPayment:async(_owner,_input,options)=>{
   assert.equal(options.queueReceipt,true);return {payment:{id:"payment"},duplicate:false,receiptStatus:"queued",receiptJobId:"job"}
  }},"@/lib/emails/dispatch":{dispatchEmailJob:async(...args)=>sent.push(args)}})("src/app/api/payments/route.ts")
  const result=await route.POST({json:async()=>({})})
  assert.equal(result.status,201);assert.equal(result.body.receipt_status,"queued");assert.equal(result.body.receiptJobId,undefined);assert.equal(sent.length,0)
  if(!schedulerFails){await callbacks[0]();assert.deepEqual(sent,[["job",owner,true]])}
 }
})

test("enqueue persists frozen provider request and only treats missing RPC as legacy schema",async()=>{
 for(const code of [null,"PGRST202","42501","connection"]) {
  let input
  const dispatch=loader({"server-only":{},"node:timers/promises":{setTimeout:async()=>{}},"@/lib/supabaseClient":{supabase:{rpc:async(name,args)=>{assert.equal(name,"enqueue_payment_receipt");input=args;return code?{error:{code}}:{data:{id:"job",state:"queued"}}}}},"./provider":{}} ,env)("src/lib/emails/dispatch.ts")
  const result=await dispatch.enqueuePaymentReceiptEmail({ownerId:owner,clientId:client,deduplicationKey:"ignored-server-derives-key",to:"client@example.test",clientName:"<Client>",ownerName:"Owner",amount:20,dueDate:null},"payment")
  assert.equal(input.p_owner,owner);assert.equal(input.p_payment,"payment");assert.equal(input.p_payload.from,env.EMAIL_FROM);assert.ok(input.p_payload.html.includes("&lt;Client&gt;"));assert.equal(JSON.stringify(input).includes(env.RESEND_API_KEY),false)
  assert.equal(result.status,code?"failed":"queued");assert.equal(Boolean(result.legacySchema),code==="PGRST202")
 }
})

test("worker sends only leased jobs, preserves idempotency and records uncertain transport for retry",async()=>{
 for(const mode of ["empty","sent","transport","validation","logging-failure"]) {
  const calls=[],sends=[]
  const payload={from:env.EMAIL_FROM,to:"client@example.test",subject:"Frozen subject",html:"<p>Frozen template</p>"}
  const dispatch=loader({"server-only":{},"node:timers/promises":{setTimeout:async()=>{}},"@/lib/supabaseClient":{supabase:{rpc:async(name,args)=>{
   calls.push([name,args])
   if(name==="claim_email_dispatch")return {data:mode==="empty"?[]:[{id:"job",owner_id:owner,deduplication_key:"key",dispatch_token:"lease",dispatch_payload:payload}]}
   if(name==="finish_email_dispatch")return mode==="logging-failure"?{error:{code:"connection"}}:{data:true}
   return {data:true}
  }}},"./provider":{getResend:()=>({emails:{send:async(body,options)=>{
   sends.push([body,options.idempotencyKey]);assert.ok(options.signal instanceof AbortSignal)
   if(mode==="transport")throw new Error("timeout")
   if(mode==="validation")return {error:{name:"validation_error"}}
   return {data:{id:"provider-id"}}
  }}})}} ,env)("src/lib/emails/dispatch.ts")
  const status=await dispatch.dispatchEmailJob("job",owner)
  assert.equal(status,{empty:"empty",sent:"sent",transport:"pending",validation:"failed","logging-failure":"pending"}[mode])
  if(mode==="empty")assert.equal(sends.length,0)
  else {assert.deepEqual(sends[0],[payload,"isipici/key"]);const finish=calls.find(([name])=>name==="finish_email_dispatch")[1];assert.equal(finish.p_token,"lease");if(mode==="transport")assert.equal(finish.p_retry,true);if(mode==="validation")assert.equal(finish.p_retry,false)}
 }
})

test("dispatch cron rejects missing bearer before queue access and bounds recovery work",async()=>{
 let calls=0
 const mocks={"next/server":{NextResponse:response},"@/lib/emails/dispatch":{drainEmailQueue:async()=>{calls++;return {processed:0}}}}
 const route=loader(mocks,env)("src/app/api/emails/dispatch/route.ts")
 assert.equal((await route.GET({headers:{get:()=>null}})).status,401);assert.equal(calls,0)
 assert.equal((await route.GET({headers:{get:()=>`Bearer ${env.CRON_SECRET}`}})).status,200);assert.equal(calls,1)
 let claims=0
 const worker=loader({"server-only":{},"node:timers/promises":{setTimeout:async()=>{}},"./provider":{getResend:()=>({emails:{send:async()=>({data:{id:"provider"}})}})},"@/lib/supabaseClient":{supabase:{rpc:async(name)=>name==="unqueued_payment_receipts"?{data:[]}:name==="claim_email_dispatch"?(claims++,{data:[{id:"job",dispatch_payload:{},deduplication_key:"key",dispatch_token:"token"}]}):{data:true}}}},env)("src/lib/emails/dispatch.ts")
 assert.equal((await worker.drainEmailQueue()).processed,3);assert.equal(claims,3)
})

test("summary API never queries historical relationships once RPC is installed; errors fail closed",async()=>{
 for(const fails of [false,true]) {
  const db={from:table=>{assert.equal(table,"owners");const q=new Proxy({},{get:(_,method)=>()=>method==="single"?Promise.resolve({data:{default_currency:"ARS"}}):q});return q},rpc:async(name,args)=>{
   assert.equal(name,"dashboard_client_summary");assert.equal(args.p_owner,owner)
   return fails?{error:{code:"42501"}}:{data:{currency:"ARS",clients:[{id:client,name:"Client",archived_at:null,current_debt:0,legacy_debt_amount:5,installment_debt:30,total_paid_this_month:80,last_payment:{id:"one",created_at:new Date().toISOString()},last_recurring:{id:"recurring",plan:"Monthly",created_at:new Date().toISOString()},has_agreements:true,has_active_agreement:false}]}}
  }}
  const route=loader({"next/server":{NextResponse:response},"@/lib/auth":{getSessionOwnerId:async()=>owner},"@/lib/supabaseClient":{supabase:db}})("src/app/api/clients/route.ts")
  const result=await route.GET({nextUrl:new URL("https://test/api/clients")})
  assert.equal(result.status,fails?500:200)
  if(!fails){assert.equal(result.body[0].currentDebt,35);assert.equal(result.body[0].totalPaidThisMonth,80);assert.equal(result.body[0].currentPlan,"Monthly");assert.equal(result.body[0].hasPayments,true);assert.equal(result.body[0].nextDue,null)}
 }
})

test("queued payment service does not call synchronous email transport and queue failures preserve the payment",async()=>{
 for(const fail of [false,true]) {
  let registrations=0,sends=0
  const payment={id:"33333333-3333-4333-8333-333333333333",owner_id:owner,client_id:client,amount:20,currency:"ARS",provider:"manual",payment_type:"one_off",concept:"Dinner",created_at:new Date().toISOString()}
  const db={from:table=>{const q=new Proxy({},{get:(_,method)=>()=>method==="single"?Promise.resolve({data:table==="owners"?{name:"Owner",default_currency:"ARS"}:{name:"Client",email:"client@example.test"}}):q});return q},rpc:async()=>{registrations++;return {data:{payment,duplicate:false}}}}
  const service=loader({"server-only":{},"@/lib/auth":{ownedClientColumn:async()=>"owner_id"},"@/lib/supabaseClient":{supabase:db},"@/lib/email":{
   enqueuePaymentReceiptEmail:async(input,id)=>{assert.equal(id,payment.id);assert.equal(input.ownerId,owner);if(fail)throw new Error("queue unavailable");return {status:"queued",jobId:"job"}},
   sendPaymentReceiptEmail:async()=>{sends++;throw new Error("must not run")},
  }})("src/lib/payments/service.ts")
  const result=await service.registerManualPayment(owner,{clientId:client,amount:20,paymentType:"one_off",concept:"Dinner",periodFrom:"2026-11-07"},{queueReceipt:true})
  assert.equal(registrations,1);assert.equal(sends,0);assert.equal(result.payment.id,payment.id);assert.equal(result.receiptStatus,fail?"failed":"queued")
 }
})

test("post-response retry is bounded and reuses the identical provider payload and key",async()=>{
 let sends=0,claims=0
 const delays=[],requests=[]
 const payload={from:env.EMAIL_FROM,to:"client@example.test",subject:"Original",html:"<p>Original</p>"}
 const db = { rpc: async (name) => name === "claim_email_dispatch"
  ? { data: [{ id: "job", dispatch_token: String(++claims), deduplication_key: "same-key", dispatch_payload: payload }] }
  : { data: true } }
 const provider = { getResend: () => ({ emails: { send: async (body, options) => {
  requests.push([body, options.idempotencyKey])
  if (++sends === 1) throw new Error("timeout")
  return { data: { id: "provider" } }
 } } }) }
 const dispatch = loader({ "server-only": {}, "node:timers/promises": { setTimeout: async ms => delays.push(ms) }, "@/lib/supabaseClient": { supabase: db }, "./provider": provider }, env)("src/lib/emails/dispatch.ts")
 assert.equal(await dispatch.dispatchEmailJob("job",owner,true),"sent")
 assert.equal(sends,2);assert.equal(claims,2);assert.deepEqual(delays,[5500]);assert.deepEqual(requests[0],requests[1])
})
