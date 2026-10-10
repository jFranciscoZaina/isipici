import {test} from "node:test"
import assert from "node:assert/strict"
import {loader} from "./helpers/load-ts.mjs"
import {readFileSync} from "node:fs"
import ts from "typescript"
import vm from "node:vm"
const response={json:(body,options)=>({body,status:options?.status??200,headers:options?.headers})}
const owner="11111111-1111-4111-8111-111111111111"
function query(data,calls,table){
 const q=new Proxy({}, {get:(_,method)=>method==="then"?((resolve)=>resolve({data,error:null})): (...args)=>{
   calls.push([table,method,...args]);return method==="single"||method==="maybeSingle"?Promise.resolve({data,error:null}):q
 }});return q
}
test("client summary uses owner currency and recurring debt even when the latest payment is one-off",async()=>{
 const calls=[]
 const now=new Date().toISOString()
 const data=[{id:"client",name:"Client",currency:"ARS",current_debt:20,next_payment_date:"2026-11-15",payments:[
 {id:"recurring",amount:100,currency:"AUD",payment_type:"recurring",debt:20,plan:"Monthly",period_to:"2026-11-15",created_at:"2026-09-01T12:00:00Z"},
 {id:"unique",amount:50,currency:"AUD",payment_type:"one_off",debt:0,plan:"Dinner",period_from:"2026-11-07",period_to:"2026-11-09",created_at:now}]}]
 const db={from:table=>query(table==="owners"?{default_currency:"AUD"}:data,calls,table)}
 const route=loader({"next/server":{NextResponse:response,after:()=>{}},"@/lib/auth":{getSessionOwnerId:async()=>owner},"@/lib/supabaseClient":{supabase:{...db,rpc:async()=>({error:{code:"PGRST202"}})}}})("src/app/api/clients/route.ts")
 const result=await route.GET({nextUrl:new URL("https://example.test/api/clients")})
 assert.equal(result.status,200);assert.equal(result.headers["X-Owner-Currency"],"AUD")
 assert.equal(result.body[0].currency,"AUD");assert.equal(result.body[0].currentDebt,20);assert.equal(result.body[0].nextDue,"2026-11-15")
 assert.equal(result.body[0].currentPlan,"Monthly");assert.equal(result.body[0].totalPaidThisMonth,50)
 assert.ok(calls.some(c=>c[0]==="clients"&&c[1]==="eq"&&c[2]==="owner_id"&&c[3]===owner))
})
test("reminders exclude clients with only one-off payments but retain existing recurring schedule",async()=>{
 const calls=[],sent=[]
 const clients=[{id:"only-unique",name:"Event",email:"event@example.test",owner_id:owner,current_debt:0},{id:"recurring-client",name:"Monthly",email:"monthly@example.test",owner_id:owner,current_debt:20}]
 const db={from:table=>{
   if(table==="owners")return query({id:owner,name:"Owner",default_currency:"AUD"},calls,table)
   if(table==="clients"){
     const q=query(clients,calls,table)
     // Canonical and compatibility queries return the same candidates; Map deduplicates.
     return q
   }
   let selectedClient
   const q=new Proxy({}, {get:(_,method)=>method==="then"?resolve=>resolve({data:selectedClient==="recurring-client"?[{id:"period"}]:[],error:null}):(...args)=>{
     calls.push([table,method,...args]);if(method==="eq"&&args[0]==="client_id")selectedClient=args[1];return q
   }});return q
 }}
 const file="src/lib/emails/reminders.ts",exports={}
 const mocks={"./installment-reminders":{legacyReminderEligible:async()=>true,sendInstallmentReminders:async()=>[]},"server-only":{},"next/server":{NextResponse:response,after:()=>{}},"@/lib/supabaseClient":{supabase:{...db,rpc:async()=>({error:{code:"PGRST202"}})}},"./service":{sendUpcomingDueEmail:async input=>{sent.push(input);return {status:"sent",providerEmailId:"email-1"}}}}
 const source=ts.transpileModule(readFileSync(new URL("../"+file,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 vm.runInNewContext(source,{exports,require:name=>mocks[name],process:{env:{CRON_SECRET:"test-cron"}},Date,Map})
 const result=await exports.handleUpcomingReminders({headers:{get:()=>"Bearer test-cron"}})
 assert.equal(result.status,200);assert.equal(sent.length,1);assert.equal(sent[0].clientId,"recurring-client");assert.equal(sent[0].remainingDebt,20);assert.equal(sent[0].currency,"AUD")
 assert.ok(calls.some(c=>c[0]==="payments"&&c[1]==="or"&&c[2]==="payment_type.eq.recurring,payment_type.is.null"))
})
