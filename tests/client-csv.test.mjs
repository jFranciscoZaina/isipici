import {test} from "node:test"
import assert from "node:assert/strict"
import {createHash} from "node:crypto"
import {loader} from "./helpers/load-ts.mjs"
const csv=loader({}, {},{TextEncoder})("src/lib/clients/csv.ts")
const owner="11111111-1111-4111-8111-111111111111"
test("CSV basic UTF-8 BOM, commas, quoted values, escaped quotes and multiline CRLF/LF",()=>{
 const rows=csv.parseCsv('\ufeffname,address\r\n"José, Pérez","Calle ""Uno""\r\nPiso 2"\r\nAna,Centro\n')
 assert.equal(rows.length,3);assert.equal(rows[1][0],"José, Pérez");assert.equal(rows[1][1],'Calle "Uno"\r\nPiso 2')
 const validated=csv.validateCsv("name,email,phone,address,address_number\nAna,a@example.test,+54 123456,Centro,012")
 assert.equal(validated.rows[0].errors.length,0);assert.equal(validated.rows[0].values.address_number,"012")
})
test("CSV rejects malformed quotes, empty batches, forbidden headers and mismatched columns",()=>{
 for(const text of ['name\n"x','name\nfoo"bar','name\n"x"tail','','\ufeff','name\n','email\na@example.test','name,owner_id\nA,foreign','name,auth_user\nA,x','name,payments\nA,42'])assert.throws(()=>csv.validateCsv(text),text)
 assert.ok(csv.validateCsv("name,email\nA").rows[0].errors.length)
 assert.equal(csv.validateCsv('name\n""\n').rows[0].errors.includes("Nombre obligatorio."),true)
})
test("server validation requires name and validates email, phone, field lengths and record count",()=>{
 for(const [field,value]of [["name",""],["email","bad"],["phone","abc"],["address","x".repeat(501)],["address_number","x".repeat(51)]]){
  const text=["name,"+field,'Ana,"'+value+'"'].join(String.fromCharCode(10))
  if(field==="name")assert.ok(csv.validateCsv('name\n""').rows[0].errors.length)
  else assert.ok(csv.validateCsv(text).rows[0].errors.length,field)
 }
 assert.equal(csv.validateCsv("name\n"+Array.from({length:500},(_,i)=>"Client "+i).join("\n")).rows.length,500)
 assert.throws(()=>csv.validateCsv("name\n"+Array.from({length:501},()=>"Client").join("\n")),/500/)
 assert.throws(()=>csv.parseCsv("x".repeat(1024*1024+1)),/1 MiB/)
})
test("duplicates use exact normalized email/phone and never names or another business",()=>{
 const rows=csv.validateCsv("name,email,phone\nSame,A@EXAMPLE.test,+54 12345\nSame,a@example.test,5412345\nSame,,999999").rows
 const marked=csv.markDuplicates(rows,{emails:["a@example.test"],phones:["5412345"]})
 assert.equal(marked[0].duplicates.length,4);assert.equal(marked[1].duplicates.length,4);assert.equal(marked[2].duplicates.length,0)
})
test("export quotes every value, mitigates formulas including whitespace prefixes, and uses archive state",()=>{
 for(const text of ["=1+1","+54","-1","@SUM(A1)","  =1","＝1","＋1","－1","＠SUM","\t=1","\n@foo"])assert.ok(csv.csvCell(text).startsWith(String.fromCharCode(34,9,39)),text)
 assert.equal(csv.csvCell('a,"b"'),'"a,""b"""')
 const output=csv.exportClientsCsv([{name:"José",email:null,phone:"+54 12345",address:'a,"b"',address_number:"012",archived_at:"2026-10-13"}])
 assert.ok(output.startsWith("\ufeffname,email,phone,address,address_number,status\r\n"));assert.equal(csv.parseCsv(output)[1][5],"archived")
 assert.equal(csv.parseCsv(csv.exportClientsCsv([{name:"A",email:null,phone:null,address:null,address_number:null,archived_at:null}]))[1][5],"unarchived")
 assert.equal(csv.validateCsv(output).statusIgnored,true)
})
function service(db){return loader({"server-only":{},"node:crypto":{createHash},"@/lib/supabaseClient":{supabase:db}}, {},{TextEncoder,TextDecoder})("src/lib/clients/csv-service.ts")}
test("preview passes trusted owner and normalized signals; commit independently validates all rows",async()=>{
 const calls=[],s=service({rpc:async(name,args)=>{calls.push({name,args});return {data:name==="client_csv_duplicates"?{emails:[],phones:[]}:{count:1,duplicate:false}}}})
 const p=await s.previewClientsCsv(owner,"name,email\nA,A@EXAMPLE.test")
 assert.equal(p.valid,1);assert.equal(calls[0].args.p_owner,owner);assert.equal(calls[0].args.p_emails[0],"a@example.test")
 await assert.rejects(()=>s.importClientsCsv(owner,'name,email\nA,invalid',"id",false))
 assert.equal(calls.length,1)
 await s.importClientsCsv(owner,"name\nA","attempt",false)
 assert.equal(calls[1].name,"import_clients_csv");assert.equal(calls[1].args.p_rows[0].name,"A")
 assert.equal(JSON.stringify(calls[1]).includes("auth_user"),false)
})
test("RPC rejection never falls back to per-row inserts and idempotent receipt is preserved",async()=>{
 let calls=0
 const bad=service({rpc:async()=>{calls++;return {error:{message:"PRIVATE_CONSTRAINT"}}},from:()=>{throw new Error("No per-row writes")}})
 await assert.rejects(()=>bad.importClientsCsv(owner,"name\nA","id",false),e=>!e.message.includes("PRIVATE_CONSTRAINT"));assert.equal(calls,1)
 const good=service({rpc:async()=>({data:{count:1,duplicate:true}})})
 assert.equal((await good.importClientsCsv(owner,"name\nA","id",false)).duplicate,true)
})
test("export requests one owner-scoped SQL snapshot and refuses incomplete oversized exports",async()=>{
 let params
 const s=service({rpc:async(_name,args)=>{params=args;return {data:[]}}})
 assert.ok((await s.exportOwnerClients(owner)).includes("status"));assert.equal(params.p_owner,owner)
 await assert.rejects(()=>service({rpc:async()=>({error:{message:"CLIENT_EXPORT_TOO_LARGE"}})}).exportOwnerClients(owner),e=>e.status===413)
})
test("request reader enforces real streamed byte limit and strict UTF-8",async()=>{
 const s=service({})
 const req=text=>({headers:new Headers({"Content-Type":"text/csv"}),body:new ReadableStream({start(c){c.enqueue(text);c.close()}})})
 assert.equal(await s.readCsvRequest(req(new TextEncoder().encode("name\nJosé"))),"name\nJosé")
 await assert.rejects(()=>s.readCsvRequest(req(new Uint8Array([0xff,0xfe]))),/UTF-8/)
 await assert.rejects(()=>s.readCsvRequest(req(new Uint8Array(1024*1024+1))),/1 MiB/)
})

test("preview and export endpoints ignore foreign owner parameters and reject anonymous access",async()=>{
 let selected=owner,calls=[]
 const response={json:(body,options)=>({body,status:options?.status??200})}
 const previewRoute=loader({"next/server":{NextResponse:response},"@/lib/auth":{getSessionOwnerId:async()=>selected},"@/lib/supabase-auth":{sameOrigin:()=>true},"@/lib/clients/csv-service":{readCsvRequest:async()=>"name\nA",previewClientsCsv:async(id)=>{calls.push(id);return {valid:1}}}},{},{TextEncoder})("src/app/api/clients/import/preview/route.ts")
 const req={nextUrl:new URL("https://app.test/api/clients/import/preview?ownerId=foreign")}
 assert.equal((await previewRoute.POST(req)).status,200);assert.equal(calls[0],owner)
 selected=null;assert.equal((await previewRoute.POST(req)).status,401);assert.equal(calls.length,1)
 selected=owner
 const NextResponse=class{constructor(body,options){this.body=body;this.headers=options.headers}static json= response.json}
 const exported=loader({"next/server":{NextResponse},"@/lib/auth":{getSessionOwnerId:async()=>selected},"@/lib/clients/csv-service":{exportOwnerClients:async(id)=>{calls.push(id);return "csv"}}},{},{TextEncoder})("src/app/api/clients/export/route.ts")
 const r=await exported.GET(req);assert.equal(calls.at(-1),owner);assert.equal(r.headers["Content-Type"],"text/csv; charset=utf-8")
})
test("commit rejects a foreign preview owner and never accepts browser-supplied records or identities",async()=>{
 let calls=0
 const route=loader({"next/server":{NextResponse:{json:(body,options)=>({body,status:options?.status??200})}},"@/lib/audit-request":{withRequestAudit:async(_req,op)=>op()},"@/lib/auth":{getSessionOwnerId:async()=>owner},"@/lib/supabase-auth":{sameOrigin:()=>true},"@/lib/clients/csv-service":{readCsvRequest:async()=>{calls++;return "name\nA"},importClientsCsv:async()=>{calls++;return {count:1}}}},{},{TextEncoder})("src/app/api/clients/import/route.ts")
 const req={headers:new Headers({"x-preview-owner":"foreign","x-import-id":"22222222-2222-4222-8222-222222222222","x-confirm-duplicates":"true"})}
 assert.equal((await route.POST(req)).status,409);assert.equal(calls,0)
 req.headers.set("x-preview-owner",owner);assert.equal((await route.POST(req)).status,200);assert.equal(calls,2)
})

test("backoffice creation form is hidden until opening the modal and cannot close during submission",()=>{
 const states=[],React={Fragment:"fragment",createElement:(type,props,...children)=>({type,props:props??{},children}),useState:initial=>{const i=index++;if(!(i in states))states[i]=initial;return [states[i],value=>{states[i]=value}]}}
 let index=0
 const Component=loader({react:React,"../dashboard/components/Modal":{default:"Modal"},"./BusinessForms":{BusinessCreateForm:"Form"}},{},{React})("src/app/admin/BusinessCreateModal.tsx").default
 const render=()=>{index=0;return Component()}
 let tree=render();assert.equal(tree.children[1],false)
 tree.children[0].props.onClick();tree=render();const modal=tree.children[1];assert.equal(modal.type,"Modal")
 modal.children[0].props.onPendingChange(true);tree=render();assert.equal(tree.children[1].props.secondaryAction.disabled,true)
 tree.children[1].props.onClose();tree=render();assert.equal(tree.children[1].type,"Modal")
})
