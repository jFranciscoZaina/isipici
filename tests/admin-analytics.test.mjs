import {test} from "node:test"
import assert from "node:assert/strict"
import {AsyncLocalStorage} from "node:async_hooks"
import {readFileSync} from "node:fs"
import {loader} from "./helpers/load-ts.mjs"
const owner="11111111-1111-4111-8111-111111111111",user="22222222-2222-4222-8222-222222222222",event="33333333-3333-4333-8333-333333333333"
function analytics(){
 const state={authorized:true,calls:[],failure:null,rows:[],summary:{businesses:3,activeBusinesses:2,users:4,profiles:3,activeMemberships:3,zeroOwnerBusinesses:1,pendingInvites:2,clients:7,payments:9,recurringPayments:4,oneOffPayments:3,unclassifiedPayments:2},audit:[]}
 const db={from(){throw new Error("Analytics must not query rows from Node")},rpc:async(name,input)=>{state.calls.push({name,input});if(state.failure)return {error:state.failure};return {data:name==="admin_platform_summary"?state.summary:name==="admin_business_summary"?{businesses:state.rows,total:state.rows.length,page:input.p_page,pageSize:input.p_page_size}:state.audit}}}
 const requireAdmin=async()=>{if(!state.authorized)throw new Error("admin login")}
 const load=loader({"server-only":{},"@/lib/admin-auth":{requireAdmin},"@/lib/supabaseClient":{supabase:db}})
 return {state,load,service:load("src/lib/admin-owners.ts"),requireAdmin}
}
test("analytics authorizes before data access; identities of Business users never grant admin access",async()=>{
 const f=analytics();f.state.authorized=false
 for(const action of [()=>f.service.platformSummary(),()=>f.service.businessPage(),()=>f.service.ownerSummary(owner),()=>f.service.auditPage(owner)])await assert.rejects(action,/admin login/)
 assert.equal(f.state.calls.length,0)
})
test("global counts are returned as one SQL aggregate RPC, retaining real and unclassified payment counts",async()=>{
 const f=analytics(),result=await f.service.platformSummary()
 assert.equal(result.businesses,3);assert.equal(result.users,4);assert.equal(result.zeroOwnerBusinesses,1)
 assert.equal(result.payments,result.recurringPayments+result.oneOffPayments+result.unclassifiedPayments)
 assert.equal(f.state.calls.length,1);assert.equal(f.state.calls[0].name,"admin_platform_summary")
})
test("per-business summaries preserve modern owners/max, payment types and zero owners without per-row queries",async()=>{
 const f=analytics()
 f.state.rows=Array.from({length:20},(_,i)=>({id:owner.slice(0,-2)+String(i).padStart(2,"0"),modernOwnerCount:i%3,max_owner_members:4,clientCount:10,paymentCount:9,recurringCount:4,oneOffCount:3,unclassifiedCount:2}))
 const result=await f.service.businessPage(2,20,"Business")
 assert.equal(result.businesses.length,20);assert.equal(result.businesses[0].modernOwnerCount,0);assert.equal(result.businesses[1].max_owner_members,4)
 assert.equal(f.state.calls.length,1);assert.equal(f.state.calls[0].input.p_page,2);assert.equal(f.state.calls[0].input.p_page_size,20)
 f.state.rows=[{id:owner,modernOwnerCount:0,max_owner_members:2}]
 assert.equal((await f.service.ownerSummary(owner)).id,owner);assert.equal(f.state.calls.at(-1).input.p_owner,owner)
})
test("pagination is bounded and raw search stays an RPC parameter, not interpolated into filters",async()=>{
 const f=analytics()
 for(const input of [[0,20,""],[1,101,""],[1,0,""],[Infinity,20,""],[1,20,"x".repeat(101)]])await assert.rejects(()=>f.service.businessPage(...input))
 assert.equal(f.state.calls.length,0)
 await f.service.businessPage(1,20,"%_,password_hash.eq.any")
 assert.equal(f.state.calls[0].input.p_query,"%_,password_hash.eq.any")
 const sql=readFileSync("supabase/migrations/20261021_admin_analytics_audit.sql","utf8")
 assert.match(sql,/p_page_size>100/);assert.match(sql,/LIMIT p_page_size OFFSET/);assert.match(sql,/WITH selected AS MATERIALIZED/);assert.match(sql,/JOIN selected s ON s.id=p.owner_id/)
})
test("audit pagination uses timestamp plus UUID and returns only a bounded page",async()=>{
 const f=analytics();f.state.audit=Array.from({length:31},(_,i)=>({id:event.slice(0,-2)+String(i).padStart(2,"0"),created_at:"2026-10-12T00:00:00Z",action:"client.created"}))
 const result=await f.service.auditPage(owner)
 assert.equal(result.events.length,30);assert.equal(result.next.beforeId,f.state.audit[29].id)
 await f.service.auditPage(owner,result.next.before,result.next.beforeId)
 assert.equal(f.state.calls.at(-1).input.p_before_id,result.next.beforeId)
 await assert.rejects(()=>f.service.auditPage(owner,"bad-date",event));await assert.rejects(()=>f.service.auditPage(owner,null,event))
})
test("missing migration and database errors are safe and never expose backend diagnostics",async()=>{
 const f=analytics();f.state.failure={code:"PGRST202",message:"PRIVATE_SECRET"}
 await assert.rejects(()=>f.service.platformSummary(),e=>e.migration===true&&!e.message.includes("PRIVATE_SECRET"))
 f.state.failure={code:"connection",message:"PRIVATE_SECRET"}
 await assert.rejects(()=>f.service.businessPage(),e=>!e.migration&&!e.message.includes("PRIVATE_SECRET"))
})
test("private audit scopes preserve concurrent actors, clean up afterward and reject invalid identities",async()=>{
 const load=loader({"server-only":{},"node:async_hooks":{AsyncLocalStorage}}),audit=load("src/lib/audit-context.ts")
 const wait=()=>new Promise(resolve=>setTimeout(resolve,5))
 const values=await Promise.all([
  audit.withAuditActor({kind:"user",userId:user,ownerId:owner},async()=>{await wait();return audit.currentAuditScope().actor}),
  audit.withAuditActor({kind:"admin"},async()=>{await wait();return audit.currentAuditScope().actor})
 ])
 assert.equal(values[0].userId,user);assert.equal(values[1].kind,"admin");assert.equal(audit.currentAuditScope(),undefined)
 assert.throws(()=>audit.withAuditActor({kind:"user",userId:"secret"},()=>{}))
 const headers=audit.auditHeaders({kind:"user",userId:user,ownerId:owner})
 assert.deepEqual(Object.keys(headers).sort(),["x-isipici-actor-kind","x-isipici-actor-owner","x-isipici-actor-user"])
})
test("Supabase audit proxy binds request-specific headers without altering shared clients",async()=>{
 const calls=[],clients=[]
 const createClient=(_url,_key,options)=>{const client={rpc:async name=>{calls.push({name,headers:options.global?.headers??{}});return {data:true}}};clients.push(client);return client}
 const load=loader({"server-only":{},"node:async_hooks":{AsyncLocalStorage},"@supabase/supabase-js":{createClient}},{SUPABASE_URL:"https://project.test",SUPABASE_SERVICE_ROLE_KEY:"private"})
 const audit=load("src/lib/audit-context.ts"),{supabase}=load("src/lib/supabaseClient.ts")
 await supabase.rpc("baseline")
 await audit.withAuditActor({kind:"admin"},async()=>{await supabase.rpc("admin-write");await supabase.rpc("same-operation")})
 await audit.withAuditActor({kind:"user",userId:user,ownerId:owner},()=>supabase.rpc("user-write"))
 await supabase.rpc("outside")
 assert.equal(clients.length,3);assert.equal(calls[0].headers["x-isipici-actor-kind"],undefined);assert.equal(calls[1].headers["x-isipici-actor-kind"],"admin");assert.equal(calls[3].headers["x-isipici-actor-user"],user);assert.equal(calls[4].headers["x-isipici-actor-kind"],undefined)
})
test("request actor is derived from verified context; browser actor fields are ignored; anonymous requests denied",async()=>{
 let context={authKind:"user",ownerId:owner,userId:user},calls=0
 const load=loader({"server-only":{},"node:async_hooks":{AsyncLocalStorage},"next/server":{NextResponse:{json:(body,opts)=>({body,status:opts.status})}},"@/lib/auth":{getAccessContext:async()=>context}})
 const audit=load("src/lib/audit-context.ts"),{withRequestAudit}=load("src/lib/audit-request.ts"),req={headers:{actor_kind:"admin"},body:{actor_user_id:"foreign"}}
 const actor=await withRequestAudit(req,async()=>{calls++;return audit.currentAuditScope().actor})
 assert.equal(actor.kind,"user");assert.equal(actor.userId,user)
 context=null;assert.equal((await withRequestAudit(req,async()=>calls++)).status,401);assert.equal(calls,1)
})
test("SQL audit schema is append-only, private and constructed from allowlisted facts without row dumps",()=>{
 const sql=readFileSync("supabase/migrations/20261021_admin_analytics_audit.sql","utf8")
 assert.match(sql,/GRANT SELECT ON public.audit_events TO service_role/);assert.doesNotMatch(sql,/GRANT (ALL|INSERT|UPDATE|DELETE) ON public.audit_events/)
 assert.match(sql,/AUDIT_HISTORY_IMMUTABLE/);assert.match(sql,/request.jwt.claims/);assert.match(sql,/='service_role'/)
 const capture=sql.slice(sql.indexOf("CREATE FUNCTION public.capture_product_audit"),sql.indexOf("REVOKE ALL ON FUNCTION public.capture_product_audit"))
 assert.match(capture,/changed_fields/);assert.doesNotMatch(capture,/jsonb_build_object[(][^)]*(password|token|code_hash)/)
 assert.doesNotMatch(capture,/emit_product_audit[(][^;]*,[ ]*(n|o)[ ]*[,)]/)
 for(const action of ["business.created","business.disabled","legacy_access.enabled","legacy_access.disabled","invite.created","invite.redeemed","invite.revoked","membership.added","membership.revoked","client.created","client.updated","client.archived","plan.created","plan.updated","plan.archived","subscription.changed"])assert.ok(sql.includes(action),action)
})
test("admin audit API returns 401 before aggregates for a non-admin caller",async()=>{
 let called=0
 const route=loader({"next/server":{NextResponse:{json:(body,opts)=>({body,status:opts?.status??200})}},"@/lib/admin-auth":{requireAdmin:async()=>{throw new Error("Business user")}},"@/lib/admin-owners":{auditPage:async()=>called++}})("src/app/admin/api/audit/route.ts")
 assert.equal((await route.GET({nextUrl:new URL("https://app.test/admin/api/audit")})).status,401);assert.equal(called,0)
})

test("confirmation cancels destructive forms and submits once after approval",async()=>{
 for(const answer of [false,true]){
  const refs=[],React={createElement:(type,props,...children)=>({type,props,children}),useRef:value=>{const ref={current:value};refs.push(ref);return ref}}
  let confirmations=0,submissions=0,prevented=0
  const FormData=class{constructor(form){this.values=form.values}get(key){return this.values[key]??null}}
  const load=loader({"react":React,"react-dom":{useFormStatus:()=>({pending:false})},"../dashboard/components/ConfirmProvider":{useConfirm:()=>async()=>{confirmations++;return answer}}},{},{React,FormData})
  const Component=load("src/app/admin/ConfirmedForm.tsx").default
  const element=Component({action:async()=>{},children:null,title:"Deshabilitar",message:"Confirmar"})
  const form={values:{},requestSubmit(){submissions++;element.props.onSubmit({currentTarget:form,preventDefault(){prevented++}})}}
  await element.props.onSubmit({currentTarget:form,preventDefault(){prevented++}})
  assert.equal(confirmations,1);assert.equal(prevented,1);assert.equal(submissions,answer?1:0)
 }
})
test("legacy form asks confirmation when disabling access or changing credentials",async()=>{
 for(const values of [{legacyEnabled:"on",email:"old@example.test",password:""},{email:"old@example.test"},{legacyEnabled:"on",email:"old@example.test",password:"new-secret"}]){
  const React={createElement:(type,props,...children)=>({type,props,children}),useRef:value=>({current:value})}
  let confirmations=0
  const FormData=class{get(key){return values[key]??null}}
  const load=loader({"react":React,"react-dom":{useFormStatus:()=>({pending:false})},"../dashboard/components/ConfirmProvider":{useConfirm:()=>async()=>{confirmations++;return false}}},{},{React,FormData})
  const element=load("src/app/admin/ConfirmedForm.tsx").default({action:async()=>{},children:null,title:"Legacy",message:"Confirmar",when:"legacy",originalEmail:"old@example.test"})
  await element.props.onSubmit({currentTarget:{},preventDefault(){}})
  assert.equal(confirmations,values.legacyEnabled==="on"&&!values.password?0:1)
 }
})

test("an audit actor alone is never authentication authority",async()=>{
 const request={cookies:{get:()=>undefined,getAll:()=>[]}}
 const load=loader({"server-only":{},"next/headers":{},"@/lib/supabaseClient":{},"jsonwebtoken":{},"@/lib/supabase-auth":{hasDualSession:()=>false,verifiedModernUser:async()=>null},"@/lib/modern-workspaces":{},"@/lib/audit-context":{currentAuditScope:()=>({request,ownerId:owner,actor:{kind:"legacy",ownerId:owner}})}})
 assert.equal(await load("src/lib/auth.ts").getSessionOwnerId(request),null)
})
