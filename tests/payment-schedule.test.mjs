import {test} from "node:test"
import assert from "node:assert/strict"
import {execFileSync} from "node:child_process"
import {loader} from "./helpers/load-ts.mjs"
const load=loader(),schedule=load("src/lib/payments/schedule.ts"),{parsePayment,PaymentError}=load("src/lib/payments/validation.ts")
const client="22222222-2222-4222-8222-222222222222"
const next=(frequency,anchorDate,currentDate)=>schedule.getNextRecurringDate({frequency,anchorDate,currentDate})
test("weekly and biweekly preserve the weekday and use 7/14 calendar days",()=>{
 assert.equal(next("weekly","2026-10-14","2026-10-14"),"2026-10-21")
 assert.equal(next("weekly","2026-10-14","2026-10-21"),"2026-10-28")
 assert.equal(next("biweekly","2026-10-14","2026-10-14"),"2026-10-28")
 assert.equal(next("biweekly","2026-10-14","2026-10-28"),"2026-11-11")
 assert.equal(next("weekly","2026-10-14","2026-10-01"),"2026-10-14")
})
test("monthly preserves the original billing day through short months and leap years",()=>{
 assert.equal(next("monthly","2026-10-10","2026-10-10"),"2026-11-10")
 assert.equal(next("monthly","2026-01-31","2026-01-31"),"2026-02-28")
 assert.equal(next("monthly","2026-01-31","2026-02-28"),"2026-03-31")
 assert.equal(next("monthly","2026-01-31","2026-03-31"),"2026-04-30")
 assert.equal(next("monthly","2026-01-31","2026-04-30"),"2026-05-31")
 assert.equal(next("monthly","2028-01-31","2028-01-31"),"2028-02-29")
 assert.equal(next("monthly","2028-01-31","2028-02-29"),"2028-03-31")
 assert.throws(()=>next("daily","2026-10-14","2026-10-14"))
 assert.throws(()=>next("monthly","2026-02-30","2026-03-01"))
})
test("canonical recurring period ends the day before the next due date",()=>{
 const monthly=parsePayment({clientId:client,amount:50,frequency:"monthly",anchorDate:"2026-10-10"})
 assert.equal(monthly.plan,"Mensual");assert.equal(monthly.periodFrom,"2026-10-10");assert.equal(monthly.periodTo,"2026-11-09");assert.equal(monthly.nextPaymentDate,"2026-11-10")
 const biweekly=parsePayment({clientId:client,amount:50,frequency:"biweekly",anchorDate:"2026-10-14"})
 assert.equal(biweekly.periodTo,"2026-10-27");assert.equal(biweekly.nextPaymentDate,"2026-10-28")
 const march=parsePayment({clientId:client,amount:50,frequency:"monthly",anchorDate:"2026-01-31",cycleDate:"2026-03-31"})
 assert.equal(march.periodTo,"2026-04-29");assert.equal(march.nextPaymentDate,"2026-04-30")
 for(const change of [{frequency:"daily"},{frequency:"yearly"},{cycleDate:"2026-10-15"},{periodFrom:"2026-10-14",periodTo:"2026-10-30"},{nextPaymentDate:"2099-01-01"}])assert.throws(()=>parsePayment({clientId:client,amount:50,frequency:"weekly",anchorDate:"2026-10-14",...change}),PaymentError)
})
test("one-off covers one day or an inclusive range with no recurring due date",()=>{
 const base={clientId:client,paymentType:"one_off",amount:200,concept:"Dinner"}
 for(const period of [{periodFrom:"2026-11-07"},{periodFrom:"2026-11-07",periodTo:"2026-11-09"},{}]){
  const p=parsePayment({...base,...period});assert.equal(p.periodFrom,period.periodFrom??null);assert.equal(p.periodTo,period.periodTo??period.periodFrom??null);assert.equal(p.nextPaymentDate,null)
 }
 assert.throws(()=>parsePayment({...base,periodTo:"2026-11-09"}),PaymentError)
 assert.throws(()=>parsePayment({...base,periodFrom:"2026-11-09",periodTo:"2026-11-07"}),PaymentError)
})
test("receipt renders single day once, full range, legacy date and true next cycle",()=>{
 const render=load("src/lib/emails/templates/payment-receipt.ts").renderPaymentReceipt
 const base={to:"a@example.test",clientName:"Client",ownerName:"Business",amount:200,currency:"AUD",paymentType:"one_off",concept:"<Dinner>",dueDate:null,paymentDate:"2026-11-03T12:00:00Z",receiptNote:"Table 4"}
 const single=render({...base,periodFrom:"2026-11-07",periodTo:"2026-11-07"}).html
 assert.equal(single.split("07/11/2026").length-1,1);assert.ok(single.includes("03/11/2026"));assert.ok(single.includes("AUD"));assert.ok(single.includes("&lt;Dinner&gt;"));assert.equal(single.includes("Próximo vencimiento"),false)
 const range=render({...base,periodFrom:"2026-11-07",periodTo:"2026-11-09",serviceDate:"2026-11-01"}).html
 assert.ok(range.includes("07/11/2026 – 09/11/2026"));assert.equal(range.includes("01/11/2026"),false)
 assert.ok(render({...base,serviceDate:"2026-11-07"}).html.includes("07/11/2026"))
 const recurring=render({...base,paymentType:"recurring",periodFrom:"2026-10-10",periodTo:"2026-11-09",dueDate:"2026-11-10"}).html
 assert.ok(recurring.includes("10/10/2026 – 09/11/2026"));assert.ok(recurring.includes("Próximo vencimiento"));assert.ok(recurring.includes("10/11/2026"))
})
test("calendar dates and recurrence results do not shift in Argentina, Australia or UTC",()=>{
 const moduleUrl=new URL("./helpers/load-ts.mjs",import.meta.url).href
 const code=`import {loader} from ${JSON.stringify(moduleUrl)};const s=loader()("src/lib/payments/schedule.ts");console.log(JSON.stringify([s.toCalendarDate(s.fromCalendarDate("2026-11-10")),s.formatCalendarDate("2026-11-10"),s.getNextRecurringDate({frequency:"monthly",anchorDate:"2026-01-31",currentDate:"2026-02-28"})]));`
 for(const TZ of ["UTC","America/Argentina/Buenos_Aires","Australia/Sydney","Pacific/Honolulu"]){
  const result=JSON.parse(execFileSync(process.execPath,["--input-type=module","-e",code],{env:{...process.env,TZ},encoding:"utf8"}))
  assert.deepEqual(result,["2026-11-10","10/11/2026","2026-03-31"])
 }
})
