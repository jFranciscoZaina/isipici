import {test} from "node:test"
import assert from "node:assert/strict"
import {loader} from "./helpers/load-ts.mjs"
const owner="11111111-1111-4111-8111-111111111111",client="22222222-2222-4222-8222-222222222222",agreement="33333333-3333-4333-8333-333333333333"
const response={json:(body,options)=>({body,status:options?.status??200})}
function chain(data,calls=[],table="",filters=[]) {
 const q=new Proxy({},{get:(_,method)=>method==="then"?resolve=>resolve({data:Array.isArray(data)?data.filter(row=>filters.every(([key,value])=>row[key]===undefined||row[key]===value)):data,error:null}):(...args)=>{calls.push([table,method,...args]);if(method==="eq")filters.push(args);return method==="single"||method==="maybeSingle"?Promise.resolve({data:Array.isArray(data)?data[0]:data,error:null}):q}})
 return q
}
test("subscription API rejects anonymous and foreign client before operations",async()=>{
 for(const authorized of [false,true]){
  let writes=0
  const route=loader({"next/server":{NextResponse:response},"server-only":{},"@/lib/auth":{getSessionOwnerId:async()=>authorized?owner:null,ownedClientColumn:async()=>null},"@/lib/supabaseClient":{supabase:{rpc:async()=>{writes++;return {data:{}}}}}})("src/app/api/clients/[id]/subscription/route.ts")
  const req={nextUrl:new URL("https://example.test/api/clients/id/subscription"),json:async()=>({action:"create",frequency:"monthly",anchorDate:"2026-11-10",amount:100})},ctx={params:Promise.resolve({id:client})}
  for(const method of ["GET","POST"]){assert.equal((await route[method](req,ctx)).status,authorized?404:401)}assert.equal(writes,0)
 }
})
test("lifecycle service uses authenticated owner and rejects browser authority fields",async()=>{
 const calls=[],db={rpc:async(name,input)=>{calls.push([name,input]);return {data:{ok:true}}}}
 const service=loader({"server-only":{},"@/lib/auth":{ownedClientColumn:async()=>"owner_id"},"@/lib/supabaseClient":{supabase:db}})("src/lib/payments/lifecycle.ts")
 for(const key of ["ownerId","owner_id","currency","status","provider","installments_enabled"])await assert.rejects(()=>service.lifecycleOperation(owner,client,{action:"create",frequency:"monthly",anchorDate:"2026-11-10",amount:100,[key]:"fake"}))
 assert.equal(calls.length,0)
 await service.lifecycleOperation(owner,client,{action:"create",frequency:"monthly",anchorDate:"2026-11-10",amount:0.29})
 assert.equal(calls[0][1].p_owner,owner);assert.equal(calls[0][1].p_client,client);assert.equal(calls[0][1].p_input.amount,0.29)
 await assert.rejects(()=>service.lifecycleOperation(owner,client,{action:"resume",agreementId:agreement,nextDueDate:"2026-02-30"}))
})
test("legacy reminders require an active legacy subscription or no agreement",async()=>{
 for(const [data,expected] of [[[],true],[[{status:"active",installments_enabled:false}],true],[[{status:"active",installments_enabled:true}],false],[[{status:"paused",installments_enabled:false}],false],[[{status:"cancelled",installments_enabled:true}],false],[[{status:"pending",installments_enabled:false}],false]]){
  const service=loader({"server-only":{},"@/lib/supabaseClient":{supabase:{from:()=>chain(data)}},"./service":{},"@/lib/auth":{}})("src/lib/emails/installment-reminders.ts")
  assert.equal(await service.legacyReminderEligible(owner,client),expected)
 }
})
test("installment reminders ensure agenda, exclude paid/archived/paused and deduplicate by installment",async()=>{
 for(const [status,archived,installmentStatus,count] of [["active",false,"open",1],["paused",false,"open",0],["active",true,"open",0],["active",false,"paid",0]]){
  const calls=[],sent=[],target="2026-11-10"
  const db={rpc:async(name,input)=>{calls.push([name,input]);return {data:name==="installment_coverage"?70:0}},from:table=>{
   const data=table==="recurring_agreements"?[{id:agreement,owner_id:owner,client_id:client,status,installments_enabled:true}]:table==="owners"?{id:owner,name:"Owner",default_currency:"ARS"}:table==="clients"?{id:client,name:"Client",email:"client@example.test",archived_at:archived?"date":null}:[{id:"quota",status:installmentStatus,due_date:target,amount_due:100,currency:"ARS",payments:[{amount:60,discount:10}]}]
   // The final recheck selects one agreement.
   if(table==="recurring_agreements") {const q=chain(data,calls,table);return new Proxy(q,{get:(obj,key)=>key==="single"?async()=>({data:data[0],error:null}):obj[key]})}
   return chain(data,calls,table)
  }}
  const service=loader({"server-only":{},"@/lib/supabaseClient":{supabase:db},"@/lib/auth":{ownedClientColumn:async()=>"owner_id"},"./service":{sendUpcomingDueEmail:async input=>{sent.push(input);return {status:"sent",providerEmailId:"mail"}}}})("src/lib/emails/installment-reminders.ts")
  assert.equal((await service.sendInstallmentReminders(target)).length,count)
  if(count){assert.equal(sent[0].remainingDebt,30);assert.ok(sent[0].deduplicationKey.includes("quota"));assert.ok(calls.some(c=>c[0]==="ensure_recurring_installments_through"))}
 }
})
test("archived client stays searchable in archive filter and new installments contribute only due balances",async()=>{
 const now=new Date().toISOString().slice(0,10),calls=[]
 const data=[{id:client,name:"Client",archived_at:"date",legacy_debt_amount:10,current_debt:999,recurring_agreements:[{status:"paused",installments_enabled:true}],payments:[],recurring_installments:[{amount_due:100,status:"open",due_date:now,payments:[{amount:60,discount:10}]},{amount_due:100,status:"open",due_date:"9999-12-31",payments:[]}]}]
 const route=loader({"next/server":{NextResponse:response},"@/lib/auth":{getSessionOwnerId:async()=>owner},"@/lib/supabaseClient":{supabase:{rpc:async()=>({error:{code:"PGRST202"}}),from:table=>chain(table==="owners"?{default_currency:"ARS"}:data,calls,table)}}})("src/app/api/clients/route.ts")
 assert.equal((await route.GET({nextUrl:new URL("https://test/api/clients")})).body.length,0)
 const archived=await route.GET({nextUrl:new URL("https://test/api/clients?status=archived")})
 assert.equal(archived.body[0].currentDebt,40);assert.equal(archived.body[0].nextDue,null)
})
